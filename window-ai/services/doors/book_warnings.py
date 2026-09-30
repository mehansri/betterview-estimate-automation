"""Palma price-book rows that look misprinted in the 2024/25 books (last updated Oct 21, 2025).

Decision 2026-09-30: quote these at the printed price and tell the rep to
confirm with Palma. See docs/palma-price-book-reconciliation.md, D1-D4.
Every entry also matches on the printed price, so once a corrected price book
replaces a row the warning stops matching on its own.
"""

from __future__ import annotations

import re
from typing import Any


# The first price column of each book; entries record the value printed there.
FIRST_COLUMN = {"fiberglass": "paint_2s_1c", "steel": "factory_white"}

_FG_P21 = "rows from 22x09 down are shifted or copied from p17/p19 (e.g. 22x09 carries p17's 22x12 (x4) price)"
_ST_P20 = "rows from 22x3.5 (x4) down are shifted or copied from p17 (e.g. 22x3.5 (x4) at $2,633 vs $4,838 on p17)"
_ST_P16 = "the table is headed DOOR (custom sizes) but repeats p17's 6mm-laminated direct-glazed sidelite table; stored as direct-glazed sidelites"
_FG_P28 = "prices are out of line with p17 and p25 (22x48 equals 22x17**, 22x64/22x80 are cheaper than 22x36)"

# (material, page, series, component, glass_size, panel, printed first-column price, reason)
_SLABS: list[tuple[str, int, str, str, str, str | None, float, str]] = [
    # D1 - fiberglass p21, Sandblast with Clear Border 6mm Lami
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x09", "Oak 6-Panel", 6008, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x09 (x4)", "Oak Flush", 6833, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x09 (x5)", "Oak Flush", 3613, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x10", "Oak 6-Panel", 4093, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x12 (x4)", "Oak Flush", 5183, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x15-1/4**", "Craftsman FIR03", 3830, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x17**", "Craftsman 3DP", 4194, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x17 (x3)", "Oak Flush", 4683, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x36", "Oak 6-Panel", 5170, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x48", "Oak 3/4 2-Panel", 3510, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x64", "Oak Flush", 3728, _FG_P21),
    ("fiberglass", 21, "sandblast_clear_border_6mm_lami", "door", "22x80", "Oak Flush", 4110, _FG_P21),
    # D2 - steel p20, Sandblast with Clear Border 6mm Lami
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x3.5 (x4)", "Flush", 2633, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x3.5 (x5)", "Flush", 4838, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x3.5 (x6)", "Flush", 5663, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x12", "Soho", 2633, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x12 (x4)", "Flush", 4838, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x12 (x5)", "Flush", 2553, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x14-7/16**", "Victoria", 4013, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x14-7/16 (x4)", "Flush", 2820, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x17", "Sydney", 3094, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x17 (x3)", "Flush", 3294, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x17 (x4)", "Flush", 3513, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x36", "London", 4000, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x48", "Orleans", 2994, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x48**", "Soho", 3194, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x64", "Flush", 3378, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "door", "22x80", "Flush", 3830, _ST_P20),
    ("steel", 20, "sandblast_clear_border_6mm_lami", "sidelite", "8x80", "Flush", 2356, "the 8x80 sidelite is identical to p18 (no lamination premium)"),
    # D3 - steel p16, Sandblast Triple "custom sizes"
    ("steel", 16, "sandblast_triple", "direct_glazed_sidelite", '5.5"-13.5"', None, 2262, _ST_P16),
    ("steel", 16, "sandblast_triple", "direct_glazed_sidelite", 'up to 15.5"', None, 2370, _ST_P16),
    ("steel", 16, "sandblast_triple", "direct_glazed_sidelite", 'up to 17.5"', None, 2478, _ST_P16),
    ("steel", 16, "sandblast_triple", "direct_glazed_sidelite", 'up to 19.5"', None, 2586, _ST_P16),
    ("steel", 16, "sandblast_triple", "direct_glazed_sidelite", 'up to 21.5"', None, 2694, _ST_P16),
    ("steel", 16, "sandblast_triple", "direct_glazed_sidelite", 'up to 23.5"', None, 2802, _ST_P16),
    ("steel", 16, "sandblast_triple", "direct_glazed_sidelite", 'up to 25.5"', None, 2910, _ST_P16),
    ("steel", 16, "sandblast_triple", "direct_glazed_sidelite", 'up to 27.5"', None, 3018, _ST_P16),
    # D4 - single rows that look copied or far out of line
    ("fiberglass", 6, "group_b", "door", "22x15-1/4**", "Craftsman FIR03", 5556, "printed above the larger 22x17** ($3,940); every other page has FIR03 below 22x17**"),
    ("fiberglass", 6, "group_b", "door", "Half-Moon", "Oak 4-Panel BT", 3094, "identical to the Clear Half-Moon on p25"),
    ("steel", 6, "group_b", "door", "Half-Moon", "4-Panel BT", 2024, "identical to the Clear Half Moon on p23"),
    ("fiberglass", 15, "sandblast_triple", "door", "22x15-1/4**", "Craftsman FIR03", 4871, "printed $1,002 above 22x17** on the same page; on p13 it is $480 below"),
    ("fiberglass", 23, "obscure", "door", "22x09", "Oak 6-Panel", 3502, "22x09, 22x10 and 22x36 are all printed at the same price"),
    ("fiberglass", 23, "obscure", "door", "22x10", "Oak 6-Panel", 3502, "22x09, 22x10 and 22x36 are all printed at the same price"),
    ("fiberglass", 28, "clear_lowe_6mm_lami", "door", "22x17**", "Craftsman 3DP", 4460, _FG_P28),
    ("fiberglass", 28, "clear_lowe_6mm_lami", "door", "22x17 (x3)", "Oak Flush", 5044, _FG_P28),
    ("fiberglass", 28, "clear_lowe_6mm_lami", "door", "22x36", "Oak 6-Panel", 3852, _FG_P28),
    ("fiberglass", 28, "clear_lowe_6mm_lami", "door", "22x48", "Oak 3/4 2-Panel", 4460, _FG_P28),
    ("fiberglass", 28, "clear_lowe_6mm_lami", "door", "22x64", "Oak Flush", 3500, _FG_P28),
    ("fiberglass", 28, "clear_lowe_6mm_lami", "door", "22x80", "Oak Flush", 3754, _FG_P28),
    ("fiberglass", 31, "sdl_obscure", "direct_glazed_sidelite", 'Direct Set up to 27.5"', None, 3290, 'the "up to 27.5"" row repeats the 25.5" prices'),
    ("steel", 29, "sdl_obscure", "direct_glazed_sidelite", 'up to 27.5"', None, 2965, 'the "up to 27.5"" row repeats the 25.5" prices'),
    ("steel", 30, "internal_blinds", "door", "20x64", "Flush", 2447, "20x64 and 22x64 are printed at the same price"),
    ("steel", 30, "internal_blinds", "door", "22x64", "Flush", 2447, "20x64 and 22x64 are printed at the same price"),
    ("steel", 30, "internal_blinds", "door", "20x80", "Flush", 2906, "20x80 and 22x80 are printed at the same price"),
    ("steel", 30, "internal_blinds", "door", "22x80", "Flush", 2906, "20x80 and 22x80 are printed at the same price"),
]

