"""WC-500 patio doors, black interiors, wood-jamb depths and layout-first bays.

Patio doors are calibrated on Window City orders 125401186 ("Common Configs"
V2 white and V3 Jet Black / white, 2026-09-28) and 125401100 / 125401102
(April 2026). The expected value is the dealer unit price printed on the order.
"""
from __future__ import annotations

import pytest

from services.windowcity import catalog
from services.windowcity.engine import PriceBookReviewRequired, catalog_payload, price_quote
from services.windowcity.quote import load_config, price_quote as raw_quote

REGULAR = {"loe180": True, "gas": "argon"}
ENERGY_STAR = {"loe180": True, "i89": True, "gas": "argon"}
TRIPLE = {"loe180": True, "triple": True, "gas": "argon"}
GLASS = {"reg": REGULAR, "es": ENERGY_STAR, "triple": TRIPLE}

# (nominal ft, colour, glass, brickmould+jamb, dealer each). Brickmould and
# the 4 1/2" jamb use the footage the engine computes from the frame size.
ORDER_125401186 = [
    (5, "ww", "reg", 1042.57), (6, "ww", "reg", 1109.44), (8, "ww", "reg", 1293.40),
    (5, "ww", "es", 1198.09), (6, "ww", "es", 1302.22), (8, "ww", "es", 1557.46),
    (5, "ww", "triple", 1334.17), (6, "ww", "triple", 1465.84),
    (10, "ww", "reg", 2232.28), (10, "ww", "es", 2543.32), (12, "ww", "es", 2751.58), (16, "ww", "es", 3262.06),
    (5, "jw", "reg", 1397.61), (6, "jw", "reg", 1495.88), (8, "jw", "reg", 1752.35),
    (5, "jw", "es", 1553.13), (6, "jw", "es", 1688.66), (8, "jw", "es", 2016.41),
    (5, "jw", "triple", 1689.21), (6, "jw", "triple", 1852.28),
    (10, "jw", "reg", 2933.84), (10, "jw", "es", 3244.88), (12, "jw", "es", 3515.94), (16, "jw", "es", 4171.44),
]

TRIM = [{"kind": "brickmould", "name": "EP326"}, {"kind": "wood_jamb", "depth_in": 4.5}]


def door(ft: int, colour: str, glass: str, **extra) -> dict:
    return {
        "type": "patio_sliding", "nominal_ft": ft,
        "operation": "OXXO" if ft >= 10 else "XO",
        "colour_ext": "white" if colour == "ww" else "black",
        "colour_int": "black" if colour == "jj" else "white",
        "glazing": GLASS[glass], "kick_lock": True, "accessories": TRIM, **extra,
    }


@pytest.mark.parametrize("ft,colour,glass,expected", ORDER_125401186,
                         ids=[f"{c[0]}ft-{c[1]}-{c[2]}" for c in ORDER_125401186])
def test_order_125401186_patio_door_dealer_prices(ft, colour, glass, expected) -> None:
    priced = raw_quote({"lines": [door(ft, colour, glass)]})["lines"][0]
    assert priced["dealer_each"] == pytest.approx(expected, abs=0.015)


def test_patio_door_without_trim_and_black_in_out() -> None:
    # 125401102 item 25.2: 6' OX, i89, no brickmould or jamb.
    bare = door(6, "ww", "es", operation="OX", accessories=[])
    assert raw_quote({"lines": [bare]})["lines"][0]["dealer_each"] == pytest.approx(1164.78, abs=0.01)
    # 125401100 item 4: 6' OX black in / black out, triple, 19.33 ft jamb only.
    black = door(6, "jj", "triple", operation="OX",
                 accessories=[{"kind": "wood_jamb", "depth_in": 4.5, "lineal_ft": 232 / 12}])
    line = raw_quote({"lines": [black]})["lines"][0]
    assert line["dealer_each"] == pytest.approx(2077.57, abs=0.01)
    assert any("Black in/out" in c["label"] for c in line["components"])


