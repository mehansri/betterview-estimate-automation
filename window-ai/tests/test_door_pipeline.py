"""Step-by-step entrance door pipeline: availability, pricing and step rules."""

from __future__ import annotations

import copy

import pytest
from fastapi.testclient import TestClient

from api.main import app
from services.doors import catalog
from services.doors.pipeline import build_index, finish_for, pipeline_catalog
from services.doors.pricing import DoorValidationError, load_config, quote


CFG = load_config()
CATALOG = pipeline_catalog(CFG)


def _models(material: str, width: int, height: str) -> list[str]:
    return [
        model["label"]
        for model in CATALOG["materials"][material]["models"]
        if any(offer["height"] == height and width in offer["widths"] for offer in model["offers"])
    ]


def _fiberglass_selection(**overrides) -> dict:
    selection = {
        "material": "fiberglass",
        "width": 36,
        "height": '6\'8"',
        "configuration": "single_1sl",
        "frame_depth": "4.625",
        "model": "oak-6-panel",
        "colours": {
            "exterior": {"type": "stained", "colour": "Walnut"},
            "interior": {"type": "stained", "colour": "Walnut"},
        },
        "glass": {
            "door": {"glazed": True, "size": "22x36", "family": "decorative"},
            "sidelites": [{"model": "oak-6-panel", "glazed": True, "size": "8x36", "family": "decorative"}],
        },
        "standard": {"lock": "double_bore"},
    }
    selection.update(overrides)
    return selection


def _spec(selection: dict) -> dict:
    return {"label": "Front entry", "material": selection.get("material") or "steel", "opening_type": "single_door", "pipeline": selection}


def test_discount_is_sixty_percent_off_list():
    assert CFG["discount"] == pytest.approx(0.40)
    result = quote(_spec(_fiberglass_selection()), CFG)
    assert result["discount"] == pytest.approx(0.40)
    assert result["material_cost"] == pytest.approx(round(result["list_total"] * 0.40, 2))


def test_size_filters_the_catalogue():
    # 42" and 8' slabs are limited; steel narrows to the flush slab.
    assert _models("steel", 42, '6\'8"') == ["Flush"]
    assert _models("steel", 36, '8\'0"') == ["Flush"]
    assert len(_models("steel", 36, '6\'8"')) > 15
    standard = set(_models("fiberglass", 36, '6\'8"'))
    wide = set(_models("fiberglass", 42, '6\'8"'))
    tall = set(_models("fiberglass", 36, '8\'0"'))
    assert "Oak 6-Panel" in standard and "Oak 6-Panel" not in wide and "Oak 6-Panel" not in tall
    assert wide < standard | wide and len(wide) < len(standard)
    assert "Oak Flush" in wide and "Oak Flush" in tall


def test_42_inch_glass_is_flush_only():
    for material in ("steel", "fiberglass"):
        for model in CATALOG["materials"][material]["models"]:
            for offer in model["offers"]:
                if offer["kind"] == "glazed" and 42 in offer["widths"]:
                    assert "Flush" in model["label"], (material, model["label"])


def test_42_inch_steel_adder_names_only_the_quoted_width():
    selection = {
        "material": "steel",
        "width": 42,
        "height": '6\'8"',
        "configuration": "single",
        "frame_depth": "4.625",
        "model": "flush",
        "colours": {"exterior": {"type": "painted", "colour": "Black"}, "interior": {"type": "white"}},
        "glass": {"door": {"glazed": False}},
        "standard": {"lock": "double_bore"},
    }
    result = quote(_spec(selection), CFG)
    adder = next(item for item in result["line_items"] if "Non-Standard" in item["description"])
    assert adder["customer_description"] == 'Non-Standard Panel 42" Steel Slab'
    assert "24" not in adder["description"] and "38" not in adder["description"]


