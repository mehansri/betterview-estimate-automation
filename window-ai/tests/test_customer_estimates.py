"""Customer estimate lifecycle and combined Windows + Doors behavior."""
from __future__ import annotations

from pathlib import Path

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