def test_patio_footage_follows_window_city() -> None:
    from services.windowcity.quote import _patio_footage

    cfg = load_config()
    assert [round(_patio_footage(w, 79.5, 2, cfg), 2) for w in (59.625, 71.625, 95.625)] == [18.83, 19.83, 21.83]
    assert [round(_patio_footage(w, 79.5, 4, cfg), 2) for w in (118.375, 142.375, 190.375)] == [23.83, 25.83, 29.83]


def test_patio_door_rejects_unoffered_colour_pairs_and_handing() -> None:
    with pytest.raises(PriceBookReviewRequired, match="interior needs a black exterior"):
        price_quote({"lines": [door(6, "ww", "reg", colour_int="black")]})
    with pytest.raises(PriceBookReviewRequired, match="only black in / black out"):
        price_quote({"lines": [door(6, "ww", "reg", colour_ext="charcoal", colour_int="charcoal")]})
    with pytest.raises(PriceBookReviewRequired, match="operation must be"):
        price_quote({"lines": [door(6, "ww", "reg", operation="OXXO")]})


def test_four_panel_black_in_out_door_asks_for_confirmation() -> None:
    result = price_quote({"lines": [door(10, "jj", "es")]})
    assert result["review_required"] is True
    assert any("2-panel door only" in w["message"] for w in result["warnings"])


# ------------------------------------------------------------ black interior
def _window(**extra) -> dict:
    return {"type": "window", "style": "WC-100", "width": 30, "height": 60,
            "glazing": REGULAR, **extra}


def test_black_interior_is_priced_as_black_in_out() -> None:
    white = raw_quote({"lines": [_window()]})["lines"][0]
    exterior = raw_quote({"lines": [_window(colour_ext="black")]})["lines"][0]
    both = raw_quote({"lines": [_window(colour_ext="black", colour_int="black")]})["lines"][0]
    base = white["components"][0]["list"]
    colour = [c for c in both["components"] if c["label"].startswith("Colour")][0]
    assert "black in/out" in colour["label"]
    # Book 40% for exterior + interior black, billed at the calibrated 3/4.
    assert colour["list"] == pytest.approx(round(base * 0.30, 2))
    assert both["dealer_each"] > exterior["dealer_each"] > white["dealer_each"]


def test_black_interior_needs_black_exterior_and_an_offering_style() -> None:
    with pytest.raises(PriceBookReviewRequired, match="interior needs a black exterior"):
        price_quote({"lines": [_window(colour_int="black")]})
    with pytest.raises(PriceBookReviewRequired, match="not offered on WC-200"):
        price_quote({"lines": [_window(style="WC-200", colour_ext="black", colour_int="black")]})
    offered = catalog_payload()["colours"]["black_interior_styles"]
    assert {"WC-100", "WC-125", "WC-175", "HC-401", "HC-476"} <= set(offered)
    assert "WC-200" not in offered


def test_black_interior_flows_into_unit_sections() -> None:
    unit = {"type": "unit", "series": "classic", "width": 60, "height": 60, "colour_ext": "black",
            "colour_int": "black", "glazing": REGULAR,
            "layout": {"split": "cols", "children": [{"op": "fixed"}, {"op": "casement", "hinge": "right"}]}}
    comps = raw_quote({"lines": [unit]})["lines"][0]["components"]
    assert sum("black in/out" in c["label"] for c in comps) == 2


# ---------------------------------------------------------------- wood jamb
def test_wood_jamb_by_depth_matches_the_printed_row() -> None:
    by_name = raw_quote({"lines": [_window(accessories=[{"kind": "wood_jamb", "name": '5 1/2"'}])]})
    by_depth = raw_quote({"lines": [_window(accessories=[{"kind": "wood_jamb", "depth_in": 5.5}])]})
    assert by_name["lines"][0]["dealer_each"] == by_depth["lines"][0]["dealer_each"]
    jamb = [c for c in by_depth["lines"][0]["components"] if "wood jamb" in c["label"]][0]
    assert "@ 5.00" in jamb["label"]