def test_every_offered_combination_prices():
    """Nothing the configurator shows may be rejected when priced."""
    finishes = {"steel": ("painted", "painted"), "fiberglass": ("painted", "painted")}
    priced = 0
    for material in ("steel", "fiberglass"):
        ext, inner = finishes[material]
        for model in CATALOG["materials"][material]["models"]:
            for offer in model["offers"]:
                width = offer["widths"][0]
                base = {
                    "material": material,
                    "width": width,
                    "height": offer["height"],
                    "configuration": "single",
                    "frame_depth": "4.625",
                    "model": model["key"],
                    "colours": {"exterior": {"type": ext, "colour": "Black"}, "interior": {"type": inner, "colour": "Black"}},
                    "standard": {"lock": "double_bore"},
                }
                if offer["kind"] == "solid":
                    quote(_spec({**base, "glass": {"door": {"glazed": False}}}), CFG)
                    priced += 1
                    continue
                for size, families in offer["glass"].items():
                    for family, series in families.items():
                        choice = {"glazed": True, "size": size, "family": family, "series": series[-1]}
                        result = quote(_spec({**base, "glass": {"door": choice}}), CFG)
                        assert result["line_items"][0]["unit_list"] > 0
                        priced += 1
    assert priced > 500


def test_every_offered_sidelite_prices():
    for material in ("steel", "fiberglass"):
        for sidelite in CATALOG["materials"][material]["sidelite_models"]:
            for offer in sidelite["offers"]:
                height = offer["height"]
                door_model = "flush" if material == "steel" else "oak-flush"
                door_offer = next(
                    item for item in next(m for m in CATALOG["materials"][material]["models"] if m["key"] == door_model)["offers"]
                    if item["height"] == height
                )
                door_glass = {"glazed": door_offer["kind"] == "glazed"}
                if door_offer["kind"] == "glazed":
                    size, families = next(iter(door_offer["glass"].items()))
                    door_glass.update({"size": size, "family": next(iter(families))})
                parts = []
                if offer["kind"] == "solid":
                    parts = [{"model": sidelite["key"], "glazed": False, "panel": panel} for panel in offer["panels"]]
                else:
                    parts = [
                        {"model": sidelite["key"], "glazed": True, "size": size, "family": family}
                        for size, families in offer["glass"].items()
                        for family in families
                    ]
                for part in parts:
                    selection = {
                        "material": material,
                        "width": door_offer["widths"][0],
                        "height": height,
                        "configuration": "single_1sl",
                        "frame_depth": "4.625",
                        "model": door_model,
                        "colours": {"exterior": {"type": "painted"}, "interior": {"type": "painted"}},
                        "glass": {"door": door_glass, "sidelites": [part]},
                        "standard": {"lock": "double_bore"},
                    }
                    result = quote(_spec(selection), CFG)
                    assert any(item["row"] == "Sidelite" for item in result["line_items"])


def test_decorative_glass_is_one_flat_price_at_the_dearest_group():
    rows = [
        row
        for row in catalog.slabs("fiberglass")
        if row["component"] == "door" and row["panel"] == "Oak 6-Panel" and row["glass_size"] == "22x36"
        and row["series"] in {"group_a", "group_b", "group_c", "group_d"}
    ]
    dearest = max(row["prices"]["stain_2s_1c"] for row in rows)
    result = quote(_spec(_fiberglass_selection()), CFG)
    door = result["line_items"][0]
    assert door["unit_list"] == dearest
    assert "Decorative glass 22x36" in door["description"]
    # The chosen pattern is recorded but never moves the price.
    with_design = _fiberglass_selection()
    with_design["glass"]["door"]["design"] = "Chinchilla"
    assert quote(_spec(with_design), CFG)["line_items"][0]["unit_list"] == dearest


def test_colour_choices_map_to_book_columns():
    assert finish_for("steel", {"exterior": {"type": "white"}, "interior": {"type": "white"}}) == "factory_white"
    assert finish_for("steel", {"exterior": {"type": "painted", "colour": "Black"}, "interior": {"type": "white"}}) == "paint_1s"
    assert finish_for("steel", {"exterior": {"type": "painted", "colour": "Black"}, "interior": {"type": "painted", "colour": "White"}}) == "paint_2s_2c"
    assert finish_for("fiberglass", {"exterior": {"type": "stained", "colour": "Oak"}, "interior": {"type": "painted", "colour": "White"}}) == "stain_out_paint_in"
    assert finish_for("fiberglass", {"exterior": {"type": "stained", "colour": "Oak"}, "interior": {"type": "stained", "colour": "oak"}}) == "stain_2s_1c"
    with pytest.raises(DoorValidationError):
        quote(_spec(_fiberglass_selection(colours={"exterior": {"type": "painted"}, "interior": {"type": "stained"}})), CFG)


