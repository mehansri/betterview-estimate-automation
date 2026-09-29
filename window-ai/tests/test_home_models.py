"""Same-model home matching from Brampton permit data, and model templates."""
from __future__ import annotations

from pathlib import Path
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from db.init_db import init_db
from db.session import reset_engine
from services import drawing_extraction
from services.address_key import address_key, city_of
from services.home_models import group_neighbours, mirror_window, subject_permit
from services.permits import brampton

# Recorded from the live MapServer (2026-09-29), trimmed to what matching reads.
FEB_17_2000 = 950763600000


def _feature(address, gfa, *, work="New Complete Building", issued=FEB_17_2000, storeys="2",
             builder="MATTAMY HOMES", subdesc="Single Family Detached", permit=None, x=-79.73915, y=43.78029):
    return {
        "attributes": {
            "ADDRESS": address, "PERMITNUMBER": permit or f"P-{address.split(',')[0]}",
            "SUBDESC": subdesc, "WORKDESC": work, "ISSUEDATE": issued, "BUILDER": builder,
            "GFA": gfa, "STOREYS": storeys, "BEDROOMS": "0", "STATUSDESC": "Closed",
        },
        "geometry": {"x": x, "y": y},
    }


SUBJECT = [
    _feature("47 Brock Dr, Brampton, ON, L6P 1A2", "234", permit="00-100697-000-00"),
    _feature("47 Brock Dr, Brampton, ON, L6P 1A2", "0", work="Revision", issued=958536000000, permit="00-100697-000-01"),
]
NEARBY = [
    SUBJECT[0],
    _feature("65 Treeline Blvd, Brampton, ON, L6P 1A6", "234"),
    _feature("12 Selhurst Dr, Brampton, ON, L6P 1A3", "236.1"),  # within 2%: elevation variant
    _feature("41 Brock Dr, Brampton, ON, L6P 1A2", "257"),  # another model
    _feature("9 Treeline Blvd, Brampton, ON, L6P 1A6", "234", storeys="3"),  # different storeys
    _feature("80 Treeline Blvd, Brampton, ON, L6P 1A6", "234", issued=FEB_17_2000 + 6 * 365 * 86400000),  # later phase
    _feature("3 Selhurst Dr, Brampton, ON, L6P 1A3", "234", storeys=None),  # storeys unknown still matches
]


def fake_fetch(params):
    if "geometry" in params:
        return {"features": NEARBY}
    prefix = params["where"].split("LIKE '")[1].rstrip("%'")
    everything = SUBJECT + NEARBY[1:]  # NEARBY[0] is SUBJECT[0]
    return {"features": [f for f in everything if f["attributes"]["ADDRESS"].upper().startswith(prefix)]}


# ------------------------------------------------------------------ address keys
@pytest.mark.parametrize("raw, key", [
    ("47 Brock Drive, Brampton, ON L6P 1A2, Canada", "47 BROCK DR"),
    ("47 Brock Dr, Brampton, ON, L6P 1A2", "47 BROCK DR"),
    ("47 brock dr.", "47 BROCK DR"),
    ("5-47 Brock Drive", "47 BROCK DR #5"),
    ("Unit 3, 12 Queen Street West, Brampton", "12 QUEEN ST W #3"),
    ("12 Queen St. W., Brampton", "12 QUEEN ST W"),
    ("65 Treeline Boulevard", "65 TREELINE BLVD"),
    ("8 Kendra Court", "8 KENDRA CRT"),
    ("10 O'Neil Crescent", "10 ONEIL CRES"),
    ("Brock Drive", None),
    ("", None),
])
def test_address_key(raw, key):
    assert address_key(raw) == key


def test_city_of():
    assert city_of("47 Brock Drive, Brampton, ON L6P 1A2, Canada") == "BRAMPTON"
    assert city_of("47 Brock Drive") is None


# ------------------------------------------------------------------ grouping
def test_permit_parsing_and_subject(monkeypatch):
    monkeypatch.setattr(brampton, "fetch_json", fake_fetch)
    records = brampton.BramptonPermits().lookup("47 BROCK DR")
    assert len(records) == 2
    subject = subject_permit(records)
    assert subject.permit_number == "00-100697-000-00"
    assert subject.builder == "MATTAMY HOMES" and subject.gfa == 234 and subject.storeys == 2
    assert subject.issue_date.isoformat() == "2000-02-17"