def test_custom_wood_jamb_depth_uses_the_custom_row() -> None:
    assert catalog.wood_jamb_for_depth(4.0)["name"].startswith("custom size up to 4 1/4")
    assert catalog.wood_jamb_for_depth(4.75)["name"].startswith("custom size >4 1/4")
    line = raw_quote({"lines": [_window(accessories=[{"kind": "wood_jamb", "depth_in": 4.75}])]})["lines"][0]
    jamb = [c for c in line["components"] if "wood jamb" in c["label"]][0]
    assert jamb["label"].startswith('4.75" wood jamb (custom') and "@ 10.00" in jamb["label"]
    with pytest.raises(catalog.CatalogError):
        catalog.wood_jamb_for_depth(8)


def test_catalog_offers_a_5_1_2_primed_default_jamb() -> None:
    jamb = catalog_payload()["wood_jamb"]
    assert jamb["default"] == '5 1/2"' and jamb["finish"] == "primed"
    assert any(d["name"] == '5 1/2"' and d["depth_in"] == 5.5 for d in jamb["depths"])


# ---------------------------------------------------------------------- bays
BAY_LAYOUT = {"split": "cols", "sizes": ["1/4", "1/2", "*"], "children": [
    {"op": "casement", "hinge": "left"}, {"op": "fixed"}, {"op": "casement", "hinge": "right"}]}


def _bay(**extra) -> dict:
    return {"type": "bay_bow", "style": "bay", "series": "classic", "width": 96, "height": 60,
            "colour_ext": "white", "glazing": REGULAR, "layout": BAY_LAYOUT,
            "head_seat": "up to 8ft wide", **extra}


def test_layout_bay_prices_like_its_lites_plus_bay_options() -> None:
    legacy = {"type": "bay_bow", "head_seat": "up to 8ft wide", "coupler_lineal_ft": 10.0, "lites": [
        {"style": "WC-100", "width": 24, "height": 60, "glazing": REGULAR},
        {"style": "WC-175", "width": 48, "height": 60, "glazing": REGULAR},
        {"style": "WC-100", "width": 24, "height": 60, "glazing": REGULAR}]}
    a = raw_quote({"lines": [_bay()]})["lines"][0]
    b = raw_quote({"lines": [legacy]})["lines"][0]
    assert a["dealer_each"] == b["dealer_each"]
    assert a["install_each"] == b["install_each"]
    assert any("30° couplers 10 lf" in c["label"] for c in a["components"])
    assert [s["label"] for s in a["unit"]["sections"]] == ["Casement (left)", "Fixed", "Casement (right)"]


def test_layout_bay_takes_a_wood_jamb_and_black_interior_but_not_brickmould() -> None:
    jamb = raw_quote({"lines": [_bay(accessories=[{"kind": "wood_jamb", "depth_in": 5.5}])]})["lines"][0]
    assert any(c["label"].startswith("assembly: 5 1/2") for c in jamb["components"])
    black = raw_quote({"lines": [_bay(colour_ext="black", colour_int="black")]})["lines"][0]
    assert sum("black in/out" in c["label"] for c in black["components"]) == 3
    with pytest.raises(PriceBookReviewRequired, match="welded"):
        price_quote({"lines": [_bay(accessories=[{"kind": "brickmould", "name": "(classic)"}])]})


def test_bay_needs_three_to_six_side_by_side_lites() -> None:
    with pytest.raises(PriceBookReviewRequired, match="3 to 6 lites"):
        price_quote({"lines": [_bay(layout={"split": "cols", "children": [{"op": "fixed"}, {"op": "fixed"}]})]})
    stacked = {"split": "cols", "children": [
        {"op": "fixed"}, {"split": "rows", "children": [{"op": "fixed"}, {"op": "fixed"}]}, {"op": "fixed"}]}
    with pytest.raises(PriceBookReviewRequired, match="side by side"):
        price_quote({"lines": [_bay(layout=stacked)]})