def test_standard_options_and_conditional_extras():
    selection = _fiberglass_selection(
        configuration="double_2sl_transom",
        glass={
            "door": {"glazed": False},
            "sidelites": [{"model": "oak-6-panel", "glazed": True, "size": "8x36", "family": "clear"}] * 2,
            "transom": {"glass": "clear_lowe_glass"},
        },
        standard={"lock": "multipoint", "handle": "Berkeley Gripset (Black, Satin Nickel, Dark Bronze, Pewter)"},
        extras={"tedee": True, "astragal_lock": True, "screen": "white"},
    )
    result = quote(_spec(selection), CFG)
    items = {item["description"]: item for item in result["line_items"]}
    rows = [item["row"] for item in result["line_items"]]
    assert result["opening_type"] == "double_2_sidelites"
    assert result["install"] == CFG["install"]["double_2_sidelites"] + CFG["install"]["transom_adder"]
    assert any("Black Anodized" in text for text in items)  # default sill
    assert any("Matte Black hinges" in text and item["qty"] == 2 for text, item in items.items())
    assert any("101\"" in text and "Brickmould" in text for text in items)  # transom -> tall brickmould
    handles = [item for item in result["line_items"] if item["description"].startswith("Berkeley")]
    assert sorted(item["unit_list"] for item in handles) == [660.0, 1620.0]  # active + dummy leaf
    assert any("inactive leaf" in item["customer_description"] for item in handles)
    assert any("Tedee-PRO" in text for text in items)
    assert any("Astragal" in text for text in items)
    assert any(text == "White RETRACTABLE Screen*" for text in items)
    assert rows.count("Transom") == 2

    # Lock prep is a required choice; Tedee needs the multipoint; astragal needs a double.
    for bad in (
        _fiberglass_selection(standard={}),
        _fiberglass_selection(extras={"tedee": True}),
        _fiberglass_selection(extras={"astragal_lock": True}),
    ):
        with pytest.raises(DoorValidationError):
            quote(_spec(bad), CFG)


def test_custom_cut_down_and_tall_system_upcharges():
    selection = {
        "material": "steel",
        "width": 36,
        "height": '8\'0"',
        "custom_size": {"enabled": True, "width_in": 35.5, "height_in": 94},
        "configuration": "single_1sl",
        "frame_depth": "4.625",
        "model": "flush",
        "colours": {"exterior": {"type": "white"}, "interior": {"type": "white"}},
        "glass": {"door": {"glazed": False}, "sidelites": [{"model": "solid-panel", "glazed": False, "panel": "Flush"}]},
        "standard": {"lock": "double_bore"},
    }
    result = quote(_spec(selection), CFG)
    by_text = {item["description"]: item for item in result["line_items"]}
    cut = next(item for text, item in by_text.items() if text.startswith("Cut-Down"))
    tall = next(item for text, item in by_text.items() if text.startswith("8' System"))
    assert cut["qty"] == 2 and cut["unit_list"] == 100  # height cut: door + sidelite
    assert tall["qty"] == 2 and tall["unit_list"] == 375

    too_big = copy.deepcopy(selection)
    too_big["custom_size"]["width_in"] = 37
    with pytest.raises(DoorValidationError):
        quote(_spec(too_big), CFG)


def test_frame_depth_rules():
    depths = {row["key"]: row for row in CATALOG["materials"]["fiberglass"]["frame_depths"]}
    assert depths["5.625"]["frame_types"] == ["smooth"]
    assert "5.625" not in {row["key"] for row in CATALOG["materials"]["steel"]["frame_depths"]}
    with pytest.raises(DoorValidationError):  # textured frame, smooth-only jamb
        quote(_spec(_fiberglass_selection(frame_depth="5.625")), CFG)
    smooth = quote(_spec(_fiberglass_selection(frame_depth="5.625", frame_type="smooth")), CFG)
    assert any("5-5/8 Jamb" in item["description"] for item in smooth["line_items"])
    # Outswing sills do not fit the 7-5/8" jamb.
    with pytest.raises(DoorValidationError):
        quote(_spec(_fiberglass_selection(frame_depth="7.625", standard={"lock": "double_bore", "sill": "outswing"})), CFG)


