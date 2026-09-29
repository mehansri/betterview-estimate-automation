import type { Hinge, LayoutPreset, LayoutSeries, WindowOperation } from "@/lib/windowLayout";
import type { PipelineCatalog, PipelineSelection } from "@/lib/doorPipeline";

export type WindowSpec = {
  type: string;
  width: number;
  height: number;
  frame: string;
  glass: string;
  color: string;
  tempered: boolean;
  grid: string;
  shape: string;
  installation: string;
  quantity: number;
  brickmould: boolean;
  wood_jamb: boolean;
  screen: boolean;
  mulled: boolean;
  nailing_flange: boolean;
  gas_fill: string;
  color_upcharge: boolean;
};

export type SimilarWindow = {
  id: string;
  estimate_id?: string;
  type?: string;
  width?: number;
  height?: number;
  frame?: string;
  glass?: string;
  color?: string;
  unit_price?: number;
  similarity?: number;
  tempered?: boolean;
  quantity?: number;
};

export type QuoteLineType =
  | "unit"
  | "window"
  | "combination"
  | "patio_sliding"
  | "patio_swing"
  | "bay_bow";

export type QuoteLineInput = {
  type: QuoteLineType;
  [key: string]: unknown;
};

export type PresentationMode = "internal" | "customer";

export type CommercialSettings = {
  preset_id: string;
  negotiated_discount_percent: number;
  agreed_customer_total?: number | null;
  presentation_mode?: PresentationMode;
  manager_override_reason?: string | null;
};

/** Sliding project margin: see services/windowcity/margin.py. */
export type SlidingMarginSettings = {
  start_margin_percent: number;
  end_margin_percent: number;
  cap_profit: number;
  basis: "margin" | "markup";
};

export type SalesStrategy = "markup" | "sliding_margin";

export type SalesPreset = {
  id: string;
  name: string;
  description: string;
  markup_percent: number;
  default_discount_percent: number;
  max_discount_percent: number;
  minimum_markup_percent: number;
  active: boolean;
  strategy?: SalesStrategy;
  sliding?: SlidingMarginSettings | null;
};

export type SalesPresetResponse = {
  sales_config_version: string;
  presets: SalesPreset[];
  currency?: string;
  minimum_markup_percent?: number;
  /** No project quote earns less profit than this (0 = off). */
  project_profit_floor?: number;
  default_preset_id?: string | null;
};

export type SalesPresetConfig = {
  currency: string;
  minimum_markup_percent: number;
  project_profit_floor?: number;
  default_preset_id?: string | null;
  presets: SalesPreset[];
};

/** Price a live preview as part of a saved project (project-level margin). */
export type CostContext = {
  project_id: string;
  scope: "append" | "replace_windows" | "replace_doors";
};

export type DeterministicQuoteRequest = {
  defaults?: Record<string, unknown>;
  lines: QuoteLineInput[];
  commercial?: CommercialSettings;
  cost_context?: CostContext;
  config_overrides?: Record<string, unknown>;
};

export type SlidingMarginPlan = {
  cost: number;
  sell: number;
  profit: number;
  rate_percent: number;
  margin_percent: number;
  markup_percent: number;
  band: "floor" | "sliding" | "flat";
  breakpoints: [number, number];
};

export type QuoteWarning = {
  code: string;
  severity: "info" | "warning" | "review";
  message: string;
};

export type QuoteComponent = {
  label: string;
  list: number;
  dealer: number;
  discount_key?: string | null;
  source_pages: number[];
  source_refs: string[];
};

export type DeterministicQuoteLine = {
  line: number;
  type: string;
  qty: number;
  components: QuoteComponent[];
  list_each?: number | null;
  dealer_each?: number | null;
  install_each?: number | null;
  sell_each: number;
  markup_each?: number | null;
  hst_each: number;
  customer_total: number;
  list_total?: number | null;
  dealer_total?: number | null;
  install_total?: number | null;
  base_sell_each?: number | null;
  merchandise_discount_each?: number | null;
  protected_install_sell_each?: number | null;
  source_pages: number[];
  source_refs: string[];
  /** Layout-first units: section geometry, products and energy ratings. */
  unit?: UnitDetails | null;
  /** Single windows: certified rating when the glass package is on file. */
  energy?: EnergyRating | null;
};

export type EnergyRating = {
  style: string;
  package: string;
  package_label?: string;
  er: number;
  u_si: number;
  u_ip: number;
  energy_star: "qualified" | "most_efficient" | null;
  pg_class: string;
  size_tested: string;
};

export type UnitSectionDetails = {
  index: number;
  path: string;
  op: string;
  hinge?: string | null;
  label: string;
  style: string;
  x: number;
  y: number;
  width: number;
  height: number;
  energy: EnergyRating | null;
};

export type WindowDrawingGeometry = {
  width: number;
  height: number;
  sections: Array<{ index: number; x: number; y: number; width: number; height: number; op: WindowOperation; hinge?: Hinge | null }>;
};

export type UnitDetails = {
  summary: string;
  sections: UnitSectionDetails[];
  mullions: Array<{ orient: "v" | "h"; pos: number; start: number; end: number }>;
};

