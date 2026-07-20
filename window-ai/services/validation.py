"""Validate window/estimate records. Reject hard errors; collect soft warnings."""
from __future__ import annotations

from typing import Any


KNOWN_TYPES = {
    "Casement",
    "Awning",
    "Fixed",
    "Slider",
    "Double Hung",
    "Picture",
    "Patio Door",
}
KNOWN_GLASS = {"Single", "Double", "Triple"}
KNOWN_FRAMES = {"Vinyl", "Aluminum", "Fiberglass", "Wood"}


def validate_window(
    row: dict[str, Any],
    *,
    min_dimension: float = 6.0,
    max_width: float = 240.0,
    max_height: float = 240.0,
) -> tuple[list[str], list[str]]:
    """Return (errors, warnings). Errors mean reject for pricing/import row."""
    errors: list[str] = []
    warnings: list[str] = []

    wtype = row.get("type")
    if not wtype:
        errors.append("Missing product type")
    elif str(wtype) not in KNOWN_TYPES:
        warnings.append(f"Unknown product type: {wtype}")

    width = row.get("width")
    height = row.get("height")
    try:
        width_f = float(width) if width is not None else None
    except (TypeError, ValueError):
        width_f = None
        errors.append(f"Invalid width: {width}")
    try:
        height_f = float(height) if height is not None else None
    except (TypeError, ValueError):
        height_f = None
        errors.append(f"Invalid height: {height}")

    if width_f is not None:
        if width_f <= 0:
            errors.append("Width must be positive")
        elif width_f < min_dimension:
            warnings.append(f"Width {width_f} below typical minimum {min_dimension}")
        elif width_f > max_width:
            errors.append(f"Width {width_f} exceeds maximum {max_width}")

    if height_f is not None:
        if height_f <= 0:
            errors.append("Height must be positive")
        elif height_f < min_dimension:
            warnings.append(f"Height {height_f} below typical minimum {min_dimension}")
        elif height_f > max_height:
            errors.append(f"Height {height_f} exceeds maximum {max_height}")

    if width_f is None or height_f is None:
        if "Invalid width" not in " ".join(errors) and width_f is None:
            errors.append("Missing width")
        if "Invalid height" not in " ".join(errors) and height_f is None:
            errors.append("Missing height")

    price = row.get("price") if row.get("price") is not None else row.get("unit_price")
    if price is not None:
        try:
            p = float(price)
            if p < 0:
                errors.append("Negative price")
            elif p == 0:
                warnings.append("Zero unit price")
        except (TypeError, ValueError):
            warnings.append(f"Non-numeric price: {price}")
    else:
        warnings.append("Missing unit price")

    glass = row.get("glass")
    if glass and str(glass) not in KNOWN_GLASS:
        warnings.append(f"Unknown glass type: {glass}")

    frame = row.get("frame")
    if frame and str(frame) not in KNOWN_FRAMES:
        warnings.append(f"Unknown frame: {frame}")

    qty = row.get("quantity", 1)
    try:
        if int(qty) < 1:
            errors.append("Quantity must be >= 1")
    except (TypeError, ValueError):
        errors.append(f"Invalid quantity: {qty}")

    return errors, warnings


def validate_estimate(est: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not est.get("estimate_number"):
        errors.append("Missing estimate_number")
    windows = est.get("windows") or []
    if not windows:
        warnings.append("Estimate has no windows")
    for i, w in enumerate(windows):
        e, warn = validate_window(w if isinstance(w, dict) else {})
        for msg in e:
            errors.append(f"Window {i + 1}: {msg}")
        for msg in warn:
            warnings.append(f"Window {i + 1}: {msg}")
    return errors, warnings