def test_fire_rated_needs_a_price_because_the_book_has_none():
    with pytest.raises(DoorValidationError):
        quote(_spec(_fiberglass_selection(extras={"fire_rated": True})), CFG)
    result = quote(_spec(_fiberglass_selection(extras={"fire_rated": True, "fire_rated_list": 450})), CFG)
    assert any(item["description"] == "Fire-rated panel upcharge" and item["unit_list"] == 450 for item in result["line_items"])


def test_index_models_have_unique_keys():
    for material in ("steel", "fiberglass"):
        index = build_index(material)
        assert len(index["doors"]) == len(CATALOG["materials"][material]["models"])


@pytest.mark.usefixtures("no_profit_floor")
def test_pipeline_api_round_trip():
    client = TestClient(app)
    body = client.get("/api/doors/catalog").json()
    assert body["pipeline"]["discount"] == pytest.approx(0.40)
    assert len(body["pipeline"]["configurations"]) == 9
    # Availability only: no price columns leak into the configurator payload.
    assert "prices" not in str(body["pipeline"])

    response = client.post("/api/doors/quote", json={"openings": [_spec(_fiberglass_selection())]})
    assert response.status_code == 200, response.text
    opening = response.json()["customer_presentation"]["openings"][0]
    assert "Oak 6-Panel" in opening["label"]

    bad = _fiberglass_selection(model="flush-wg00", width=42, glass={"door": {"glazed": True, "size": "22x36", "family": "decorative"}})
    rejected = client.post("/api/doors/quote", json={"openings": [_spec(bad)]})
    assert rejected.status_code == 422


def test_saved_builder_description_is_not_repeated_on_the_estimate():
    from services.descriptions import door_description
    from services.doors.pipeline import pipeline_summary

    selection = _fiberglass_selection(standard={"lock": "multipoint", "handle": "Berkeley Gripset (Black, Satin Nickel, Dark Bronze, Pewter)"})
    summary = " - ".join(pipeline_summary(selection))
    assert summary.startswith('Fiberglass - 36" x 6\'8" - Single + sidelite - Oak 6-Panel slab - Decorative glass 22x36')
    assert "Stained 2 sides, 1 colour" in summary and "Multipoint lock: Berkeley Gripset" in summary
    # The builder saves "<label> - <same summary>" as the line description.
    saved = f"Front entry - {summary}"
    opening = {"description": saved, "spec": {**_spec(selection), "label": "Front entry"}}
    assert door_description(opening) == saved


def test_door_drawing_geometry_follows_the_configuration():
    from services.doors.pipeline import door_drawing

    selection = _fiberglass_selection(
        configuration="single_2sl_transom",
        glass={
            "door": {"glazed": True, "size": "22x36", "family": "decorative"},
            "sidelites": [{"model": "oak-6-panel", "glazed": True, "size": "8x36", "family": "clear"}, {"model": "oak-6-panel", "glazed": False}],
            "transom": {"glass": "clear_lowe_glass"},
        },
        standard={"lock": "multipoint", "handle": "Berkeley Gripset (Black, Satin Nickel, Dark Bronze, Pewter)"},
    )
    geometry = door_drawing(_spec(selection))
    assert geometry["doors"] == 1 and geometry["sidelites"] == 2 and geometry["transom"] is True
    assert (geometry["slab_width"], geometry["slab_height"], geometry["model"]) == (36.0, 80.0, "Oak 6-Panel")
    assert geometry["door_glass"] == {"size": "22x36", "family": "decorative"}
    assert geometry["sidelite_glass"] == [{"size": "8x36", "family": "clear"}, None]
    assert geometry["slab_colour"] == "#5d3a1a"  # walnut stain
    assert geometry["lock"] == "multipoint"

    cut = _fiberglass_selection(custom_size={"enabled": True, "width_in": 35, "height_in": 79})
    assert (door_drawing(_spec(cut))["slab_width"], door_drawing(_spec(cut))["slab_height"]) == (35.0, 79.0)
    # Incomplete selections are not drawn.
    assert door_drawing(_spec({"material": "steel"})) is None


