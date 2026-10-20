"""Steel reinforcement and thick glass as Window City actually applies them.

Thresholds read from 420 Window City order checklists (2024-2026) attached
to Better View's QuickBooks estimates: 5,700 single frames and 1,271 mulled
units. Under-quoting costs margin, so each rule errs toward reinforcing.
"""
from __future__ import annotations

import pytest

from services.windowcity.order_checklist import lines_from_text
from services.windowcity.quote import price_quote, sash_reinforcement_needed

TRIPLE = {"loe180": True, "triple": True, "gas": "90/5"}


def _labels(line: dict) -> list[str]:
    return [c["label"] for c in price_quote({"lines": [line]})["lines"][0]["components"]]


def _single(op: str, w: float, h: float, ext: str = "white", inside: str = "white") -> dict:
    return {"type": "unit", "series": "classic", "width": w, "height": h,
            "colour_ext": ext, "colour_int": inside, "glazing": TRIPLE,
            "layout": {"op": op, **({"hinge": "left"} if op == "casement" else {})}}


@pytest.mark.parametrize(("ext", "inside", "height", "reinforced"), [
    ("jet black", "white", 62, False),
    ("jet black", "white", 64, True),      # Frank Hanna 125401074 items 11.1/11.3
    ("Jet Black", "White", 66, True),      # Ranj 125401151 items 1.2, 2.1, 16.1
    ("dark bronze", "white", 64.75, True), # Frank Hanna item 9.3
    ("charcoal", "white", 64, False),
    ("charcoal", "white", 66, True),
    ("black", "black", 52, True),          # black in / black out from ~48"
    ("black", "black", 48, False),
    ("sandstone", "white", 70, False),
    ("white", "white", 70, False),
])
def test_casement_sash_reinforcement_follows_colour(ext, inside, height, reinforced) -> None:
    assert sash_reinforcement_needed("CASEMENT", 24, height, ext, inside) is reinforced
    labels = _labels(_single("casement", 24, height, ext, inside))
    assert any("Reinforcement" in label for label in labels) is reinforced


@pytest.mark.parametrize(("width", "reinforced"), [(48, False), (49, True), (60, True)])
def test_awnings_wider_than_48_are_reinforced_in_any_colour(width, reinforced) -> None:
    for colour in ("white", "jet black"):
        labels = _labels(_single("awning", width, 20, colour))
        assert any("Reinforcement" in label for label in labels) is reinforced


def test_plain_window_lines_get_the_reinforcement_too() -> None:
    line = {"type": "window", "style": "WC-100", "width": 24, "height": 64,
            "colour_ext": "jet black", "glazing": TRIPLE}
    assert "Sash Reinforcement" in _labels(line)


def test_reinforcement_is_never_billed_twice() -> None:
    line = {"type": "window", "style": "WC-100", "width": 24, "height": 70,
            "colour_ext": "jet black", "glazing": TRIPLE, "adders": ["Sash Reinforcement"]}
    assert _labels(line).count("Sash Reinforcement") == 1


def _mulled(w: float, h: float, ops: list[str]) -> dict:
    children = [{"op": op, **({"hinge": "left"} if op == "casement" else {})} for op in ops]
    return {"type": "unit", "series": "classic", "width": w, "height": h, "glazing": TRIPLE,
            "layout": {"split": "cols", "sizes": ["*"] * len(children), "children": children}}


@pytest.mark.parametrize(("w", "h", "ops", "reinforced"), [
    (48, 68, ["casement", "casement"], True),          # Dorothy 125401101 item 4
    (97, 69, ["casement", "fixed", "casement"], True),  # Dorothy item 3 (chart said no: < 108)
    (83, 72, ["fixed", "fixed", "casement"], True),     # Marisa 125401111 item 2
    (72, 66, ["fixed", "casement"], False),             # Ranj items 1 and 2 were not
    (47, 70, ["casement", "fixed"], False),
])
def test_mullions_are_reinforced_past_66_tall_from_48_wide(w, h, ops, reinforced) -> None:
    labels = _labels(_mulled(w, h, ops))
    assert any("reinforcement mullion" in label for label in labels) is reinforced


def test_triple_pane_past_35_sqft_carries_the_6mm_charge() -> None:
    q = price_quote({"lines": [_single("fixed", 84, 72)]})
    assert any(c["label"].startswith("Oversize glass 6mm") for c in q["lines"][0]["components"])
    assert any("triple-pane glass limit" in w for w in q["warnings"])


