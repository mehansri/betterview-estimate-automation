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
      detail?: string | Array<{ msg?: string; loc?: unknown }>;
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