def test_neighbours_grouped_by_floor_area(monkeypatch):
    monkeypatch.setattr(brampton, "fetch_json", fake_fetch)
    source = brampton.BramptonPermits()
    subject = subject_permit(source.lookup("47 BROCK DR"))
    groups = group_neighbours(subject, source.nearby_new_builds(subject, 600))
    assert [r.address_key for r in groups["same"]] == ["3 SELHURST DR", "65 TREELINE BLVD"]
    assert [r.address_key for r in groups["similar"]] == ["12 SELHURST DR"]


# ------------------------------------------------------------------ mirroring
def test_mirror_window_flips_handing_elevation_and_layout():
    line = {
        "id": "w1",
        "location": "Kitchen",
        "spec": {"type": "unit", "layout": {"split": "cols", "sizes": ["1/3", "*"], "children": [
            {"op": "casement", "hinge": "left"}, {"op": "fixed"}]}},
        "details": {"elevation": "left", "sections": [
            {"operation": "casement", "handing": "left"}, {"operation": "fixed", "handing": None}]},
    }
    mirrored = mirror_window(line)
    assert mirrored["details"]["elevation"] == "right"
    assert mirrored["details"]["sections"] == [
        {"operation": "fixed", "handing": None}, {"operation": "casement", "handing": "right"}]
    assert mirrored["spec"]["layout"] == {"split": "cols", "sizes": ["*", "1/3"], "children": [
        {"op": "fixed"}, {"op": "casement", "hinge": "right"}]}
    assert line["details"]["elevation"] == "left"  # the template is untouched


def test_mirror_keeps_rows_order_and_front_elevation():
    line = {"id": "w", "spec": {"type": "unit", "layout": {"split": "rows", "sizes": ["2/3", "*"], "children": [
        {"op": "fixed"}, {"op": "awning", "hinge": "top"}]}}, "details": {"elevation": "front"}}
    mirrored = mirror_window(line)
    assert mirrored["spec"]["layout"]["children"] == [{"op": "fixed"}, {"op": "awning", "hinge": "top"}]
    assert mirrored["details"]["elevation"] == "front"


# ------------------------------------------------------------------ drawing rows
def test_drawing_extraction_becomes_measure_rows():
    rows = drawing_extraction.to_measure_rows({"windows": [
        {"tag": "W3", "elevation": "front", "location": "Primary bedroom", "operation": "casement",
         "width_in": 30.06, "height_in": 48, "size_basis": "rough_opening", "qty": 2, "confidence": "high", "note": ""},
        {"tag": "", "elevation": "back", "location": "", "operation": "fixed_plus_casement",
         "width_in": 60, "height_in": None, "size_basis": "frame", "qty": 1, "confidence": "low", "note": "height illegible"},
        {"tag": "", "elevation": "left", "location": "Stair", "operation": "other_combination",
         "width_in": 24, "height_in": 72, "size_basis": "nominal", "qty": 1, "confidence": "medium", "note": ""},
    ]})
    assert rows[0] == {**rows[0], "location": "Primary bedroom · front elevation · W3", "style": "WC-100",
                       "width": "30", "height": "48", "qty": "2", "roughOpening": True}
    assert rows[1]["style"] == "preset:C3" and rows[1]["height"] == "" and not rows[1]["roughOpening"]
    assert rows[2]["style"] == ""


def test_drawing_extraction_rejects_non_pdf():
    with pytest.raises(drawing_extraction.DrawingExtractionError):
        drawing_extraction.extract_openings(b"hello")


# ------------------------------------------------------------------ API
def _client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'home-models.db'}")
    monkeypatch.setattr(brampton, "fetch_json", fake_fetch)
    reset_engine()
    init_db()
    from api.main import app

    return TestClient(app)


def _window(line_id="w1", handing="left", elevation="left"):
    return {
        "id": line_id,
        "location": "Kitchen",
        "description": "",
        "spec": {"type": "window", "style": "WC-100", "width": 30, "height": 48, "qty": 2,
                 "colour_ext": "white", "glazing": {"loe180": True, "gas": "argon"}, "accessories": []},
        "details": {"elevation": elevation, "sections": [{"operation": "casement", "handing": handing}]},
    }