CHECKLIST = """125401151
Order Checklist
Client information: Test
Qty DescriptionItem#
1 1 Living
C3 - Fixed+Casement (right) pcr
mulled units 3 1/4" frame
Frame Size W: 72.0000 x H: 66.0000 inch
Division 24.0000:48.0000 inch
Color: outside: Jet Black / inside: White jw
1.1 1 Living
F1 - Fixed SINGLE FRAME p
3.25" Frame - Classic Collection WC-175
Frame Size W: 47.9750 x H: 66.0000 inch
Color: outside: Jet Black / inside: White jw
1.2 1 Living
C1-Casement (right) SINGLE FRAME cr
3.25" Frame - Classic Collection WC-100
Frame Size W: 23.9750 x H: 66.0000 inch
Color: outside: Jet Black / inside: White jw
right hinge cmr
2 1 Bath
AW4 - Fixed over Awning p/a
mulled units 3 1/4" frame
Frame Size W: 28.0000 x H: 71.0000 inch
Division 14.0000:57.0000 inch
Color: outside: White / inside: White ww
2.1 1 Bath
F1 - Fixed SINGLE FRAME p
3.25" Frame - Classic Collection WC-175
Frame Size W: 28.0000 x H: 56.9750 inch
Color: outside: White / inside: White ww
2.2 1 Bath
AW1 - Awning SINGLE FRAME a
3.25" Frame - Classic Collection WC-125
Frame Size W: 28.0000 x H: 13.9750 inch
Color: outside: White / inside: White ww
Total Qty
"""


def test_import_sizes_sections_from_their_own_frames_not_the_division_order() -> None:
    windows = {line["details"]["tag"]: line["spec"] for line in lines_from_text(CHECKLIST)["windows"]}
    # Division reads 24:48, but section 1.1 (the fixed) is the 48" one.
    assert windows["1"]["layout"]["sizes"] == [48, "*"]
    assert [c["op"] for c in windows["1"]["layout"]["children"]] == ["fixed", "casement"]


def test_import_reads_items_without_a_room_name() -> None:
    # Order 125401082: with no room the configuration shares the item line.
    text = CHECKLIST.replace("1 1 Living\nC3 - Fixed+Casement (right) pcr", "1 1 C3 - Fixed+Casement (right) pcr")
    windows = {line["details"]["tag"]: line for line in lines_from_text(text)["windows"]}
    assert windows["1"]["spec"]["layout"]["sizes"] == [48, "*"]
    assert windows["1"]["location"] == ""


def test_import_reads_ep326_zero_inch_as_the_1_inch_classic_brickmould() -> None:
    text = CHECKLIST.replace(
        "Division 24.0000:48.0000 inch\n",
        "Division 24.0000:48.0000 inch\n-brickmould\ninstalled color - w, 15.67 ft Classic BM - 0 inch, EP326-0\n")
    living = {line["details"]["tag"]: line["spec"] for line in lines_from_text(text)["windows"]}["1"]
    assert {"kind": "brickmould", "name": '1" brickmould (classic)'} in living["accessories"]


@pytest.mark.parametrize(("style", "colour", "per_square"), [
    ("colonial", "white", 6.0), ("colonial", "black", 8.0), ("colonial", "two-tone", 8.0),
    ("georgian", "white", 8.0), ("sdl classic", "white", 50.0), ("sdl heritage", "black", 34.5),
])
def test_grilles_price_per_square_from_the_book(style, colour, per_square) -> None:
    line = {**_single("fixed", 36, 48), "grilles": {"style": style, "colour": colour, "squares": 6}}
    grille = [c for c in price_quote({"lines": [line]})["lines"][0]["components"] if c["label"].startswith("Grilles")]
    assert grille and grille[0]["list"] == pytest.approx(6 * per_square)


def test_import_reads_grilles_per_section() -> None:
    text = CHECKLIST.replace(
        "Color: outside: Jet Black / inside: White jw\nright hinge cmr",
        "Color: outside: Jet Black / inside: White jw\nright hinge cmr\n"
        "-grill  field# 1, type Colonial Grill,  Color- jw grill_cw\n2 by 3 grid")
    living = {line["details"]["tag"]: line["spec"] for line in lines_from_text(text)["windows"]}["1"]
    fixed, casement = living["layout"]["children"]
    assert "grilles" not in fixed
    assert casement["grilles"] == {"style": "colonial", "colour": "two-tone", "squares": 6}


def test_import_reads_lowe_180_neat_as_loe_180() -> None:
    text = CHECKLIST.replace("right hinge cmr", "right hinge cmr\n-LowE 180  Neat Glass exterior pane,\n-I89 Glass interior pane I89")
    living = {line["details"]["tag"]: line["spec"] for line in lines_from_text(text)["windows"]}["1"]
    assert living["glazing"]["loe180"] and living["glazing"]["i89"]


def test_import_reads_the_nailing_flange() -> None:
    text = CHECKLIST.replace(
        "Division 24.0000:48.0000 inch\n",
        "Division 24.0000:48.0000 inch\n-nailing flange , lenght 23 ft. nail_flang\n")
    living = {line["details"]["tag"]: line["spec"] for line in lines_from_text(text)["windows"]}["1"]
    assert {"kind": "misc", "name": "Nailing Flange"} in living["accessories"]


def test_import_stacks_fixed_over_awning() -> None:
    stack = {line["details"]["tag"]: line["spec"] for line in lines_from_text(CHECKLIST)["windows"]}["2"]
    assert stack["layout"]["split"] == "rows"
    assert stack["layout"]["sizes"] == [57, "*"]
    assert [c["op"] for c in stack["layout"]["children"]] == ["fixed", "awning"]
