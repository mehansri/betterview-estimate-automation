"""Normalize raw parsed fields into consistent enums and numbers."""
from __future__ import annotations

import re
from typing import Optional

from parser.base import ParsedEstimate, ParsedWindow

COLOR_MAP = {
    "white": "White",
    "blk": "Black",
    "black": "Black",
    "dark bronze": "Dark Bronze",
    "brn": "Brown",
    "brown": "Brown",
    "beige": "Beige",
    "almond": "Beige",
    "gray": "Gray",
    "grey": "Gray",
    # plain "bronze" only — not "dark bronze" (checked via exact key first)
    "bronze": "Dark Bronze",
}

TYPE_MAP = {
    "casement": "Casement",
    "awning": "Awning",
    "double hung": "Double Hung",
    "double-hung": "Double Hung",
    "dh": "Double Hung",
    "slider": "Slider",
    "sliding": "Slider",
    "fixed": "Fixed",
    "picture": "Picture",
    "picture window": "Picture",
}

FRAME_MAP = {
    "vinyl": "Vinyl",
    "pvc": "Vinyl",
    "aluminum": "Aluminum",
    "alum": "Aluminum",
    "aluminium": "Aluminum",
    "fiberglass": "Fiberglass",
    "fg": "Fiberglass",
    "wood": "Wood",
}

GLASS_MAP = {
    "single": "Single",
    "1 pane": "Single",
    "double": "Double",
    "dual": "Double",
    "2 pane": "Double",
    "double pane": "Double",
    "triple": "Triple",
    "3 pane": "Triple",
    "triple pane": "Triple",
}

GRID_MAP = {
    "none": "None",
    "no grid": "None",
    "n/a": "None",
    "colonial": "Colonial",
    "prairie": "Prairie",
    "diamond": "Diamond",
    "sdl": "Colonial",
}


def _title_or_map(value: Optional[str], mapping: dict[str, str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    if not cleaned:
        return None
    key = cleaned.lower()
    if key in mapping:
        return mapping[key]
    # Longer keys first so "dark bronze" wins over "bronze"
    for k, v in sorted(mapping.items(), key=lambda kv: -len(kv[0])):
        if k in key:
            return v
    return cleaned.title()


def parse_inches(value: object) -> Optional[float]:
    """Convert 48, 48\", 48 in, 4'0\" style dimensions to inches."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().lower()
    if not s:
        return None

    # feet'inches"
    m = re.match(r"^(\d+)\s*'\s*(\d+(?:\.\d+)?)\s*\"?$", s)
    if m:
        return float(m.group(1)) * 12 + float(m.group(2))

    m = re.match(r"^(\d+)\s*'$", s)
    if m:
        return float(m.group(1)) * 12

    # plain number with optional unit
    m = re.match(r"^(\d+(?:\.\d+)?)\s*(?:\"|in|inch|inches)?$", s)
    if m:
        return float(m.group(1))

    # extract first number
    m = re.search(r"(\d+(?:\.\d+)?)", s)
    if m:
        return float(m.group(1))
    return None


def normalize_window(w: ParsedWindow) -> ParsedWindow:
    data = w.model_dump()
    data["type"] = _title_or_map(data.get("type"), TYPE_MAP)
    data["frame"] = _title_or_map(data.get("frame"), FRAME_MAP)
    data["glass"] = _title_or_map(data.get("glass"), GLASS_MAP)
    data["color"] = _title_or_map(data.get("color"), COLOR_MAP)
    data["grid"] = _title_or_map(data.get("grid"), GRID_MAP) or "None"
    data["width"] = parse_inches(data.get("width"))
    data["height"] = parse_inches(data.get("height"))
    if data["width"] is not None and data["height"] is not None:
        data["area"] = round(data["width"] * data["height"], 3)
    if data.get("quantity") is None or data["quantity"] < 1:
        data["quantity"] = 1
    if data.get("price") is not None and data.get("line_total") is None:
        data["line_total"] = round(float(data["price"]) * int(data["quantity"]), 2)
    if data.get("shape"):
        data["shape"] = str(data["shape"]).strip().title()
    else:
        data["shape"] = "Rectangular"
    return ParsedWindow(**data)


def normalize_estimate(est: ParsedEstimate) -> ParsedEstimate:
    windows = [normalize_window(w) for w in est.windows]
    total = est.total
    if total is None and windows:
        line_sums = [w.line_total for w in windows if w.line_total is not None]
        if line_sums:
            total = round(sum(line_sums), 2)
    return est.model_copy(update={"windows": windows, "total": total})


def is_valid_training_window(w: ParsedWindow) -> bool:
    if w.width is None or w.height is None:
        return False
    if w.width <= 0 or w.height <= 0:
        return False
    price = w.price if w.price is not None else (
        (w.line_total / w.quantity) if w.line_total and w.quantity else None
    )
    if price is None or price <= 0:
        return False
    return True
