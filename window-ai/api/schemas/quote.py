"""Schemas for Phase 1 quote / import / admin APIs."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class WindowSpec(BaseModel):
    type: str = Field(..., examples=["Casement"])
    width: float = Field(..., gt=0, examples=[48])
    height: float = Field(..., gt=0, examples=[60])
    frame: str = Field(default="Vinyl")
    glass: str = Field(default="Double")
    color: str = Field(default="White")
    tempered: bool = False
    grid: str = "None"
    shape: str = "Rectangular"
    installation: str = "Replacement"
    hardware: Optional[str] = None
    quantity: int = Field(default=1, ge=1)
    brickmould: bool = False
    wood_jamb: bool = True
    screen: bool = False
    mulled: bool = False
    nailing_flange: bool = False
    gas_fill: str = "Argon"
    color_upcharge: bool = False


class PriceRange(BaseModel):
    low: float
    high: float


class SimilarWindow(BaseModel):
    id: str
    estimate_id: Optional[str] = None
    type: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    frame: Optional[str] = None
    glass: Optional[str] = None
    color: Optional[str] = None
    unit_price: Optional[float] = None
    similarity: Optional[float] = None
    tempered: Optional[bool] = None
    quantity: Optional[int] = None


class QuoteResponse(BaseModel):
    estimated_price: float
    predicted_price: float
    historical_average: Optional[float] = None
    price_range: PriceRange
    low: float
    high: float
    confidence: float
    method: str
    reason: str
    similar_windows: list[SimilarWindow] = Field(default_factory=list)
    neighbor_count: int = 0
    currency: str = "CAD"
    quantity: int = 1
    line_total: float


class BatchQuoteRequest(BaseModel):
    windows: list[WindowSpec]


class BatchQuoteResponse(BaseModel):
    lines: list[QuoteResponse]
    quote_subtotal: float
    currency: str = "CAD"


class ImportResult(BaseModel):
    status: str
    filename: Optional[str] = None
    estimate_number: Optional[str] = None
    estimate_id: Optional[str] = None
    window_count: Optional[int] = None
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class EstimateSummary(BaseModel):
    id: str
    estimate_number: str
    customer: Optional[str] = None
    project_name: Optional[str] = None
    salesperson: Optional[str] = None
    estimate_date: Optional[str] = None
    total_price: Optional[float] = None
    source_filename: Optional[str] = None
    window_count: int = 0
    parsed_at: Optional[str] = None


class WindowRow(BaseModel):
    id: str
    estimate_id: str
    estimate_number: Optional[str] = None
    window_number: Optional[int] = None
    type: Optional[str] = None
    width: Optional[float] = None
    height: Optional[float] = None
    area: Optional[float] = None
    frame: Optional[str] = None
    glass: Optional[str] = None
    color: Optional[str] = None
    tempered: bool = False
    quantity: int = 1
    unit_price: Optional[float] = None
    line_total: Optional[float] = None
    brickmould: bool = False
    wood_jamb: bool = False
    screen: bool = False
    gas_fill: Optional[str] = None
