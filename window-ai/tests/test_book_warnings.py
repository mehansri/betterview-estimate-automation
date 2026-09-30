"""Palma misprints: quoted at the printed price, with a note telling the rep to confirm."""

from __future__ import annotations

import copy

from services.doors import book_warnings, catalog
from services.doors.pricing import load_config, quote


CFG = load_config()


def _flagged(material: str) -> list[dict]:
    return [row for row in catalog.slabs(material) if book_warnings.slab_warning(material, row)]


def _checks(result: dict) -> list[str]:
    return [note for note in result["notes"] if note.startswith("Check with Palma")]


def test_every_listed_misprint_matches_exactly_one_book_row():
    # A typo in the list would silently never warn; each entry must hit one row.
    flagged = _flagged("fiberglass") + _flagged("steel")
    assert len(flagged) == len(book_warnings._SLABS)
    keys = {(row["material"], row["source_page"], row["series"], row["component"], row["glass_size"], row.get("panel")) for row in flagged}
    assert len(keys) == len(flagged)
    for material, category, item, *_ in book_warnings._OPTIONS:
        hits = [
            row
            for row in catalog.options()["options"]
            if row["material"] == material and row["category"] == category and book_warnings.option_warning(material, row)
        ]
        assert len(hits) == 1, (material, category, item)
    for material, shape, finish, *_ in book_warnings._TRANSOMS:
        assert book_warnings.transom_warning(material, catalog.transom(material, shape), finish)
    for material, height, code, width, *_ in book_warnings._PANEL_UPCHARGES:
        record, choice = catalog.panel_upcharge(material, code=code, height=height, width=width)
        assert book_warnings.panel_upcharge_warning(material, record, choice, width)


def test_misprinted_row_is_quoted_as_printed_with_a_warning():
    spec = {
        "material": "fiberglass",
        "finish": "paint_2s_1c",
        "opening_type": "single_door",
        "door": {"series": "sandblast_clear_border_6mm_lami", "glass_size": "22x09", "panel": "Oak 6-Panel"},
    }
    result = quote(spec, CFG)
    slab = result["line_items"][0]
    assert slab["unit_list"] == 6008.0  # the printed (suspect) price, unchanged
    [note] = _checks(result)
    assert "fiberglass book p21" in note and "22x09" in note
    # The warning is for the rep; the customer's line wording is untouched.
    assert "Palma" not in slab["customer_description"]


def test_configurator_flags_the_misprint_once():
    selection = {
        "material": "steel",
        "width": 36,
        "height": '6\'8"',
        "configuration": "single",
        "frame_depth": "4.625",
        "model": "flush",
        "colours": {"exterior": {"type": "white"}, "interior": {"type": "white"}},
        "glass": {"door": {"glazed": True, "size": "22x3.5 (x4)", "family": "sandblast", "series": "sandblast_clear_border_6mm_lami"}},
        "standard": {"lock": "double_bore"},
    }
    result = quote({"label": "Front entry", "material": "steel", "opening_type": "single_door", "pipeline": selection}, CFG)
    assert result["line_items"][0]["unit_list"] == 2633.0
    [note] = _checks(result)
    assert "steel book p20" in note


def test_sound_rows_carry_no_warning():
    spec = {
        "material": "fiberglass",
        "finish": "paint_2s_1c",
        "opening_type": "single_door",
        "door": {"series": "sandblast_6mm_lami", "glass_size": "22x12 (x4)", "panel": "Oak Flush"},
    }
    result = quote(spec, CFG)
    assert result["line_items"][0]["unit_list"] == 6008.0  # the same number is correct on p17
    assert _checks(result) == []


def test_a_corrected_price_switches_the_warning_off():
    row = copy.deepcopy(_flagged("fiberglass")[0])
    assert book_warnings.slab_warning("fiberglass", row)
    row["prices"][book_warnings.FIRST_COLUMN["fiberglass"]] += 1
    assert book_warnings.slab_warning("fiberglass", row) is None