export type DeterministicQuoteResponse = {
  quote_id?: string;
  status: "priced" | "review_required";
  method: string;
  price_book_version: string;
  config_version: string;
  currency: string;
  review_required: boolean;
  warnings: QuoteWarning[];
  lines: DeterministicQuoteLine[];
  totals: {
    list?: number | null;
    dealer_cost?: number | null;
    install?: number | null;
    markup?: number | null;
    sell: number;
    sell_before_tax: number;
    hst: number;
    customer_total: number;
    base_sell_before_discount?: number | null;
    merchandise_sell_before_discount?: number | null;
    merchandise_discount?: number | null;
    protected_install_sell?: number | null;
    minimum_floor_sell?: number | null;
  };
  sales_pricing: {
    preset_id?: string | null;
    preset_name?: string | null;
    preset_description?: string | null;
    strategy?: SalesStrategy | null;
    cost_basis?: number | null;
    profit_floor?: number | null;
    floor_applied?: boolean | null;
    sliding?: SlidingMarginPlan | null;
    markup_percent?: number | null;
    minimum_markup_percent?: number | null;
    negotiated_discount_percent: number;
    configured_max_discount_percent?: number | null;
    floor_derived_max_discount_percent?: number | null;
    maximum_allowed_discount_percent?: number | null;
    remaining_discount_percent?: number | null;
    merchandise_discount_amount: number;
    dealer_cost?: number | null;
    install_cost?: number | null;
    base_merchandise_sell?: number | null;
    protected_install_sell?: number | null;
    minimum_floor_sell?: number | null;
    effective_markup_percent?: number | null;
    gross_margin_percent?: number | null;
    floor_status?: "within_floor" | "manager_override" | null;
    manager_override_reason?: string | null;
    sales_config_version: string;
    override_applied?: boolean | null;
  };
  customer_presentation: {
    preset_name?: string | null;
    negotiated_discount_percent: number;
    merchandise_discount: number;
    lines: Array<{ line: number; type: string; qty: number; unit_price: number; line_total: number }>;
    subtotal: number;
    hst: number;
    total: number;
  };
  internal_presentation?: Record<string, unknown> | null;
  sales_config_version?: string;
  presentation_mode: PresentationMode;
  ml_assist: Record<string, unknown>;
};

export type QuoteCatalog = {
  price_book_version: string;
  config_version: string;
  styles: Array<{
    code: string;
    name: string;
    collection: string;
    source_page_pdf?: number;
    size_ranges?: Array<{
      label?: string | null;
      ranges: Array<{ min: number; max: number }>;
    }>;
  }>;
  accessories: Record<string, Array<{ name: string; item_code?: string; source_page_pdf?: number }>>;
  shapes: Record<string, Array<{ name: string; source_page_pdf?: number }>>;
  patio_sliding_sizes: number[];
  patio_swing_kinds: string[];
  /** WC-500 standard sliding doors; absent on older API versions. */
  patio_sliding?: Array<{
    nominal_ft: number;
    panels: number;
    frame_width: number;
    frame_height: number;
    operations: string[];
    triple: boolean;
    tint: boolean;
  }>;
  patio_swing_sizes?: Record<string, Array<{ width_from: number; width_to: number; height_from: number; height_to: number }>>;
  baybow: {
    head_seat_sizes: string[];
    welded_brickmould_lites: number[];
    lite_counts?: number[];
    angles?: Record<string, number[]>;
  };
  colours?: {
    exterior: string[];
    interior: string[];
    interior_requires_matching_exterior: boolean;
    black_interior_styles: string[];
  };
  wood_jamb?: {
    default: string;
    /** Standard patio door jamb (4 1/2"); absent on older API versions. */
    patio_default?: string;
    finish: string;
    /** Deepest jamb that can be primed white, per product; deeper jambs are unfinished. */
    primed_max_in?: { window: number; patio: number };
    depths: Array<{ name: string; depth_in: number; price_lf: number }>;
    custom_max_in: number;
  };
  /** Layout-first window units; absent on older API versions. */
  layout?: {
    series: LayoutSeries[];
    default_series: string;
    operations: Array<{ id: WindowOperation; label: string; hinges: string[] }>;
    presets: LayoutPreset[];
  };
};

export type DoorPartSpec = {
  series?: string;
  glass?: string;
  glass_size?: string;
  panel?: string;
  height: string;
  qty: number;
  direct_glazed?: boolean;
  /** Order-spec only: pattern within the priced group. Never affects price. */
  design?: string;
};

export type DoorOptionSpec = {
  category?: string;
  item: string;
  column?: string;
  qty: number;
  row?: string;
};

export type DoorOpeningSpec = {
  label?: string;
  material: "fiberglass" | "steel";
  finish?: string;
  opening_type:
    | "single_door"
    | "single_1_sidelite"
    | "single_2_sidelites"
    | "double_door"
    | "double_2_sidelites";
  /** Classic price-book openings name their parts; pipeline openings leave this empty. */
  door?: DoorPartSpec;
  door2?: DoorPartSpec;
  sidelites: DoorPartSpec[];
  /** Step-by-step configurator selection; the server derives every part from it. */
  pipeline?: PipelineSelection;
  transom?: {
    shape: "rectangle" | "shapes";
    glass?: string;
    sq_ft: number;
    tempered: boolean;
    qty: number;
  };
  panel_upcharge?: {
    code?: string;
    panel?: string;
    height: string;
    width: number;
    qty: number;
  };
  pull_bars: Array<{
    style: string;
    block: string;
    length_in: number;
    finish: string;
    shape: string;
    qty: number;
  }>;
  options: DoorOptionSpec[];
  /** Silence a standing default for this opening. */
  skip_defaults?: Array<"sill" | "hinges" | "brickmould">;
};

export type DoorCatalogRow = {
  material: string;
  series: string;
  series_label: string;
  component: string;
  height: string;
  source_page: number;
  kind: string;
  glass_size?: string | null;
  panel?: string | null;
  row_label?: string | null;
};

