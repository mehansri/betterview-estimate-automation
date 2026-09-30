"""Door configurator rules added by the 2026-09-30 Palma price-book audit.

IDs (P1, M5, C1, R1...) refer to docs/palma-price-book-reconciliation.md.
"""

from __future__ import annotations

import pytest

from services.doors import catalog
from services.doors.pipeline import pipeline_catalog
from services.doors.pricing import DoorValidationError, load_config, quote


CFG = load_config()
CATALOG = pipeline_catalog(CFG)
BERKELEY = "Berkeley Gripset (Black, Satin Nickel, Dark Bronze, Pewter)"
EMTEK = "Prep for EMTEK Multi Point Lock Trim"
LARGE_LEVER = "Large Lever Handle: Verona, Miliano, Country, Ribbon and Miami Large (Active)"


def _sel(material: str, **overrides) -> dict:
    painted = {"type": "painted", "colour": "Black"}
    selection = {
        "material": material,
        "width": 36,
        "height": '6\'8"',
        "configuration": "single",
        "frame_depth": "4.625",
        "model": "flush" if material == "steel" else "oak-flush",
        "colours": {"exterior": painted, "interior": painted if material == "fiberglass" else {"type": "white"}},
        "glass": {"door": {"glazed": False}},
        "standard": {"lock": "multipoint", "handle": BERKELEY},
    }
    selection.update(overrides)
    return selection


def _quote(selection: dict) -> dict:
    return quote({"label": "Front entry", "material": selection["material"], "opening_type": "single_door", "pipeline": selection}, CFG)


def _lines(result: dict, text: str) -> list[dict]:
    return [item for item in result["line_items"] if text in item["description"]]


def _glazed(size: str, family: str, series: str | None = None, **extra) -> dict:
    return {"door": {"glazed": True, "size": size, "family": family, **({"series": series} if series else {}), **extra}}


# -- Pricing fixes ------------------------------------------------------------


def test_p1_fiberglass_solid_tall_bases_already_include_the_system():
    tall = _quote(_sel("fiberglass", height='8\'0"'))
    assert not _lines(tall, "System")
    assert tall["line_items"][0]["unit_list"] + _lines(tall, "Panel style")[0]["unit_list"] == 3323  # 3113 + OAK00 210
    seven = _quote(_sel("fiberglass", height='7\'0"', model="flush-wg00"))
    assert seven["line_items"][0]["unit_list"] == 3013 and not _lines(seven, "System")
    # Glazed 8' rows and steel 6'8" bases don't include it.
    glazed = _quote(_sel("fiberglass", height='8\'0"', glass=_glazed("22x80", "clear", "clear_lowe")))
    assert _lines(glazed, "8' System")[0]["qty"] == 1
    steel = _quote(_sel("steel", height='8\'0"', model="tao", width=34))
    assert _lines(steel, "8' System")[0]["unit_list"] == 375


def test_m5_vented_units_price_their_own_sub_table():
    # 22x64 Elevation Clear/LowE in a flush slab: FG p36 $3,988, ST p34 $3,668 (was $5,144 / $4,824).
    fg = _quote(_sel("fiberglass", glass=_glazed("22x64", "vented", "elevation_clear")))
    assert fg["line_items"][0]["unit_list"] == 3988
    assert "Elevation, Clear/LowE" in fg["line_items"][0]["description"]
    steel = _quote(_sel("steel", colours={"exterior": {"type": "painted", "colour": "Black"}, "interior": {"type": "painted", "colour": "Black"}},
                        glass=_glazed("22x64", "vented", "elevation_clear")))
    assert steel["line_items"][0]["unit_list"] == 3668
    # A selection saved with the old series key still prices, at the old (dearest) figure, with a note.
    legacy = _quote(_sel("fiberglass", glass=_glazed("22x64", "vented", "venting_elevation")))
    assert legacy["line_items"][0]["unit_list"] == 5144
    assert any("Re-pick the exact unit" in note for note in legacy["notes"])
    families = {row["key"]: row for row in CATALOG["glass_families"]}
    assert "peak470_blackout_clear" in {series["key"] for series in families["vented"]["series"]}


