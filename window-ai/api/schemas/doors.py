"""Pydantic contracts for deterministic Palma Door quotes."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator
from api.schemas.quote import CommercialSettings, CostContext, SalesPricingSummary


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
    # Order-spec only: names the decorative pattern within the priced group.
    # Pricing ignores it, so the quote holds while the customer decides.
    design: Optional[str] = None


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


class PipelineSide(BaseModel):
    type: Optional[str] = None
    colour: Optional[str] = None


class PipelineFrameColour(BaseModel):
    mode: Literal["match", "split"] = "match"
    exterior: Optional[PipelineSide] = None
    interior: Optional[PipelineSide] = None


class PipelineColours(BaseModel):
    exterior: Optional[PipelineSide] = None
    interior: Optional[PipelineSide] = None
    frame: PipelineFrameColour = Field(default_factory=PipelineFrameColour)


class PipelineGlass(BaseModel):
    glazed: Optional[bool] = None
    size: Optional[str] = None
    family: Optional[str] = None
    series: Optional[str] = None
    # Order-spec only; decorative glass is one flat price whatever the pattern.
    design: Optional[str] = None
    # SDL glass: Palma charges per square on top of the glass row.
    squares: Optional[int] = Field(default=None, ge=0)


class PipelineSidelite(PipelineGlass):
    model: Optional[str] = None
    panel: Optional[str] = None


class PipelineTransom(BaseModel):
    shape: Literal["rectangle", "shapes"] = "rectangle"
    glass: Optional[str] = None
    height_in: Optional[float] = Field(default=None, gt=0)
    tempered: bool = False


class PipelineGlassSet(BaseModel):
    door: PipelineGlass = Field(default_factory=PipelineGlass)
    sidelites: list[PipelineSidelite] = Field(default_factory=list)
    transom: Optional[PipelineTransom] = None


class PipelineCustomSize(BaseModel):
    enabled: bool = False
    width_in: Optional[float] = Field(default=None, gt=0)
    height_in: Optional[float] = Field(default=None, gt=0)


class PipelinePullBar(BaseModel):
    style: str = "straight"
    block: Optional[str] = None
    length_in: int = 36
    finish: str = "satin"
    shape: str = "round"


class PipelineStandard(BaseModel):
    brickmould: Literal["regular", "flat", "none", "custom_pvc", "custom_textured"] = "regular"
    sill: str = "black_anodized"
    sill_extension: bool = False
    hinges: Literal["black", "satin_nickel", "standard"] = "black"
    lock: Optional[Literal["double_bore", "multipoint", "pull_bar"]] = None
    handle: Optional[str] = None
    pull_bar: Optional[PipelinePullBar] = None


class PipelineAccent(BaseModel):
    design: Optional[str] = None
    finish: Optional[str] = None
    sides: Literal["exterior", "both"] = "exterior"


class PipelineExtras(BaseModel):
    tedee: bool = False
    tedee_keypad: bool = False
    tedee_bridge: bool = False
    tedee_sensor: bool = False
    tedee_knob: bool = False
    key_alike: bool = False
    screen: Literal["none", "white", "painted", "sliding_white", "sliding_painted_1s", "sliding_painted_2s"] = "none"
    screen_qty: int = Field(default=1, ge=1)
    astragal_lock: bool = False
    fire_rated: bool = False
    fire_rated_list: Optional[float] = Field(default=None, ge=0)
    mail_slot: bool = False
    peep_viewer: bool = False
    dentil_shelf: bool = False
    kick_panel: bool = False
    casing: bool = False
    casing_backband: bool = False
    glass_frame: Optional[str] = None
    operating_sidelite: int = Field(default=0, ge=0)
    triple_glazing: Optional[Literal["lowe_1x", "lowe_2x"]] = None
    accent: Optional[PipelineAccent] = None
    vertical_accent: Optional[str] = None
    reeded_accent: bool = False


class DoorPipelineSpec(BaseModel):
    """A step-by-step configurator selection; see services/doors/pipeline.py."""

    material: Optional[Literal["fiberglass", "steel"]] = None
    frame_type: Optional[Literal["smooth", "textured"]] = None
    width: Optional[int] = None
    height: Optional[str] = None
    custom_size: PipelineCustomSize = Field(default_factory=PipelineCustomSize)
    configuration: Optional[str] = None
    frame_depth: Optional[str] = None
    model: Optional[str] = None
    colours: PipelineColours = Field(default_factory=PipelineColours)
    glass: PipelineGlassSet = Field(default_factory=PipelineGlassSet)
    standard: PipelineStandard = Field(default_factory=PipelineStandard)
    extras: PipelineExtras = Field(default_factory=PipelineExtras)
    sidelite_width_in: Optional[float] = Field(default=None, gt=0)


class DoorOpeningSpec(BaseModel):
    label: Optional[str] = None
    material: Literal["fiberglass", "steel"]
    finish: Optional[str] = None
    opening_type: OpeningType
    # Classic price-book openings name their parts; pipeline openings derive
    # every part from ``pipeline`` and leave ``door`` empty.
    door: Optional[DoorPartSpec] = None
    pipeline: Optional[DoorPipelineSpec] = None
    door2: Optional[DoorPartSpec] = None
    sidelites: list[DoorPartSpec] = Field(default_factory=list)
    transom: Optional[DoorTransomSpec] = None
    panel_upcharge: Optional[DoorPanelUpchargeSpec] = None
    pull_bars: list[DoorPullBarSpec] = Field(default_factory=list)
    options: list[DoorOptionSpec] = Field(default_factory=list)
    # Silence a standing default ("sill", "hinges", "brickmould") for this
    # opening; an explicit line for that row also overrides the default.
    skip_defaults: list[Literal["sill", "hinges", "brickmould"]] = Field(
        default_factory=list
    )

    @model_validator(mode="after")
    def _door_or_pipeline(self) -> "DoorOpeningSpec":
        if self.door is None and self.pipeline is None:
            raise ValueError("A door opening needs a door slab or a pipeline selection.")
        return self


class DoorQuoteRequest(BaseModel):
    openings: list[DoorOpeningSpec] = Field(..., min_length=1)
    commercial: CommercialSettings = Field(default_factory=CommercialSettings)
    # Price as part of a saved project (project-level sliding margin and floor).
    cost_context: Optional[CostContext] = None


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


class DoorCustomerItem(BaseModel):
    description: str
    qty: int
    unit_price: float
    line_total: float


class DoorCustomerOpening(BaseModel):
    id: str
    location: str = ""
    label: str
    material: str
    finish_label: str
    # Elevation geometry (services/doors/pipeline.py:door_drawing); None when not drawable.
    drawing: Optional[dict] = None
    items: list[DoorCustomerItem]
    subtotal: float
    hst: float
    total: float


class DoorCustomerPresentation(BaseModel):
    openings: list[DoorCustomerOpening]
    subtotal: float
    hst: float
    total: float
    currency: str = "CAD"


class DoorProjectQuote(BaseModel):
    openings: list[DoorOpeningQuote]
    totals: DoorProjectTotals
    customer_presentation: DoorCustomerPresentation
    sales_pricing: SalesPricingSummary
    internal_presentation: dict = Field(default_factory=dict)