export type DoorCatalog = {
  materials: Array<{
    key: "fiberglass" | "steel";
    label: string;
    finishes: Array<{ key: string; label: string }>;
    slabs: DoorCatalogRow[];
    options: Array<{
      category: string;
      category_label: string;
      item: string;
      source_page?: number;
      columns?: string[];
    }>;
    panel_upcharges: Array<{
      code: string;
      panel: string;
      height: string;
      options: Array<{ sizes: string; upcharge: number }>;
      source_page?: number;
    }>;
    transoms: Array<{
      shape: "rectangle" | "shapes";
      shape_label: string;
      glass: string[];
      minimum_sqft: number[];
      source_page?: number;
    }>;
    pull_bars: Array<{
      material: string;
      style: string;
      block: string;
      block_label: string;
      length_in: number;
      finish: string;
      finish_label: string;
      shape: string;
    }>;
  }>;
  glass_groups: Array<{
    name: string;
    group: string;
    materials: string[];
    source_pages: Record<string, number>;
  }>;
  opening_types: Array<{
    key: DoorOpeningSpec["opening_type"];
    label: string;
    doors: number;
    sidelites: number;
  }>;
  install: Record<string, number>;
  quote_defaults?: {
    sill?: string;
    hd_hinges?: boolean;
    brickmould?: boolean;
    brickmould_qty?: number;
  };
  /** Availability for the step-by-step door configurator; absent on older API versions. */
  pipeline?: PipelineCatalog;
  currency: string;
};

export type DoorLineItem = {
  row: string;
  description: string;
  customer_description: string;
  qty: number;
  unit_list: number;
  list: number;
  source?: string;
};

export type DoorOpeningQuote = {
  label: string;
  opening_type: DoorOpeningSpec["opening_type"];
  material: string;
  finish: string;
  finish_label: string;
  line_items: DoorLineItem[];
  list_total: number;
  discount: number;
  material_cost: number;
  install_tier: DoorOpeningSpec["opening_type"];
  install: number;
  cost_subtotal: number;
  markup: number;
  markup_amount: number;
  sell: number;
  hst_rate: number;
  hst: number;
  customer_total: number;
  notes: string[];
};

export type DoorProjectResponse = {
  openings: DoorOpeningQuote[];
  totals: Omit<DoorOpeningQuote, "label" | "opening_type" | "material" | "finish" | "finish_label" | "line_items" | "discount" | "install_tier" | "markup" | "hst_rate" | "notes">;
  customer_presentation: DoorCustomerPresentation;
  sales_pricing: DeterministicQuoteResponse["sales_pricing"];
  internal_presentation?: Record<string, unknown>;
};