def test_c18_sdl_squares_are_charged_per_square():
    selection = _sel("steel", model="london", glass=_glazed("22x36", "sdl", "sdl_clear", squares=6))
    result = _quote(selection)
    [squares] = _lines(result, "SDL squares")
    assert squares["unit_list"] == 6 * 90  # painted 1 side: $90/square (ST p28)
    missing = _quote(_sel("steel", model="london", glass=_glazed("22x36", "sdl", "sdl_clear")))
    assert not _lines(missing, "SDL squares")
    assert any("SDL square count not entered" in note for note in missing["notes"])


def test_a4_black_anodized_sill_is_included_on_finished_doors():
    painted = _quote(_sel("fiberglass"))
    assert _lines(painted, "Black Anodized")[0]["unit_list"] == 0
    white = _quote(_sel("steel", colours={"exterior": {"type": "white"}, "interior": {"type": "white"}}))
    assert _lines(white, "Black Anodized")[0]["unit_list"] == 20


def test_x3_phantom_models_are_folded_into_the_real_slab():
    models = {model["key"]: model for model in CATALOG["materials"]["steel"]["models"]}
    assert "camber-4-panel-bt" not in models and "oval-flush" not in models
    assert any("22x10 Camber" in offer.get("glass", {}) for offer in models["4-panel-bt"]["offers"])
    # A saved selection on the old key prices exactly as before.
    old = _quote(_sel("steel", model="camber-4-panel-bt", glass=_glazed("22x10", "decorative")))
    new = _quote(_sel("steel", model="4-panel-bt", glass=_glazed("22x10 Camber", "decorative")))
    assert old["line_items"][0]["unit_list"] == new["line_items"][0]["unit_list"] > 0


# -- Availability -------------------------------------------------------------


def test_c15_seven_foot_doors():
    steel = _quote(_sel("steel", height='7\'0"', model="soho", glass=_glazed("22x48", "clear", "clear_lowe")))
    six_eight = _quote(_sel("steel", model="soho", glass=_glazed("22x48", "clear", "clear_lowe")))
    assert steel["line_items"][0]["unit_list"] == six_eight["line_items"][0]["unit_list"]
    assert _lines(steel, "7' System")[0]["unit_list"] == 275
    assert any("confirm with Palma" in note for note in steel["notes"])
    wg25 = _quote(_sel("fiberglass", height='7\'0"', model="2-panel-3-4-wg25", glass=_glazed("22x48", "clear", "clear_lowe")))
    assert _lines(wg25, "7' System")[0]["qty"] == 1
    with pytest.raises(DoorValidationError):  # no fiberglass sidelites at 7'0"
        _quote(_sel("fiberglass", height='7\'0"', model="flush-wg00", configuration="single_1sl",
                    glass={"door": {"glazed": False}, "sidelites": [{"model": "oak-flush", "glazed": True, "size": "7x64", "family": "clear"}]}))


def test_w2_panel_selector_widths_steer_but_still_price():
    tao = next(model for model in CATALOG["materials"]["steel"]["models"] if model["key"] == "tao")
    assert all(offer["widths"] == [34, 36] for offer in tao["offers"])
    result = _quote(_sel("steel", model="tao", width=30))
    assert result["line_items"][0]["unit_list"] > 0
    assert any("Panel Selector lists the Tao slab" in note for note in result["notes"])


def test_c14_non_standard_steel_widths_are_flush_only_plus_375():
    result = _quote(_sel("steel", width=26))
    [adder] = _lines(result, "Non-Standard")
    assert adder["unit_list"] == 375 and '26"' in adder["description"]
    with pytest.raises(DoorValidationError):
        _quote(_sel("steel", width=26, model="orleans"))


def test_c12_steel_jambs_and_r1_retractable_screen_rule():
    depths = {row["key"]: row for row in CATALOG["materials"]["steel"]["frame_depths"]}
    assert depths["5.25"]["frame_types"] == ["smooth"] and "7.25" in depths
    seven_quarter = _quote(_sel("steel", frame_depth="7.25", extras={"screen": "white"}))
    assert _lines(seven_quarter, "7-1/4 Jamb")[0]["unit_list"] == 135
    assert _lines(seven_quarter, "RETRACTABLE")
    with pytest.raises(DoorValidationError):
        _quote(_sel("steel", frame_depth="4.625", extras={"screen": "white"}))
    sliding = _quote(_sel("steel", extras={"screen": "sliding_painted_2s"}))
    assert _lines(sliding, "SLIDING")[0]["unit_list"] == 700


