"""Weighted similarity search over historical windows."""
from __future__ import annotations

import math
import statistics
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from db.models import Window
from services.rules import get_quote_config, get_similarity_weights, load_rules


def _cat_score(a: Any, b: Any) -> float:
    if a is None or b is None:
        return 0.5
    return 1.0 if str(a).lower() == str(b).lower() else 0.0


def _dim_score(
    qw: float | None,
    qh: float | None,
    hw: float | None,
    hh: float | None,
) -> float:
    """Relative L1 on width/height → 1 when identical, decays to 0."""
    if qw is None or qh is None or hw is None or hh is None:
        return 0.0
    try:
        qw, qh, hw, hh = float(qw), float(qh), float(hw), float(hh)
    except (TypeError, ValueError):
        return 0.0
    if qw <= 0 or qh <= 0 or hw <= 0 or hh <= 0:
        return 0.0
    err_w = abs(qw - hw) / qw
    err_h = abs(qh - hh) / qh
    # 10% size error → ~0.67; 50% → ~0
    mean_err = (err_w + err_h) / 2.0
    return max(0.0, 1.0 - mean_err * 2.0)


def _options_score(query: dict[str, Any], hist: Window) -> float:
    keys = ("tempered", "brickmould", "wood_jamb", "screen", "mulled", "nailing_flange")
    matches = 0
    total = 0
    for k in keys:
        qv = query.get(k)
        hv = getattr(hist, k, None)
        if qv is None:
            continue
        total += 1
        if bool(qv) == bool(hv):
            matches += 1
    if total == 0:
        return 0.5
    return matches / total


def score_window(query: dict[str, Any], hist: Window, weights: dict[str, float]) -> float:
    s_type = _cat_score(query.get("type"), hist.type)
    s_dim = _dim_score(query.get("width"), query.get("height"), hist.width, hist.height)
    s_glass = _cat_score(query.get("glass"), hist.glass)
    s_frame = _cat_score(query.get("frame"), hist.frame)
    s_color = _cat_score(query.get("color"), hist.color)
    s_opt = _options_score(query, hist)
    return (
        weights.get("type", 0.4) * s_type
        + weights.get("dimensions", 0.3) * s_dim
        + weights.get("glass", 0.1) * s_glass
        + weights.get("frame", 0.1) * s_frame
        + weights.get("color", 0.05) * s_color
        + weights.get("options", 0.05) * s_opt
    )


def _window_to_public(w: Window, score: float) -> dict[str, Any]:
    return {
        "id": str(w.id),
        "estimate_id": str(w.estimate_id),
        "type": w.type,
        "width": float(w.width) if w.width is not None else None,
        "height": float(w.height) if w.height is not None else None,
        "frame": w.frame,
        "glass": w.glass,
        "color": w.color,
        "unit_price": float(w.unit_price) if w.unit_price is not None else None,
        "similarity": round(score, 4),
        "tempered": w.tempered,
        "quantity": w.quantity,
    }


def find_similar(
    session: Session,
    query: dict[str, Any],
    *,
    top_k: int | None = None,
    min_score: float = 0.15,
) -> dict[str, Any]:
    """Return similar historical windows and price statistics."""
    cfg = load_rules()
    weights = get_similarity_weights(cfg)
    qcfg = get_quote_config(cfg)
    k = top_k or int(qcfg.get("top_k", 12))

    rows = (
        session.query(Window)
        .filter(Window.unit_price.isnot(None), Window.unit_price > 0)
        .all()
    )
    scored: list[tuple[float, Window]] = []
    for w in rows:
        s = score_window(query, w, weights)
        if s >= min_score:
            scored.append((s, w))
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:k]

    prices = [float(w.unit_price) for _, w in top if w.unit_price is not None]
    stats: dict[str, Any] = {
        "count": len(prices),
        "average": None,
        "median": None,
        "min": None,
        "max": None,
        "stdev": None,
    }
    if prices:
        stats["average"] = round(statistics.mean(prices), 2)
        stats["median"] = round(statistics.median(prices), 2)
        stats["min"] = round(min(prices), 2)
        stats["max"] = round(max(prices), 2)
        if len(prices) >= 2:
            stats["stdev"] = round(statistics.stdev(prices), 2)

    return {
        "neighbor_count": len(top),
        "similar_windows": [_window_to_public(w, s) for s, w in top],
        "price_stats": stats,
    }
