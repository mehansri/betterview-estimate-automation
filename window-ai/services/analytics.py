"""Historical pricing analytics for dashboards."""
from __future__ import annotations

import statistics
from collections import defaultdict
from typing import Any, Optional

from sqlalchemy.orm import Session

from db.models import Estimate, Window


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _group_stats(prices: list[float], areas: list[float]) -> dict[str, Any]:
    if not prices:
        return {
            "count": 0,
            "average": None,
            "median": None,
            "min": None,
            "max": None,
            "stdev": None,
            "avg_price_per_sqft": None,
        }
    sqft_prices = []
    for p, a in zip(prices, areas):
        if a and a > 0:
            sqft_prices.append(p / (a / 144.0))
    return {
        "count": len(prices),
        "average": round(statistics.mean(prices), 2),
        "median": round(statistics.median(prices), 2),
        "min": round(min(prices), 2),
        "max": round(max(prices), 2),
        "stdev": round(statistics.stdev(prices), 2) if len(prices) >= 2 else 0.0,
        "avg_price_per_sqft": round(statistics.mean(sqft_prices), 2) if sqft_prices else None,
    }


def compute_analytics(session: Session) -> dict[str, Any]:
    windows = (
        session.query(Window)
        .filter(Window.unit_price.isnot(None), Window.unit_price > 0)
        .all()
    )
    estimates_count = session.query(Estimate).count()

    all_prices: list[float] = []
    all_areas: list[float] = []
    by_type: dict[str, list[tuple[float, float]]] = defaultdict(list)
    by_glass: dict[str, list[tuple[float, float]]] = defaultdict(list)
    by_color: dict[str, list[tuple[float, float]]] = defaultdict(list)
    by_frame: dict[str, list[tuple[float, float]]] = defaultdict(list)
    widths: list[float] = []
    heights: list[float] = []

    for w in windows:
        p = _safe_float(w.unit_price)
        if p is None:
            continue
        a = _safe_float(w.area) or (
            (_safe_float(w.width) or 0) * (_safe_float(w.height) or 0)
        )
        all_prices.append(p)
        all_areas.append(a or 0)
        by_type[str(w.type or "Unknown")].append((p, a or 0))
        by_glass[str(w.glass or "Unknown")].append((p, a or 0))
        by_color[str(w.color or "Unknown")].append((p, a or 0))
        by_frame[str(w.frame or "Unknown")].append((p, a or 0))
        if w.width is not None:
            widths.append(float(w.width))
        if w.height is not None:
            heights.append(float(w.height))

    def pack(groups: dict[str, list[tuple[float, float]]]) -> dict[str, Any]:
        out = {}
        for key, pairs in sorted(groups.items(), key=lambda x: -len(x[1])):
            ps = [p for p, _ in pairs]
            ar = [a for _, a in pairs]
            out[key] = _group_stats(ps, ar)
        return out

    return {
        "estimates_count": estimates_count,
        "windows_count": len(all_prices),
        "overall": _group_stats(all_prices, all_areas),
        "by_type": pack(by_type),
        "by_glass": pack(by_glass),
        "by_color": pack(by_color),
        "by_frame": pack(by_frame),
        "avg_width": round(statistics.mean(widths), 2) if widths else None,
        "avg_height": round(statistics.mean(heights), 2) if heights else None,
        "product_counts": {k: v["count"] for k, v in pack(by_type).items()},
    }
