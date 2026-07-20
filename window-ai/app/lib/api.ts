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

export type PredictLine = {
  predicted_price: number;
  confidence: number;
  low: number;
  high: number;
  currency: string;
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

/**
 * Prefer same-origin (empty string) so Next.js rewrites proxy to the FastAPI backend.
 * Override with NEXT_PUBLIC_API_URL only when calling the API directly (e.g. no proxy).
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

export async function predictBatch(windows: WindowSpec[]): Promise<BatchResponse> {
  let res: Response;
  try {
    res = await fetch(apiPath("/api/predict/batch"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ windows }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot reach quote API (${msg}). Is the backend running on port 8000? ` +
        `From window-ai: DATABASE_URL=sqlite:///data/local.db make api`
    );
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(formatApiError(res.status, detail));
  }
  return res.json();
}

export async function healthCheck(): Promise<{ status: string; model_loaded: boolean }> {
  let res: Response;
  try {
    res = await fetch(apiPath("/health"), { cache: "no-store" });
  } catch {
    throw new Error("API unreachable — start the FastAPI backend on port 8000");
  }
  if (!res.ok) throw new Error("API unreachable");
  return res.json();
}
