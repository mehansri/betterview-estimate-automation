from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

from api.schemas.predict import (
    BatchPredictRequest,
    BatchPredictResponse,
    MetricsResponse,
    PredictResponse,
    WindowSpec,
)
from api.services.predictor import get_predictor, reload_predictor
from utils.paths import DEFAULT_METRICS_PATH

router = APIRouter(prefix="/api", tags=["predict"])


@router.post("/predict", response_model=PredictResponse)
def predict(spec: WindowSpec) -> PredictResponse:
    predictor = get_predictor()
    if not predictor.loaded:
        raise HTTPException(status_code=503, detail="Model not loaded. Run training first.")
    try:
        result = predictor.predict_one(spec.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PredictResponse(**result)


@router.post("/predict/batch", response_model=BatchPredictResponse)
def predict_batch(body: BatchPredictRequest) -> BatchPredictResponse:
    predictor = get_predictor()
    if not predictor.loaded:
        raise HTTPException(status_code=503, detail="Model not loaded. Run training first.")
    if not body.windows:
        raise HTTPException(status_code=400, detail="windows list is empty")
    lines = []
    for idx, spec in enumerate(body.windows):
        try:
            result = predictor.predict_one(spec.model_dump())
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Prediction failed for window line {idx + 1}: {exc}",
            ) from exc
        lines.append(PredictResponse(**result))
    subtotal = round(sum(l.line_total for l in lines), 2)
    currency = lines[0].currency if lines else "CAD"
    return BatchPredictResponse(lines=lines, quote_subtotal=subtotal, currency=currency)


@router.get("/metrics", response_model=MetricsResponse)
def metrics() -> MetricsResponse:
    path = Path(DEFAULT_METRICS_PATH)
    if not path.exists():
        raise HTTPException(status_code=404, detail="metrics.json not found")
    raw = json.loads(path.read_text())
    best = raw.get("best_model")
    test_mape = None
    if best and best in raw.get("models", {}):
        test_mape = raw["models"][best]["test"]["mape"]
    return MetricsResponse(
        best_model=best,
        test_mape=test_mape,
        meets_target=raw.get("meets_target"),
        trained_at=raw.get("trained_at"),
        raw=raw,
    )


@router.post("/reload-model")
def reload_model() -> dict:
    pred = reload_predictor()
    return {"model_loaded": pred.loaded, "model_version": pred.version, "model_name": pred.model_name}
