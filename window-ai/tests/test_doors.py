"""Regression coverage for the deterministic Palma Door quoting flow."""

from __future__ import annotations

from fastapi.testclient import TestClient

from api.main import app
from services.doors import catalog
from services.doors.pricing import load_config, quote, quote_project


def _live_opening() -> dict:
    return {
        "label": "Front entry",
        "material": "fiberglass",
        "finish": "stain 2 sides 1 colour",
        "opening_type": "single_1_sidelite",
        "door": {
            "glass": "Chinchilla",
            "glass_size": "22x36",
            "panel": "Oak 6-Panel",
        },
        "sidelites": [
            {"glass": "Chinchilla", "glass_size": "8x36"},
        ],
        "options": [
            {
                "category": "sills",
                "item": "Hight Performance Fixed Sill - Black Anodized / box (included with painted doors)",
            }
        ],
    }


def test_door_catalog_integrity():
    assert len(catalog.slabs("fiberglass")) == 588
    assert len(catalog.slabs("steel")) == 671
    assert len(catalog.data("glass_groups.json")) == 73
    for material in ("fiberglass", "steel"):
        expected = set(catalog.FINISHES[material])
        assert all(set(row["prices"]) == expected for row in catalog.slabs(material))
        assert all(
            all(value > 0 for value in row["prices"].values())
            for row in catalog.slabs(material)
            if row["kind"] == "slab"
        )


def test_reference_live_lookup_and_pricing_chain():
    result = quote(_live_opening(), load_config())
    assert result["list_total"] == 7875.0  # 4402 + 3453 + 20
    assert result["material_cost"] == 2992.5
    assert result["install"] == 750.0
    assert result["sell"] == 4865.25
    assert result["customer_total"] == 5497.73
    assert result["line_items"][0]["source"] == "fiberglass p5"


def test_transom_minimum_and_pull_bar_are_priced_once():
    spec = {
        "material": "fiberglass",
        "finish": "paint_2s_1c",
        "opening_type": "single_door",
        "door": {"series": "solid_panel", "panel": "Oak Flush"},
        "transom": {
            "shape": "rectangle",
            "glass": "decorative_glass",
            "sq_ft": 1,
        },
        "pull_bars": [
            {
                "style": "straight",
                "block": "with_multipoint_lock_and_t_bar_handle",
                "length_in": 36,
                "finish": "satin",
                "shape": "round",
            }
        ],
    }
    result = quote(spec, load_config())
    assert any(item["unit_list"] == 2415 for item in result["line_items"])
    assert any(item["unit_list"] == 1750 for item in result["line_items"])
    assert any("10 sq.ft. minimum" in note for note in result["notes"])
    assert result["install"] == 750.0  # 550 + 200 transom adder


def test_project_rollup_sums_openings():
    result = quote_project([_live_opening(), _live_opening()], load_config())
    assert len(result["openings"]) == 2
    assert result["totals"]["customer_total"] == 10995.46


def test_door_api_catalog_and_validation():
    client = TestClient(app)
    catalog_response = client.get("/api/doors/catalog")
    assert catalog_response.status_code == 200
    catalog_body = catalog_response.json()
    assert {entry["key"] for entry in catalog_body["materials"]} == {"fiberglass", "steel"}
    assert len(catalog_body["glass_groups"]) == 73

    valid = client.post("/api/doors/quote", json={"openings": [_live_opening()]})
    assert valid.status_code == 200, valid.text
    body = valid.json()
    assert body["totals"]["customer_total"] == 5497.73
    customer = body["customer_presentation"]
    assert customer["total"] == 5497.73
    assert customer["openings"][0]["items"]
    assert customer["openings"][0]["items"][-1]["description"] == "Professional installation"
    assert "material_cost" not in customer
    assert "markup" not in customer
    assert "list_total" not in customer["openings"][0]

    invalid = client.post(
        "/api/doors/quote",
        json={
            "openings": [
                {
                    **_live_opening(),
                    "opening_type": "single_door",
                }
            ]
        },
    )
    assert invalid.status_code == 422
    assert "sidelite count" in invalid.json()["detail"].lower()
