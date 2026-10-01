"""Layout-first window units, calibrated on Window City order 125401186.

The order ("Common Configs", 2026-09-28) quotes ten Classic 3 1/4" configurations
plus triple-pane versions. Every unit below carries the order's 1" classic
brickmould and 5 1/2" wood jamb, and the expected value is Window City's net
(dealer) unit price printed on the order.
"""
from __future__ import annotations

import pytest

from services.windowcity import layout
from services.windowcity.catalog import CatalogError, energy_rating
from services.windowcity.engine import PriceBookReviewRequired, catalog_payload, price_quote
from services.windowcity.quote import load_config, price_unit

ACCESSORIES = [{"kind": "brickmould", "name": "(classic)"}, {"kind": "wood_jamb", "name": "5 1/2"}]
DOUBLE = {"loe180": True, "gas": "argon"}
TRIPLE = {"loe180": True, "gas": "90/5", "triple": True}


def leaf(op, hinge=None):
    return {"op": op, **({"hinge": hinge} if hinge else {})}


def unit(width, height, tree, glazing=DOUBLE):
    return {"type": "unit", "series": "classic", "width": width, "height": height,
            "colour_ext": "white", "colour_int": "white", "glazing": glazing,
            "accessories": ACCESSORIES, "layout": tree}


AW5 = {"split": "rows", "sizes": [48, 24], "children": [
    leaf("fixed"),
    {"split": "cols", "sizes": [36, 36], "children": [leaf("awning", "top"), leaf("awning", "top")]}]}

ORDER_125401186 = [
    ("1 C1 casement", unit(24, 48, leaf("casement", "left")), 347.02),
    ("2 AW1 awning", unit(36, 42, leaf("awning", "top")), 370.12),
    ("3 F1 fixed", unit(24, 48, leaf("fixed")), 277.72),
    ("4 C3 fixed + casement", unit(60, 60, {"split": "cols", "sizes": [30, 30], "children": [
        leaf("fixed"), leaf("casement", "right")]}), 722.48),
    ("5 C5 casement + fixed + casement", unit(72, 60, {"split": "cols", "sizes": [24, 24, 24], "children": [
        leaf("casement", "left"), leaf("fixed"), leaf("casement", "right")]}), 920.67),
    ("6 F5 fixed over fixed", unit(30, 96, {"split": "rows", "sizes": [48, 48], "children": [
        leaf("fixed"), leaf("fixed")]}), 599.58),
    ("7 AW5 fixed over two awnings", unit(72, 72, AW5), 1193.66),
    ("9 VS1 single slider", unit(36, 24, leaf("single_slider", "left")), 260.01),
    ("11 triple C1", unit(24, 48, leaf("casement", "left"), TRIPLE), 397.42),
    ("12 triple F1", unit(24, 48, leaf("fixed"), TRIPLE), 328.12),
    ("13 triple AW5", unit(72, 72, AW5, TRIPLE), 1393.73),
]


@pytest.mark.parametrize("name,line,expected", ORDER_125401186, ids=[c[0] for c in ORDER_125401186])
def test_order_125401186_dealer_prices(name, line, expected) -> None:
    priced = price_quote({"lines": [line]})["lines"][0]
    assert priced["dealer_each"] == pytest.approx(expected, abs=0.05), name


def test_same_units_expressed_with_shares_match_inches() -> None:
    by_share = unit(72, 72, {"split": "rows", "sizes": ["2/3", "*"], "children": [
        leaf("fixed"), {"split": "cols", "children": [leaf("awning"), leaf("awning")]}]})
    assert price_quote({"lines": [by_share]})["lines"][0]["dealer_each"] == pytest.approx(1193.66, abs=0.05)


def test_one_section_unit_prices_exactly_like_a_window_line() -> None:
    window = {"type": "window", "style": "WC-100", "width": 30, "height": 60,
              "colour_ext": "black", "glazing": DOUBLE, "accessories": ACCESSORIES}
    as_unit = {**unit(30, 60, leaf("casement", "right")), "colour_ext": "black"}
    a = price_quote({"lines": [window]})["lines"][0]
    b = price_quote({"lines": [as_unit]})["lines"][0]
    assert a["dealer_each"] == b["dealer_each"]
    assert a["install_each"] == b["install_each"]


def test_aw5_reinforces_only_the_full_width_horizontal_joint() -> None:
    comps = price_quote({"lines": [unit(72, 72, AW5)]})["lines"][0]["components"]
    mullions = [c for c in comps if "mullion" in c["label"]]
    assert len(mullions) == 1
    assert "horizontal" in mullions[0]["label"] and "6.00 lf" in mullions[0]["label"]
    assert mullions[0]["list"] == pytest.approx(132.0)


