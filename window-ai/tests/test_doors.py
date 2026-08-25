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
    assert result["list_total"] == 8385.0  # 4402 + 3453 + 20 sill + 60 hinges + 450 brickmould
    assert result["material_cost"] == 3186.3
    assert result["install"] == 750.0
    assert result["sell"] == 5117.19
    assert result["customer_total"] == 5782.42
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
    assert result["totals"]["customer_total"] == 11564.84


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
    assert body["totals"]["customer_total"] == 5782.42
    customer = body["customer_presentation"]
    assert customer["total"] == 5782.42
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


def test_standing_defaults_ride_on_every_opening():
    """Sill, HD hinges and brickmould go on unless overridden (order 29372 lesson)."""
    config = load_config()
    bare = {
        "material": "steel",
        "finish": "paint 1 side",
        "opening_type": "single_door",
        "door": {"series": "solid_panel", "panel": "Orleans"},
    }
    result = quote(bare, config)
    rows = {item["row"]: item for item in result["line_items"]}
    assert rows["Sill"]["list"] == 20.0
    assert rows["Hinges"]["list"] == 60.0
    assert rows["Brickmould"]["list"] == 300.0  # 84" painted x3

    # Factory white: standard brickmould is included, noted rather than priced.
    white = quote({**bare, "finish": "factory white"}, config)
    assert not any(item["row"] == "Brickmould" for item in white["line_items"])
    assert any("included at no charge" in note for note in white["notes"])

    # An explicit line overrides; skip_defaults silences.
    overridden = quote(
        {
            **bare,
            "finish": "factory white",
            "options": [{"category": "sills", "item": "Wheelchair"}],
            "skip_defaults": ["hinges", "brickmould"],
        },
        config,
    )
    rows = {item["row"] for item in overridden["line_items"]}
    assert "Hinges" not in rows
    assert any(
        item["row"] == "Sill" and item["list"] == 0.0
        for item in overridden["line_items"]
    )

    # Double door doubles the hinges; a transom selects 101" brickmould.
    double = quote(
        {
            **bare,
            "opening_type": "double_door",
            "door2": {"series": "solid_panel", "panel": "Orleans"},
            "transom": {"shape": "rectangle"},
        },
        config,
    )
    hinges = next(item for item in double["line_items"] if item["row"] == "Hinges")
    brickmould = next(item for item in double["line_items"] if item["row"] == "Brickmould")
    assert hinges["list"] == 120.0
    assert '101"' in brickmould["description"]


def test_design_names_the_pattern_without_moving_the_price():
    config = load_config()
    base = {
        "material": "fiberglass",
        "finish": "stain 2 sides 1 colour",
        "opening_type": "single_door",
        "door": {"series": "group_b", "glass_size": "22x36", "panel": "Oak 6-Panel"},
    }
    undecided = quote(base, config)
    assert any("design to be selected" in note for note in undecided["notes"])

    chosen = quote(
        {**base, "door": {**base["door"], "design": "Allure"}}, config
    )
    assert chosen["list_total"] == undecided["list_total"]
    assert "design: Allure" in chosen["line_items"][0]["description"]