export type DoorCustomerItem = {
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

/** Door elevation from services/doors/pipeline.py:door_drawing. */
export type DoorDrawingGeometry = {
  doors: number;
  sidelites: number;
  transom: boolean;
  /** Whole opening (slabs + sidelites + transom), inches; the CRM draws from this and `sections`. */
  width: number;
  height: number;
  /** One slab, inches. Absent on snapshots priced before the CRM sections, where width/height were the slab. */
  slab_width?: number;
  slab_height?: number;
  height_label?: string;
  model?: string;
  door_glass?: { size: string; family: string } | null;
  sidelite_glass?: Array<{ size: string; family: string } | null>;
  transom_glass?: string | null;
  slab_colour: string;
  frame_colour: string;
  lock?: "double_bore" | "multipoint" | null;
  exterior_colour?: string;
  /** Positioned sections in the CRM drawing format (Betterview-Crm src/domain/drawn-item.ts). */
  sections?: Array<{ x: number; y: number; width: number; height: number; op: string; hinge: string | null; panel?: "solid" | "glass"; lites?: Array<{ x: number; y: number; width: number; height: number }> }>;
};

export type DoorCustomerOpening = {
  id: string;
  location: string;
  label: string;
  material: string;
  finish_label: string;
  /** Elevation geometry; absent on older snapshots and undrawable openings. */
  drawing?: DoorDrawingGeometry | null;
  items: DoorCustomerItem[];
  subtotal: number;
  hst: number;
  total: number;
};

export type DoorCustomerPresentation = {
  openings: DoorCustomerOpening[];
  subtotal: number;
  hst: number;
  total: number;
  currency: string;
};

export type CustomerEstimateStatus = "draft" | "priced" | "finalized" | "sent" | "viewed" | "accepted" | "lost";

/** Finalized estimates are customer documents; edits go into a revision. */
export const LOCKED_STATUSES: CustomerEstimateStatus[] = ["finalized", "sent", "viewed", "accepted", "lost"];
export function isLockedStatus(status: CustomerEstimateStatus): boolean {
  return LOCKED_STATUSES.includes(status);
}

/** Section operations the order details accept (api/schemas/customer_estimates.py). */
export type WindowSectionOperation =
  | "fixed"
  | "casement"
  | "awning"
  | "single_slider"
  | "double_slider"
  | "single_hung"
  | "double_hung";

/** casement: hinge side; awning: "top"; single slider: operating sash side (viewed from outside). */
export type WindowHanding = "left" | "right" | "top" | null;

export type WindowElevation = "front" | "right" | "left" | "back" | "other";

export type WindowSection = {
  operation: WindowSectionOperation;
  handing: WindowHanding;
};

/**
 * Order-checklist details for a window line. Presentation only: never sent to
 * the pricing engine and not part of the pricing hash.
 */
export type WindowDetails = {
  /** Opening number printed on the estimate / order, e.g. "1", "14". */
  tag?: string | null;
  elevation?: WindowElevation | null;
  /** One entry per lite, same order as spec.lites (one entry for a single window). */
  sections?: WindowSection[] | null;
  /** null = no screen. */
  screen?: { frame_colour?: string | null; mesh_colour?: string | null } | null;
  hardware?: string | null;
  spacer?: string | null;
  jamb_finish?: string | null;
  notes?: string | null;
};

export type CustomerWindowLine = {
  id: string;
  location: string;
  description: string;
  /** The priced engine line. */
  spec: QuoteLineInput;
  details?: WindowDetails | null;
};

export type CustomerDoorOpening = {
  id: string;
  location: string;
  description: string;
  spec: DoorOpeningSpec;
};

/** A job item on an estimate: a catalog adder or a one-off custom item. */
export type EstimateAdder = {
  id: string;
  adder_id?: string | null;
  custom?: boolean;
  name?: string;
  cost?: number;
  price?: number;
  /** null = automatic quantity from the adder unit (per window, per job...) */
  qty?: number | null;
  note?: string;
};

export type TierOverrides = {
  glazing?: Record<string, unknown>;
  colour_ext?: string | null;
  colour_int?: string | null;
};

export type EstimateTier = {
  id: string;
  name: string;
  description?: string;
  window_overrides: TierOverrides;
};

export type CustomerEstimateDraft = {
  customer_name: string;
  company_name: string;
  email: string;
  phone: string;
  project_name: string;
  project_address: string;
  salesperson: string;
  estimate_date: string;
  valid_until: string;
  description: string;
  notes: string;
  terms: string;
  windows: CustomerWindowLine[];
  doors: CustomerDoorOpening[];
  commercial: CommercialSettings;
  province: string;
  adders: EstimateAdder[];
  tiers: EstimateTier[];
  selected_tier: string | null;
  follow_up_on: string | null;
  /** Openings copied from a same-model home, not yet confirmed by a site measure. */
  is_preliminary?: boolean;
  home_model_id?: string | null;
};

export type CustomerEstimateLineAppend = {
  windows?: CustomerWindowLine[];
  doors?: CustomerDoorOpening[];
  commercial?: CommercialSettings;
};

export type TaxLine = { label: string; rate: number; amount: number };

export type FinancingOptions = {
  apr_percent: number;
  disclaimer: string;
  options: Array<{ months: number; monthly_payment: number }>;
} | null;

export type TierSummary = {
  id: string;
  name: string;
  description: string;
  selected: boolean;
  subtotal?: number;
  hst?: number;
  total?: number;
  profit?: number;
  margin_percent?: number;
  review_required?: boolean;
  financing?: FinancingOptions;
  deposit?: number;
  error?: string;
};

export type WindowSectionLine = {
  id: string;
  location: string;
  description: string;
  /** Certified energy summary, "" when a part has no rating on file. */
  energy?: string;
  /** Section geometry for the elevation drawing (absent on older snapshots). */
  drawing?: WindowDrawingGeometry | null;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type DoorSectionOpening = {
  id: string;
  location: string;
  label: string;
  material: string;
  finish_label: string;
  /** Elevation geometry; absent on older snapshots and undrawable openings. */
  drawing?: DoorDrawingGeometry | null;
  items: Array<{ description: string; qty: number; unit_price: number; line_total: number }>;
  subtotal: number;
  hst: number;
  total: number;
};

export type AdderSectionLine = {
  id: string;
  name: string;
  note: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type EstimateSections = {
  windows: { lines: WindowSectionLine[]; subtotal: number; hst: number; total: number };
  doors: { openings: DoorSectionOpening[]; subtotal: number; hst: number; total: number };
  adders?: { lines: AdderSectionLine[]; subtotal: number; hst: number; total: number };
};

export type EstimateTotals = {
  subtotal: number;
  hst: number;
  total: number;
  currency: string;
  tax_label?: string;
  tax_lines?: TaxLine[];
  base_subtotal?: number;
  base_hst?: number;
  base_total?: number;
  discount?: number;
  minimum_floor_subtotal?: number;
  minimum_floor_total?: number;
};

export type Profitability = {
  cost: number;
  sell: number;
  profit: number;
  margin_percent: number;
  markup_percent: number;
  discount: number;
  breakdown: Record<"windows" | "doors" | "adders", { cost: number; sell: number }>;
  override_applied: boolean;
  effective_discount_percent: number;
  /** How the project markup was set (absent on estimates priced before 2026-09-28). */
  strategy?: SalesStrategy | null;
  preset_name?: string | null;
  cost_basis?: number;
  profit_floor?: number | null;
  floor_applied?: boolean;
  sliding?: SlidingMarginPlan | null;
  target_markup_percent?: number | null;
};

export type CustomerEstimatePricing = {
  pricing_hash: string;
  priced_at: string;
  review_required: boolean;
  warnings: QuoteWarning[];
  price_versions: Record<string, unknown>;
  province?: string;
  tax_rate?: number;
  sections: EstimateSections;
  totals: EstimateTotals;
  profitability?: Profitability;
  tiers?: TierSummary[];
  selected_tier?: string | null;
  financing?: FinancingOptions;
  deposit?: number;
  window_quote?: DeterministicQuoteResponse | null;
  door_quote?: Record<string, unknown> | null;
};

export type EstimateAcceptance = {
  name: string;
  tier_id?: string | null;
  tier_name?: string | null;
  total?: number;
  subtotal?: number;
  tax?: number;
  deposit?: number;
  accepted_at: string;
  ip?: string | null;
};

export type CustomerEstimate = CustomerEstimateDraft & {
  id: string;
  estimate_number?: string | null;
  status: CustomerEstimateStatus;
  pricing?: CustomerEstimatePricing | null;
  pricing_hash?: string | null;
  created_at: string;
  updated_at: string;
  finalized_at?: string | null;
  sent_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  acceptance?: EstimateAcceptance | null;
  lost_at?: string | null;
  lost_reason?: string | null;
  public_token?: string | null;
  revision_of?: string | null;
  revision_number?: number;
  deleted_at?: string | null;
  /** Set when the project was started from a CRM opportunity. */
  crm_opportunity_id?: string | null;
  crm_contact_id?: string | null;
};

export type CustomerEstimateSummary = {
  id: string;
  estimate_number?: string | null;
  status: CustomerEstimateStatus;
  customer_name: string;
  company_name: string;
  project_name: string;
  salesperson?: string;
  total?: number | null;
  margin_percent?: number | null;
  updated_at: string;
  finalized_at?: string | null;
  sent_at?: string | null;
  follow_up_on?: string | null;
  revision_number?: number;
  deleted_at?: string | null;
};

export type EstimateEvent = {
  id: string;
  kind: string;
  detail: Record<string, unknown>;
  created_at: string;
};

export type EstimatePhoto = {
  id: string;
  line_id?: string | null;
  caption: string;
  content_type: string;
  created_at?: string;
  url: string;
};

export type SendEstimateResult = {
  delivered: boolean;
  link: string;
  subject: string;
  body: string;
  estimate: CustomerEstimate;
};

export type CompanySettings = { name: string; phone: string; email: string; address: string; website: string };

/** Customer-safe estimate as the public portal and PDF see it. */
export type PublicEstimate = {
  estimate_number?: string | null;
  status: CustomerEstimateStatus;
  revision_number: number;
  customer_name: string;
  company_name: string;
  email: string;
  phone: string;
  project_name: string;
  project_address: string;
  salesperson: string;
  estimate_date?: string | null;
  valid_until?: string | null;
  expired: boolean;
  description: string;
  notes: string;
  terms: string;
  sections: EstimateSections;
  totals: Pick<EstimateTotals, "subtotal" | "hst" | "tax_label" | "tax_lines" | "total" | "base_subtotal" | "discount" | "currency">;
  tiers: Array<Pick<TierSummary, "id" | "name" | "description" | "subtotal" | "hst" | "total" | "financing" | "deposit" | "selected">>;
  selected_tier?: string | null;
  financing?: FinancingOptions;
  deposit: number;
  company: CompanySettings;
  accepted?: { name: string; accepted_at: string; tier_name?: string | null; total?: number; deposit?: number } | null;
  can_accept: boolean;
  superseded_by?: string | null;
};

export type TaxRateEntry = { name: string; components: Array<{ label: string; rate: number }> };

export type BusinessSettings = {
  company: CompanySettings;
  sales_process: { deposit_percent: number; follow_up_days: number; estimate_valid_days: number };
  financing: { enabled: boolean; apr_percent: number; terms_months: number[]; minimum_amount: number; disclaimer: string };
  measurement: { rough_opening_deduction_in: number };
  tax: { default_province: string; rates: Record<string, TaxRateEntry> };
};

export type BusinessSettingsGroup = keyof BusinessSettings;

export type JobAdderUnit = "per_job" | "per_opening" | "per_window" | "per_door" | "each";

export type JobAdder = {
  id: string;
  name: string;
  category: string;
  unit: JobAdderUnit;
  cost: number;
  price: number;
  description: string;
  active: boolean;
  sort_order: number;
};

export type TemplateKind = "window" | "door" | "estimate";

export type SavedTemplate<T = Record<string, unknown>> = {
  id: string;
  name: string;
  kind: TemplateKind;
  payload: T;
  created_at?: string;
};

export type PriceBookVersion = {
  id: string;
  dataset: string;
  label: string;
  summary: {
    values_compared: number;
    changed: number;
    added: number;
    removed: number;
    average_change_percent: number;
    largest_changes: Array<{ path: string; old: number; new: number; percent: number | null }>;
  } | null;
  active: boolean;
  created_at?: string | null;
  published_at?: string | null;
};

export type PriceBookListing = {
  datasets: Array<{ dataset: string; file: string; active_version?: string | null }>;
  versions: PriceBookVersion[];
};

export type ReconcileResult = {
  tolerance_percent: number;
  lines: Array<{
    ref: string;
    row: number;
    status: "ok" | "drift" | "error";
    error?: string;
    qty?: number;
    description?: string;
    engine_unit_cost?: number;
    supplier_unit_cost?: number;
    difference?: number;
    difference_percent?: number | null;
  }>;
  summary: {
    lines: number;
    matched: number;
    drift: number;
    errors: number;
    engine_total: number;
    supplier_total: number;
    difference: number;
    difference_percent: number | null;
  };
};

export type ReportSummary = {
  days: number;
  pipeline: Record<string, { count: number; value: number }>;
  open_pipeline_value: number;
  won: { count: number; value: number };
  lost: { count: number; reasons: Array<[string, number]> };
  close_rate: number | null;
  average_days_to_close: number | null;
  average_won_margin_percent: number | null;
  by_salesperson: Array<{
    salesperson: string;
    estimates: number;
    sent: number;
    won: number;
    lost: number;
    close_rate: number | null;
    won_value: number;
    average_margin_percent: number | null;
    average_discount_percent: number | null;
    overrides: number;
  }>;
  overrides: Array<{
    estimate_id: string;
    estimate_number?: string | null;
    customer_name?: string | null;
    salesperson?: string | null;
    reason?: string | null;
    total?: number | null;
    margin_percent?: number | null;
    created_at?: string | null;
  }>;
  follow_ups_due: Array<{
    id: string;
    estimate_number?: string | null;
    customer_name?: string | null;
    salesperson?: string | null;
    status: CustomerEstimateStatus;
    follow_up_on: string;
    total: number;
  }>;
};

/**
 * Always same-origin: middleware.ts forwards /api/* to the FastAPI backend and
 * adds the API token server-side, so the browser never calls the API directly.
 */
function apiPath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function formatApiError(status: number, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return `API error ${status}`;
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      detail?:
        | string
        | Array<{ msg?: string; loc?: unknown }>
        | { message?: string; reasons?: string[]; maximum_allowed_discount_percent?: number };
    };
    if (typeof parsed.detail === "string") {
      return parsed.detail;
    }
    if (Array.isArray(parsed.detail)) {
      return parsed.detail
        .map((d) => d.msg || JSON.stringify(d))
        .filter(Boolean)
        .join("; ");
    }
    if (parsed.detail && typeof parsed.detail === "object") {
      if (parsed.detail.message) return parsed.detail.message;
      if (parsed.detail.reasons?.length) return parsed.detail.reasons.join("; ");
      if (parsed.detail.maximum_allowed_discount_percent !== undefined) {
        return `Negotiation exceeds the permitted discount. Maximum allowed: ${parsed.detail.maximum_allowed_discount_percent.toFixed(2)}%.`;
      }
    }
  } catch {
    // not JSON
  }
  return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(apiPath(path), init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach API (${msg}). Is the backend running on port 8000? ` +
        `From window-ai: DATABASE_URL=sqlite:///data/local.db make api`
    );
  }
}

