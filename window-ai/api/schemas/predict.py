"""Pydantic schemas for prediction API."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class WindowSpec(BaseModel):
    type: str = Field(..., examples=["Casement"])
    width: float = Field(..., gt=0, examples=[48])
    height: float = Field(..., gt=0, examples=[60])
    frame: str = Field(default="Vinyl", examples=["Vinyl"])
    glass: str = Field(default="Double", examples=["Triple"])
    color: str = Field(default="White", examples=["Dark Bronze"])
    tempered: bool = False
    grid: str = "None"
    shape: str = "Rectangular"
    installation: str = "Replacement"
    hardware: Optional[str] = None
    quantity: int = Field(default=1, ge=1)
    # Manufacturer options (high impact on Window City pricing)
    brickmould: bool = False
    wood_jamb: bool = True
    screen: bool = False
    mulled: bool = False
    nailing_flange: bool = False
    gas_fill: str = Field(default="Argon", examples=["Argon", "Krypton", "None"])
    color_upcharge: bool = False


class PredictResponse(BaseModel):
    predicted_price: float
    confidence: float
    low: float
    high: float
    currency: str = "CAD"
    model_version: Optional[str] = None
    model_name: Optional[str] = None
    quantity: int = 1
    line_total: float


class BatchPredictRequest(BaseModel):
    windows: list[WindowSpec]


class BatchPredictResponse(BaseModel):
    lines: list[PredictResponse]
    quote_subtotal: float
    currency: str = "CAD"


class MetricsResponse(BaseModel):
    best_model: Optional[str] = None
    test_mape: Optional[float] = None
    meets_target: Optional[bool] = None
    trained_at: Optional[str] = None
    raw: Optional[dict] = None


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_version: Optional[str] = None
