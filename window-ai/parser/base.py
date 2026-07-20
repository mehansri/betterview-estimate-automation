"""Shared parse schemas."""
from __future__ import annotations

from datetime import date
from typing import Any, Optional, Protocol

from pydantic import BaseModel, Field


class ParsedWindow(BaseModel):
    type: Optional[str] = None
    # Allow raw PDF strings (e.g. 48"); normalize.py converts to inches.
    width: Optional[float | str] = None
    height: Optional[float | str] = None
    area: Optional[float] = None
    frame: Optional[str] = None
    glass: Optional[str] = None
    color: Optional[str] = None
    grid: Optional[str] = None
    tempered: bool = False
    shape: str = "Rectangular"
    installation: Optional[str] = None
    hardware: Optional[str] = None
    quantity: int = 1
    # High-impact manufacturer options (Window City / Keystone)
    brickmould: bool = False
    wood_jamb: bool = False
    screen: bool = False
    mulled: bool = False
    nailing_flange: bool = False
    gas_fill: Optional[str] = None  # Argon | Krypton | None
    price: Optional[float] = Field(
        default=None, description="Unit price when available"
    )
    line_total: Optional[float] = None


class ParsedEstimate(BaseModel):
    estimate_number: str
    customer: Optional[str] = None
    estimate_date: Optional[date] = None
    windows: list[ParsedWindow] = Field(default_factory=list)
    total: Optional[float] = None
    source_filename: Optional[str] = None
    parse_warnings: list[str] = Field(default_factory=list)

    def to_training_dict(self) -> dict[str, Any]:
        return {
            "estimate_number": self.estimate_number,
            "customer": self.customer,
            "estimate_date": self.estimate_date.isoformat() if self.estimate_date else None,
            "windows": [w.model_dump() for w in self.windows],
            "total": self.total,
        }


class EstimateParser(Protocol):
    def parse(self, path: str) -> ParsedEstimate: ...