def test_legacy_combination_uses_the_assembly_brickmould_growth() -> None:
    lite = {"type": "window", "width": 24, "height": 60, "glazing": DOUBLE, "colour_ext": "white"}
    combination = {"type": "combination", "layout": {"cols": 3, "rows": 1}, "accessories": ACCESSORIES,
                   "lites": [{**lite, "style": "WC-100"}, {**lite, "style": "WC-175"}, {**lite, "style": "WC-100"}]}
    assert price_quote({"lines": [combination]})["lines"][0]["dealer_each"] == pytest.approx(920.67, abs=0.05)


def test_unit_details_report_sections_in_reading_order_with_energy() -> None:
    priced = price_quote({"lines": [unit(72, 72, AW5, TRIPLE)]})["lines"][0]
    details = priced["unit"]
    assert details["summary"] == "Fixed / Awning | Awning"
    assert [(s["style"], s["width"], s["height"]) for s in details["sections"]] == [
        ("WC-175", 72, 48), ("WC-125", 36, 24), ("WC-125", 36, 24)]
    assert details["sections"][0]["energy"]["er"] == 44
    assert details["sections"][1]["energy"]["energy_star"] == "most_efficient"
    assert {m["orient"] for m in details["mullions"]} == {"h", "v"}


def test_window_lines_report_energy_only_for_rated_packages() -> None:
    rated = price_quote({"lines": [{"type": "window", "style": "WC-175", "width": 24, "height": 48,
                                    "glazing": DOUBLE}]})["lines"][0]
    assert rated["energy"]["u_ip"] == 0.27
    assert energy_rating("WC-175", {"loe180": True, "i89": True, "gas": "argon"}) is None
    assert energy_rating("HC-101", DOUBLE) is None


def test_install_is_per_section() -> None:
    priced = price_quote({"lines": [unit(72, 60, {"split": "cols", "children": [
        leaf("casement"), leaf("fixed"), leaf("casement")]})]})["lines"][0]
    assert priced["install_each"] == pytest.approx(3 * 23.0 * 24 * 60 / 144)


def test_tall_casement_sections_get_sash_reinforcement() -> None:
    comps = price_quote({"lines": [unit(30, 76, leaf("casement", "left"))]})["lines"][0]["components"]
    assert any("Sash Reinforcement" in c["label"] for c in comps)
    dark = {**unit(30, 70, leaf("casement", "left")), "colour_ext": "black"}
    comps = price_quote({"lines": [dark]})["lines"][0]["components"]
    assert any("Sash Reinforcement" in c["label"] for c in comps)


def test_section_size_warnings_name_the_section() -> None:
    result = price_quote({"lines": [unit(96, 60, {"split": "cols", "sizes": [40, "*"], "children": [
        leaf("casement", "left"), leaf("fixed")]})]})
    assert result["review_required"] is True
    assert any(w["message"].startswith("Section 1 (Casement (left))") for w in result["warnings"])


@pytest.mark.parametrize("sizes,total,expected", [
    (None, 72, [36, 36]),
    (["*", "*"], 72, [36, 36]),
    (["1/3", "*"], 72, [24, 48]),
    (["25%", "*"], 80, [20, 60]),
    ([24.5, "*"], 72, [24.5, 47.5]),
    (["23 1/2", "*"], 72, [23.5, 48.5]),
    ([30, 42], 72, [30, 42]),
])
def test_division_sizes(sizes, total, expected) -> None:
    assert layout.resolve_sizes(sizes, 2, total) == pytest.approx(expected)


@pytest.mark.parametrize("sizes", [[30, 30], [72, "*"], ["abc", "*"], [10]])
def test_bad_divisions_are_rejected(sizes) -> None:
    with pytest.raises(CatalogError):
        layout.resolve_sizes(sizes, 2, 72)


def test_invalid_units_fail_closed() -> None:
    with pytest.raises(PriceBookReviewRequired):
        price_quote({"lines": [unit(48, 48, {"split": "cols", "children": [leaf("fixed")]})]})
    with pytest.raises(PriceBookReviewRequired):
        price_quote({"lines": [unit(48, 48, leaf("skylight"))]})
    with pytest.raises(PriceBookReviewRequired):  # sliders are not offered in heritage
        price_quote({"lines": [{**unit(48, 30, leaf("single_slider")), "series": "heritage"}]})


def test_merged_lines_and_side_by_side_count() -> None:
    four = layout.resolve({"split": "rows", "children": [
        {"split": "cols", "children": [leaf("fixed"), leaf("fixed")]},
        {"split": "cols", "children": [leaf("casement"), leaf("casement")]}]}, 60, 72)
    vertical = [l for l in four.lines if l.orient == "v"]
    assert len(vertical) == 1 and vertical[0].length == 72  # two row joints merge
    assert four.max_side_by_side == 2