def test_c16_executive_panels_are_offered_as_printed():
    result = _quote(_sel("steel", glass=_glazed("22x17 (x3)", "executive", "executive_panels")))
    assert result["line_items"][0]["unit_list"] == 4858  # ST p37, painted 1 side
    assert any("Executive panel priced as printed" in note for note in result["notes"])


# -- Extras -------------------------------------------------------------------


def test_c1_accents_are_steel_only_on_their_own_slab_and_per_side():
    result = _quote(_sel("steel", extras={"accent": {"design": "uno_1", "finish": "black", "sides": "both"}}))
    [accent] = _lines(result, "Uno 1 decorative accent")
    assert (accent["unit_list"], accent["qty"]) == (810, 2)
    for bad in (
        _sel("steel", extras={"accent": {"design": "vog_1"}}),  # Vogue accent on the Uno flush slab
        _sel("steel", extras={"accent": {"design": "uno_3", "finish": "matte_gold"}}),  # not made in matte gold
        _sel("fiberglass", extras={"accent": {"design": "uno_1"}}),  # steel only (A2)
        _sel("steel", extras={"vertical_accent": "ss"}),  # needs the 7x64 lite
    ):
        with pytest.raises(DoorValidationError):
            _quote(bad)
    vertical = _quote(_sel("steel", glass=_glazed("07x64", "clear", "clear_lowe"), extras={"vertical_accent": "black"}))
    assert _lines(vertical, "Vertical accent")[0]["unit_list"] == 1890
    assert not CATALOG["materials"]["fiberglass"]["extras"]["accents"]


def test_c7_pull_bars_replace_the_handle():
    pull = {"style": "offset", "block": "with_multipoint_lock", "length_in": 48, "finish": "black", "shape": "square"}
    double = _quote(_sel("fiberglass", configuration="double", standard={"lock": "pull_bar", "pull_bar": pull}))
    bars = _lines(double, "pull bar")
    assert [item["qty"] for item in bars] == [1, 1]
    assert "inactive leaf" in bars[1]["description"] and "DUMMY" in bars[1]["description"]
    with pytest.raises(DoorValidationError):  # offset bars are fiberglass only
        _quote(_sel("steel", standard={"lock": "pull_bar", "pull_bar": pull}))
    with pytest.raises(DoorValidationError):  # 84" bars are for 8' doors
        _quote(_sel("fiberglass", standard={"lock": "pull_bar", "pull_bar": {**pull, "length_in": 84}}))
    assert _quote(_sel("fiberglass", height='8\'0"', standard={"lock": "pull_bar", "pull_bar": {**pull, "length_in": 84}}))


def test_r3_tedee_compatibility():
    with pytest.raises(DoorValidationError):
        _quote(_sel("steel", standard={"lock": "multipoint", "handle": EMTEK}, extras={"tedee": True}))
    lever = _quote(_sel("steel", standard={"lock": "multipoint", "handle": LARGE_LEVER}, extras={"tedee": True, "tedee_knob": True}))
    assert any("only with the Miami handle" in note for note in lever["notes"])
    assert _lines(lever, "Temporary Knob")[0]["unit_list"] == 40


def test_r4_special_order_doorlites_and_sidelites_go_together():
    base = _sel(
        "fiberglass",
        model="oak-6-panel",
        configuration="single_1sl",
        glass={
            "door": {"glazed": True, "size": "22x36", "family": "specialty", "series": "special_order"},
            "sidelites": [{"model": "oak-6-panel", "glazed": True, "size": "8x36", "family": "decorative"}],
        },
    )
    with pytest.raises(DoorValidationError):
        _quote(base)
    base["glass"]["sidelites"][0].update(family="specialty", series="special_order")
    assert _quote(base)["list_total"] > 0


