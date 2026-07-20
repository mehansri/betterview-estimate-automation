"""Load model bundle and run predictions."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

import joblib

from api.services.confidence import confidence_and_band
from training.features import row_to_feature_frame
from utils.logging import get_logger
from utils.paths import DEFAULT_MODEL_PATH

logger = get_logger("windowai.predictor")


class QuotePredictor:
    def __init__(self, model_path: Path | None = None) -> None:
        self.model_path = Path(
            model_path or os.getenv("MODEL_PATH", str(DEFAULT_MODEL_PATH))
        )
        self.bundle: dict[str, Any] | None = None
        self.load()

    def load(self) -> bool:
        if not self.model_path.exists():
            logger.warning("Model not found at %s", self.model_path)
            self.bundle = None
            return False
        self.bundle = joblib.load(self.model_path)
        logger.info(
            "Loaded model %s (%s)",
            self.bundle.get("model_name"),
            self.bundle.get("trained_at"),
        )
        return True

    @property
    def loaded(self) -> bool:
        return self.bundle is not None

    @property
    def version(self) -> Optional[str]:
        if not self.bundle:
            return None
        return self.bundle.get("trained_at")

    @property
    def model_name(self) -> Optional[str]:
        if not self.bundle:
            return None
        return self.bundle.get("model_name")

    def predict_one(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.bundle:
            raise RuntimeError("Model not loaded. Train with: python -m training.pipeline")

        frame = row_to_feature_frame(payload)
        X = self.bundle["preprocessor"].transform(frame)
        unit_price = float(self.bundle["model"].predict(X)[0])
        unit_price = max(0.0, unit_price)
        qty = int(payload.get("quantity") or 1)
        conf, low, high = confidence_and_band(
            unit_price, payload, self.bundle.get("residual_index")
        )
        currency = os.getenv("CURRENCY", "CAD")
        return {
            "predicted_price": round(unit_price, 2),
            "confidence": conf,
            "low": low,
            "high": high,
            "currency": currency,
            "model_version": self.version,
            "model_name": self.model_name,
            "quantity": qty,
            "line_total": round(unit_price * qty, 2),
        }


_predictor: QuotePredictor | None = None


def get_predictor() -> QuotePredictor:
    global _predictor
    if _predictor is None:
        _predictor = QuotePredictor()
    return _predictor


def reload_predictor() -> QuotePredictor:
    global _predictor
    _predictor = QuotePredictor()
    return _predictor
