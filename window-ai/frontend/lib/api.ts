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

export type PredictLine = {
  estimated_price?: number;
  predicted_price: number;
  historical_average?: number | null;
  price_range?: { low: number; high: number };
  confidence: number;
  low: number;
  high: number;
  currency: string;
  method?: string;
  reason?: string;
  similar_windows?: SimilarWindow[];
  neighbor_count?: number;
  model_version?: string;
  model_name?: string;
  quantity: number;
  line_total: number;
};

export type BatchResponse = {
  lines: PredictLine[];
  quote_subtotal: number;
  currency: string;
};

export type QuoteLineType =
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
  presentation_mode?: PresentationMode;
  manager_override_reason?: string | null;
};

export type SalesPreset = {
  id: string;
  name: string;
  description: string;
  markup_percent: number;
  default_discount_percent: number;
  max_discount_percent: number;
  minimum_markup_percent: number;
  active: boolean;
};

export type SalesPresetResponse = {
  sales_config_version: string;
  presets: SalesPreset[];
  currency?: string;
  minimum_markup_percent?: number;
};

export type SalesPresetConfig = {
  currency: string;
  minimum_markup_percent: number;
  presets: SalesPreset[];
};

export type DeterministicQuoteRequest = {
  defaults?: Record<string, unknown>;
  lines: QuoteLineInput[];
  commercial?: CommercialSettings;
  config_overrides?: Record<string, unknown>;
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
  }>;
  accessories: Record<string, Array<{ name: string; item_code?: string; source_page_pdf?: number }>>;
  shapes: Record<string, Array<{ name: string; source_page_pdf?: number }>>;
  patio_sliding_sizes: number[];
  patio_swing_kinds: string[];
  baybow: {
    head_seat_sizes: string[];
    welded_brickmould_lites: number[];
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
  door: DoorPartSpec;
  door2?: DoorPartSpec;
  sidelites: DoorPartSpec[];
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
};

export type DoorCustomerItem = {
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

export type DoorCustomerOpening = {
  id: string;
  location: string;
  label: string;
  material: string;
  finish_label: string;
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

export type CustomerEstimateStatus = "draft" | "priced" | "finalized";

export type CustomerWindowLine = {
  id: string;
  location: string;
  description: string;
  spec: QuoteLineInput;
};

export type CustomerDoorOpening = {
  id: string;
  location: string;
  description: string;
  spec: DoorOpeningSpec;
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
};

export type CustomerEstimatePricing = {
  pricing_hash: string;
  priced_at: string;
  review_required: boolean;
  warnings: QuoteWarning[];
  price_versions: Record<string, unknown>;
  sections: {
    windows: {
      lines: Array<{
        id: string;
        location: string;
        description: string;
        qty: number;
        unit_price: number;
        line_total: number;
      }>;
      subtotal: number;
      hst: number;
      total: number;
    };
    doors: {
      openings: Array<{
        id: string;
        location: string;
        label: string;
        material: string;
        finish_label: string;
        items: Array<{ description: string; qty: number; unit_price: number; line_total: number }>;
        subtotal: number;
        hst: number;
        total: number;
      }>;
      subtotal: number;
      hst: number;
      total: number;
    };
  };
  totals: { subtotal: number; hst: number; total: number; currency: string };
  window_quote?: DeterministicQuoteResponse | null;
  door_quote?: Record<string, unknown> | null;
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
};

export type CustomerEstimateSummary = {
  id: string;
  estimate_number?: string | null;
  status: CustomerEstimateStatus;
  customer_name: string;
  company_name: string;
  project_name: string;
  total?: number | null;
  updated_at: string;
  finalized_at?: string | null;
};

/**
 * Prefer same-origin (empty string) so Next.js rewrites proxy to the FastAPI backend.
 */
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

function apiPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${p}`;
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

/** Phase 1 quote: similarity-first (+ optional ML fallback). */
export async function quoteBatch(windows: WindowSpec[]): Promise<BatchResponse> {
  const res = await apiFetch("/api/quote/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ windows }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(formatApiError(res.status, detail));
  }
  return res.json();
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
  request: DeterministicQuoteRequest
): Promise<DeterministicQuoteResponse> {
  const res = await apiFetch("/api/quotes/price", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(formatApiError(res.status, detail));
  }
  return res.json();
}

export async function recordQuoteOutcome(
  quoteId: string,
  outcome: {
    actual_total: number;
    actual_material?: number;
    actual_install?: number;
    actual_sell?: number;
    actual_hst?: number;
    source_estimate_id?: string;
    notes?: string;
  }
) {
  const res = await apiFetch(`/api/quotes/${quoteId}/outcome`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(outcome),
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

export async function quoteDoors(openings: DoorOpeningSpec[]): Promise<DoorProjectResponse> {
  const res = await apiFetch("/api/doors/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openings }),
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

export async function updateCustomerEstimate(id: string, draft: CustomerEstimateDraft): Promise<CustomerEstimate> {
  const res = await apiFetch(`/api/customer-estimates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

export async function priceCustomerEstimate(id: string): Promise<CustomerEstimate> {
  const res = await apiFetch(`/api/customer-estimates/${id}/price`, { method: "POST" });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

export async function finalizeCustomerEstimate(id: string): Promise<CustomerEstimate> {
  const res = await apiFetch(`/api/customer-estimates/${id}/finalize`, { method: "POST" });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

export async function duplicateCustomerEstimate(id: string): Promise<CustomerEstimate> {
  const res = await apiFetch(`/api/customer-estimates/${id}/duplicate`, { method: "POST" });
  if (!res.ok) throw new Error(formatApiError(res.status, await res.text()));
  return res.json();
}

/** @deprecated prefer quoteBatch — kept for compatibility */
export async function predictBatch(windows: WindowSpec[]): Promise<BatchResponse> {
  return quoteBatch(windows);
}

export async function healthCheck(): Promise<{ status: string; model_loaded: boolean }> {
  const res = await apiFetch("/health", { cache: "no-store" });
  if (!res.ok) throw new Error("API unreachable");
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