def _estimate(client, address, **extra):
    body = {"customer_name": "Test Customer", "project_address": address, "windows": [_window()],
            "commercial": {"preset_id": "standard", "negotiated_discount_percent": 0, "presentation_mode": "internal"},
            **extra}
    response = client.post("/api/customer-estimates", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_model_match_finds_neighbours_and_measured_jobs(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    measured = _estimate(client, "65 Treeline Boulevard, Brampton, ON L6P 1A6, Canada")
    _estimate(client, "12 Selhurst Dr, Brampton, ON", is_preliminary=True)  # a copy, not a measurement

    match = client.get("/api/model-match", params={"address": "47 Brock Drive, Brampton, ON L6P 1A2, Canada"}).json()
    assert match["supported"] and match["address_key"] == "47 BROCK DR"
    assert match["subject"]["builder"] == "MATTAMY HOMES" and match["subject"]["gfa"] == 234
    assert match["subject"]["label"].startswith("Mattamy Homes · 234 m² · 2-storey")
    assert {r["address_key"] for r in match["same_model"]} == {"3 SELHURST DR", "65 TREELINE BLVD"}
    assert [job["estimate_id"] for job in match["measured_jobs"]] == [measured["id"]]
    assert match["measured_jobs"][0]["relation"] == "same" and match["measured_jobs"][0]["window_count"] == 2
    assert match["home_models"] == []


def test_model_match_in_an_unsupported_city(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    match = client.get("/api/model-match", params={"address": "10 Main St, Markham, ON"}).json()
    assert match["supported"] is False and "Markham" in match["message"] and "City of Toronto" in match["message"]


def test_save_measured_job_as_model_and_reuse_mirrored(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    measured = _estimate(client, "65 Treeline Blvd, Brampton, ON")

    saved = client.post(f"/api/home-models/from-estimate/{measured['id']}", json={})
    assert saved.status_code == 200, saved.text
    model = saved.json()
    assert model["builder"] == "MATTAMY HOMES" and model["gfa"] == 234 and model["window_count"] == 2
    assert model["source"] == "measured" and model["source_estimate_id"] == measured["id"]

    match = client.get("/api/model-match", params={"address": "47 Brock Dr, Brampton"}).json()
    assert [(m["id"], m["relation"]) for m in match["home_models"]] == [(model["id"], "same")]

    openings = client.get(f"/api/home-models/{model['id']}/openings", params={"mirror": "true"}).json()
    window = openings["windows"][0]
    assert window["id"] != "w1"
    assert window["details"]["elevation"] == "right"
    assert window["details"]["sections"][0]["handing"] == "right"

    # A preliminary estimate built from the model keeps its flag through a
    # later save that leaves it out (another builder screen, the CRM).
    created = _estimate(client, "47 Brock Dr, Brampton", windows=openings["windows"],
                        is_preliminary=True, home_model_id=model["id"])
    assert created["is_preliminary"] and created["home_model_id"] == model["id"]
    update = {"customer_name": "Test Customer", "project_address": "47 Brock Dr, Brampton", "windows": openings["windows"]}
    kept = client.put(f"/api/customer-estimates/{created['id']}", json=update).json()
    assert kept["is_preliminary"] is True

    refused = client.post(f"/api/home-models/from-estimate/{created['id']}", json={})
    assert refused.status_code == 409

    # Replacing the template with a newer measurement keeps the one model.
    replaced = client.post(f"/api/home-models/from-estimate/{measured['id']}", json={"replace_model_id": model["id"]})
    assert replaced.status_code == 200 and replaced.json()["id"] == model["id"]
    assert len(client.get("/api/home-models").json()) == 1


def test_preliminary_estimate_view_is_marked(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = _estimate(client, "47 Brock Dr, Brampton", is_preliminary=True)
    from db.models import CustomerEstimate
    from db.session import get_session
    from services.estimate_documents import customer_view

    with get_session() as session:
        row = session.get(CustomerEstimate, UUID(created["id"]))
        assert customer_view(row)["preliminary"] is True