def test_every_preset_prices() -> None:
    for preset in layout.PRESETS:
        line = unit(preset["width"], preset["height"], preset["layout"])
        result = price_quote({"lines": [line]})
        assert result["lines"][0]["dealer_each"] > 0, preset["id"]


def test_catalog_exposes_layout_options() -> None:
    payload = catalog_payload()["layout"]
    assert payload["default_series"] == "classic"
    assert {p["id"] for p in payload["presets"]} >= {"C1", "C3", "C5", "F5", "AW5"}
    classic = next(s for s in payload["series"] if s["id"] == "classic")
    assert classic["styles"]["casement"] == "WC-100"


def test_price_unit_directly() -> None:
    comps = price_unit(unit(60, 60, {"split": "cols", "children": [leaf("fixed"), leaf("casement")]}),
                       load_config(), [])
    assert comps[0].label.startswith("Unit 60x60, 2 sections: Fixed | Casement")


def test_unit_description_lists_layout_sections_and_energy() -> None:
    from services.descriptions import window_description

    text = window_description({"spec": unit(72, 72, AW5, TRIPLE)})
    assert "3-section window unit - 72 x 72 in - Fixed / Awning | Awning" in text
    assert "Sections: Fixed 72 x 48, Awning 36 x 24, Awning 36 x 24" in text
    assert "ENERGY" not in text  # energy is its own estimate field


def test_line_energy_summaries() -> None:
    from services.descriptions import line_energy

    assert line_energy(unit(72, 72, AW5, TRIPLE)) == "ENERGY STAR Most Efficient - ER 38-44 - U-factor 0.17-0.18"
    assert line_energy(unit(24, 48, leaf("fixed"))) == "ENERGY STAR qualified - ER 36 - U-factor 0.27"
    assert line_energy(unit(60, 60, {"split": "cols", "children": [leaf("fixed"), leaf("casement")]})) == "ER 33-36 - U-factor 0.26-0.27"
    assert line_energy({"type": "window", "style": "WC-100", "glazing": DOUBLE}) == "ER 33 - U-factor 0.26"
    assert line_energy({"type": "window", "style": "HC-101", "glazing": DOUBLE}) == ""


def test_tier_glazing_upgrade_reaches_section_overrides() -> None:
    from services.customer_estimates import apply_tier

    spec = unit(60, 60, {"split": "cols", "children": [
        {"op": "fixed", "glazing": {"frost_tint": True}}, leaf("casement")]})
    upgraded = apply_tier([{"spec": spec}], {"window_overrides": {"glazing": {"triple": True}}})[0]["spec"]
    assert upgraded["glazing"]["triple"] is True
    assert upgraded["layout"]["children"][0]["glazing"] == {"frost_tint": True, "triple": True}
    assert spec["layout"]["children"][0]["glazing"] == {"frost_tint": True}


def test_quote_api_prices_units_and_returns_section_details(tmp_path, monkeypatch) -> None:
    from fastapi.testclient import TestClient

    from db.init_db import init_db
    from db.session import reset_engine

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'units.db'}")
    reset_engine()
    init_db()
    from api.main import app

    client = TestClient(app)
    catalog = client.get("/api/quotes/catalog").json()
    assert any(p["id"] == "AW5" for p in catalog["layout"]["presets"])
    response = client.post("/api/quotes/price", json={"lines": [unit(72, 72, AW5)]})
    assert response.status_code == 200, response.text
    line = response.json()["lines"][0]
    assert line["type"] == "unit"
    assert line["dealer_each"] == pytest.approx(1193.66, abs=0.05)
    assert [s["label"] for s in line["unit"]["sections"]] == ["Fixed", "Awning", "Awning"]


def test_unit_description_matches_the_frontend_text() -> None:
    """frontend/lib/__tests__/windowLayout.test.ts asserts the same string; the
    estimate de-duplicates the saved and generated text case-insensitively."""
    from services.descriptions import window_description

    spec = {"type": "unit", "series": "classic", "width": 72, "height": 72, "colour_ext": "white",
            "glazing": {"loe180": True, "gas": "argon"},
            "layout": {"split": "rows", "sizes": ["2/3", "*"], "children": [
                {"op": "fixed"}, {"split": "cols", "children": [leaf("awning", "top"), leaf("awning", "top")]}]}}
    frontend = ('Classic 3 1/4" (WC-100 series) 3-section window unit - 72 x 72 in - Fixed / Awning | Awning - '
                "Sections: Fixed 72 x 48, Awning 36 x 24, Awning 36 x 24 - Exterior colour: white - LoE 180 - argon gas")
    assert window_description({"spec": spec}).casefold() == frontend.casefold()
    assert window_description({"spec": spec, "description": frontend}) == frontend