def test_bay_and_door_descriptions_and_drawings() -> None:
    from services.descriptions import window_description
    from services.windowcity.layout import drawing

    text = window_description({"spec": _bay(colour_ext="black", colour_int="black",
                                            accessories=[{"kind": "wood_jamb", "name": '5 1/2"'}])})
    assert text.startswith('Classic 3 1/4" (WC-100 series) bay window, 3 lites - 96 x 60 in')
    assert "Interior colour: black" in text and '5 1/2" primed wood jamb' in text
    assert [s["op"] for s in drawing(_bay())["sections"]] == ["casement", "fixed", "casement"]
    four = drawing({"type": "patio_sliding", "nominal_ft": 12})
    assert [s["hinge"] for s in four["sections"]] == [None, "right", "left", None]


def test_descriptions_match_the_frontend_text() -> None:
    """frontend/lib/__tests__/products.test.ts asserts the same strings."""
    from services.descriptions import window_description

    bay = _bay(colour_ext="black", colour_int="black", accessories=[{"kind": "wood_jamb", "name": '5 1/2"'}])
    assert window_description({"spec": bay}).casefold() == (
        'Classic 3 1/4" (WC-100 series) bay window, 3 lites - 96 x 60 in - Lites: Casement (left) 24 x 60, '
        "Fixed 48 x 60, Casement (right) 24 x 60 - Head & seat: up to 8ft wide - Exterior colour: black - "
        'Interior colour: black - LoE 180 - argon gas - 5 1/2" primed wood jamb').casefold()
    slider = {"type": "patio_sliding", "nominal_ft": 6, "operation": "OX", "colour_ext": "white", "kick_lock": True,
              "accessories": [{"kind": "wood_jamb", "depth_in": 4.75}]}
    assert window_description({"spec": slider}) == (
        'Sliding patio door - 6 ft - OX - Exterior colour: white - 4 3/4" unfinished wood jamb - Kick lock')


def test_wood_jamb_priming_limits() -> None:
    """Primed white: patio doors up to 4 1/2", windows up to 6 1/4" (user rule 2026-09-28)."""
    from services.descriptions import accessory_text
    from services.windowcity.quote import wood_jamb_finish

    assert wood_jamb_finish({"kind": "wood_jamb", "depth_in": 4.5}, "patio_sliding") == "primed"
    assert wood_jamb_finish({"kind": "wood_jamb", "name": '5 1/2"', "depth_in": 5.5}, "patio") == "unfinished"
    assert wood_jamb_finish({"kind": "wood_jamb", "depth_in": 4.5, "finish": "unfinished"}, "patio") == "unfinished"
    assert wood_jamb_finish({"kind": "wood_jamb", "name": '6 1/4"'}, "window") == "primed"
    assert wood_jamb_finish({"kind": "wood_jamb", "name": '7 1/2"'}, "window") == "unfinished"
    # A primed request past the limit is still unfinished.
    assert accessory_text({"kind": "wood_jamb", "depth_in": 7, "finish": "primed"}) == '7" unfinished wood jamb'


def test_patio_door_standard_jamb_prices_on_the_door_row() -> None:
    """The standard 4 1/2" patio jamb is not a printed window row; it bills at 4.00/lf."""
    line = door(6, "ww", "es", accessories=[{"kind": "wood_jamb", "name": '4 1/2"', "depth_in": 4.5, "finish": "primed"}])
    comps = raw_quote({"lines": [line]})["lines"][0]["components"]
    jamb = next(c["label"] for c in comps if "wood jamb" in c["label"])
    assert jamb.startswith('4.5" primed wood jamb') and jamb.endswith("@ 4.00")
