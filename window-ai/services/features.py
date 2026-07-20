"""Feature generator — derived fields only; never overwrites raw width/height."""
from __future__ import annotations

from typing import Any


def compute_area(width: float | None, height: float | None) -> float | None:
    if width is None or height is None:
        return None
    return float(width) * float(height)


def compute_perimeter(width: float | None, height: float | None) -> float | None:
    if width is None or height is None:
        return None
    return 2.0 * (float(width) + float(height))


def compute_aspect_ratio(width: float | None, height: float | None) -> float | None:
    if width is None or height is None:
        return None
    h = float(height)
    if h == 0:
        return None
    return float(width) / h


def attach_derived_features(
    row: dict[str, Any],
    *,
    oversized_area: float = 3000.0,
    wide_width: float = 60.0,
    tall_height: float = 72.0,
) -> dict[str, Any]:
    """Return a copy of row with derived features filled (raw dims preserved)."""
    out = dict(row)
    w = out.get("width")
    h = out.get("height")
    try:
        w_f = float(w) if w is not None else None
    except (TypeError, ValueError):
        w_f = None
    try:
        h_f = float(h) if h is not None else None
    except (TypeError, ValueError):
        h_f = None

    area = out.get("area")
    if area is None:
        area = compute_area(w_f, h_f)
    else:
        try:
            area = float(area)
        except (TypeError, ValueError):
            area = compute_area(w_f, h_f)

    out["area"] = area
    out["perimeter"] = compute_perimeter(w_f, h_f)
    out["aspect_ratio"] = compute_aspect_ratio(w_f, h_f)
    out["oversized"] = bool(area is not None and area > oversized_area)
    out["wide_window"] = bool(w_f is not None and w_f > wide_width)
    out["tall_window"] = bool(h_f is not None and h_f > tall_height)

    glass = str(out.get("glass") or "").lower()
    layers = {"single": 1, "double": 2, "triple": 3}.get(glass)
    if layers is not None:
        out["glass_layers"] = layers
    elif out.get("glass_layers") is None:
        out["glass_layers"] = 2

    color = str(out.get("color") or "")
    if "color_upcharge" not in out or out.get("color_upcharge") is None:
        out["color_upcharge"] = color not in ("White", "Beige", "")

    return out