def test_classic_openings_are_drawn_too():
    from services.doors.pipeline import door_drawing

    classic = {
        "material": "fiberglass",
        "finish": "stain_2s_1c",
        "opening_type": "double_2_sidelites",
        "door": {"series": "group_a", "glass_size": "22x64", "panel": "Oak Flush", "height": '8\'0"'},
        "sidelites": [{"series": "clear_lowe", "glass_size": "7x64"}, {"series": "solid_panel"}],
    }
    geometry = door_drawing(classic)
    assert geometry["doors"] == 2 and geometry["sidelites"] == 2 and geometry["slab_height"] == 96.0
    assert geometry["door_glass"] == {"size": "22x64", "family": "decorative"}
    assert geometry["sidelite_glass"] == [{"size": "7x64", "family": "clear"}, None]


@pytest.mark.usefixtures("no_profit_floor")
def test_estimate_openings_carry_the_drawing_and_the_pdf_draws_it():
    from services.estimate_documents import door_drawing_flowable, render_pdf

    client = TestClient(app)
    response = client.post("/api/doors/quote", json={"openings": [_spec(_fiberglass_selection())]})
    opening = response.json()["customer_presentation"]["openings"][0]
    assert opening["drawing"]["model"] == "Oak 6-Panel"

    assert door_drawing_flowable(opening["drawing"], 90, 80) is not None
    assert door_drawing_flowable(None, 90, 80) is None
    view = {"sections": {"doors": {"subtotal": 100, "openings": [
        {**opening, "subtotal": 100},
        {"label": "Old snapshot without drawing", "items": [], "subtotal": 0},
    ]}}, "totals": {}}
    assert render_pdf(view)[:4] == b"%PDF"


def test_customer_lines_drop_price_book_tags():
    from services.doors.pricing import _customer_text

    assert _customer_text("[NEW] Composite 7-5/8 Jamb / box (available in smooth and woodgrain)") == "Composite 7-5/8 Jamb"
    assert _customer_text("*Tedee-PRO Smart Lock (Black or Silver)") == "Tedee-PRO Smart Lock"


def test_door_drawing_uses_the_crm_section_contract():
    """Betterview-Crm src/domain/drawn-item.ts drawingGeometrySchema: positioned sections in inches."""
    from services.doors.pipeline import door_drawing

    crm_operations = {"fixed", "casement", "awning", "single_slider", "double_slider", "single_hung", "double_hung", "sliding_panel"}
    selection = _fiberglass_selection(
        configuration="double_2sl_transom",
        glass={
            "door": {"glazed": True, "size": "22x36", "family": "decorative"},
            "sidelites": [{"model": "oak-6-panel", "glazed": True, "size": "8x36", "family": "clear"}] * 2,
            "transom": {"glass": "clear_lowe_glass"},
        },
    )
    geometry = door_drawing(_spec(selection))
    assert (geometry["width"], geometry["height"]) == (36 * 2 + 14 * 2, 80 + 14)
    sections = geometry["sections"]
    assert 1 <= len(sections) <= 24
    assert [(s["op"], s["hinge"]) for s in sections] == [
        ("fixed", None), ("fixed", None), ("casement", "left"), ("casement", "right"), ("fixed", None),
    ]
    for section in sections:
        assert section["op"] in crm_operations
        assert 0 < section["width"] <= 360 and 0 < section["height"] <= 360
        assert section["x"] >= 0 and section["y"] >= 0
        assert section["x"] + section["width"] <= geometry["width"] + 1e-6
        assert section["y"] + section["height"] <= geometry["height"] + 1e-6
        for lite in section.get("lites", []):
            assert lite["x"] >= 0 and lite["x"] + lite["width"] <= section["width"] + 1e-6
    assert sections[2]["panel"] == "solid" and sections[2]["lites"] == [{"x": 7.0, "y": 8.0, "width": 22.0, "height": 36.0}]
    assert geometry["exterior_colour"] == "Walnut stain"
