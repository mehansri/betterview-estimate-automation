from __future__ import annotations

from fastapi import APIRouter

from api.schemas.predict import HealthResponse
from api.services.predictor import get_predictor

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    pred = get_predictor()
    return HealthResponse(
        status="ok" if pred.loaded else "degraded",
        model_loaded=pred.loaded,
        model_version=pred.version,
    )