def test_c11_custom_colours_add_the_colour_match():
    standard = _quote(_sel("fiberglass", colours={"exterior": {"type": "painted", "colour": "G-5P6"}, "interior": {"type": "painted", "colour": "Iron Ore"}}))
    assert not _lines(standard, "Custom colour match")
    custom = _quote(_sel("fiberglass", colours={"exterior": {"type": "stained", "colour": "Honey"}, "interior": {"type": "painted", "colour": "Barn Red"}}))
    matches = _lines(custom, "Custom colour match")
    assert sorted(item["unit_list"] for item in matches) == [750, 750]
    assert {item["source"] for item in matches} == {"fiberglass p51"}


def test_c3_c4_casing_backband_and_glass_frames():
    result = _quote(_sel("steel", extras={"casing": True, "casing_backband": True}))
    assert _lines(result, "Casing trim")[0]["unit_list"] == 400
    assert _lines(result, "backband")[0]["unit_list"] == 200
    # Victoria's ** lite includes the contemporary frame; an aluminum frame is charged.
    victoria = _sel("steel", model="victoria", glass=_glazed("22x14-7/16", "clear", "clear_lowe"))
    included = _quote({**victoria, "extras": {"glass_frame": "contemporary"}})
    assert not _lines(included, "Contemporary")
    urban = _quote({**victoria, "extras": {"glass_frame": "urban_smooth"}})
    assert _lines(urban, "urban smooth")[0]["unit_list"] == 250


def test_other_book_extras():
    result = _quote(
        _sel(
            "steel",
            configuration="single_2sl",
            glass={"door": {"glazed": False}, "sidelites": [{"model": "solid-panel", "glazed": False, "panel": "Flush"}] * 2},
            standard={"lock": "multipoint", "handle": BERKELEY, "hinges": "satin_nickel", "brickmould": "custom_pvc"},
            extras={"operating_sidelite": 1, "key_alike": True, "dentil_shelf": True, "kick_panel": True},
        )
    )
    assert _lines(result, "Hinged Sidelite")[0]["unit_list"] == 250
    assert _lines(result, "Key Alike")[0]["unit_list"] == 80
    assert _lines(result, "Dentil Shelf for Steel door - Painted")[0]["unit_list"] == 470
    assert _lines(result, "Kick Panel")[0]["unit_list"] == 250
    assert _lines(result, "Satin Nickel")[0]["unit_list"] == 60
    brickmould = [item for item in result["line_items"] if item["row"] == "Brickmould"]
    assert [item["unit_list"] for item in brickmould] == [685]  # replaces the standing brickmould
    triple = _quote(_sel("steel", glass=_glazed("22x64", "clear", "clear_lowe"), extras={"triple_glazing": "lowe_2x"}))
    assert _lines(triple, "Triple glazing")[0]["unit_list"] == 316


def test_website_rules_add_notes_not_errors():
    # W1: multipoint on fiberglass and 8' doors; A20: no stain on smooth skins.
    double_bore = _quote(_sel("fiberglass", standard={"lock": "double_bore"}))
    assert any("Multipoint locks are necessary" in note for note in double_bore["notes"])
    smooth = next(model for model in CATALOG["materials"]["fiberglass"]["models"] if model["smooth"])
    offer = next(offer for offer in smooth["offers"] if offer["kind"] == "solid")
    stained = _quote(_sel("fiberglass", model=smooth["key"], height=offer["height"], width=offer["widths"][0],
                          colours={"exterior": {"type": "stained", "colour": "Teak"}, "interior": {"type": "stained", "colour": "Teak"}}))
    assert any("smooth skin" in note for note in stained["notes"])
    assert CATALOG["multipoint_required"] == {"materials": ["fiberglass"], "heights": ['8\'0"']}
    assert "Mistlite" in CATALOG["glass_patterns"]["solution_sandblast"]
    assert len(CATALOG["paint_colours"]) == 51 and len(CATALOG["stain_colours"]) == 16


def test_new_option_records_are_in_the_book_data():
    rating = catalog.find_option("steel", "fire_rating", "20 min. Fire Rating")
    assert (rating["price"], rating["source_page"]) == (230, 38)
    for material, page in (("fiberglass", 29), ("steel", 27)):
        grills = catalog.find_option(material, "glass_options", "Custom Grills")
        assert (grills["price"], grills["source_page"]) == (40, page)
    assert not any("companion_column" in row for row in catalog.options()["pull_bars"])


