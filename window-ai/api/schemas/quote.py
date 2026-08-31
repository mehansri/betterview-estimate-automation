"""Schemas for Phase 1 quote / import / admin APIs."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


QUOTE_LINE_TYPES = Literal[
    "window",
    "combination",
    "patio_sliding",
    "patio_swing",
    "bay_bow",
]
PresentationMode = Literal["internal", "customer"]


class CommercialSettings(BaseModel):
    """Sales controls; catalog cost and price-book rules are never accepted here."""

    preset_id: str = "standard"
    negotiated_discount_percent: float = Field(default=0.0, ge=0)
    agreed_customer_total: Optional[float] = Field(default=None, ge=0)
    presentation_mode: PresentationMode = "internal"
    manager_override_reason: Optional[str] = None


class SalesPreset(BaseModel):
    id: str
    name: str
    description: str = ""
    markup_percent: float = Field(ge=0)
    default_discount_percent: float = Field(default=0.0, ge=0)
    max_discount_percent: float = Field(default=0.0, ge=0)
    # A negative floor is an intentional, manager-controlled loss allowance.
    # It is bounded at -99% so the configured floor can never create a
    # negative selling price on cost-bearing lines.
    minimum_markup_percent: float = Field(default=20.0, ge=-99)
    active: bool = True


class SalesPresetConfig(BaseModel):
    currency: str = "CAD"
    minimum_markup_percent: float = Field(default=20.0, ge=-99)
    presets: list[SalesPreset] = Field(min_length=1)


class QuoteLineInput(BaseModel):
    """Canonical price-book line; subtype fields remain catalog-specific."""

    type: QUOTE_LINE_TYPES = "window"
    model_config = ConfigDict(extra="allow")


class DeterministicQuoteRequest(BaseModel):
    """Structured Window City quote request."""

    defaults: dict[str, Any] = Field(default_factory=dict)
    lines: list[QuoteLineInput] = Field(min_length=1)
    commercial: CommercialSettings = Field(default_factory=CommercialSettings)
    # Retained for backwards-compatible validation, but the API rejects it.
    # Server-side calibration is intentionally not part of a salesperson quote.
    config_overrides: dict[str, Any] = Field(default_factory=dict)


class QuoteWarning(BaseModel):
    code: str
    severity: Literal["info", "warning", "review"] = "review"
    message: str


class QuoteComponent(BaseModel):
    label: str
    list: float
    dealer: float
    discount_key: Optional[str] = None
    source_pages: list[int] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)


class DeterministicQuoteLine(BaseModel):
    line: int
    type: str
    qty: int
    components: list[QuoteComponent]
    list_each: Optional[float] = None
    dealer_each: Optional[float] = None
    install_each: Optional[float] = None
    sell_each: float
    markup_each: Optional[float] = None
    hst_each: float
    customer_total: float
    list_total: Optional[float] = None
    dealer_total: Optional[float] = None
    install_total: Optional[float] = None
    base_sell_each: Optional[float] = None
    merchandise_discount_each: Optional[float] = None
    protected_install_sell_each: Optional[float] = None
    source_pages: list[int] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)


class DeterministicQuoteTotals(BaseModel):
    list: Optional[float] = None
    dealer_cost: Optional[float] = None
    install: Optional[float] = None
    markup: Optional[float] = None
    sell: float
    sell_before_tax: float
    hst: float
    customer_total: float
    base_sell_before_discount: Optional[float] = None
    merchandise_sell_before_discount: Optional[float] = None
    merchandise_discount: Optional[float] = None
    protected_install_sell: Optional[float] = None
    minimum_floor_sell: Optional[float] = None


class SalesPricingSummary(BaseModel):
    preset_id: Optional[str] = None
    preset_name: Optional[str] = None
    preset_description: Optional[str] = None
    markup_percent: Optional[float] = None
    minimum_markup_percent: Optional[float] = None
    negotiated_discount_percent: float
    configured_max_discount_percent: Optional[float] = None
    floor_derived_max_discount_percent: Optional[float] = None
    maximum_allowed_discount_percent: Optional[float] = None
    remaining_discount_percent: Optional[float] = None
    merchandise_discount_amount: float
    dealer_cost: Optional[float] = None
    install_cost: Optional[float] = None
    base_merchandise_sell: Optional[float] = None
    protected_install_sell: Optional[float] = None
    minimum_floor_sell: Optional[float] = None
    effective_markup_percent: Optional[float] = None
    gross_margin_percent: Optional[float] = None
    floor_status: Optional[Literal["within_floor", "manager_override"]] = None
    manager_override_reason: Optional[str] = None
    sales_config_version: str
    override_applied: Optional[bool] = False


class DeterministicQuoteResponse(BaseModel):
    quote_id: Optional[str] = None
    status: Literal["priced", "review_required"]
    method: str
    price_book_version: str
    config_version: str
    currency: str = "CAD"
    review_required: bool = False
    warnings: list[QuoteWarning] = Field(default_factory=list)
    lines: list[DeterministicQuoteLine]
    totals: DeterministicQuoteTotals
    sales_pricing: SalesPricingSummary
    customer_presentation: dict[str, Any] = Field(default_factory=dict)
    internal_presentation: Optional[dict[str, Any]] = None
    sales_config_version: Optional[str] = None
    presentation_mode: PresentationMode = "internal"
    ml_assist: dict[str, Any] = Field(default_factory=dict)


class QuoteOutcomeRequest(BaseModel):
    actual_total: float = Field(gt=0)
    actual_material: Optional[float] = Field(default=None, ge=0)
    actual_install: Optional[float] = Field(default=None, ge=0)
    actual_sell: Optional[float] = Field(default=None, ge=0)
    actual_hst: Optional[float] = Field(default=None, ge=0)
    source_estimate_id: Optional[str] = None
    notes: Optional[str] = None


class QuoteOutcomeResponse(BaseModel):
    quote_id: str
    outcome_id: str
    actual_total: float
    recorded_at: str


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
