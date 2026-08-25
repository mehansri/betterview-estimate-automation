"""Pure lookups over the extracted Palma Door price data.

The JSON files retain the source page and raw printed line for auditability.
Lookups intentionally raise on missing or ambiguous matches: pricing the wrong
door is worse than asking the user to complete one more prerequisite.
"""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "doors"

FINISHES: dict[str, list[str]] = {
    "fiberglass": [
        "paint_2s_1c",
        "paint_2s_2c",
        "stain_2s_1c",
        "stain_2s_2c",
        "stain_out_paint_in",
    ],
    "steel": ["factory_white", "paint_1s", "paint_2s_1c", "paint_2s_2c"],
}

FINISH_LABELS = {
    "factory_white": "Factory White",
    "paint_1s": "Paint 1 Side",
    "paint_2s_1c": "Paint 2 Sides, 1 Colour",
    "paint_2s_2c": "Paint 2 Sides, 2 Colours",
    "stain_2s_1c": "Stain 2 Sides, 1 Colour",
    "stain_2s_2c": "Stain 2 Sides, 2 Colours",
    "stain_out_paint_in": "Stain Outside / Paint Inside",
}

FINISH_ALIASES = {
    "factory white": "factory_white",
    "white": "factory_white",
    "paint 1 side": "paint_1s",
    "painted 1 side": "paint_1s",
    "paint one side": "paint_1s",
    "paint 2 sides": "paint_2s_1c",
    "painted 2 sides": "paint_2s_1c",
    "paint 2 sides 1 colour": "paint_2s_1c",
    "paint 2 sides 1 color": "paint_2s_1c",
    "paint 2 sides 2 colours": "paint_2s_2c",
    "paint 2 sides 2 colors": "paint_2s_2c",
    "stain 2 sides": "stain_2s_1c",
    "stained 2 sides": "stain_2s_1c",
    "stain 2 sides 1 colour": "stain_2s_1c",
    "stain 2 sides 1 color": "stain_2s_1c",
    "stain 2 sides 2 colours": "stain_2s_2c",
    "stain 2 sides 2 colors": "stain_2s_2c",
    "stain out paint in": "stain_out_paint_in",
    "stain outside paint inside": "stain_out_paint_in",
}

GROUP_SERIES = {
    "A": "group_a",
    "B": "group_b",
    "C": "group_c",
    "D": "group_d",
    "W": "wrought_iron",
}


class DoorLookupError(Exception):
    """Raised when a catalog lookup finds zero or multiple rows."""


def _norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).lower())