@pytest.mark.usefixtures("no_profit_floor")
def test_api_keeps_the_new_selection_fields():
    # The request schema must carry every field the pricer reads, or Pydantic drops it silently.
    from fastapi.testclient import TestClient

    from api.main import app

    selection = _sel(
        "steel",
        model="london",
        configuration="double",
        glass=_glazed("22x36", "sdl", "sdl_clear", squares=4),
        standard={"lock": "pull_bar", "pull_bar": {"style": "straight", "block": "with_multipoint_lock", "length_in": 48, "finish": "black", "shape": "square"}, "hinges": "satin_nickel", "brickmould": "custom_textured"},
        extras={"accent": None, "casing": True, "casing_backband": True, "glass_frame": "urban_textured", "triple_glazing": None, "key_alike": True, "dentil_shelf": True, "kick_panel": True, "screen": "sliding_white"},
    )
    body = {"openings": [{"label": "Front entry", "material": "steel", "opening_type": "double_door", "pipeline": selection}]}
    response = TestClient(app).post("/api/doors/quote", json=body)
    assert response.status_code == 200, response.text
    texts = " | ".join(item["description"] for item in response.json()["openings"][0]["line_items"])
    for expected in ("SDL squares", "pull bar", "Satin Nickel", "Custom Textured Brickmould", "backband", "urban textured", "Key Alike", "Dentil Shelf", "Kick Panel", "SLIDING"):
        assert expected in texts, expected


def test_pull_bars_are_drawn_to_length():
    from services.doors.pipeline import door_drawing
    from services.estimate_documents import door_drawing_flowable

    pull = {"style": "straight", "block": "with_multipoint_lock", "length_in": 72, "finish": "satin", "shape": "round"}
    selection = _sel("fiberglass", configuration="double", standard={"lock": "pull_bar", "pull_bar": pull})
    geometry = door_drawing({"material": "fiberglass", "opening_type": "double_door", "pipeline": selection})
    assert (geometry["lock"], geometry["pull_bar_in"]) == ("pull_bar", 72.0)
    assert door_drawing_flowable(geometry, 90, 80) is not None
    classic = {"material": "steel", "finish": "factory_white", "opening_type": "single_door",
               "door": {"series": "solid_panel", "panel": "Flush"}, "pull_bars": [{**pull, "length_in": 48}]}
    assert (door_drawing(classic)["lock"], door_drawing(classic)["pull_bar_in"]) == ("pull_bar", 48.0)
    handle = door_drawing({"material": "fiberglass", "opening_type": "single_door", "pipeline": _sel("fiberglass")})
    assert (handle["lock"], handle["pull_bar_in"]) == ("multipoint", None)


def test_a_price_book_published_before_the_audit_still_quotes(monkeypatch):
    """A door import published in the app replaces the file whole, without the audit's new fields."""
    import copy

    from services import price_books

    def old_book(dataset):
        data = copy.deepcopy(price_books.file_data(dataset))
        if dataset in ("doors/fiberglass", "doors/steel"):
            for row in data:
                row.pop("variant", None)
                row.pop("variant_label", None)
        if dataset == "doors/options":
            data["options"] = [row for row in data["options"] if row["category"] != "fire_rating"]
        return data

    monkeypatch.setattr(price_books, "load_override", old_book)
    vented = _quote(_sel("fiberglass", glass=_glazed("22x64", "vented", "venting_elevation")))
    assert vented["line_items"][0]["unit_list"] == 5144  # the dearest Elevation row, as before the audit
    assert any("doesn't name the sub-type" in note for note in vented["notes"])
    families = next(
        offer["glass"]["22x64"] for model in pipeline_catalog(CFG)["materials"]["fiberglass"]["models"]
        if model["key"] == "oak-flush" for offer in model["offers"] if offer["kind"] == "glazed" and "22x64" in offer["glass"]
    )
    assert "venting_elevation" in families["vented"]
    with pytest.raises(DoorValidationError, match="re-import"):
        _quote(_sel("steel", model="orleans", extras={"fire_rated": True}))
