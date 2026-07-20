"""
Stable pricing interface for Phase 1.

predict_price(window) → estimated price + explanation.

Order:
  1. Similarity (historical neighbors) when enough matches
  2. ML fallback (existing CatBoost joblib) if loaded
  3. Type-level or global historical average
"""
from __future__ import annotations

import os
import statistics
from typing import Any, Optional

from sqlalchemy.orm import Session

from db.models import Window
from services.rules import get_quote_config, load_rules
from services.similarity import find_similar


def predict_price(session: Session, window: dict[str, Any]) -> dict[str, Any]:
    cfg = load_rules()
    qcfg = get_quote_config(cfg)
    currency = os.getenv("CURRENCY", qcfg.get("currency", "CAD"))
    min_neighbors = int(qcfg.get("min_neighbors", 3))
    qty = int(window.get("quantity") or 1)

    similar = find_similar(session, window)
    stats = similar["price_stats"]
    n = similar["neighbor_count"]

    if n >= min_neighbors and stats.get("average") is not None:
        avg = float(stats["average"])
        median = float(stats["median"]) if stats.get("median") is not None else avg
        low = float(stats["min"]) if stats.get("min") is not None else round(avg * 0.92, 2)
        high = float(stats["max"]) if stats.get("max") is not None else round(avg * 1.08, 2)
        # Prefer median for robustness
        unit = median
        # Confidence: more neighbors + tighter range → higher
        spread = (high - low) / unit if unit else 0.2
        conf = max(55.0, min(97.0, 70.0 + min(n, 20) * 1.2 - spread * 40))
        return _result(
            unit_price=unit,
            qty=qty,
            currency=currency,
            confidence=round(conf, 1),
            low=low,
            high=high,
            historical_average=avg,
            method="similarity",
            reason=(
                f"Based on {n} similar historical windows "
                f"(median ${median:,.2f}, avg ${avg:,.2f}, range ${low:,.2f}–${high:,.2f})."
            ),
            similar=similar,
        )

    # ML fallback
    ml = _try_ml(window)
    if ml is not None:
        unit = float(ml["predicted_price"])
        band = 0.08
        hist_avg = stats.get("average")
        return _result(
            unit_price=unit,
            qty=qty,
            currency=currency,
            confidence=float(ml.get("confidence") or 75.0),
            low=float(ml.get("low") or unit * (1 - band)),
            high=float(ml.get("high") or unit * (1 + band)),
            historical_average=hist_avg,
            method="ml_fallback",
            reason=(
                f"Fewer than {min_neighbors} strong historical neighbors "
                f"({n} found); used ML model fallback ({ml.get('model_name') or 'model'})."
            ),
            similar=similar,
        )

    # Global / type average
    unit, low, high, avg, reason = _historical_average(session, window)
    return _result(
        unit_price=unit,
        qty=qty,
        currency=currency,
        confidence=60.0 if unit else 50.0,
        low=low,
        high=high,
        historical_average=avg,
        method="global_average",
        reason=reason,
        similar=similar,
    )


def _try_ml(window: dict[str, Any]) -> Optional[dict[str, Any]]:
    try:
        from api.services.predictor import get_predictor

        pred = get_predictor()
        if not pred.loaded:
            return None
        return pred.predict_one(window)
    except Exception:
        return None


def _historical_average(
    session: Session, window: dict[str, Any]
) -> tuple[float, float, float, Optional[float], str]:
    wtype = window.get("type")
    q = session.query(Window).filter(Window.unit_price.isnot(None), Window.unit_price > 0)
    if wtype:
        typed = q.filter(Window.type == wtype).all()
    else:
        typed = []
    if len(typed) >= 2:
        prices = [float(w.unit_price) for w in typed]
        avg = statistics.mean(prices)
        med = statistics.median(prices)
        return (
            round(med, 2),
            round(min(prices), 2),
            round(max(prices), 2),
            round(avg, 2),
            f"Type-level historical average for {wtype} (n={len(prices)}).",
        )
    all_rows = q.all()
    if all_rows:
        prices = [float(w.unit_price) for w in all_rows]
        avg = statistics.mean(prices)
        med = statistics.median(prices)
        return (
            round(med, 2),
            round(min(prices), 2),
            round(max(prices), 2),
            round(avg, 2),
            f"Global historical average (n={len(prices)}); sparse type matches.",
        )
    # Last resort default
    return 500.0, 400.0, 600.0, None, "No historical prices in database; placeholder estimate."


def _result(
    *,
    unit_price: float,
    qty: int,
    currency: str,
    confidence: float,
    low: float,
    high: float,
    historical_average: Optional[float],
    method: str,
    reason: str,
    similar: dict[str, Any],
) -> dict[str, Any]:
    unit_price = max(0.0, float(unit_price))
    return {
        "estimated_price": round(unit_price, 2),
        "predicted_price": round(unit_price, 2),  # alias for existing UI
        "historical_average": round(historical_average, 2) if historical_average is not None else None,
        "price_range": {"low": round(low, 2), "high": round(high, 2)},
        "low": round(low, 2),
        "high": round(high, 2),
        "confidence": confidence,
        "method": method,
        "reason": reason,
        "similar_windows": similar.get("similar_windows") or [],
        "neighbor_count": similar.get("neighbor_count") or 0,
        "currency": currency,
        "quantity": qty,
        "line_total": round(unit_price * qty, 2),
    }