@lru_cache(maxsize=None)
def data(name: str) -> Any:
    with (DATA_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def slabs(material: str) -> list[dict[str, Any]]:
    if material not in FINISHES:
        raise DoorLookupError(f"Unsupported door material {material!r}.")
    return data(f"{material}.json")


def options() -> dict[str, Any]:
    return data("options.json")


def resolve_finish(value: str, material: str | None = None) -> str:
    if value in FINISH_LABELS:
        finish = value
    else:
        normalized = re.sub(r"[^a-z0-9 ]+", " ", str(value).lower())
        normalized = re.sub(r"\s+", " ", normalized).strip()
        finish = FINISH_ALIASES.get(normalized)
        if finish is None:
            for alias, candidate in sorted(
                FINISH_ALIASES.items(), key=lambda item: -len(item[0])
            ):
                if alias in normalized:
                    finish = candidate
                    break
    if finish is None:
        valid = ", ".join(FINISHES.get(material or "", FINISH_LABELS))
        raise DoorLookupError(f"Unrecognised finish {value!r}. Valid: {valid}")
    if material and finish not in FINISHES.get(material, []):
        valid = ", ".join(FINISH_LABELS[key] for key in FINISHES[material])
        raise DoorLookupError(
            f"{FINISH_LABELS[finish]} is not offered on {material}. Options: {valid}"
        )
    return finish


def glass_group(name: str) -> dict[str, Any]:
    target = _norm(name)
    hits = [row for row in data("glass_groups.json") if _norm(row["name"]) == target]
    if not hits:
        hits = [row for row in data("glass_groups.json") if target in _norm(row["name"])]
    if not hits:
        raise DoorLookupError(f"No decorative glass named {name!r}.")
    if len(hits) > 1:
        raise DoorLookupError(
            f"{name!r} matches several glasses: {', '.join(row['name'] for row in hits)}"
        )
    return hits[0]


def series_for_glass(name: str) -> tuple[str, dict[str, Any]]:
    record = glass_group(name)
    series = GROUP_SERIES.get(record["group"])
    if series is None:
        raise DoorLookupError(
            f"{record['name']} has no pricing group in the book; price it as Special Order."
        )
    return series, record


def find_slab(
    material: str,
    series: str,
    *,
    component: str = "door",
    glass_size: str | None = None,
    panel: str | None = None,
    height: str = '6\'8"',
) -> dict[str, Any]:
    rows = [
        row
        for row in slabs(material)
        if row["series"] == series
        and row["component"] == component
        and row["height"] == height
        and row["kind"] == "slab"
    ]
    if glass_size is not None:
        target = _norm(glass_size)
        exact = [row for row in rows if _norm(row.get("glass_size")) == target]
        rows = exact or [row for row in rows if target in _norm(row.get("glass_size"))]
    if panel is not None:
        target = _norm(panel)
        exact = [row for row in rows if _norm(row.get("panel")) == target]
        rows = exact or [row for row in rows if target in _norm(row.get("panel"))]

    if not rows:
        raise DoorLookupError(
            f"No {material} {series} {component} row for size={glass_size!r} "
            f"panel={panel!r} height={height!r}."
        )
    if len(rows) > 1:
        choices = "; ".join(
            f"{row.get('glass_size') or ''} {row.get('panel') or ''}" for row in rows[:8]
        )
        raise DoorLookupError(
            f"{len(rows)} {material} {series} {component} rows match "
            f"size={glass_size!r} panel={panel!r}: {choices}"
        )
    return rows[0]


def slab_choices(material: str) -> list[dict[str, Any]]:
    """Return UI-safe slab metadata without exposing price columns."""
    fields = (
        "material",
        "series",
        "series_label",
        "component",
        "height",
        "source_page",
        "kind",
        "glass_size",
        "panel",
        "row_label",
    )
    return [{key: row.get(key) for key in fields} for row in slabs(material)]


def find_option(material: str, category: str | None, item: str) -> dict[str, Any]:
    rows = [row for row in options()["options"] if row["material"] == material]
    if category:
        target_category = _norm(category)
        rows = [row for row in rows if target_category == _norm(row["category"])]
    target = _norm(item)
    exact = [row for row in rows if _norm(row["item"]) == target]
    rows = exact or [row for row in rows if target in _norm(row["item"])]
    if not rows:
        raise DoorLookupError(
            f"No {material} option matching category={category!r} item={item!r}."
        )
    if len(rows) > 1:
        choices = "; ".join(f"[{row['category']}] {row['item']}" for row in rows[:8])
        raise DoorLookupError(
            f"{len(rows)} {material} options match category={category!r} "
            f"item={item!r}: {choices}"
        )
    return rows[0]


def option_price(record: dict[str, Any], column: str | None = None) -> float:
    if "price" in record:
        return float(record["price"])
    prices = record.get("prices", {})
    if column:
        if column not in prices:
            raise DoorLookupError(
                f"{record['item']!r} has no {column!r} price "
                f"(has: {', '.join(prices)})."
            )
        return float(prices[column])
    if len(prices) == 1:
        return float(next(iter(prices.values())))
    raise DoorLookupError(
        f"{record['item']!r} has several prices ({', '.join(prices)}); choose one."
    )


def options_for(material: str) -> list[dict[str, Any]]:
    rows = [row for row in options()["options"] if row["material"] == material]
    result = []
    for row in rows:
        clean = {
            "category": row["category"],
            "category_label": row["category_label"],
            "item": row["item"],
            "source_page": row.get("source_page"),
        }
        if "prices" in row:
            clean["columns"] = sorted(row["prices"])
        result.append(clean)
    return result


def panel_upcharge(
    material: str,
    *,
    code: str | None = None,
    panel: str | None = None,
    height: str = '6\'8"',
    width: float = 36,
) -> tuple[dict[str, Any], dict[str, Any]]:
    rows = [
        row
        for row in options()["panel_upcharges"]
        if row["material"] == material and row["height"] == height
    ]
    if code:
        target = _norm(code)
        rows = [row for row in rows if _norm(row["code"]) == target]
    if panel:
        target = _norm(panel)
        exact = [row for row in rows if _norm(row["panel"]) == target]
        rows = exact or [row for row in rows if target in _norm(row["panel"])]
    if not rows:
        raise DoorLookupError(
            f"No {material} {height} panel upcharge for code={code!r} panel={panel!r}."
        )
    if len(rows) > 1:
        choices = "; ".join(f"{row['code']} {row['panel']}" for row in rows[:8])
        raise DoorLookupError(f"Several panels match: {choices}")
    record = rows[0]
    for choice in record["options"]:
        nums = [float(value) for value in re.findall(r"(\d+(?:\.\d+)?)", choice["sizes"])]
        if not nums or min(nums) <= width <= max(nums):
            return record, choice
    return record, record["options"][0]


def transom(material: str, shape: str = "rectangle") -> dict[str, Any]:
    for record in options()["transoms"]:
        if record["material"] == material and record["shape"] == shape:
            return record
    raise DoorLookupError(f"No {material} transom table for shape={shape!r}.")


def pull_bar(
    material: str,
    *,
    style: str = "straight",
    block: str | None,
    length_in: int = 36,
    finish: str = "satin",
    shape: str = "round",
) -> dict[str, Any]:
    rows = [
        row
        for row in options()["pull_bars"]
        if row["material"] == material
        and row["style"] == style
        and row["length_in"] == length_in
        and row["finish"] == finish
        and row["shape"] == shape
    ]
    if block:
        target = _norm(block)
        exact = [
            row for row in rows if _norm(row["block"]) in (target, f"with{target}")
        ]
        rows = exact or [row for row in rows if target in _norm(row["block"])]
    if not rows:
        raise DoorLookupError(
            f"No {material} {style} pull bar for {length_in}in {finish} {shape} "
            f"block={block!r}."
        )
    if len(rows) > 1:
        raise DoorLookupError(
            "Name one hardware block: " + ", ".join(row["block_label"] for row in rows)
        )
    return rows[0]


def pull_bar_choices(material: str) -> list[dict[str, Any]]:
    fields = (
        "material",
        "style",
        "block",
        "block_label",
        "length_in",
        "finish",
        "finish_label",
        "shape",
    )
    return [{key: row[key] for key in fields} for row in options()["pull_bars"] if row["material"] == material]


def catalog_payload(config: dict[str, Any]) -> dict[str, Any]:
    materials = []
    for material in FINISHES:
        materials.append(
            {
                "key": material,
                "label": material.title(),
                "finishes": [
                    {"key": key, "label": FINISH_LABELS[key]}
                    for key in FINISHES[material]
                ],
                "slabs": slab_choices(material),
                "options": options_for(material),
                "panel_upcharges": [
                    {
                        "code": row["code"],
                        "panel": row["panel"],
                        "height": row["height"],
                        "options": row["options"],
                        "source_page": row.get("source_page"),
                    }
                    for row in options()["panel_upcharges"]
                    if row["material"] == material
                ],
                "transoms": [
                    {
                        "shape": row["shape"],
                        "shape_label": row["shape_label"],
                        "glass": sorted(row.get("glass_per_sqft", {})),
                        "minimum_sqft": row.get("minimum_sqft", []),
                        "source_page": row.get("source_page"),
                    }
                    for row in options()["transoms"]
                    if row["material"] == material
                ],
                "pull_bars": pull_bar_choices(material),
            }
        )
    glasses = [
        {
            "name": row["name"],
            "group": row["group"],
            "materials": row.get("materials", []),
            "source_pages": row.get("source_pages", {}),
        }
        for row in data("glass_groups.json")
    ]
    return {
        "materials": materials,
        "glass_groups": glasses,
        "opening_types": [
            {"key": "single_door", "label": "Single door", "doors": 1, "sidelites": 0},
            {"key": "single_1_sidelite", "label": "Single + 1 sidelite", "doors": 1, "sidelites": 1},
            {"key": "single_2_sidelites", "label": "Single + 2 sidelites", "doors": 1, "sidelites": 2},
            {"key": "double_door", "label": "Double door", "doors": 2, "sidelites": 0},
            {"key": "double_2_sidelites", "label": "Double + 2 sidelites", "doors": 2, "sidelites": 2},
        ],
        "install": config["install"],
        "quote_defaults": config.get("quote_defaults", {}),
        "currency": "CAD",
    }