export async function fetchQuoteCatalog(): Promise<QuoteCatalog> {
  const res = await apiFetch("/api/quotes/catalog");
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(formatApiError(res.status, detail));
  }
  return res.json();
}

export async function fetchSalesPresets(): Promise<SalesPresetResponse> {
  const res = await apiFetch("/api/quotes/sales-presets");
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(formatApiError(res.status, detail));
  }
  return res.json();
}

/** Whether the API has a manager token set up; null when the API could not be reached. */
export async function fetchManagerTokenConfigured(): Promise<boolean | null> {
  try {
    const res = await apiFetch("/api/admin/manager-token");
    if (!res.ok) return null;
    const body = await res.json() as { configured?: unknown };
    return typeof body.configured === "boolean" ? body.configured : null;
  } catch {
    return null;
  }
}

/** True when the manager token is valid (used to leave the rep view). */
export async function verifyManagerToken(pricingAdminToken: string): Promise<boolean> {
  const res = await apiFetch("/api/admin/verify-token", {
    method: "POST",
    headers: { "X-Pricing-Admin-Token": pricingAdminToken },
  });
  return res.ok;
}

export async function fetchAdminSalesPresets(): Promise<SalesPresetResponse> {
  const res = await apiFetch("/api/admin/sales-presets");
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(formatApiError(res.status, detail));
  }
  return res.json();
}

