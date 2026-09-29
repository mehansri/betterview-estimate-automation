"""Contracts for same-model home matching and the house-model library."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from api.schemas.customer_estimates import CustomerDoorOpening, CustomerWindowLine


class HomeModelSave(BaseModel):
    """Save openings as the template for one builder model."""

    source_city: str = "brampton"
    builder: str = Field(default="", max_length=150)
    dwelling_type: str = Field(default="", max_length=80)
    gfa: Optional[float] = Field(default=None, gt=0)
    storeys: Optional[int] = Field(default=None, ge=1, le=5)
    model_name: str = Field(default="", max_length=120)
    elevation: str = Field(default="", max_length=16)
    plan: str = Field(default="", max_length=32)
    variant_flags: list[str] = Field(default_factory=list)
    lat: Optional[float] = None
    lng: Optional[float] = None
    label: str = Field(default="", max_length=255)
    windows: list[CustomerWindowLine] = Field(default_factory=list)
    doors: list[CustomerDoorOpening] = Field(default_factory=list)
    source: Literal["measured", "permit_pdf", "manual"] = "measured"
    source_address: str = ""
    source_estimate_id: Optional[str] = None
    notes: str = ""


class HomeModelFromEstimate(BaseModel):
    """Make an estimate's openings the template for its address's model."""

    replace_model_id: Optional[str] = None
    notes: str = ""
