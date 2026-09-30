"""Palma's standard paint and stain colours.

Names and codes are from the price books (FG pp. 53-58, ST pp. 47-49) and
docs.palmadoor.com (2026-09-30). Palma treats every other colour as custom:
"All other colours will be considered custom and require a physical colour
chip", priced as Custom Colour Match (FG p51, ST p44).

Hex values are for the elevation drawing only. Paint hex values come from
Palma's swatch files; stain hex values are averaged from woodgrain photos and
are approximate (Light Pecan and Early American are set by hand because the
source swatches were unusable).
"""

from __future__ import annotations

import re
from typing import Any

STANDARD_WHITE = "Polytex White"

# (name, Palma code, hex)
PAINT_COLOURS: list[tuple[str, str, str]] = [
    (STANDARD_WHITE, "", "#ededed"),
    ("NS Espresso", "", "#272320"),
    ("Antique Brown", "G-265", "#4d3f24"),
    ("Red", "G-322", "#ca1921"),
    ("Ice White", "G-429", "#e0e6e6"),
    ("Rainwear White", "G-430", "#e5e5e1"),
    ("Bright White", "G-431", "#e3e3de"),
    ("Cream", "G-492", "#d0c0a6"),
    ("Lambeth Beige", "G-501", "#c2b59e"),
    ("Maize", "G-502", "#e7d8b8"),
    ("Windswept Smoke", "G-506", "#5c564f"),
    ("Tan", "G-507", "#b39a86"),
    ("Sandalwood", "G-508", "#c0aea0"),
    ("Midnight Surf", "G-509", "#4f5558"),
    ("Canyon Clay", "G-510", "#b3aa9a"),
    ("Moonlit Moss", "G-513", "#64655c"),
    ("Cashmere", "G-514", "#d1c9bc"),
    ("Sage", "G-517", "#94948b"),
    ("Ivy Green", "G-522", "#546a65"),
    ("Slate", "G-523", "#61615c"),
    ("Black", "G-525", "#1a1a1c"),
    ("Almond", "G-532", "#d4c7b5"),
    ("Antique Ivory", "G-533", "#d9c5a4"),
    ("Pearl", "G-534", "#c3c3be"),
    ("Wedgewood Blue", "G-535", "#5f7583"),
    ("Dover Gray", "G-536", "#abaaa7"),
    ("Mist Blue", "G-537", "#909da0"),
    ("Wicker Cafe", "G-538", "#bcac95"),
    ("Venetian Red", "G-539", "#7a3829"),
    ("Sandstone", "G-540", "#ebe3d1"),
    ("Old World Blue", "G-542", "#243748"),
    ("Harvest Wheat", "G-543", "#a98663"),
    ("Sable", "G-547", "#665f54"),
    ("Chestnut Brown", "G-554", "#442d25"),
    ("Forest Green", "G-556", "#1f4931"),
    ("Dark Drift", "G-557", "#7a6957"),
    ("Pebble", "G-559", "#9b8e7b"),
    ("Commercial Brown", "G-562", "#423a32"),
    ("Burgundy", "G-567", "#592231"),
    ("Nutmeg", "G-568", "#3e281d"),
    ("Saddle Brown", "G-569", "#705746"),
    ("Storm", "G-570", "#847d74"),
    ("Brownstone", "G-571", "#9d8e7a"),
    ("Juniper Grove", "G-580", "#949c7c"),
    ("Chesapeake Grey", "G-5C1", "#808581"),
    ("Marine Dusk", "G-5C6", "#323d47"),
    ("Rockwell Blue", "G-5P2", "#62747d"),
    ("Espresso", "G-5P3", "#594438"),
    ("Graphite", "G-5P5", "#545955"),
    ("Iron Ore", "G-5P6", "#444442"),
    ("Coastal Blue", "G-5P9", "#3a5f74"),
]

# (name, hex) -- woodgrain fiberglass only.
STAIN_COLOURS: list[tuple[str, str]] = [
    ("Timber Grey", "#4d5154"),
    ("Slate Grey", "#33383a"),
    ("Charcoal Grey", "#23292c"),
    ("White Oak", "#736048"),
    ("Bleached Oak", "#877b68"),
    ("Driftwood", "#776d5b"),
    ("Teak", "#612b1c"),
    ("Rustic Cherry", "#462118"),
    ("Red Mahogany", "#291e1c"),
    ("English Oak", "#3e2517"),
    ("Light Pecan", "#7a4b2a"),
    ("Early American", "#4a3122"),
    ("Dark Walnut", "#2a201c"),
    ("Jacobean", "#26201a"),
    ("Early American Black", "#2e241b"),
    ("Dark Pecan", "#201b17"),
]

# Spellings reps (and the book) use for a standard colour.
_PAINT_ALIASES = {
    "white": STANDARD_WHITE,
    "standard white": STANDARD_WHITE,
    "polytex": STANDARD_WHITE,
    "polytex white": STANDARD_WHITE,
    "irion ore": "Iron Ore",  # printed "Irion Ore" in the book
    "dover grey": "Dover Gray",
    "chesapeake gray": "Chesapeake Grey",
}


def _key(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "").replace("”", '"').replace("“", '"')).strip().lower()


_PAINT_BY_KEY: dict[str, str] = {}
for _name, _code, _hex in PAINT_COLOURS:
    _PAINT_BY_KEY[_key(_name)] = _name
    if _code:
        _PAINT_BY_KEY[_key(_code)] = _name
        _PAINT_BY_KEY[_key(_code.replace("G-", ""))] = _name
        _PAINT_BY_KEY[_key(f"{_code} {_name}")] = _name
        _PAINT_BY_KEY[_key(f"{_code.replace('G-', '')} {_name}")] = _name
for _alias, _name in _PAINT_ALIASES.items():
    _PAINT_BY_KEY[_alias] = _name
_STAIN_BY_KEY = {_key(name): name for name, _hex in STAIN_COLOURS}

PAINT_HEX_BY_NAME = {_key(name): hex_ for name, _code, hex_ in PAINT_COLOURS}
STAIN_HEX_BY_NAME = {_key(name): hex_ for name, hex_ in STAIN_COLOURS}


def standard_name(side_type: str, colour: Any) -> str | None:
    """Palma's name for a standard colour, or None when the colour is custom (or blank)."""
    key = _key(colour)
    if not key:
        return None
    if side_type == "stained":
        return _STAIN_BY_KEY.get(key)
    return _PAINT_BY_KEY.get(key)


def colour_hex(side_type: str, colour: Any) -> str | None:
    name = standard_name(side_type, colour)
    if not name:
        return None
    table = STAIN_HEX_BY_NAME if side_type == "stained" else PAINT_HEX_BY_NAME
    return table.get(_key(name))


def payload() -> dict[str, Any]:
    return {
        "paint_colours": [{"name": name, "code": code, "hex": hex_} for name, code, hex_ in PAINT_COLOURS],
        "stain_colours": [{"name": name, "hex": hex_} for name, hex_ in STAIN_COLOURS],
    }
