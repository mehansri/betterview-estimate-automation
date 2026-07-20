"""Evaluation metrics for price prediction."""
from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mask = y_true != 0
    if not mask.any():
        return float("nan")
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)


def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "mape": mape(y_true, y_pred),
        "r2": float(r2_score(y_true, y_pred)),
    }


def format_metrics(name: str, metrics: dict[str, float]) -> str:
    return (
        f"{name}: MAPE={metrics['mape']:.2f}%  MAE={metrics['mae']:.2f}  "
        f"RMSE={metrics['rmse']:.2f}  R²={metrics['r2']:.4f}"
    )