export async function saveAdminSalesPresets(
  config: SalesPresetConfig,
  pricingAdminToken: string
): Promise<SalesPresetResponse> {
  const res = await apiFetch("/api/admin/sales-presets", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Pricing-Admin-Token": pricingAdminToken,
    },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(formatApiError(res.status, detail));
  }
  return res.json();
}

export async function priceDeterministicQuote(
  request: DeterministicQuoteRequest,
  pricingAdminToken?: string,
  options: { record?: boolean } = {}
): Promise<DeterministicQuoteResponse> {
  // Live previews pass record=false so every keystroke is not audited.
  const res = await apiFetch(options.record === false ? "/api/quotes/price?record=false" : "/api/quotes/price", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(pricingAdminToken ? { "X-Pricing-Admin-Token": pricingAdminToken } : {}),
    },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(formatApiError(res.status, detail));
  }
  return res.json();
}

export async function fetchDoorCatalog(): Promise<DoorCatalog> {
  const res = await apiFetch("/api/doors/catalog");
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(formatApiError(res.status, detail));
  }
  return res.json();
}

export async function quoteDoors(openings: DoorOpeningSpec[], commercial?: CommercialSettings, costContext?: CostContext): Promise<DoorProjectResponse> {
  const res = await apiFetch("/api/doors/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openings, commercial, ...(costContext ? { cost_context: costContext } : {}) }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(formatApiError(res.status, detail));
  }
  return res.json();
}

