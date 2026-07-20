"""Confidence score and prediction intervals from residual history."""
from __future__ import annotations

from typing import Any

import numpy as np


def bucket_key(payload: dict[str, Any], area: float, n_bins: int = 10) -> str:
    # Coarse area bin 0-9 based on typical range 200-6000 sq in
    bin_idx = int(np.clip((area - 200) / (6000 / n_bins), 0, n_bins - 1))
    return f"{payload.get('type')}|{payload.get('glass')}|{bin_idx}"


def confidence_and_band(
    predicted: float,
    payload: dict[str, Any],
    residual_index: dict[str, Any] | None,
) -> tuple[float, float, float]:
    """
    Returns (confidence_pct, low, high).
    Confidence rises with more similar historical samples and lower residual MAPE.
    """
    if not residual_index or not residual_index.get("residual_pct"):
        # Uninformative prior
        band = 0.08
        return 75.0, round(predicted * (1 - band), 2), round(predicted * (1 + band), 2)

    residuals = np.asarray(residual_index["residual_pct"], dtype=float)
    buckets = residual_index.get("buckets") or []
    area = float(payload["width"]) * float(payload["height"])
    key = bucket_key(payload, area)

    neighbor_res = [residuals[i] for i, b in enumerate(buckets) if b == key]
    if len(neighbor_res) >= 5:
        arr = np.abs(np.asarray(neighbor_res))
        n = len(neighbor_res)
    else:
        arr = np.abs(residuals)
        n = 0

    p90 = float(np.quantile(arr, 0.90)) if len(arr) else float(residual_index.get("global_p90", 0.08))
    p50 = float(np.quantile(arr, 0.50)) if len(arr) else float(residual_index.get("global_p50", 0.04))

    # Confidence: high when error small and neighbors plentiful
    # MAPE-like p50 of 2% → ~98; of 10% → ~80
    base = max(50.0, min(99.0, 100.0 - p50 * 100 * 1.2))
    if n >= 30:
        base = min(99.0, base + 2)
    elif n >= 10:
        base = min(99.0, base + 1)
    elif n < 5:
        base = max(50.0, base - 8)

    band = max(0.02, min(0.25, p90))
    low = round(predicted * (1 - band), 2)
    high = round(predicted * (1 + band), 2)
    return round(base, 1), low, high
