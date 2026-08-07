"""Contracts for saved, combined customer estimates."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from api.schemas.doors import DoorOpeningSpec
from api.schemas.quote import CommercialSettings, QuoteLineInput


EstimateStatus = Literal["draft", "priced", "finalized"]


def _today() -> date:
    return date.today()


def _valid_until() -> date:
    return date.today() + timedelta(days=30)


class CustomerWindowLine(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    location: str = ""
    description: str = ""
    spec: QuoteLineInput


class CustomerDoorOpening(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    location: str = ""
    description: str = ""
    spec: DoorOpeningSpec


class CustomerEstimateDraft(BaseModel):
    customer_name: str = ""
    company_name: str = ""
    email: str = ""
    phone: str = ""
    project_name: str = ""
    project_address: str = ""
    salesperson: str = ""
    estimate_date: date = Field(default_factory=_today)
    valid_until: date = Field(default_factory=_valid_until)
    description: str = ""
    notes: str = ""
    terms: str = (
        "This estimate is based on the information available at the time of quoting. "
        "Final measurements, site conditions, product availability, and installation details "
        "will be confirmed before ordering."
    )
    windows: list[CustomerWindowLine] = Field(default_factory=list)
    doors: list[CustomerDoorOpening] = Field(default_factory=list)
    commercial: CommercialSettings = Field(default_factory=CommercialSettings)


class CustomerEstimateResponse(CustomerEstimateDraft):
    id: str
    estimate_number: Optional[str] = None
    status: EstimateStatus
    pricing: Optional[dict[str, Any]] = None
    pricing_hash: Optional[str] = None
    created_at: str
    updated_at: str
    finalized_at: Optional[str] = None


class CustomerEstimateSummary(BaseModel):
    id: str
    estimate_number: Optional[str] = None
    status: EstimateStatus
    customer_name: str = ""
    company_name: str = ""
    project_name: str = ""
    total: Optional[float] = None
    updated_at: str
    finalized_at: Optional[str] = None

