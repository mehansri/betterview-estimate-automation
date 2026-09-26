"""Golden check against Window City order 125401151 (Ranj - 111 Triplex, 2026-07-17).

Lines are shaped exactly as the Better View CRM's opening spec sends them
(src/domain/opening-spec.ts): triple pane 2x LoE 180, Jet Black exterior,
5 1/2" wood jamb + nailing flange around the assembly, sash reinforcement as
a style adder. `expected` is Window City's dealer unit price on the order.
"""
from __future__ import annotations

import pytest

from services.windowcity.quote import price_quote

TRIM = [{"kind": "wood_jamb", "name": '5 1/2" wood jamb'}, {"kind": "misc", "name": "Nailing Flange"}]


def _lite(style: str, width: float, height: float, gas: str, *, reinforced: bool = False, accessories=None) -> dict:
    return {
        "type": "window",
        "style": style,
        "width": width,
        "height": height,
        "colour_ext": "Jet Black",
        "colour_int": "White",
        "glazing": {"loe180": True, "i89": False, "triple": True, "tri_pane_lami": False, "frost_tint": False, "gas": gas},
        "adders": ["Sash Reinforcement"] if reinforced else [],
        "accessories": accessories if accessories is not None else TRIM,
    }


def _combo(width: float, height: float, lites: list[tuple[str, float, bool]]) -> dict:
    perimeter_ft = round(2 * (width + height) / 12, 2)
    trim = [{**accessory, "lineal_ft": perimeter_ft} for accessory in TRIM]
    return {
        "type": "combination",
        "layout": {"cols": len(lites), "rows": 1},
        "lites": [
            _lite(style, lite_width, height, "90/5", reinforced=reinforced, accessories=trim if index == 0 else [])
            for index, (style, lite_width, reinforced) in enumerate(lites)
        ],
    }


# Argon (90/5) packages: engine must match Window City to within a dollar.
KRYPTON_MIX = [
    ("7 awning 60x20", _lite("WC-125", 60, 20, "90/5", reinforced=True), 455.44),
    ("4 fixed 24x42", _lite("WC-175", 24, 42, "90/5"), 265.32),
    ("17 fixed 60x24", _lite("WC-175", 60, 24, "90/5"), 340.38),
    ("18 fixed 24x66", _lite("WC-175", 24, 66, "90/5"), 371.60),
    ("1 fixed + casement 72x66", _combo(72, 66, [("WC-175", 47.975, False), ("WC-100", 23.975, True)]), 1097.11),
    ("5 casement + fixed 60x42", _combo(60, 42, [("WC-100", 29.975, False), ("WC-175", 29.975, False)]), 651.43),
    ("15 casement + fixed 72x66", _combo(72, 66, [("WC-100", 35.975, True), ("WC-175", 35.975, False)]), 1126.31),
    ("16 casement + fixed 48x66", _combo(48, 66, [("WC-100", 23.975, True), ("WC-175", 23.975, False)]), 798.41),
]

# Argon-only triple: Window City did not bill the argon; the engine still does
# (over-quoting accepted), so it may be high by exactly the argon charge.
ARGON = [
    ("3 slider 60x30", _lite("WC-200", 60, 30, "argon"), 416.71),
    ("8 slim fixed 36x16", _lite("WC-150", 36, 16, "argon"), 226.76),
    ("11 slim fixed 72x18", _lite("WC-150", 72, 18, "argon"), 317.94),
    ("14 slim fixed 18x66", _lite("WC-150", 18, 66, "argon"), 311.78),
]


@pytest.mark.parametrize(("name", "line", "expected"), KRYPTON_MIX, ids=[case[0] for case in KRYPTON_MIX])
def test_ranj_krypton_mix_openings_match_window_city(name: str, line: dict, expected: float) -> None:
    dealer = price_quote({"lines": [line]})["lines"][0]["dealer_each"]
    assert dealer == pytest.approx(expected, abs=1.0)


@pytest.mark.parametrize(("name", "line", "expected"), ARGON, ids=[case[0] for case in ARGON])
def test_ranj_argon_openings_never_under_quote(name: str, line: dict, expected: float) -> None:
    priced = price_quote({"lines": [line]})["lines"][0]
    argon = sum(component["dealer"] for component in priced["components"] if component["label"] == "Argon")
    assert priced["dealer_each"] >= expected - 0.05
    assert priced["dealer_each"] - argon == pytest.approx(expected, abs=0.05)
