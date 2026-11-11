"""Door slab faces: the panels, planks, grooves, inlays and slots drawn on a slab.

The library is config/door_faces.json, measured from Palma's panel selector
photos. Every element is in fractions of the slab (x across from the left, y
down from the top). ``door_face`` resolves a catalog model (and, for the
Grooved / Stainless Steel Oak slabs, the chosen pattern) to its elements;
``door_drawing`` stores them on the geometry so the PDF
(services/estimate_documents.py), the on-screen drawing
(frontend/components/DoorDrawing.tsx, which reads its own copy
frontend/lib/doorFaces.data.json) and the Better View CRM all draw the same face.
"""
from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

FACES_PATH = Path(__file__).resolve().parents[2] / "config" / "door_faces.json"

# Element sizes in inches, shared with the TypeScript renderers.
GROOVE_IN = 0.35
INLAY_IN = 0.45
SLOT_IN = 1.1
TAPER_IN = (0.9, 0.2)
TOP_RISE = {"arch": 0.16, "camber": 0.06, "scroll": 0.12}  # of the panel width


@lru_cache(maxsize=1)
def library() -> dict[str, Any]:
    return json.loads(FACES_PATH.read_text(encoding="utf-8"))


def _expand(item: dict[str, Any]) -> list[dict[str, Any]]:
    """A pattern's elements, with its ``rows`` / ``columns`` shorthand spelled out."""
    out: list[dict[str, Any]] = []
    rows = item.get("rows")
    if rows:
        for i in range(int(rows["count"])):
            y = round(rows["from"] + i * rows["step"], 4)
            out.append({"t": "g", "x1": rows["x1"], "y1": y, "x2": rows["x2"], "y2": y})
    columns = item.get("columns")
    if columns:
        for i in range(int(columns["count"])):
            x = round(columns["from"] + i * columns["step"], 4)
            out.append({"t": "g", "x1": x, "y1": columns["y1"], "x2": x, "y2": columns["y2"]})
    return out + [dict(element) for element in item.get("elements") or []]


def patterns_for(material: str | None, model: str | None) -> dict[str, Any] | None:
    """The pattern group (grooved / stainless) a model is drawn with, or None."""
    entry = (library()["models"].get(material or "") or {}).get(model or "")
    if isinstance(entry, dict) and entry.get("pattern"):
        group = library()["patterns"][entry["pattern"]]
        return {"key": entry["pattern"], **group}
    return None


def slab_designs(material: str | None, model: str | None) -> list[dict[str, str]]:
    """The patterns a rep can pick for a model, as [{code, label}] (empty when it has none)."""
    group = patterns_for(material, model)
    if not group:
        return []
    return [{"code": code, "label": item["label"]} for code, item in group["items"].items()]


def door_face(material: str | None, model: str | None, pattern: str | None = None) -> dict[str, Any] | None:
    """The face of a catalog model: {key, label, pattern?, elements}; None when the model isn't in the library."""
    entry = (library()["models"].get(material or "") or {}).get(model or "")
    if entry is None:
        return None
    if isinstance(entry, dict):
        group = library()["patterns"][entry["pattern"]]
        code = pattern if pattern in group["items"] else group["default"]
        item = group["items"][code]
        return {
            "key": f"{entry['pattern']}:{code}",
            "label": f"{group['label']} {code} ({item['label']})",
            "pattern": {"code": code, "label": item["label"], "chosen": pattern == code},
            "elements": _expand(item),
        }
    face = library()["faces"][entry]
    return {"key": entry, "label": face["label"], "pattern": None, "elements": [dict(e) for e in face["elements"]]}


def element_box(element: dict[str, Any]) -> tuple[float, float, float, float]:
    """(x, y, w, h) in slab fractions; lines get a hair of thickness."""
    kind = element["t"]
    if kind == "p":
        return element["x"], element["y"], element["w"], element["h"]
    if kind == "slot":
        return element["x"], element["y"] - 0.008, element["w"], 0.016
    x1, x2 = sorted((element["x1"], element["x2"]))
    y1, y2 = sorted((element["y1"], element["y2"]))
    return x1, y1, max(x2 - x1, 0.004), max(y2 - y1, 0.004)


def without_glass(
    elements: list[dict[str, Any]],
    lites: list[tuple[float, float, float, float, str]],
    slab_w: float,
    slab_h: float,
) -> list[dict[str, Any]]:
    """Drop the elements a door's glass covers by a quarter or more (the glass takes that panel's place).

    A lite that only clips a panel's edge (a half-moon over a blank-top door's
    panels) leaves the panel drawn.
    """
    if not lites:
        return elements
    kept = []
    for element in elements:
        x, y, w, h = element_box(element)
        ex, ey, ew, eh = x * slab_w, y * slab_h, w * slab_w, h * slab_h
        covered = sum(
            max(0.0, min(ex + ew, lx + lw) - max(ex, lx)) * max(0.0, min(ey + eh, ly + lh) - max(ey, ly))
            for lx, ly, lw, lh, _ in lites
        )
        if covered < 0.25 * ew * eh:
            kept.append(element)
    return kept


def panel_top(element: dict[str, Any], x: float) -> float:
    """The y (slab fraction) of a panel's top edge at slab fraction x, for curved tops."""
    top = element.get("top") or "square"
    if top == "square" or element["w"] <= 0:
        return element["y"]
    t = min(1.0, max(0.0, (x - element["x"]) / element["w"]))
    return element["y"] + _rise(element) * _curve(top, t)


def panel_outline(element: dict[str, Any], slab_w: float, slab_h: float, steps: int = 16) -> list[tuple[float, float]]:
    """A panel's outline in slab inches, clockwise from its bottom-left corner."""
    x, y, w, h = element["x"] * slab_w, element["y"] * slab_h, element["w"] * slab_w, element["h"] * slab_h
    top = element.get("top") or "square"
    points = [(x, y + h)]
    if top == "square":
        points += [(x, y), (x + w, y)]
    else:
        rise = _rise(element) * slab_h
        points += [(x + w * i / steps, y + rise * _curve(top, i / steps)) for i in range(steps + 1)]
    points.append((x + w, y + h))
    return points


def _rise(element: dict[str, Any]) -> float:
    """How far a curved top dips at its corners, as a slab-height fraction (from the panel width)."""
    rise = TOP_RISE.get(element.get("top") or "", 0.0) * element["w"]
    # Width fraction to height fraction on a 36 x 80 slab; capped so tall panels keep their shape.
    return min(rise * 36 / 80, element["h"] * 0.3)


def _curve(top: str, t: float) -> float:
    """0 at the crown, 1 at the corners."""
    if top == "scroll":
        return (1 + math.cos(2 * math.pi * t)) / 2
    return 1 - math.sin(math.pi * t)
