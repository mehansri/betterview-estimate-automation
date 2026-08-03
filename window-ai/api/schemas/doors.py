"""Pydantic contracts for deterministic Palma Door quotes."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


OpeningType = Literal[
    "single_door",
    "single_1_sidelite",
    "single_2_sidelites",
    "double_door",
    "double_2_sidelites",
]


class DoorPartSpec(BaseModel):
    series: Optional[str] = None
    glass: Optional[str] = None
    glass_size: Optional[str] = None
    panel: Optional[str] = None
    height: str = '6\'8"'
    qty: int = Field(default=1, ge=1)
    direct_glazed: bool = False


class DoorPanelUpchargeSpec(BaseModel):
    code: Optional[str] = None
    panel: Optional[str] = None
    height: str = '6\'8"'
    width: float = Field(default=36, gt=0)
    qty: int = Field(default=1, ge=1)


class DoorTransomSpec(BaseModel):
    shape: Literal["rectangle", "shapes"] = "rectangle"
    glass: Optional[str] = None
    sq_ft: float = Field(default=0, ge=0)
    tempered: bool = False
    qty: int = Field(default=1, ge=1)


class DoorPullBarSpec(BaseModel):
    style: str = "straight"
    block: str
    length_in: int = Field(default=36, ge=1)
    finish: str = "satin"
    shape: str = "round"
    qty: int = Field(default=1, ge=1)


class DoorOptionSpec(BaseModel):
    category: Optional[str] = None
    item: str
    column: Optional[str] = None
    qty: int = Field(default=1, ge=1)
    row: Optional[str] = None


class DoorOpeningSpec(BaseModel):
    label: Optional[str] = None
    material: Literal["fiberglass", "steel"]
    finish: Optional[str] = None
    opening_type: OpeningType
    door: DoorPartSpec
    door2: Optional[DoorPartSpec] = None
    sidelites: list[DoorPartSpec] = Field(default_factory=list)
    transom: Optional[DoorTransomSpec] = None
    panel_upcharge: Optional[DoorPanelUpchargeSpec] = None
    pull_bars: list[DoorPullBarSpec] = Field(default_factory=list)
    options: list[DoorOptionSpec] = Field(default_factory=list)


class DoorQuoteRequest(BaseModel):
    openings: list[DoorOpeningSpec] = Field(..., min_length=1)


class DoorLineItem(BaseModel):
    row: str
    description: str
    customer_description: str
    qty: int
    unit_list: float
    list: float
    source: Optional[str] = None


class DoorOpeningQuote(BaseModel):
    label: str
    opening_type: OpeningType
    material: str
    finish: str
    finish_label: str
    line_items: list[DoorLineItem]
    list_total: float
    discount: float
    material_cost: float
    install_tier: OpeningType
    install: float
    cost_subtotal: float
    markup: float
    markup_amount: float
    sell: float
    hst_rate: float
    hst: float
    customer_total: float
    notes: list[str] = Field(default_factory=list)


class DoorProjectTotals(BaseModel):
    list_total: float
    material_cost: float
    install: float
    cost_subtotal: float
    markup_amount: float
    sell: float
    hst: float
    customer_total: float


class DoorProjectQuote(BaseModel):
    openings: list[DoorOpeningQuote]
    totals: DoorProjectTotals