export async function createCustomerEstimate(draft: CustomerEstimateDraft): Promise<CustomerEstimate> {
  const res = await apiFetch("/api/customer-estimates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

export async function fetchCustomerEstimates(): Promise<CustomerEstimateSummary[]> {
  const res = await apiFetch("/api/customer-estimates");
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

export async function fetchCustomerEstimate(id: string): Promise<CustomerEstimate> {
  const res = await apiFetch(`/api/customer-estimates/${id}`);
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

export async function deleteCustomerEstimate(id: string): Promise<void> {
  const res = await apiFetch(`/api/customer-estimates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
}

export async function updateCustomerEstimate(id: string, draft: CustomerEstimateDraft): Promise<CustomerEstimate> {
  const res = await apiFetch(`/api/customer-estimates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

export async function appendCustomerEstimateLines(
  id: string,
  lines: CustomerEstimateLineAppend,
): Promise<CustomerEstimate> {
  const res = await apiFetch(`/api/customer-estimates/${id}/lines`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lines),
  });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

export async function priceCustomerEstimate(id: string, pricingAdminToken?: string): Promise<CustomerEstimate> {
  const headers = pricingAdminToken ? { "X-Pricing-Admin-Token": pricingAdminToken } : undefined;
  const res = await apiFetch(`/api/customer-estimates/${id}/price`, {
    method: "POST",
    ...(headers ? { headers } : {}),
  });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

export async function finalizeCustomerEstimate(id: string): Promise<CustomerEstimate> {
  const res = await apiFetch(`/api/customer-estimates/${id}/finalize`, { method: "POST" });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

// ---------------------------------------------------------------- same-model homes

export type PermitRecord = {
  permit_number: string;
  address: string;
  address_key: string;
  dwelling_type: string;
  work: string;
  builder: string | null;
  gfa: number | null;
  storeys: number | null;
  bedrooms: number | null;
  issue_date: string | null;
  lat: number | null;
  lng: number | null;
  model: string | null;
  elevation: string | null;
  options: string | null;
  plan: string | null;
  lot: string | null;
  flags: string[];
  parent_permit: string | null;
  /** What differs from the looked-up home (neighbours only). */
  differences?: string[];
};

/** One model of the builder's lineup around a home. */
export type LineupModel = {
  key: string;
  model: string | null;
  dwelling_type: string;
  count: number;
  gfa_min: number | null;
  gfa_max: number | null;
  elevations: Record<string, number>;
  flags: Record<string, number>;
  includes_subject: boolean;
  addresses: string[];
};

export type HomeModelSummary = {
  id: string;
  relation: "same" | "similar" | null;
  label: string;
  builder: string;
  model_name: string;
  elevation: string;
  plan: string;
  variant_flags: string[];
  differences: string[];
  dwelling_type: string;
  gfa: number;
  storeys: number | null;
  source: "measured" | "permit_pdf" | "manual";
  source_address: string;
  source_estimate_id: string | null;
  window_count: number;
  door_count: number;
  notes: string;
  updated_at: string | null;
};

export type MeasuredJob = {
  estimate_id: string;
  estimate_number: string | null;
  status: CustomerEstimateStatus;
  customer_name: string;
  project_address: string;
  relation: "this_home" | "same" | "similar";
  window_count: number;
  door_count: number;
};

export type ModelMatch = {
  address_key: string | null;
  supported: boolean;
  source: { key: string; label: string; records_request_url: string; records_request_note: string; match_basis: string } | null;
  subject: (PermitRecord & { label: string }) | null;
  same_model: PermitRecord[];
  similar: PermitRecord[];
  home_models: HomeModelSummary[];
  measured_jobs: MeasuredJob[];
  lineup: LineupModel[];
  message: string;
};

/** A window read off permit drawings, shaped as a measure-sheet row. */
export type DrawingRow = {
  location: string;
  style: string;
  width: string;
  height: string;
  qty: string;
  roughOpening: boolean;
  elevation: string;
  operation: string;
  size_basis: string;
  confidence: "high" | "medium" | "low";
  note: string;
};

export type DrawingExtraction = {
  house_model: string;
  builder: string;
  rows: DrawingRow[];
  doors: Array<{ elevation: string; location: string; kind: string; description: string; width_in: number | null; height_in: number | null; confidence: string; note: string }>;
  warnings: string[];
};

export async function fetchModelMatch(address: string, estimateId?: string): Promise<ModelMatch> {
  const params = new URLSearchParams({ address });
  if (estimateId) params.set("estimate_id", estimateId);
  return jsonOrThrow(await apiFetch(`/api/model-match?${params}`));
}

export async function fetchHomeModelOpenings(modelId: string, mirror: boolean): Promise<{ windows: CustomerWindowLine[]; doors: CustomerDoorOpening[]; model: HomeModelSummary }> {
  return jsonOrThrow(await apiFetch(`/api/home-models/${modelId}/openings?mirror=${mirror ? "true" : "false"}`));
}

export async function saveHomeModelFromEstimate(estimateId: string, replaceModelId?: string): Promise<HomeModelSummary> {
  return jsonOrThrow(await apiFetch(`/api/home-models/from-estimate/${estimateId}`, jsonInit("POST", { replace_model_id: replaceModelId || null })));
}

export async function fetchDrawingReaderStatus(): Promise<{ available: boolean }> {
  return jsonOrThrow(await apiFetch("/api/drawings/status"));
}

export async function extractDrawingOpenings(file: File, address = ""): Promise<DrawingExtraction> {
  const form = new FormData();
  form.append("file", file);
  form.append("address", address);
  return jsonOrThrow(await apiFetch("/api/drawings/extract", { method: "POST", body: form }));
}

export async function duplicateCustomerEstimate(id: string): Promise<CustomerEstimate> {
  const res = await apiFetch(`/api/customer-estimates/${id}/duplicate`, { method: "POST" });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

export async function fetchEstimates() {
  const res = await apiFetch("/api/estimates");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchWindows(params: Record<string, string> = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await apiFetch(`/api/windows${q ? `?${q}` : ""}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchAnalytics() {
  const res = await apiFetch("/api/analytics");
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function findSimilar(spec: WindowSpec) {
  const res = await apiFetch("/api/similar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function importEstimateFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await apiFetch("/api/import-estimate", {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function reprocessEstimate(id: string) {
  const res = await apiFetch(`/api/estimates/${id}/reprocess`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function exportWindows() {
  const res = await apiFetch("/api/exports/windows", { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ---------------------------------------------------------------- estimate lifecycle

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

function jsonInit(method: string, body?: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function adminHeaders(pricingAdminToken: string): Record<string, string> {
  return { "X-Pricing-Admin-Token": pricingAdminToken };
}

export async function fetchCustomerEstimateList(params: { status?: string; q?: string; deleted?: boolean; limit?: number } = {}): Promise<CustomerEstimateSummary[]> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.q) query.set("q", params.q);
  if (params.deleted) query.set("deleted", "true");
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query}` : "";
  return jsonOrThrow(await apiFetch(`/api/customer-estimates${suffix}`));
}

export async function restoreCustomerEstimate(id: string): Promise<CustomerEstimate> {
  return jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/restore`, { method: "POST" }));
}

export async function reviseCustomerEstimate(id: string): Promise<CustomerEstimate> {
  return jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/revise`, { method: "POST" }));
}

export async function fetchEstimateRevisions(id: string): Promise<CustomerEstimateSummary[]> {
  return jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/revisions`));
}

export async function sendCustomerEstimate(
  id: string,
  body: { to?: string; cc?: string; message?: string; portal_base_url?: string } = {}
): Promise<SendEstimateResult> {
  const portal_base_url = body.portal_base_url ?? (typeof window !== "undefined" ? window.location.origin : "");
  return jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/send`, jsonInit("POST", { ...body, portal_base_url })));
}

export async function markEstimateLost(id: string, reason: string): Promise<CustomerEstimate> {
  return jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/lost`, jsonInit("POST", { reason })));
}

export async function reopenEstimate(id: string): Promise<CustomerEstimate> {
  return jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/reopen`, { method: "POST" }));
}

export async function setEstimateFollowUp(id: string, follow_up_on: string | null, note = ""): Promise<CustomerEstimate> {
  return jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/follow-up`, jsonInit("PUT", { follow_up_on, note })));
}

export async function fetchEstimateEvents(id: string): Promise<EstimateEvent[]> {
  return jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/events`));
}

export async function fetchFollowUpsDue(daysAhead = 0): Promise<CustomerEstimateSummary[]> {
  return jsonOrThrow(await apiFetch(`/api/customer-estimates/queues/follow-ups?days_ahead=${daysAhead}`));
}

/** Same-origin URL of the estimate PDF (open in a new tab or download). */
export function estimatePdfUrl(id: string): string {
  return apiPath(`/api/customer-estimates/${id}/pdf`);
}

/** The customer-facing link for a finalized estimate. */
export function customerPortalUrl(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/estimate/${token}`;
}

// ---------------------------------------------------------------- photos

export async function fetchEstimatePhotos(id: string): Promise<EstimatePhoto[]> {
  const photos: EstimatePhoto[] = await jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/photos`));
  return photos.map((photo) => ({ ...photo, url: apiPath(photo.url) }));
}

