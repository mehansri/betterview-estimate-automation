"""Customer estimate lifecycle and combined Windows + Doors behavior."""
from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from db.init_db import init_db
from db.session import reset_engine


def _window_line(line_id: str = "w1") -> dict:
    return {
        "id": line_id,
        "location": "Living room",
        "description": "Energy-efficient living room window",
        "spec": {
            "type": "window",
            "style": "WC-100",
            "width": 30,
            "height": 60,
            "qty": 1,
            "colour_ext": "white",
            "glazing": {"loe180": True, "gas": "argon"},
            "accessories": [],
        },
    }


def _door_opening(opening_id: str = "d1") -> dict:
    return {
        "id": opening_id,
        "location": "Front entry",
        "description": "Front entry package",
        "spec": {
            "label": "Front entry",
            "material": "fiberglass",
            "finish": "stain 2 sides 1 colour",
            "opening_type": "single_1_sidelite",
            "door": {"glass": "Chinchilla", "glass_size": "22x36", "panel": "Oak 6-Panel"},
            "sidelites": [{"glass": "Chinchilla", "glass_size": "8x36"}],
            "options": [
                {
                    "category": "sills",
                    "item": "Hight Performance Fixed Sill - Black Anodized / box (included with painted doors)",
                }
            ],
        },
    }


def _draft(*, mixed: bool = True) -> dict:
    return {
        "customer_name": "Ada Lovelace",
        "company_name": "Lovelace Homes",
        "project_name": "Front elevation renewal",
        "email": "ada@example.com",
        "windows": [_window_line()],
        "doors": [_door_opening()] if mixed else [],
        "commercial": {"preset_id": "standard", "negotiated_discount_percent": 0, "presentation_mode": "internal"},
    }


def _client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'customer-estimates.db'}")
    reset_engine()
    init_db()
    from api.main import app

    return TestClient(app)