# (material, category, item, printed price, page, reason)
_OPTIONS: list[tuple[str, str, str, float, int, str]] = [
    ("fiberglass", "casing_trim_painted", "Double Door + 2 Sidelites", 700, 45, "priced the same as Single Door + 2 Sidelites"),
    ("fiberglass", "casing_trim_stained", "Double Door + 2 Sidelites", 800, 45, "priced the same as Single Door + 2 Sidelites"),
    ("steel", "casing_trim_painted", "Double Door + 2 Sidelites", 700, 40, "priced the same as Single Door + 2 Sidelites"),
]

# (material, shape, finish column, printed frame price, page, reason)
_TRANSOMS: list[tuple[str, str, str, float, int, str]] = [
    ("fiberglass", "rectangle", "stain_2s_2c", 1140, 43, "the 2-colour stain frame is printed above stain-out/paint-in ($710)"),
    ("fiberglass", "shapes", "stain_2s_2c", 1390, 43, "the 2-colour stain frame is printed above stain-out/paint-in ($1105)"),
]

# (material, height, panel code, width in the band, printed upcharge, page, reason)
_PANEL_UPCHARGES: list[tuple[str, str, str, int, float, int, str]] = [
    ("fiberglass", '8\'0"', "DRF3F80", 42, 6280, 42, "$6,280 at 42\" against $1,800 at 36\""),
]


def _norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _message(subject: str, material: str, page: Any, reason: str) -> str:
    book = "fiberglass" if material == "fiberglass" else "steel"
    return (
        f"Check with Palma: {subject} ({book} book p{page}) is quoted at the printed price, "
        f"but the book looks misprinted here: {reason}."
    )


def slab_warning(material: str, row: dict[str, Any]) -> str | None:
    """Warning text for a door/sidelite price row, or None when the row looks sound."""
    column = FIRST_COLUMN.get(material)
    printed = (row.get("prices") or {}).get(column)
    for entry in _SLABS:
        mat, page, series, component, glass, panel, price, reason = entry
        if (
            mat == material
            and row.get("source_page") == page
            and row.get("series") == series
            and row.get("component") == component
            and _norm(row.get("glass_size")) == _norm(glass)
            and _norm(row.get("panel")) == _norm(panel)
            and printed == price
        ):
            label = " ".join(value for value in (row.get("glass_size"), row.get("panel")) if value)
            return _message(f"{row.get('series_label', series)} {label}", material, page, reason)
    return None


def option_warning(material: str, record: dict[str, Any]) -> str | None:
    for mat, category, item, price, page, reason in _OPTIONS:
        if (
            mat == material
            and record.get("category") == category
            and _norm(record.get("item")) == _norm(item)
            and record.get("price") == price
        ):
            return _message(f"{record.get('category_label', category)}: {record['item']}", material, page, reason)
    return None


def transom_warning(material: str, record: dict[str, Any], finish: str) -> str | None:
    for mat, shape, column, price, page, reason in _TRANSOMS:
        if (
            mat == material
            and record.get("shape") == shape
            and finish == column
            and (record.get("frame") or {}).get(finish) == price
        ):
            return _message(f"{record.get('shape_label', shape)} transom frame", material, page, reason)
    return None


def panel_upcharge_warning(material: str, record: dict[str, Any], choice: dict[str, Any], width: float) -> str | None:
    for mat, height, code, band_width, price, page, reason in _PANEL_UPCHARGES:
        if (
            mat == material
            and record.get("height") == height
            and _norm(record.get("code")) == _norm(code)
            and int(width) == band_width
            and choice.get("upcharge") == price
        ):
            return _message(f"panel upcharge {record.get('panel')} {record.get('code')}", material, page, reason)
    return None