export async function uploadEstimatePhoto(id: string, file: File, lineId = "", caption = ""): Promise<EstimatePhoto> {
  const form = new FormData();
  form.append("file", file);
  form.append("line_id", lineId);
  form.append("caption", caption);
  const photo: EstimatePhoto = await jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/photos`, { method: "POST", body: form }));
  return { ...photo, url: apiPath(photo.url) };
}

export async function deleteEstimatePhoto(estimateId: string, photoId: string): Promise<void> {
  const res = await apiFetch(`/api/customer-estimates/${estimateId}/photos/${photoId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
}

// ---------------------------------------------------------------- public customer portal

export async function fetchPublicEstimate(token: string): Promise<PublicEstimate> {
  return jsonOrThrow(await apiFetch(`/api/public/estimates/${encodeURIComponent(token)}`, { cache: "no-store" }));
}

export async function acceptPublicEstimate(
  token: string,
  body: { name: string; signature: string; tier_id?: string | null; accepted_terms: boolean }
): Promise<PublicEstimate> {
  return jsonOrThrow(await apiFetch(`/api/public/estimates/${encodeURIComponent(token)}/accept`, jsonInit("POST", body)));
}

export function publicEstimatePdfUrl(token: string): string {
  return apiPath(`/api/public/estimates/${encodeURIComponent(token)}/pdf`);
}

// ---------------------------------------------------------------- business settings

export async function fetchBusinessSettings(): Promise<BusinessSettings> {
  return jsonOrThrow(await apiFetch("/api/settings"));
}

export async function saveBusinessSettings<G extends BusinessSettingsGroup>(
  group: G,
  value: BusinessSettings[G],
  pricingAdminToken: string
): Promise<BusinessSettings[G]> {
  return jsonOrThrow(await apiFetch(`/api/admin/settings/${group}`, jsonInit("PUT", value, adminHeaders(pricingAdminToken))));
}

export async function fetchJobAdders(activeOnly = false): Promise<{ units: JobAdderUnit[]; adders: JobAdder[] }> {
  return jsonOrThrow(await apiFetch(`/api/job-adders${activeOnly ? "?active_only=true" : ""}`));
}

export async function saveJobAdders(adders: JobAdder[], pricingAdminToken: string): Promise<{ units: JobAdderUnit[]; adders: JobAdder[] }> {
  return jsonOrThrow(await apiFetch("/api/admin/job-adders", jsonInit("PUT", { adders }, adminHeaders(pricingAdminToken))));
}

// ---------------------------------------------------------------- templates / favourites

export async function fetchTemplates<T = Record<string, unknown>>(kind?: TemplateKind): Promise<SavedTemplate<T>[]> {
  return jsonOrThrow(await apiFetch(`/api/templates${kind ? `?kind=${kind}` : ""}`));
}

export async function createTemplate<T>(name: string, kind: TemplateKind, payload: T): Promise<SavedTemplate<T>> {
  return jsonOrThrow(await apiFetch("/api/templates", jsonInit("POST", { name, kind, payload })));
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await apiFetch(`/api/templates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
}

// ---------------------------------------------------------------- price books & reconciliation

export async function fetchPriceBooks(): Promise<PriceBookListing> {
  return jsonOrThrow(await apiFetch("/api/admin/price-books"));
}

export async function importPriceBook(dataset: string, label: string, file: File, pricingAdminToken: string): Promise<PriceBookVersion> {
  const form = new FormData();
  form.append("dataset", dataset);
  form.append("label", label);
  form.append("file", file);
  return jsonOrThrow(await apiFetch("/api/admin/price-books", { method: "POST", body: form, headers: adminHeaders(pricingAdminToken) }));
}

export async function publishPriceBook(versionId: string, pricingAdminToken: string): Promise<PriceBookListing> {
  return jsonOrThrow(await apiFetch(`/api/admin/price-books/${versionId}/publish`, { method: "POST", headers: adminHeaders(pricingAdminToken) }));
}

export async function revertPriceBook(dataset: string, pricingAdminToken: string): Promise<PriceBookListing> {
  return jsonOrThrow(await apiFetch("/api/admin/price-books/revert", jsonInit("POST", { dataset }, adminHeaders(pricingAdminToken))));
}

/** URL of the dataset currently in effect (bundled file or published import). */
export function currentPriceBookUrl(dataset: string): string {
  return apiPath(`/api/admin/price-books/${dataset}/current`);
}

export async function reconcileSupplierOrder(file: File, tolerancePercent = 1): Promise<ReconcileResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("tolerance_percent", String(tolerancePercent));
  return jsonOrThrow(await apiFetch("/api/admin/reconcile", { method: "POST", body: form }));
}

// ---------------------------------------------------------------- reports

export async function fetchReportSummary(days = 90): Promise<ReportSummary> {
  return jsonOrThrow(await apiFetch(`/api/reports/summary?days=${days}`));
}

export type FollowUpDraft = { subject: string; body: string; to: string; source: "claude" | "template" };

export async function draftFollowUpEmail(id: string): Promise<FollowUpDraft> {
  return jsonOrThrow(await apiFetch(`/api/customer-estimates/${id}/follow-up-draft`, { method: "POST" }));
}
