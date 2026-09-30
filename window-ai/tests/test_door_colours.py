"""Palma standard colours: the backend list and the configurator's copy agree."""

from __future__ import annotations

import re
from pathlib import Path

from services.doors import colours
from services.doors.pipeline import custom_colours, finish_hex


TS = Path(__file__).resolve().parents[1] / "frontend" / "lib" / "palmaColours.ts"


def test_frontend_colour_list_mirrors_the_backend():
    text = TS.read_text(encoding="utf-8")
    paints = re.findall(r'\{ name: "([^"]+)", code: "([^"]*)", hex: "(#[0-9a-f]{6})" \}', text)
    stains = re.findall(r'\{ name: "([^"]+)", hex: "(#[0-9a-f]{6})" \}', text)
    assert paints == list(colours.PAINT_COLOURS)
    assert stains == list(colours.STAIN_COLOURS)
    for alias, name in colours._PAINT_ALIASES.items():
        assert f'"{alias}": "{name}"' in text


def test_standard_names_codes_and_aliases():
    assert colours.standard_name("painted", "g-525") == "Black"
    assert colours.standard_name("painted", "5P6 Iron Ore") == "Iron Ore"
    assert colours.standard_name("painted", "Irion Ore") == "Iron Ore"  # the book's spelling
    assert colours.standard_name("painted", "white") == colours.STANDARD_WHITE
    assert colours.standard_name("stained", "dark walnut") == "Dark Walnut"
    assert colours.standard_name("stained", "Walnut") is None
    assert colours.standard_name("painted", "") is None


def test_custom_colours_are_distinct_and_ignore_blanks():
    picked = {
        "exterior": {"type": "painted", "colour": "Barn Red"},
        "interior": {"type": "painted", "colour": "barn red"},
        "frame": {"mode": "split", "exterior": {"type": "painted", "colour": "Black"}, "interior": {"type": "painted"}},
    }
    assert custom_colours(picked) == [("painted", "Barn Red")]
    assert finish_hex("painted", "G-525") == "#1a1a1c"
    assert finish_hex("stained", "Walnut") == "#5d3a1a"  # saved before the Palma list: legacy swatch
