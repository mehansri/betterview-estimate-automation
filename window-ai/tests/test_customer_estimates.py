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


def test_customer_estimate_manager_override_requires_token(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
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

    monkeypatch.setenv("PRICING_ADMIN_TOKEN", "manager-secret")
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