def test_mixed_project_prices_and_finalizes(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/customer-estimates", json=_draft())
    assert created.status_code == 200, created.text
    estimate_id = created.json()["id"]

    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    pricing = priced.json()["pricing"]
    assert pricing["sections"]["windows"]["lines"]
    assert pricing["sections"]["doors"]["openings"]
    assert pricing["totals"]["total"] == round(pricing["totals"]["subtotal"] + pricing["totals"]["hst"], 2)
    assert pricing["totals"]["base_total"] >= pricing["totals"]["total"]
    assert pricing["totals"]["discount"] == pytest.approx(
        pricing["totals"]["base_subtotal"] - pricing["totals"]["subtotal"]
    )
    assert pricing["totals"]["minimum_floor_total"] <= pricing["totals"]["base_total"]
    door = pricing["sections"]["doors"]["openings"][0]
    assert round(sum(item["line_total"] for item in door["items"]), 2) == door["subtotal"]

    finalized = client.post(f"/api/customer-estimates/{estimate_id}/finalize")
    assert finalized.status_code == 200, finalized.text
    assert finalized.json()["status"] == "finalized"
    assert finalized.json()["estimate_number"].startswith("BV-EST-")

    update = client.put(f"/api/customer-estimates/{estimate_id}", json=_draft())
    assert update.status_code == 409


def test_residential_project_can_finalize_without_company(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = _draft(mixed=False)
    draft["company_name"] = ""
    created = client.post("/api/customer-estimates", json=draft)
    assert created.status_code == 200, created.text
    estimate_id = created.json()["id"]

    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    finalized = client.post(f"/api/customer-estimates/{estimate_id}/finalize")
    assert finalized.status_code == 200, finalized.text
    assert finalized.json()["company_name"] == ""


def test_customer_estimate_can_be_removed_after_finalization(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/customer-estimates", json=_draft(mixed=False))
    assert created.status_code == 200, created.text
    estimate_id = created.json()["id"]

    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    finalized = client.post(f"/api/customer-estimates/{estimate_id}/finalize")
    assert finalized.status_code == 200, finalized.text

    removed = client.delete(f"/api/customer-estimates/{estimate_id}")
    assert removed.status_code == 204, removed.text
    # Deleting moves the estimate to the trash rather than destroying it.
    assert client.get(f"/api/customer-estimates/{estimate_id}").json()["deleted_at"]
    assert client.get("/api/customer-estimates").json() == []
    assert [row["id"] for row in client.get("/api/customer-estimates?deleted=true").json()] == [estimate_id]

    restored = client.post(f"/api/customer-estimates/{estimate_id}/restore")
    assert restored.status_code == 200, restored.text
    assert restored.json()["deleted_at"] is None
    assert [row["id"] for row in client.get("/api/customer-estimates").json()] == [estimate_id]


def test_customer_estimate_manager_override_requires_token(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.setenv("PRICING_ADMIN_TOKEN", "manager-secret")
    draft = _draft(mixed=False)
    created = client.post("/api/customer-estimates", json=draft)
    assert created.status_code == 200, created.text
    estimate_id = created.json()["id"]

    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    maximum_discount = priced.json()["pricing"]["window_quote"]["sales_pricing"]["maximum_allowed_discount_percent"]

    draft["commercial"]["negotiated_discount_percent"] = maximum_discount + 1
    draft["commercial"]["manager_override_reason"] = "Approved customer offer"
    updated = client.put(f"/api/customer-estimates/{estimate_id}", json=draft)
    assert updated.status_code == 200, updated.text

    blocked = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert blocked.status_code == 403
    assert blocked.json()["detail"]["code"] == "manager_authorization_required"

    approved = client.post(
        f"/api/customer-estimates/{estimate_id}/price",
        headers={"X-Pricing-Admin-Token": "manager-secret"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["pricing"]["window_quote"]["sales_pricing"]["floor_status"] == "manager_override"


def test_quote_lines_append_to_one_existing_project(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/customer-estimates", json=_draft(mixed=False))
    assert created.status_code == 200, created.text
    estimate_id = created.json()["id"]

    assigned = client.post(
        f"/api/customer-estimates/{estimate_id}/lines",
        json={"doors": [_door_opening()], "commercial": {"preset_id": "standard", "negotiated_discount_percent": 0, "presentation_mode": "internal"}},
    )
    assert assigned.status_code == 200, assigned.text
    body = assigned.json()
    assert len(body["windows"]) == 1
    assert len(body["doors"]) == 1
    assert body["status"] == "draft"

    duplicate = client.post(f"/api/customer-estimates/{estimate_id}/lines", json={"doors": [_door_opening()]})
    assert duplicate.status_code == 200, duplicate.text
    assert len(duplicate.json()["windows"]) == 1
    assert len(duplicate.json()["doors"]) == 1

    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    assert priced.json()["pricing"]["sections"]["windows"]["lines"]
    assert priced.json()["pricing"]["sections"]["doors"]["openings"]


def test_door_only_project_prices_from_handoff_shape(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = _draft(mixed=True)
    draft["windows"] = []
    created = client.post("/api/customer-estimates", json=draft)
    assert created.status_code == 200, created.text

    priced = client.post(f"/api/customer-estimates/{created.json()['id']}/price")
    assert priced.status_code == 200, priced.text
    body = priced.json()
    assert body["pricing"]["sections"]["windows"]["lines"] == []
    assert body["pricing"]["sections"]["doors"]["openings"]
    assert body["pricing"]["totals"]["total"] > 0


def test_priced_descriptions_include_product_selections(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = _draft()
    draft["windows"][0]["description"] = ""
    draft["windows"][0]["spec"]["colour_ext"] = "black"
    draft["windows"][0]["spec"]["glazing"].update({"i89": True, "triple": True})
    draft["doors"][0]["description"] = ""

    created = client.post("/api/customer-estimates", json=draft)
    assert created.status_code == 200, created.text
    priced = client.post(f"/api/customer-estimates/{created.json()['id']}/price")
    assert priced.status_code == 200, priced.text

    body = priced.json()["pricing"]["sections"]
    window_description = body["windows"]["lines"][0]["description"]
    assert "WC-100" in window_description
    assert "black" in window_description
    assert "LoE 180" in window_description
    assert "i89" in window_description
    assert "Triple pane" in window_description
    assert "Argon gas" in window_description

    door_description = body["doors"]["openings"][0]["label"]
    assert "Fiberglass" in door_description
    assert "Stain 2 Sides, 1 Colour" in door_description
    assert "Oak 6-Panel" in door_description
    assert "Chinchilla" in door_description
    assert "Hight Performance Fixed Sill" in door_description


def test_metadata_edits_preserve_pricing_but_product_edits_make_it_stale(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/customer-estimates", json=_draft(mixed=False))
    estimate_id = created.json()["id"]
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200

    metadata = _draft(mixed=False)
    metadata["customer_name"] = "Updated Customer"
    metadata["description"] = "Updated scope"
    metadata["windows"][0]["location"] = "Updated living room"
    metadata["windows"][0]["description"] = "Customer-friendly window description"
    saved = client.put(f"/api/customer-estimates/{estimate_id}", json=metadata)
    assert saved.status_code == 200
    assert saved.json()["status"] == "priced"
    assert saved.json()["pricing"] is not None

    product = _draft(mixed=False)
    product["windows"][0]["spec"]["width"] = 42
    stale = client.put(f"/api/customer-estimates/{estimate_id}", json=product)
    assert stale.status_code == 200
    assert stale.json()["status"] == "draft"
    assert stale.json()["pricing"] is None


def test_review_required_project_cannot_finalize(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = _draft(mixed=False)
    draft["windows"][0]["spec"]["screen"] = True
    created = client.post("/api/customer-estimates", json=draft)
    estimate_id = created.json()["id"]
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200
    assert priced.json()["pricing"]["review_required"] is True
    finalized = client.post(f"/api/customer-estimates/{estimate_id}/finalize")
    assert finalized.status_code == 422


def test_finalize_requires_line_locations(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = _draft()
    draft["windows"][0]["location"] = ""
    draft["doors"][0]["location"] = ""
    created = client.post("/api/customer-estimates", json=draft)
    assert created.status_code == 200
    estimate_id = created.json()["id"]

    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200

    finalized = client.post(f"/api/customer-estimates/{estimate_id}/finalize")
    assert finalized.status_code == 422
    detail = finalized.json()["detail"]
    assert detail["code"] == "locations_required"
    assert "window item 1" in detail["message"]
    assert "door item 1" in detail["message"]

    filled = dict(draft)
    filled["windows"][0]["location"] = "Bedroom"
    filled["doors"][0]["location"] = "Front entrance"
    saved = client.put(f"/api/customer-estimates/{estimate_id}", json=filled)
    assert saved.status_code == 200
    assert saved.json()["status"] == "priced"

    finalized = client.post(f"/api/customer-estimates/{estimate_id}/finalize")
    assert finalized.status_code == 200, finalized.text
    body = finalized.json()
    assert body["windows"][0]["location"] == "Bedroom"
    assert body["doors"][0]["location"] == "Front entrance"


def test_crm_link_is_kept_filterable_and_carried_into_revisions(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    linked = client.post(
        "/api/customer-estimates",
        json={**_draft(), "crm_opportunity_id": "opp-1", "crm_contact_id": "contact-1"},
    ).json()
    client.post("/api/customer-estimates", json=_draft())
    assert linked["crm_opportunity_id"] == "opp-1"
    assert linked["crm_contact_id"] == "contact-1"

    # The estimating UI saves without the link fields; that keeps the link.
    updated = client.put(f"/api/customer-estimates/{linked['id']}", json={**_draft(), "notes": "Edited"}).json()
    assert updated["crm_opportunity_id"] == "opp-1"

    matches = client.get("/api/customer-estimates?crm_opportunity_id=opp-1").json()
    assert [row["id"] for row in matches] == [linked["id"]]
    assert matches[0]["crm_opportunity_id"] == "opp-1"

    assert client.post(f"/api/customer-estimates/{linked['id']}/price").status_code == 200
    assert client.post(f"/api/customer-estimates/{linked['id']}/finalize").status_code == 200
    revision = client.post(f"/api/customer-estimates/{linked['id']}/revise").json()
    assert revision["crm_opportunity_id"] == "opp-1"
    duplicate = client.post(f"/api/customer-estimates/{linked['id']}/duplicate").json()
    assert duplicate["crm_opportunity_id"] is None


def test_quote_first_project_can_be_linked_after_finalizing(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    estimate_id = client.post("/api/customer-estimates", json=_draft()).json()["id"]
    assert client.post(f"/api/customer-estimates/{estimate_id}/price").status_code == 200
    assert client.post(f"/api/customer-estimates/{estimate_id}/finalize").status_code == 200

    linked = client.put(
        f"/api/customer-estimates/{estimate_id}/crm-link",
        json={"crm_opportunity_id": "opp-9", "crm_contact_id": "contact-9"},
    )
    assert linked.status_code == 200
    assert linked.json()["crm_opportunity_id"] == "opp-9"
    assert linked.json()["status"] == "finalized"
    assert client.put(f"/api/customer-estimates/{estimate_id}/crm-link", json={"crm_opportunity_id": ""}).status_code == 422
    events = [event["kind"] for event in client.get(f"/api/customer-estimates/{estimate_id}/events").json()]
    assert "crm_linked" in events


def _casement_details() -> dict:
    return {
        "tag": "7",
        "elevation": "front",
        "sections": [{"operation": "casement", "handing": "left"}],
        "screen": {"frame_colour": "white", "mesh_colour": "black"},
        "hardware": "Fold-away handle (white)",
        "spacer": "Black",
        "jamb_finish": "primed",
        "notes": "Egress bedroom window",
    }


def test_window_details_round_trip_and_do_not_affect_pricing(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = _draft(mixed=False)
    draft["windows"][0]["details"] = _casement_details()
    created = client.post("/api/customer-estimates", json=draft)
    assert created.status_code == 200, created.text
    estimate_id = created.json()["id"]

    fetched = client.get(f"/api/customer-estimates/{estimate_id}").json()
    assert fetched["windows"][0]["details"] == _casement_details()
    # details stay out of the engine line
    assert "details" not in fetched["windows"][0]["spec"]

    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    priced_body = priced.json()
    assert priced_body["pricing"]["review_required"] is False
    original_hash = priced_body["pricing_hash"]

    # Same spec, no details at all: identical pricing hash.
    bare = client.post("/api/customer-estimates", json=_draft(mixed=False)).json()
    bare_priced = client.post(f"/api/customer-estimates/{bare['id']}/price").json()
    assert bare_priced["windows"][0]["details"] is None
    assert bare_priced["pricing_hash"] == original_hash
    assert bare_priced["pricing"]["totals"] == priced_body["pricing"]["totals"]

    # Editing only details keeps the saved pricing snapshot current.
    changed = _draft(mixed=False)
    changed["windows"][0]["details"] = {**_casement_details(), "tag": "8", "screen": None, "sections": [{"operation": "casement", "handing": "right"}]}
    saved = client.put(f"/api/customer-estimates/{estimate_id}", json=changed)
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "priced"
    assert saved.json()["pricing_hash"] == original_hash
    refetched = client.get(f"/api/customer-estimates/{estimate_id}").json()
    assert refetched["windows"][0]["details"]["tag"] == "8"
    assert refetched["windows"][0]["details"]["screen"] is None
    assert refetched["windows"][0]["details"]["sections"] == [{"operation": "casement", "handing": "right"}]


def test_window_details_append_through_lines_endpoint(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = _draft(mixed=False)
    draft["windows"] = []
    draft["doors"] = [_door_opening()]
    estimate_id = client.post("/api/customer-estimates", json=draft).json()["id"]
    line = _window_line("w-details")
    line["details"] = _casement_details()
    assigned = client.post(f"/api/customer-estimates/{estimate_id}/lines", json={"windows": [line]})
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["windows"][0]["details"] == _casement_details()


def test_window_details_reject_unknown_operation(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = _draft(mixed=False)
    draft["windows"][0]["details"] = {"sections": [{"operation": "pivot", "handing": None}]}
    assert client.post("/api/customer-estimates", json=draft).status_code == 422


def test_manager_override_needs_no_token_while_none_is_set(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    monkeypatch.delenv("PRICING_ADMIN_TOKEN", raising=False)
    draft = _draft(mixed=False)
    estimate_id = client.post("/api/customer-estimates", json=draft).json()["id"]
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    maximum_discount = priced.json()["pricing"]["window_quote"]["sales_pricing"]["maximum_allowed_discount_percent"]

    draft["commercial"]["negotiated_discount_percent"] = maximum_discount + 1
    draft["commercial"]["manager_override_reason"] = "Approved customer offer"
    assert client.put(f"/api/customer-estimates/{estimate_id}", json=draft).status_code == 200
    approved = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert approved.status_code == 200, approved.text
    assert approved.json()["pricing"]["window_quote"]["sales_pricing"]["floor_status"] == "manager_override"


def test_pdf_logo_ships_with_the_backend():
    # The Vercel API bundle has no frontend/ folder; the logo must live under services/.
    from services.estimate_documents import LOGO_PATH

    assert LOGO_PATH.exists()
    assert "frontend" not in LOGO_PATH.parts


def test_agreed_total_over_the_limit_prices_while_the_manager_token_is_off(tmp_path, monkeypatch):
    # The Abbey case: an agreed total far below list, no override reason, no token set up.
    client = _client(tmp_path, monkeypatch)
    monkeypatch.delenv("PRICING_ADMIN_TOKEN", raising=False)
    draft = _draft(mixed=False)
    estimate_id = client.post("/api/customer-estimates", json=draft).json()["id"]
    listed = client.post(f"/api/customer-estimates/{estimate_id}/price").json()["pricing"]["totals"]["total"]

    draft["commercial"]["agreed_customer_total"] = round(listed * 0.8, 2)
    draft["commercial"]["manager_override_reason"] = None
    assert client.put(f"/api/customer-estimates/{estimate_id}", json=draft).status_code == 200
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    assert priced.json()["pricing"]["totals"]["total"] == pytest.approx(listed * 0.8, abs=0.05)


def test_estimate_carries_gst_number_general_notes_and_collection_features(tmp_path, monkeypatch):
    # As the QuickBooks estimates: GST/HST number, product features per collection, general notes.
    from io import BytesIO

    from pypdf import PdfReader

    client = _client(tmp_path, monkeypatch)
    draft = _draft(mixed=False)
    draft["windows"].append({"id": "p1", "location": "Rear", "spec": {
        "type": "patio_sliding", "nominal_ft": 5, "operation": "XO", "colour_ext": "black", "accessories": []}})
    estimate_id = client.post("/api/customer-estimates", json=draft).json()["id"]
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text

    copy = priced.json()["document"]
    assert copy["gst_number"] == "809807191"
    assert "Includes disposal of old windows/doors." in copy["general_notes"]
    assert copy["payment_terms"][0].startswith("35% deposit")
    classic, patio = copy["collections"]
    assert (classic["key"], patio["key"]) == ("classic", "patio_sliding")
    assert classic["summary"][0].startswith("To supply and install: 1 new Classic Collection window ")
    assert patio["summary"][1:] == ["Exterior colour: Black", "Interior colour: White"]
    assert "Twin point hardware standard." in patio["features"]

    pdf = client.get(f"/api/customer-estimates/{estimate_id}/pdf")
    assert pdf.status_code == 200, pdf.text
    text = " ".join(page.extract_text() for page in PdfReader(BytesIO(pdf.content)).pages)
    for expected in ("GST/HST number: 809807191", "GENERAL NOTES", "TERMS OF PAYMENT", "Sliding Collection patio door",
                     "CLIENT SIGNATURE"):
        assert expected in text


def test_collection_features_follow_settings(tmp_path, monkeypatch):
    from services import business_settings

    client = _client(tmp_path, monkeypatch)
    settings = business_settings.get_group("estimate_document")
    settings["collections"]["classic"] = {"title": "", "features": "* Fusion-welded corners\n\n- Steel reinforced"}
    business_settings.save_group("estimate_document", settings)
    estimate_id = client.post("/api/customer-estimates", json=_draft(mixed=False)).json()["id"]
    (block,) = client.post(f"/api/customer-estimates/{estimate_id}/price").json()["document"]["collections"]
    assert block["title"] == 'Classic 3 1/4" (WC-100 series) windows'
    assert block["features"] == ["Fusion-welded corners", "Steel reinforced"]


def test_primed_in_white_lines_are_left_off_dark_interior_jobs(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = _draft(mixed=False)
    draft["windows"][0]["spec"].update(colour_ext="black", colour_int="black")  # black in/out, like the Abbey job
    estimate_id = client.post("/api/customer-estimates", json=draft).json()["id"]
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    copy = priced.json()["document"]
    assert not any("primed in white" in line for line in copy["general_notes"])
    assert not any("primed in white" in line for line in copy["collections"][0]["features"])
    assert "Includes disposal of old windows/doors." in copy["general_notes"]

    draft["windows"][0]["spec"]["colour_int"] = "white"
    assert client.put(f"/api/customer-estimates/{estimate_id}", json=draft).status_code == 200
    copy = client.post(f"/api/customer-estimates/{estimate_id}/price").json()["document"]
    assert "Includes interior casing primed in white." in copy["general_notes"]


def _pipeline_door(interior: dict, **extras) -> dict:
    selection = {
        "material": "steel", "width": 36, "height": '6\'8"', "configuration": "single", "frame_depth": "4.625",
        "model": "orleans", "colours": {"exterior": {"type": "painted", "colour": "Black"}, "interior": interior},
        "glass": {"door": {"glazed": False}}, "standard": {"lock": "double_bore"}, "extras": extras,
    }
    return {"id": "d1", "location": "Front entry", "spec": {
        "label": "Front entry", "material": "steel", "opening_type": "single_door", "pipeline": selection}}


def test_door_only_estimates_print_the_palma_door_notes(tmp_path, monkeypatch):
    # As QuickBooks door estimate 2143: Palma door system, 5 to 8 weeks, no Window City lines.
    client = _client(tmp_path, monkeypatch)
    draft = {**_draft(), "windows": []}
    estimate_id = client.post("/api/customer-estimates", json=draft).json()["id"]
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    notes = priced.json()["document"]["general_notes"]
    assert notes[0] == "Palma Door entrance door system."
    assert "Estimated delivery time for entrance doors at this moment: 5 to 8 weeks." in notes
    assert not any("window city" in line.lower() for line in notes)
    # A stained door still gets our white primed casing (QuickBooks estimate 1499).
    assert "Includes interior casing primed in white." in notes
    assert "Includes disposal of old windows/doors." in notes

    # The builder saves its own summary as the description; the breakdown doesn't repeat it.
    draft["doors"] = [{**_pipeline_door({"type": "white"}),
                       "description": "Opening 1 - Steel - 36\" x 6'8\" - Single - Orleans slab - Solid slab - Double-bore prep"}]
    assert client.put(f"/api/customer-estimates/{estimate_id}", json=draft).status_code == 200
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    assert "Includes interior casing primed in white." in priced.json()["document"]["general_notes"]
    (opening,) = priced.json()["pricing"]["sections"]["doors"]["openings"]
    assert opening["scope"] == "To supply and install: Single door"
    assert opening["details"][0].startswith("Frame system:")
    assert "Interior door colour: Factory white" in opening["details"]

    # One the rep wrote stays, first.
    draft["doors"][0]["description"] = "Keep the existing mail slot opening"
    assert client.put(f"/api/customer-estimates/{estimate_id}", json=draft).status_code == 200
    (opening,) = client.post(f"/api/customer-estimates/{estimate_id}/price").json()["pricing"]["sections"]["doors"]["openings"]
    assert opening["details"][0] == "Keep the existing mail slot opening"

    # Palma's finished casing trim replaces ours: the primed line goes.
    draft["doors"] = [_pipeline_door({"type": "white"}, casing=True)]
    assert client.put(f"/api/customer-estimates/{estimate_id}", json=draft).status_code == 200
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    assert not any("primed in white" in line for line in priced.json()["document"]["general_notes"])

    # Windows and doors together: the Window City notes, then the door lines not already there.
    estimate_id = client.post("/api/customer-estimates", json=_draft()).json()["id"]
    notes = client.post(f"/api/customer-estimates/{estimate_id}/price").json()["document"]["general_notes"]
    assert notes[0] == "All windows are Window City Industries manufactured."
    assert any(line.startswith("Window City warranty") for line in notes)
    assert "Palma Door entrance door system." in notes
    assert notes.count("Labour warranty: 15 years.") == 1


def test_payment_terms_can_be_set_per_estimate(tmp_path, monkeypatch):
    # 35/65 stays the company default; one estimate (Abbey) can be 50/50.
    client = _client(tmp_path, monkeypatch)
    draft = _draft(mixed=False)
    estimate_id = client.post("/api/customer-estimates", json=draft).json()["id"]
    copy = client.post(f"/api/customer-estimates/{estimate_id}/price").json()["document"]
    assert copy["payment_terms"] == copy["default_payment_terms"] == [
        "35% deposit upon signing.", "65% due upon project completion."]

    assert copy["payment_schedule"] == copy["default_payment_schedule"] == [
        {"trigger": "deposit", "percentage": 35.0}, {"trigger": "completion", "percentage": 65.0}]

    # The 50 / 50 preset, sent in any order: stored deposit first, worded on the estimate.
    draft["payment_schedule"] = [{"trigger": "completion", "percentage": 50}, {"trigger": "deposit", "percentage": 50}]
    saved = client.put(f"/api/customer-estimates/{estimate_id}", json=draft)
    assert saved.status_code == 200, saved.text
    assert saved.json()["payment_schedule"] == [{"trigger": "deposit", "percentage": 50.0}, {"trigger": "completion", "percentage": 50.0}]
    assert saved.json()["document"]["payment_terms"] == ["50% deposit upon signing.", "50% due upon project completion."]
    assert saved.json()["document"]["payment_schedule"] == saved.json()["payment_schedule"]
    assert saved.json()["document"]["default_payment_terms"][0] == "35% deposit upon signing."

    # A save that leaves the field out (e.g. from the CRM) keeps the estimate's schedule.
    del draft["payment_schedule"]
    assert client.put(f"/api/customer-estimates/{estimate_id}", json=draft).json()["payment_schedule"][0]["percentage"] == 50

    # Schedules must start with a deposit and add up to 100%.
    for bad in ([{"trigger": "deposit", "percentage": 50}, {"trigger": "completion", "percentage": 40}],
                [{"trigger": "delivery", "percentage": 50}, {"trigger": "completion", "percentage": 50}]):
        assert client.put(f"/api/customer-estimates/{estimate_id}", json={**draft, "payment_schedule": bad}).status_code == 422

    client.post(f"/api/customer-estimates/{estimate_id}/price")
    pdf = client.get(f"/api/customer-estimates/{estimate_id}/pdf")
    from io import BytesIO

    from pypdf import PdfReader

    text = " ".join(page.extract_text() for page in PdfReader(BytesIO(pdf.content)).pages)
    assert "50% due upon project completion." in text and "65%" not in text

    other = client.post("/api/customer-estimates", json=_draft(mixed=False)).json()["id"]
    assert client.post(f"/api/customer-estimates/{other}/price").json()["document"]["payment_terms"][0].startswith("35%")

    # Back to the company default.
    cleared = client.put(f"/api/customer-estimates/{estimate_id}", json={**draft, "payment_schedule": None}).json()
    assert cleared["payment_schedule"] is None and cleared["document"]["payment_terms"][0].startswith("35%")


def test_terms_typed_before_schedules_still_print(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    draft = {**_draft(mixed=False), "payment_terms": "40% deposit upon signing.\n60% on completion."}
    estimate_id = client.post("/api/customer-estimates", json=draft).json()["id"]
    copy = client.post(f"/api/customer-estimates/{estimate_id}/price").json()["document"]
    assert copy["payment_terms"] == ["40% deposit upon signing.", "60% on completion."]
    assert copy["payment_schedule"] is None  # nothing structured for the CRM to bill against


def test_company_payment_schedule_is_validated(tmp_path, monkeypatch):
    from services import business_settings

    _client(tmp_path, monkeypatch)
    settings = business_settings.get_group("estimate_document")
    with pytest.raises(ValueError):
        business_settings.save_group("estimate_document", {**settings, "payment_schedule": [{"trigger": "deposit", "percentage": 90}]})
    saved = business_settings.save_group("estimate_document", {**settings, "payment_schedule": [
        {"trigger": "deposit", "percentage": 50}, {"trigger": "delivery", "percentage": 25}, {"trigger": "completion", "percentage": 25}]})
    assert [entry["percentage"] for entry in saved["payment_schedule"]] == [50, 25, 25]
