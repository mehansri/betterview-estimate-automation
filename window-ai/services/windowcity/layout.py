"""Layout-first window units: one frame size, divisions, a type per section.

A ``unit`` line describes a window the way Window City's order system does
(order 125401186, "Common Configs"): an overall frame size, a division
list per direction, and one single-frame product in each section. The layout is
a tree so any arrangement can be expressed, not only an even grid:

    {"split": "rows", "sizes": [48, 24], "children": [
        {"op": "fixed"},
        {"split": "cols", "sizes": ["*", "*"], "children": [
            {"op": "awning"}, {"op": "awning"}]}]}

``cols`` places children side by side (vertical joints), ``rows`` stacks them
(horizontal joints). A size is inches (``24``, ``"23 1/2"``), a share of the
parent (``"1/3"``, ``"25%"``) or ``"*"`` for an equal share of what is left.
A leaf is ``{"op": ..., "hinge": ..., "style": optional code override,
"glazing": optional per-section override}``.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from . import catalog
from .catalog import CatalogError

EPS = 1e-6

SERIES: dict[str, dict[str, Any]] = {
    "classic": {
        "label": "Classic 3 1/4\" (WC-100 series)",
        "styles": {
            "casement": "WC-100", "awning": "WC-125", "slim_fixed": "WC-150",
            "fixed": "WC-175", "single_slider": "WC-200", "single_hung": "WC-201",
            "double_slider": "WC-250", "double_hung": "WC-251",
        },
    },
    "classic_400": {
        "label": "Classic WC-400 series",
        "styles": {"casement": "WC-400", "awning": "WC-425", "slim_fixed": "WC-450",
                   "fixed": "WC-475"},
    },
    "heritage": {
        "label": "Heritage (HC-100 series)",
        "styles": {"casement": "HC-101", "awning": "HC-126", "slim_fixed": "HC-151",
                   "fixed": "HC-176"},
    },
    "heritage_maximum": {
        "label": "Heritage Maximum (HC-400 series)",
        "styles": {"casement": "HC-401", "awning": "HC-426", "slim_fixed": "HC-451",
                   "fixed": "HC-476"},
    },
}
DEFAULT_SERIES = "classic"

# hinge choices are "as viewed from outside", matching Window City drawings
OPERATIONS: dict[str, dict[str, Any]] = {
    "fixed": {"label": "Fixed", "hinges": []},
    "casement": {"label": "Casement", "hinges": ["left", "right"]},
    "awning": {"label": "Awning", "hinges": ["top"]},
    "slim_fixed": {"label": "Slim fixed", "hinges": []},
    "single_slider": {"label": "Single slider", "hinges": ["left", "right"]},
    "double_slider": {"label": "Double slider", "hinges": []},
    "single_hung": {"label": "Single hung", "hinges": []},
    "double_hung": {"label": "Double hung", "hinges": []},
}


def _leaf(op: str, hinge: str | None = None) -> dict:
    return {"op": op, **({"hinge": hinge} if hinge else {})}


def _split(direction: str, sizes: list, children: list) -> dict:
    return {"split": direction, "sizes": sizes, "children": children}


# Common configurations. ``code`` is Window City's name where their order
# system uses one (order 125401186); the rest are descriptive starting points.
PRESETS: list[dict[str, Any]] = [
    {"id": "C1", "code": "C1", "label": "Casement", "panels": 1,
     "width": 24, "height": 48, "layout": _leaf("casement", "left")},
    {"id": "F1", "code": "F1", "label": "Fixed", "panels": 1,
     "width": 24, "height": 48, "layout": _leaf("fixed")},
    {"id": "AW1", "code": "AW1", "label": "Awning", "panels": 1,
     "width": 36, "height": 24, "layout": _leaf("awning", "top")},
    {"id": "VS1", "code": "VS1", "label": "Single slider", "panels": 1,
     "width": 36, "height": 24, "layout": _leaf("single_slider", "left")},
    {"id": "VX1", "code": "VX1", "label": "Double slider", "panels": 1,
     "width": 36, "height": 24, "layout": _leaf("double_slider")},
    {"id": "C3", "code": "C3", "label": "Fixed + casement", "panels": 2,
     "width": 60, "height": 60,
     "layout": _split("cols", ["*", "*"], [_leaf("fixed"), _leaf("casement", "right")])},
    {"id": "twin_casement", "code": None, "label": "Twin casement", "panels": 2,
     "width": 48, "height": 48,
     "layout": _split("cols", ["*", "*"], [_leaf("casement", "left"), _leaf("casement", "right")])},
    {"id": "casement_fixed", "code": None, "label": "Casement + fixed", "panels": 2,
     "width": 60, "height": 60,
     "layout": _split("cols", ["*", "*"], [_leaf("casement", "left"), _leaf("fixed")])},
    {"id": "awning_stack", "code": None, "label": "Awning over awning", "panels": 2,
     "width": 36, "height": 48,
     "layout": _split("rows", ["*", "*"], [_leaf("awning", "top"), _leaf("awning", "top")])},
    {"id": "slider_transom", "code": None, "label": "Fixed transom over slider", "panels": 2,
     "width": 60, "height": 54,
     "layout": _split("rows", ["1/3", "*"], [_leaf("fixed"), _leaf("single_slider", "left")])},
    {"id": "F5", "code": "F5", "label": "Fixed over fixed", "panels": 2,
     "width": 30, "height": 96,
     "layout": _split("rows", ["*", "*"], [_leaf("fixed"), _leaf("fixed")])},
    {"id": "fixed_over_awning", "code": None, "label": "Fixed over awning", "panels": 2,
     "width": 36, "height": 60,
     "layout": _split("rows", ["2/3", "*"], [_leaf("fixed"), _leaf("awning", "top")])},
    {"id": "C5", "code": "C5", "label": "Casement + fixed + casement", "panels": 3,
     "width": 72, "height": 60,
     "layout": _split("cols", ["*", "*", "*"], [
         _leaf("casement", "left"), _leaf("fixed"), _leaf("casement", "right")])},
    {"id": "picture_flankers", "code": None, "label": "Picture with casement flankers (1/4-1/2-1/4)",
     "panels": 3, "width": 96, "height": 60,
     "layout": _split("cols", ["1/4", "1/2", "1/4"], [
         _leaf("casement", "left"), _leaf("fixed"), _leaf("casement", "right")])},
    {"id": "AW5", "code": "AW5", "label": "Fixed over two awnings", "panels": 3,
     "width": 72, "height": 72,
     "layout": _split("rows", ["2/3", "*"], [
         _leaf("fixed"),
         _split("cols", ["*", "*"], [_leaf("awning", "top"), _leaf("awning", "top")])])},
    {"id": "four_panel", "code": None, "label": "Two fixed over two casements", "panels": 4,
     "width": 60, "height": 72,
     "layout": _split("rows", ["*", "*"], [
         _split("cols", ["*", "*"], [_leaf("fixed"), _leaf("fixed")]),
         _split("cols", ["*", "*"], [_leaf("casement", "left"), _leaf("casement", "right")])])},
    {"id": "twin_fixed_over_awnings", "code": None, "label": "Two fixed over two awnings", "panels": 4,
     "width": 72, "height": 72,
     "layout": _split("rows", ["2/3", "*"], [
         _split("cols", ["*", "*"], [_leaf("fixed"), _leaf("fixed")]),
         _split("cols", ["*", "*"], [_leaf("awning", "top"), _leaf("awning", "top")])])},
    {"id": "transom_c5", "code": None, "label": "Fixed transom over casement + fixed + casement",
     "panels": 4, "width": 72, "height": 80,
     "layout": _split("rows", ["1/4", "*"], [
         _leaf("fixed"),
         _split("cols", ["*", "*", "*"], [
             _leaf("casement", "left"), _leaf("fixed"), _leaf("casement", "right")])])},
    {"id": "six_panel", "code": None, "label": "Three fixed over casement + fixed + casement",
     "panels": 6, "width": 96, "height": 84,
     "layout": _split("rows", ["1/3", "*"], [
         _split("cols", ["*", "*", "*"], [_leaf("fixed"), _leaf("fixed"), _leaf("fixed")]),
         _split("cols", ["*", "*", "*"], [
             _leaf("casement", "left"), _leaf("fixed"), _leaf("casement", "right")])])},
]


@dataclass
class Section:
    index: int          # 1-based, reading order (top-to-bottom, left-to-right)
    path: str           # e.g. "1.2" = second child of the first child
    x: float
    y: float            # from the top
    width: float
    height: float
    node: dict


@dataclass
class Line:
    orient: str         # "v" (between side-by-side sections) or "h" (stacked)
    pos: float          # x for vertical lines, y for horizontal ones
    start: float
    end: float

    @property
    def length(self) -> float:
        return self.end - self.start


@dataclass
class Resolved:
    width: float
    height: float
    sections: list[Section] = field(default_factory=list)
    lines: list[Line] = field(default_factory=list)

    @property
    def max_side_by_side(self) -> int:
        """Most sections crossed by any horizontal scan line."""
        ys = sorted({round(v, 6) for s in self.sections for v in (s.y, s.y + s.height)})
        best = 1
        for top, bottom in zip(ys, ys[1:]):
            mid = (top + bottom) / 2
            best = max(best, sum(1 for s in self.sections if s.y < mid < s.y + s.height))
        return best


_FRACTION = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)\s*$")


def _size_spec(raw: Any, total: float) -> float | None:
    """Inches for one division entry, or None for a '*' share."""
    if raw is None or raw == "*" or raw == "":
        return None
    if isinstance(raw, bool):
        raise CatalogError(f"invalid division size {raw!r}")
    if isinstance(raw, (int, float)):
        return float(raw)
    text = str(raw).strip()
    if text.endswith("%"):
        return total * float(text[:-1]) / 100.0
    m = _FRACTION.match(text)
    if m and float(m.group(1)) < float(m.group(2)):
        return total * float(m.group(1)) / float(m.group(2))
    try:
        return float(text.rstrip('"”'))
    except ValueError:
        pass
    try:
        return catalog.inches(text)
    except Exception as exc:  # noqa: BLE001 - surfaced as a catalog error
        raise CatalogError(f"invalid division size {raw!r}") from exc


def resolve_sizes(sizes: list | None, count: int, total: float) -> list[float]:
    """Division sizes in inches that add up to ``total``."""
    raw = list(sizes) if sizes else ["*"] * count
    if len(raw) != count:
        raise CatalogError(f"{count} sections need {count} division sizes, got {len(raw)}")
    fixed = [_size_spec(item, total) for item in raw]
    stars = sum(1 for v in fixed if v is None)
    used = sum(v for v in fixed if v is not None)
    if stars:
        share = (total - used) / stars
        if share <= EPS:
            raise CatalogError(
                f"divisions {raw} leave no room for the '*' sections in {total:g} in")
        out = [share if v is None else v for v in fixed]
    else:
        if abs(used - total) > 0.01:
            raise CatalogError(f"divisions {raw} add up to {used:g} in, not {total:g} in")
        out = fixed
    if any(v <= EPS for v in out):
        raise CatalogError(f"divisions {raw} include a section with no size")
    return out


def resolve(layout: dict | None, width: float, height: float) -> Resolved:
    """Place every section and every joint of a layout tree."""
    out = Resolved(float(width), float(height))
    if width <= 0 or height <= 0:
        raise CatalogError("unit width and height must be positive")

    def walk(node: dict, x: float, y: float, w: float, h: float, path: str) -> None:
        if not isinstance(node, dict):
            raise CatalogError(f"layout node {path or 'root'} must be an object")
        if "split" not in node:
            op = node.get("op")
            if op not in OPERATIONS:
                raise CatalogError(f"section {path or '1'}: unknown type {op!r}; "
                                   f"use one of {sorted(OPERATIONS)}")
            out.sections.append(Section(0, path or "1", x, y, w, h, node))
            return
        direction = node["split"]
        children = node.get("children") or []
        if direction not in ("cols", "rows"):
            raise CatalogError(f"layout split must be 'cols' or 'rows', got {direction!r}")
        if len(children) < 2:
            raise CatalogError(f"layout split {path or 'root'} needs at least two sections")
        sizes = resolve_sizes(node.get("sizes"), len(children), w if direction == "cols" else h)
        offset = 0.0
        for i, (child, size) in enumerate(zip(children, sizes), 1):
            child_path = f"{path}.{i}" if path else str(i)
            if direction == "cols":
                if i > 1:
                    out.lines.append(Line("v", x + offset, y, y + h))
                walk(child, x + offset, y, size, h, child_path)
            else:
                if i > 1:
                    out.lines.append(Line("h", y + offset, x, x + w))
                walk(child, x, y + offset, w, size, child_path)
            offset += size

    walk(layout or {"op": "fixed"}, 0.0, 0.0, float(width), float(height), "")
    out.sections.sort(key=lambda s: (round(s.y, 6), round(s.x, 6)))
    for i, section in enumerate(out.sections, 1):
        section.index = i
    out.lines = _merge_lines(out.lines)
    return out


def _merge_lines(lines: list[Line]) -> list[Line]:
    """Join collinear touching joint segments into single mullion lines."""
    merged: list[Line] = []
    for orient in ("v", "h"):
        by_pos: dict[float, list[Line]] = {}
        for line in lines:
            if line.orient == orient:
                by_pos.setdefault(round(line.pos, 6), []).append(line)
        for pos in sorted(by_pos):
            segs = sorted(by_pos[pos], key=lambda s: s.start)
            current = Line(orient, pos, segs[0].start, segs[0].end)
            for seg in segs[1:]:
                if seg.start <= current.end + EPS:
                    current.end = max(current.end, seg.end)
                else:
                    merged.append(current)
                    current = Line(orient, pos, seg.start, seg.end)
            merged.append(current)
    return merged


def style_for(section: Section, series: str) -> str:
    override = section.node.get("style")
    if override:
        return str(override)
    op = section.node["op"]
    s = SERIES.get(series)
    if s is None:
        raise CatalogError(f"unknown series {series!r}; use one of {sorted(SERIES)}")
    code = s["styles"].get(op)
    if not code:
        raise CatalogError(f"{OPERATIONS[op]['label']} is not offered in the {s['label']}")
    return code


def section_label(section: Section) -> str:
    op = OPERATIONS[section.node["op"]]["label"]
    hinge = section.node.get("hinge")
    if hinge and hinge != "top":
        return f"{op} ({hinge})"
    return op


def summary(layout: dict | None, width: float, height: float) -> str:
    """Window City style text: 'Casement (left) | Fixed | Casement (right)'."""
    r = resolve(layout, width, height)
    rows: dict[float, list[Section]] = {}
    for s in r.sections:
        rows.setdefault(round(s.y, 6), []).append(s)
    return " / ".join(" | ".join(section_label(s) for s in row) for _, row in sorted(rows.items()))


def from_grid(cols: int, rows: int, lites: list[dict]) -> dict:
    """Layout tree for a legacy even-grid ``combination`` line (row-major lites)."""
    if cols * rows != len(lites):
        raise CatalogError(f"combination {cols}x{rows} needs {cols * rows} lites, got {len(lites)}")

    def leaf(lite: dict) -> dict:
        return {"op": "fixed", "style": lite["style"], "_line": lite}

    def row(r: int) -> dict:
        items = lites[r * cols:(r + 1) * cols]
        if cols == 1:
            return leaf(items[0])
        return _split("cols", [float(l["width"]) for l in items], [leaf(l) for l in items])

    if rows == 1:
        return row(0)
    heights = [float(lites[r * cols]["height"]) for r in range(rows)]
    return _split("rows", heights, [row(r) for r in range(rows)])


def catalog_payload() -> dict[str, Any]:
    return {
        "series": [{"id": key, "label": value["label"], "operations": sorted(value["styles"],
                    key=list(OPERATIONS).index), "styles": value["styles"]}
                   for key, value in SERIES.items()],
        "default_series": DEFAULT_SERIES,
        "operations": [{"id": key, **value} for key, value in OPERATIONS.items()],
        "presets": PRESETS,
    }


# Catalog style code -> operation, so single windows and legacy combinations
# can be drawn the same way as units.
STYLE_OPERATIONS: dict[str, str] = {
    **{code: "casement" for code in ("WC-100", "WC-400", "HC-101", "HC-401")},
    **{code: "awning" for code in ("WC-125", "WC-425", "HC-126", "HC-426")},
    **{code: "slim_fixed" for code in ("WC-150", "WC-450", "HC-151", "HC-451")},
    **{code: "fixed" for code in ("WC-175", "WC-475", "HC-176", "HC-476")},
    **{code: "single_slider" for code in ("WC-200", "WC-300", "WC-325")},
    **{code: "double_slider" for code in ("WC-250", "WC-350")},
    "WC-201": "single_hung", "WC-251": "double_hung",
}


def _style_leaf(style_code: Any) -> dict:
    try:
        code = catalog.style(str(style_code))["code"]
    except CatalogError:
        code = str(style_code or "").upper()
    op = STYLE_OPERATIONS.get(code, "fixed")
    hinges = OPERATIONS[op]["hinges"]
    return {"op": op, **({"hinge": hinges[0]} if hinges else {})}


def patio_layout(spec: dict) -> tuple[dict, float, float]:
    """Panels of a patio door as a drawable layout, viewed from outside.

    A sliding panel is drawn as a slider whose arrow points the way it opens:
    XO slides right over the fixed panel, OX slides left, and the two centre
    panels of OXXO part outwards.
    """
    if spec.get("type") == "patio_swing":
        w, h = float(spec["width"]), float(spec["height"])
        if spec.get("kind") == "double":
            return _split("cols", ["*", "*"], [_leaf("casement", "left"), _leaf("casement", "right")]), w, h
        return _leaf("casement", str(spec.get("hinge") or "left")), w, h
    row = catalog.sliding_row(int(spec["nominal_ft"]))
    w, h = catalog.inches(row["frame_width"]), catalog.inches(row["frame_height"])
    operation = str(spec.get("operation") or ("OXXO" if int(row["panels"]) == 4 else "XO")).upper()
    panels = {
        "XO": [_leaf("single_slider", "left"), _leaf("fixed")],
        "OX": [_leaf("fixed"), _leaf("single_slider", "right")],
        "OXXO": [_leaf("fixed"), _leaf("single_slider", "right"), _leaf("single_slider", "left"), _leaf("fixed")],
    }.get(operation)
    if panels is None:
        raise CatalogError(f"unknown sliding door operation {operation!r}")
    return _split("cols", ["*"] * len(panels), panels), w, h


def drawing(spec: dict) -> dict | None:
    """Section geometry for drawing a window line (viewed from outside), or None."""
    kind = spec.get("type", "window")
    try:
        if kind == "unit":
            tree, w, h = spec.get("layout"), float(spec["width"]), float(spec["height"])
        elif kind == "window":
            tree, w, h = _style_leaf(spec.get("style")), float(spec["width"]), float(spec["height"])
        elif kind == "combination":
            cols, rows = int(spec["layout"]["cols"]), int(spec["layout"]["rows"])
            lites = spec.get("lites") or []
            tree = from_grid(cols, rows, lites)

            def relabel(node: dict) -> dict:
                if "split" in node:
                    return {**node, "children": [relabel(c) for c in node["children"]]}
                return _style_leaf(node.get("style"))

            tree = relabel(tree)
            w = sum(float(l["width"]) for l in lites[:cols])
            h = sum(float(lites[r * cols]["height"]) for r in range(rows))
        elif kind == "bay_bow":
            if spec.get("layout"):
                tree, w, h = spec["layout"], float(spec["width"]), float(spec["height"])
            else:
                lites = [lite for lite in spec.get("lites") or [] if isinstance(lite, dict)]
                tree = _split("cols", [float(l["width"]) for l in lites],
                              [_style_leaf(l.get("style")) for l in lites])
                w, h = sum(float(l["width"]) for l in lites), float(lites[0]["height"])
        elif kind in ("patio_sliding", "patio_swing"):
            tree, w, h = patio_layout(spec)
        else:
            return None
        resolved = resolve(tree, w, h)
    except (CatalogError, KeyError, TypeError, ValueError, IndexError):
        return None
    return {
        "width": resolved.width,
        "height": resolved.height,
        "sections": [
            {"index": s.index, "x": round(s.x, 4), "y": round(s.y, 4), "width": round(s.width, 4),
             "height": round(s.height, 4), "op": s.node["op"], "hinge": s.node.get("hinge")}
            for s in resolved.sections
        ],
    }