def test_estimate_pdf_draws_window_units() -> None:
    from services.estimate_documents import render_pdf, window_drawing_flowable
    from services.windowcity.layout import drawing

    geometry = drawing(unit(72, 72, AW5))
    assert [s["op"] for s in geometry["sections"]] == ["fixed", "awning", "awning"]
    assert drawing({"type": "window", "style": "WC-100", "width": 30, "height": 60})["sections"][0]["hinge"] == "left"
    combo = drawing({"type": "combination", "layout": {"cols": 2, "rows": 1}, "lites": [
        {"style": "WC-175", "width": 30, "height": 60}, {"style": "WC-100", "width": 30, "height": 60}]})
    assert combo["width"] == 60 and [s["op"] for s in combo["sections"]] == ["fixed", "casement"]
    door = drawing({"type": "patio_sliding", "nominal_ft": 6, "operation": "OX"})
    assert door["width"] == 71.625 and [s["op"] for s in door["sections"]] == ["fixed", "single_slider"]
    assert drawing({"type": "patio_sliding", "nominal_ft": 7}) is None
    assert window_drawing_flowable(geometry, 80, 60) is not None
    view = {"sections": {"windows": {"subtotal": 100, "lines": [
        {"description": "AW5", "energy": "ER 36", "qty": 1, "unit_price": 100, "line_total": 100, "drawing": geometry},
        {"description": "old line without drawing", "qty": 1, "unit_price": 0, "line_total": 0}]}}, "totals": {}}
    assert render_pdf(view)[:4] == b"%PDF"


def test_window_drawings_carry_the_exterior_colour() -> None:
    from reportlab.graphics.shapes import Rect
    from services.estimate_documents import window_drawing_flowable, window_frame_colours
    from services.windowcity.layout import drawing

    assert drawing(unit(72, 72, AW5))["exterior_colour"] == "white"
    assert drawing({**unit(72, 72, AW5), "colour_ext": "black"})["exterior_colour"] == "black"
    assert drawing({"type": "window", "style": "WC-100", "width": 30, "height": 60, "colour_ext": "Black"})["exterior_colour"] == "black"
    # Combinations keep the colour on their lites.
    combo = drawing({"type": "combination", "layout": {"cols": 2, "rows": 1}, "lites": [
        {"style": "WC-175", "width": 30, "height": 60, "colour_ext": "black"},
        {"style": "WC-100", "width": 30, "height": 60, "colour_ext": "black"}]})
    assert combo["exterior_colour"] == "black"
    assert drawing({"type": "patio_sliding", "nominal_ft": 6, "colour_ext": "black"})["exterior_colour"] == "black"

    assert window_frame_colours("black") == window_frame_colours("Jet Black") == ("#1f2328", "#0b0d10")
    assert window_frame_colours(None) == window_frame_colours("unknown") == window_frame_colours("white")
    black = window_drawing_flowable(drawing({**unit(72, 72, AW5), "colour_ext": "black"}), 80, 60)
    white = window_drawing_flowable(drawing(unit(72, 72, AW5)), 80, 60)
    frame_fill = lambda d: next(shape for shape in d.contents if isinstance(shape, Rect)).fillColor.hexval()
    assert frame_fill(black) == "0x1f2328"
    assert frame_fill(white) == "0xf8fafc"


def test_customer_view_colours_drawings_priced_before_they_carried_one() -> None:
    from types import SimpleNamespace

    from services.estimate_documents import _with_window_colours
    from services.windowcity.layout import drawing

    old = {k: v for k, v in drawing(unit(72, 72, AW5)).items() if k != "exterior_colour"}
    windows = {"subtotal": 100, "lines": [{"id": "a", "drawing": old}, {"id": "b", "drawing": old}, {"id": "c"}]}
    row = SimpleNamespace(tiers=[], windows=[
        {"id": "a", "spec": {**unit(72, 72, AW5), "colour_ext": "black"}},
        {"id": "b", "spec": unit(72, 72, AW5)}])
    lines = _with_window_colours(windows, row, {})["lines"]
    assert [line.get("drawing", {}).get("exterior_colour") for line in lines] == ["black", "white", None]
    # The option the customer picked decides the colour.
    row.tiers = [{"id": "t1", "window_overrides": {"colour_ext": "black"}}]
    lines = _with_window_colours(windows, row, {"selected_tier": "t1"})["lines"]
    assert [line["drawing"]["exterior_colour"] for line in lines[:2]] == ["black", "black"]
    current = {"lines": [{"id": "a", "drawing": drawing(unit(72, 72, AW5))}]}
    assert _with_window_colours(current, row, {}) is current
