"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  appendCustomerEstimateLines,
  CustomerEstimate,
  DeterministicQuoteResponse,
  CustomerWindowLine,
  QuoteCatalog,
  QuoteLineInput,
  QuoteLineType,
  PresentationMode,
  priceCustomerEstimate,
  SalesPreset,
  fetchCustomerEstimate,
  fetchQuoteCatalog,
  fetchSalesPresets,
  priceDeterministicQuote,
} from "@/lib/api";
import { newEstimateLineId } from "@/lib/quoteHandoff";
import { describeWindowSpec } from "@/lib/productDescriptions";
import ProjectAccessGate from "@/components/ProjectAccessGate";
import LocationInput from "@/components/LocationInput";
import { isBetween, isAtLeast, numericInputValue, NumericInputValue } from "@/lib/numericInput";

const COLORS = ["white", "black", "dark bronze", "charcoal", "sandstone"];
const GAS = ["argon", "50/50", "krypton"];

type Draft = {
  type: QuoteLineType;
  style: string;
  width: NumericInputValue;
  height: NumericInputValue;
  qty: NumericInputValue;
  colour_ext: string;
  loe180: boolean;
  i89: boolean;
  gas: string;
  triple: boolean;
  tri_pane_lami: boolean;
  frost_tint: boolean;
  brickmould: boolean;
  wood_jamb: boolean;
  sliding_ft: number;
  swing_kind: string;
  head_seat: string;
  lite_count: NumericInputValue;
};

type QuoteLineDraft = {
  id: string;
  spec: QuoteLineInput;
  location: string;
  description: string;
};

function emptyDraft(style = "WC-100", type: QuoteLineType = "window"): Draft {
  return {
    type,
    style,
    width: 30,
    height: 60,
    qty: 1,
    colour_ext: "white",
    loe180: true,
    i89: false,
    gas: "argon",
    triple: false,
    tri_pane_lami: false,
    frost_tint: false,
    brickmould: false,
    wood_jamb: false,
    sliding_ft: 6,
    swing_kind: "single",
    head_seat: "up to 8ft wide",
    lite_count: 3,
  };
}

function money(n: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function windowLine(draft: Draft, qty: NumericInputValue = 1): QuoteLineInput {
  const accessories: Array<{ kind: string; name: string }> = [];
  return {
    type: "window",
    style: draft.style,
    width: draft.width,
    height: draft.height,
    qty,
    colour_ext: draft.colour_ext,
    glazing: {
      loe180: draft.loe180,
      i89: draft.i89,
      gas: draft.gas,
      triple: draft.triple,
      tri_pane_lami: draft.tri_pane_lami,
      frost_tint: draft.frost_tint,
    },
    accessories,
  };
}

function toQuoteLine(draft: Draft, catalog: QuoteCatalog | null): QuoteLineInput {
  if (draft.type === "window") {
    const line = windowLine(draft, draft.qty);
    const accessories: Array<{ kind: string; name: string }> = [];
    if (draft.brickmould) {
      const name = catalog?.accessories.brickmould?.[0]?.name;
      if (name) accessories.push({ kind: "brickmould", name });
    }
    if (draft.wood_jamb) {
      const name = catalog?.accessories.wood_jamb?.[0]?.name;
      if (name) accessories.push({ kind: "wood_jamb", name });
    }
    return { ...line, accessories };
  }

  if (draft.type === "combination") {
    const first = windowLine(draft);
    const second = windowLine({ ...draft, style: catalog?.styles[1]?.code || draft.style });
    return {
      type: "combination",
      qty: draft.qty,
      layout: { cols: 2, rows: 1 },
      lites: [first, second],
    };
  }

  if (draft.type === "patio_sliding") {
    return {
      type: "patio_sliding",
      qty: draft.qty,
      nominal_ft: draft.sliding_ft,
      colour_ext: draft.colour_ext,
      glazing: {
        loe180: draft.loe180,
        i89: draft.i89,
        gas: draft.gas,
        triple: draft.triple,
        frost_tint: draft.frost_tint,
      },
      assembled: true,
    };
  }

  if (draft.type === "patio_swing") {
    return {
      type: "patio_swing",
      qty: draft.qty,
      kind: draft.swing_kind,
      width: draft.width,
      height: draft.height,
      colour_ext: draft.colour_ext,
      glazing: {
        loe180: draft.loe180,
        i89: draft.i89,
        gas: draft.gas,
        triple: draft.triple,
      },
    };
  }

  const liteCount = draft.lite_count === "" ? 0 : draft.lite_count;
  const liteWidth = draft.width === "" || draft.lite_count === "" ? "" : draft.width / Math.max(draft.lite_count, 1);
  const lites = Array.from({ length: liteCount }, (_, index) =>
    windowLine({
      ...draft,
      width: liteWidth,
      style: catalog?.styles[index % Math.max(catalog.styles.length, 1)]?.code || draft.style,
    })
  );
  return {
    type: "bay_bow",
    qty: draft.qty,
    lites,
    head_seat: draft.head_seat,
  };
}

function lineLabel(line: QuoteLineInput) {
  const lites = Array.isArray(line.lites) ? line.lites.length : 0;
  if (line.type === "window") return `${line.style} ${line.width}×${line.height}`;
  if (line.type === "patio_sliding") return `WC-500 ${line.nominal_ft}' sliding patio door`;
  if (line.type === "patio_swing") return `${line.kind} swing patio door ${line.width}×${line.height}`;
  if (line.type === "combination") return `2×1 combination (${lites} lites)`;
  return `Bay/bow (${lites} lites)`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function QuoteTotals({ result, mode = result.presentation_mode }: { result: DeterministicQuoteResponse; mode?: PresentationMode }) {
  const totals = result.totals;
  const internal = mode === "internal";
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Customer total</p>
      <p className="mt-1 text-3xl font-bold text-brand-800">{money(totals.customer_total, result.currency)}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-700">
        {internal ? <>
          <Metric label="List" value={totals.list} />
          <Metric label="Dealer cost" value={totals.dealer_cost} />
          <Metric label="Installation" value={totals.install} />
          <Metric label="Profit" value={totals.markup} />
        </> : null}
        <Metric label="Sell before HST" value={totals.sell} />
        <Metric label="HST" value={totals.hst} />
      </div>
    </div>
  );
}

function Metric({ label, value, format = "money" }: { label: string; value?: number | null; format?: "money" | "percent" }) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold">{typeof value === "number" ? (format === "percent" ? `${value.toFixed(2)}%` : money(value)) : "—"}</p>
    </div>
  );
}

function SalesResult({ result, mode = result.presentation_mode }: { result: DeterministicQuoteResponse; mode?: PresentationMode }) {
  const sales = result.sales_pricing;
  const customer = result.customer_presentation;
  const internal = mode === "internal";
  return (
    <div className="space-y-4">
      {internal ? (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Sales strategy</h2>
            <p className="mt-1 text-sm text-slate-500">{sales.preset_name || "Selected preset"} · {sales.markup_percent ?? 0}% markup on cost</p>
          </div>
          {internal ? <span className={`rounded-full px-2 py-1 text-xs font-semibold ${sales.floor_status === "manager_override" ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
            {sales.floor_status === "manager_override" ? "Manager override" : "Within floor"}
          </span> : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Metric label="Negotiated discount" value={sales.negotiated_discount_percent} format="percent" />
          {internal ? <>
            <Metric label="Minimum markup" value={sales.minimum_markup_percent} format="percent" />
            <Metric label="Gross margin" value={sales.gross_margin_percent} format="percent" />
            <Metric label="Maximum discount" value={sales.maximum_allowed_discount_percent} format="percent" />
            <Metric label="Remaining discount" value={sales.remaining_discount_percent} format="percent" />
            <Metric label="Floor price" value={sales.minimum_floor_sell} />
            <Metric label="Floor headroom" value={result.internal_presentation?.floor_headroom as number | undefined} />
          </> : null}
          <Metric label="Merchandise discount" value={sales.merchandise_discount_amount} />
        </div>
        {sales.floor_status === "manager_override" ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">This quote used a manager-approved concession. The reason is retained in the audit record.</p> : null}
      </div>
      ) : null}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Customer presentation</p>
        <p className="mt-1 text-2xl font-bold text-emerald-900">{money(customer.total, result.currency)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-emerald-950">
          <Metric label="Negotiated discount" value={customer.negotiated_discount_percent} format="percent" />
          <Metric label="Merchandise discount" value={customer.merchandise_discount} />
          <Metric label="Subtotal" value={customer.subtotal} />
          <Metric label="HST" value={customer.hst} />
        </div>
        <div className="mt-4 space-y-1 text-sm text-emerald-950">
          {customer.lines.map((line) => <div key={line.line} className="flex justify-between gap-3"><span>Line {line.line} · {line.qty}×</span><span className="font-semibold">{money(line.line_total, result.currency)}</span></div>)}
        </div>
      </div>
    </div>
  );
}

export default function QuoteBuilder({ projectId }: { projectId?: string }) {
  const [catalog, setCatalog] = useState<QuoteCatalog | null>(null);
  const [project, setProject] = useState<CustomerEstimate | null>(null);
  const [salesPresets, setSalesPresets] = useState<SalesPreset[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [lines, setLines] = useState<QuoteLineDraft[]>([]);
  const [result, setResult] = useState<DeterministicQuoteResponse | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState("standard");
  const [negotiatedDiscount, setNegotiatedDiscount] = useState(0);
  const [negotiationMode, setNegotiationMode] = useState<"percent" | "dollars" | "price">("percent");
  const [overrideReason, setOverrideReason] = useState("");
  const [discountText, setDiscountText] = useState("0");
  const [presentationMode, setPresentationMode] = useState<PresentationMode>("internal");
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffEstimateId, setHandoffEstimateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectLoading, setProjectLoading] = useState(Boolean(projectId));

  useEffect(() => {
    Promise.all([fetchQuoteCatalog(), fetchSalesPresets()])
      .then(([catalogPayload, salesPayload]) => {
        setCatalog(catalogPayload);
        setSalesPresets(salesPayload.presets);
        setDraft((current) => ({ ...current, style: catalogPayload.styles[0]?.code || current.style }));
        const standard = salesPayload.presets.find((preset) => preset.id === "standard") || salesPayload.presets[0];
        if (standard) {
          setSelectedPresetId(standard.id);
          setNegotiatedDiscount(standard.default_discount_percent);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the price-book catalog."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setProjectLoading(false);
      return;
    }
    setProjectLoading(true);
    fetchCustomerEstimate(projectId)
      .then(setProject)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the selected project."))
      .finally(() => setProjectLoading(false));
  }, [projectId]);

  const currentLine = useMemo(() => toQuoteLine(draft, catalog), [draft, catalog]);
  const selectedPreset = useMemo(
    () => salesPresets.find((preset) => preset.id === selectedPresetId) || salesPresets[0],
    [salesPresets, selectedPresetId]
  );

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  const draftIsValid =
    isAtLeast(draft.qty, 1) &&
    (draft.type === "patio_sliding" ||
      (isAtLeast(draft.width, 1) &&
        isAtLeast(draft.height, 1) &&
        (draft.type !== "bay_bow" || isBetween(draft.lite_count, 3, 6))));

  function addLine() {
    if (!draftIsValid) return;
    setLines((current) => [
      ...current,
      { id: newEstimateLineId("window"), spec: currentLine, location: "", description: describeWindowSpec(currentLine, catalog) },
    ]);
    setResult(null);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
    setResult(null);
  }

  function updateLine(index: number, patch: Partial<Pick<QuoteLineDraft, "location" | "description">>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  async function generateQuote() {
    if (!lines.length && !draftIsValid) {
      setError("Enter a valid quantity and dimensions before generating the quote.");
      return;
    }
    const payload = lines.length ? lines.map((line) => line.spec) : [currentLine];
    if (!payload.length) return;
    const requested = Math.max(0, negotiatedDiscount);
    // Avoid surfacing a hard server error for an over-limit discount with no reason.
    if (requested > allowedMax + 1e-9 && !overrideReason.trim()) {
      setError(
        `This discount (${requested.toFixed(1)}%) exceeds your authorized limit (${allowedMax.toFixed(1)}%). ` +
          "Enter a manager approval reason to proceed, or reduce the discount."
      );
      return;
    }
    setPricing(true);
    setError(null);
    try {
      const priced = await priceDeterministicQuote({
        lines: payload,
        commercial: {
          preset_id: selectedPreset?.id || selectedPresetId,
          negotiated_discount_percent: requested,
          manager_override_reason: requested > allowedMax + 1e-9 ? overrideReason.trim() : undefined,
          // Keep the complete calculation available to the salesperson so
          // switching between internal and customer display never loses data.
          // The API still supports presentation_mode="customer" for external
          // callers and redacts protected fields there.
          presentation_mode: "internal",
        },
      });
       setLines((current) => payload.map((spec, index) => ({
         id: current[index]?.id || newEstimateLineId("window"),
         location: current[index]?.location || "",
         description: current[index]?.description || describeWindowSpec(spec, catalog),
         spec,
       })));
       setResult(priced);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not price the quote.");
    } finally {
      setPricing(false);
    }
  }

  async function sendToProjectEstimate() {
    if (!projectId || !project || project.status === "finalized" || !result || !lines.length) return;
    setHandoffBusy(true);
    setHandoffEstimateId(null);
    setError(null);
    const windows: CustomerWindowLine[] = lines.map((line) => ({
      id: line.id,
      location: line.location,
      description: line.description,
      spec: line.spec,
    }));
    const projectHasProducts = project.windows.length > 0 || project.doors.length > 0;
    try {
      const assigned = await appendCustomerEstimateLines(projectId, {
        windows,
        doors: [],
        commercial: projectHasProducts ? undefined : {
          preset_id: result.sales_pricing.preset_id || selectedPresetId,
          negotiated_discount_percent: result.sales_pricing.negotiated_discount_percent,
          manager_override_reason: result.sales_pricing.manager_override_reason || undefined,
          presentation_mode: "internal",
        },
      });
      try {
        const priced = await priceCustomerEstimate(assigned.id);
        window.location.href = `/projects/${priced.id}`;
      } catch (pricingError) {
        setHandoffEstimateId(assigned.id);
        setError(pricingError instanceof Error ? `Window quote assigned, but project pricing needs attention: ${pricingError.message}` : "Window quote assigned, but project pricing needs attention.");
      }
    } catch (handoffError) {
      setError(handoffError instanceof Error ? handoffError.message : "Could not assign the window quote to this project.");
    } finally {
      setHandoffBusy(false);
    }
  }

  const accessories = catalog?.accessories || {};

  // --- Sales strategy: live negotiation preview (recomputed from the last price) ---
  const sp = result?.sales_pricing;
  const isPriced = Boolean(sp && sp.base_merchandise_sell != null);
  const baseMerch = sp?.base_merchandise_sell ?? 0;
  const protectedInstall = sp?.protected_install_sell ?? 0;
  const hstRate = result?.totals?.sell_before_tax ? result.totals.hst / result.totals.sell_before_tax : 0.13;
  const configuredCap = sp?.configured_max_discount_percent ?? (selectedPreset?.max_discount_percent ?? 0);
  const floorCap = sp?.floor_derived_max_discount_percent ?? 0;
  const allowedMax = sp?.maximum_allowed_discount_percent ?? configuredCap;
  const requestedPct = Math.max(0, negotiatedDiscount);
  const overLimit = requestedPct > allowedMax + 1e-9;
  const remainingPct = Math.max(0, allowedMax - requestedPct);
  const sliderMax = Math.max(allowedMax, negotiatedDiscount, 5) + 0.5;
  const frac = requestedPct / 100;
  const previewDiscount = baseMerch * frac;
  const previewPreTax = baseMerch * (1 - frac) + protectedInstall;
  const previewTotal = previewPreTax * (1 + hstRate);
  const maximumDiscountDollars = baseMerch * (allowedMax / 100);
  const minimumCustomerTotal = (baseMerch * (1 - allowedMax / 100) + protectedInstall) * (1 + hstRate);
  function capToAllowedDiscount(value: number) {
    return Math.max(0, Math.min(allowedMax, value));
  }
  function pctFromDollars(dollars: number) {
    return baseMerch > 0 ? capToAllowedDiscount((dollars / baseMerch) * 100) : 0;
  }
  function pctFromPrice(targetTotal: number) {
    if (baseMerch <= 0) return 0;
    const targetPreTax = targetTotal / (1 + hstRate);
    return capToAllowedDiscount(((baseMerch + protectedInstall - targetPreTax) / baseMerch) * 100);
  }
  const cp: Record<string, any> = result?.customer_presentation ?? {};
  const customerLines = Array.isArray(cp.lines)
    ? (cp.lines as Array<{ line: number; type: string; qty: number; unit_price: number; line_total: number }>).map((line, index) => ({
        ...line,
        location: lines[index]?.location || "",
        description: lines[index]?.description || describeWindowSpec(lines[index]?.spec || currentLine, catalog),
      }))
    : [];
  // A discount that no longer matches the generated quote → quote is stale, needs regenerating.
  const stale = isPriced && Math.abs(requestedPct - (sp?.negotiated_discount_percent ?? -1)) > 1e-9;
  // Keep the visible discount field freely editable without clearing the quote on each keystroke.
  useEffect(() => {
    if (negotiationMode === "percent") setDiscountText(String(negotiatedDiscount));
    else if (negotiationMode === "dollars") setDiscountText(String(Number(previewDiscount.toFixed(2))));
    else setDiscountText(String(Number(previewTotal.toFixed(2))));
  }, [negotiationMode, negotiatedDiscount, previewDiscount, previewTotal]);
  // --------------------------------------------------------------------------------

  if (!projectId) return <ProjectAccessGate product="window" />;
  if (projectLoading) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading projectâ€¦</p>;
  if (!project) return <p className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error || "The selected project could not be loaded."}</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow</p>
          <p className="text-base font-semibold text-slate-900">{presentationMode === "internal" ? "Internal pricing workspace" : "Customer presentation"}</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold">
          <button type="button" className={`rounded-lg px-3 py-2 ${presentationMode === "internal" ? "bg-brand-600 text-white" : "text-slate-700"}`} onClick={() => setPresentationMode("internal")}>Internal view</button>
          <button type="button" className={`rounded-lg px-3 py-2 ${presentationMode === "customer" ? "bg-emerald-600 text-white" : "text-slate-700"}`} onClick={() => setPresentationMode("customer")}>Customer view</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
        <div><span className="text-brand-700">Assigning this quote to </span><strong className="text-brand-900">{project.project_name || project.customer_name || "Selected project"}</strong>{project.estimate_number ? <span className="ml-2 text-xs text-brand-700">{project.estimate_number}</span> : null}</div>
        <Link href={`/projects/${project.id}`} className="font-semibold text-brand-700 hover:underline">Open project</Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        {presentationMode === "internal" ? (
        <section className="space-y-6 lg:col-span-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Build a catalog-backed window quote</h2>
            <p className="mt-1 text-sm text-slate-500">
              Prices come from Window City v18 with component traceability. Unsupported options are flagged for review.
            </p>

          {loading ? <p className="mt-6 text-sm text-slate-500">Loading price-book catalog…</p> : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Line type">
              <select className="input" value={draft.type} onChange={(e) => update("type", e.target.value as QuoteLineType)}>
                <option value="window">Window</option>
                <option value="combination">Combination</option>
                <option value="patio_sliding">Sliding patio door</option>
                <option value="patio_swing">Swing patio door</option>
                <option value="bay_bow">Bay / bow assembly</option>
              </select>
            </Field>

            {(draft.type === "window" || draft.type === "combination" || draft.type === "bay_bow") && (
              <Field label="Window style">
                <select className="input" value={draft.style} onChange={(e) => update("style", e.target.value)}>
                  {catalog?.styles.map((style) => <option key={style.code} value={style.code}>{style.code} · {style.name}</option>)}
                </select>
              </Field>
            )}

            {draft.type === "patio_sliding" ? (
              <Field label="Nominal size">
                <select className="input" value={draft.sliding_ft} onChange={(e) => update("sliding_ft", Number(e.target.value))}>
                  {catalog?.patio_sliding_sizes.map((size) => <option key={size} value={size}>{size}'</option>)}
                </select>
              </Field>
            ) : null}

            {draft.type === "patio_swing" ? (
              <Field label="Door family">
                <select className="input" value={draft.swing_kind} onChange={(e) => update("swing_kind", e.target.value)}>
                  {catalog?.patio_swing_kinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </Field>
            ) : null}

            {draft.type !== "patio_sliding" && (
              <>
                <Field label="Width (in)"><input className="input" type="number" min={1} step={0.125} value={draft.width} onChange={(e) => update("width", numericInputValue(e.target.value))} /></Field>
                <Field label="Height (in)"><input className="input" type="number" min={1} step={0.125} value={draft.height} onChange={(e) => update("height", numericInputValue(e.target.value))} /></Field>
              </>
            )}

            <Field label="Quantity"><input className="input" type="number" min={1} step={1} value={draft.qty} onChange={(e) => update("qty", numericInputValue(e.target.value))} /></Field>
            <Field label="Exterior colour">
              <select className="input" value={draft.colour_ext} onChange={(e) => update("colour_ext", e.target.value)}>
                {COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
              </select>
            </Field>
          </div>

          {draft.type !== "bay_bow" ? (
            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Glazing</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle label="LoE 180" value={draft.loe180} onChange={(value) => update("loe180", value)} />
                <Toggle label="i89" value={draft.i89} onChange={(value) => update("i89", value)} />
                <Toggle label="Triple pane" value={draft.triple} onChange={(value) => update("triple", value)} />
                <Toggle label="Tri-pane laminated" value={draft.tri_pane_lami} onChange={(value) => update("tri_pane_lami", value)} />
                <Toggle label="Frost / tint" value={draft.frost_tint} onChange={(value) => update("frost_tint", value)} />
                <Field label="Gas"><select className="input" value={draft.gas} onChange={(e) => update("gas", e.target.value)}>{GAS.map((gas) => <option key={gas} value={gas}>{gas}</option>)}</select></Field>
              </div>
            </div>
          ) : null}

          {draft.type === "window" ? (
            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Catalog accessories</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle label="Brickmould" value={draft.brickmould} onChange={(value) => update("brickmould", value)} />
                <Toggle label="Wood jamb" value={draft.wood_jamb} onChange={(value) => update("wood_jamb", value)} />
              </div>
              <p className="mt-3 text-xs text-slate-500">{accessories.brickmould?.[0]?.name || "Catalog accessory rows load with the price book."}</p>
            </div>
          ) : null}

          {draft.type === "bay_bow" ? (
            <div className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <Field label="Lite count"><input className="input" type="number" min={3} max={6} value={draft.lite_count} onChange={(e) => update("lite_count", numericInputValue(e.target.value))} /></Field>
              <Field label="Head / seat"><select className="input" value={draft.head_seat} onChange={(e) => update("head_seat", e.target.value)}>{catalog?.baybow.head_seat_sizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></Field>
            </div>
          ) : null}

          <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Sales strategy</p>
                <p className="mt-1 text-xs text-slate-600">
                  Set the markup approach and how much room to give the customer. Your discount applies to the
                  product only — installation is never discounted — and the configured floor controls the minimum
                  markup. A manager can intentionally configure a negative floor for approved loss-making sales.
                </p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-brand-700">Manager-controlled floors</span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Preset">
                <select
                  className="input"
                  value={selectedPreset?.id || selectedPresetId}
                  onChange={(e) => {
                    const next = salesPresets.find((preset) => preset.id === e.target.value);
                    setSelectedPresetId(e.target.value);
                    setNegotiatedDiscount(next?.default_discount_percent || 0);
                    setResult(null);
                  }}
                >
                  {salesPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.markup_percent}% markup</option>)}
                </select>
                {selectedPreset?.description ? <p className="mt-1 text-xs text-slate-500">{selectedPreset.description}</p> : null}
              </Field>

              <div>
                <p className="mb-1 block text-sm font-medium text-slate-700">Negotiated discount</p>
                <p className="mb-2 text-xs text-slate-500">How do you want to enter the room you give the customer?</p>
                <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold">
                  {([["percent", "% off"], ["dollars", "$ off"], ["price", "Total price"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`flex-1 rounded-md px-2 py-1 ${negotiationMode === key ? "bg-brand-600 text-white" : "text-slate-600"}`}
                      onClick={() => {
                        setNegotiationMode(key);
                        if (key !== "percent") {
                          setNegotiatedDiscount((current) => capToAllowedDiscount(current));
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Negotiation control with live preview */}
            <div className="mt-5 rounded-lg border border-brand-200/70 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {negotiationMode === "percent" ? "Discount off product price" : negotiationMode === "dollars" ? "Dollars off total" : "Customer price (incl. tax)"}
                </p>
                {isPriced ? (
                  <span className="text-sm font-semibold text-brand-700">
                    {negotiationMode === "percent" ? `${requestedPct.toFixed(1)}%` : negotiationMode === "dollars" ? money(previewDiscount) : money(previewTotal)}
                  </span>
                ) : null}
              </div>

              {!isPriced && negotiationMode !== "percent" ? (
                <p className="mt-3 text-xs text-slate-500">Generate a quote first, then enter the discount in dollars or as a total customer price.</p>
              ) : negotiationMode === "percent" ? (
                <>
                  <input type="range" min={0} max={sliderMax} step={0.5} value={negotiatedDiscount} onChange={(e) => { setNegotiatedDiscount(Number(e.target.value)); }} className="mt-3 w-full" />
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="input mt-2 w-32"
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value)}
                    onBlur={() => { const v = Math.max(0, parseFloat(discountText) || 0); setNegotiatedDiscount(v); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                </>
              ) : negotiationMode === "dollars" ? (
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="input mt-3 w-40"
                  value={discountText}
                  onChange={(e) => setDiscountText(e.target.value)}
                  onBlur={() => { setNegotiatedDiscount(pctFromDollars(parseFloat(discountText) || 0)); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="input mt-3 w-40"
                  value={discountText}
                  onChange={(e) => setDiscountText(e.target.value)}
                  onBlur={() => { setNegotiatedDiscount(pctFromPrice(parseFloat(discountText) || 0)); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              )}

              {isPriced && negotiationMode === "dollars" ? <p className="mt-2 text-xs text-slate-500">Capped at {money(maximumDiscountDollars)} off ({allowedMax.toFixed(1)}%).</p> : null}
              {isPriced && negotiationMode === "price" ? <p className="mt-2 text-xs text-slate-500">Customer total cannot go below {money(minimumCustomerTotal)} without switching to % off and requesting manager approval.</p> : null}

              {isPriced ? (
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Discount</span><b>{money(previewDiscount)} ({requestedPct.toFixed(1)}%)</b></div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Pre-tax total</span><b>{money(previewPreTax)}</b></div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Customer total</span><b>{money(previewTotal)}</b></div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Remaining room</span><b>{remainingPct.toFixed(1)}%</b></div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Markup</span><b>{sp?.markup_percent ?? selectedPreset?.markup_percent}%</b></div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Minimum markup</span><b>{sp?.minimum_markup_percent ?? selectedPreset?.minimum_markup_percent}%</b></div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Floor price</span><b>{money(sp?.minimum_floor_sell ?? 0)}</b></div>
                  <div className={`rounded-lg px-3 py-2 ${overLimit ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}><span className="block text-slate-500">Status</span><b>{overLimit ? (overrideReason.trim() ? "Awaiting manager" : "Over limit") : "Within floor"}</b></div>
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">Generate a quote to see the dollar totals, the floor, your remaining room, and the binding limit.</p>
              )}

              {stale ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Discount changed since the quote was generated — select <b>Generate window quote</b> to refresh the pricing.
                </p>
              ) : null}
            </div>
            {/* Which limit is binding */}
            {isPriced ? (
              <p className="mt-3 text-xs text-slate-600">
                {floorCap < configuredCap - 1e-9
                  ? `Allowed discount capped at ${allowedMax.toFixed(1)}% by the minimum-markup floor (${floorCap.toFixed(1)}%), which is tighter than the preset cap of ${configuredCap.toFixed(1)}%.`
                  : `Allowed discount is the preset cap of ${configuredCap.toFixed(1)}%; the floor would permit up to ${floorCap.toFixed(1)}%.`}
              </p>
            ) : null}

            {/* Guided manager approval */}
            {overLimit ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-800">This discount exceeds your authorized limit of {allowedMax.toFixed(1)}%.</p>
                <p className="mt-1 text-xs text-rose-700">A manager approval reason is required. The override, the reason, and the resulting price are recorded in the audit log.</p>
                <input type="text" className="input mt-2 w-full" placeholder="Manager approval reason (required)" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" onClick={addLine} disabled={!draftIsValid}>Add line</button>
            <button type="button" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60" onClick={generateQuote} disabled={pricing || loading || (!lines.length && !draftIsValid)}>{pricing ? "Pricing…" : "Generate window quote"}</button>
          </div>
        </div>

        {lines.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
             <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-slate-900">Window quote lines</h2><span className="text-sm text-slate-500">{lines.length} line{lines.length === 1 ? "" : "s"}</span></div>
            <div className="mt-4 space-y-2">
               {lines.map((line, index) => <div key={line.id} className="rounded-lg bg-slate-50 px-3 py-3 text-sm">
                 <div className="flex items-center justify-between gap-3"><span className="font-medium text-slate-800">{lineLabel(line.spec)}</span><button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeLine(index)}>Remove</button></div>
                 <div className="mt-2 grid gap-2 sm:grid-cols-2">
                   <LocationInput className="input" value={line.location} onChange={(value) => updateLine(index, { location: value })} placeholder="Location (e.g. Bedroom)" />
                   <input className="input" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} placeholder="Customer description (optional)" />
                 </div>
               </div>)}
            </div>
          </div>
        ) : null}

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}
          </section>
        ) : (
          <section className="space-y-6 lg:col-span-3">
            {result ? (
              <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-emerald-900">Customer estimate</h2>
                    <p className="mt-1 text-xs text-emerald-800">
                      A clean, shareable quote with sell prices, the negotiated discount, and tax. Costs, margins,
                      floors, and sales strategy are not shown here.
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Customer view</span>
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Item</th>
                        <th className="px-2 py-2 text-right">Qty</th>
                        <th className="px-2 py-2 text-right">Unit price</th>
                        <th className="px-2 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customerLines.map((c) => (
                        <tr key={c.line}>
                          <td className="px-2 py-2 font-medium text-slate-900"><div>{c.description || c.type.replace(/_/g, " ")}</div>{c.location ? <div className="mt-1 text-xs font-normal text-slate-500">{c.location}</div> : null}</td>
                          <td className="px-2 py-2 text-right text-slate-700">{c.qty}</td>
                          <td className="px-2 py-2 text-right text-slate-700">{money(c.unit_price, result.currency)}</td>
                          <td className="px-2 py-2 text-right font-semibold text-slate-900">{money(c.line_total, result.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 ml-auto w-full max-w-xs space-y-1 border-t border-slate-200 pt-3 text-sm">
                  <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>{money(cp.subtotal, result.currency)}</span></div>
                  <div className="flex justify-between text-slate-600"><span>Discount</span><span>−{money(cp.merchandise_discount, result.currency)}</span></div>
                  <div className="flex justify-between text-slate-700"><span>HST</span><span>{money(cp.hst, result.currency)}</span></div>
                  <div className="flex justify-between text-base font-bold text-emerald-900"><span>Total</span><span>{money(cp.total, result.currency)}</span></div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
                <h2 className="text-base font-semibold text-emerald-900">Customer presentation</h2>
                <p className="mt-1 text-sm text-emerald-800">
                  This read-only view shows the priced quote for sharing with the customer. Switch back to{" "}
                  <b>Internal view</b> to build or edit the quote.
                </p>
              </div>
            )}
          </section>
        )}

      <aside className="space-y-6 lg:col-span-2">
        {result ? (
          <>
            <div className={`rounded-2xl border p-4 ${presentationMode === "internal" ? "border-brand-200 bg-brand-50" : "border-emerald-200 bg-emerald-50"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current presentation</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{presentationMode === "internal" ? "Internal pricing view" : "Customer-facing view"}</p>
              <p className="mt-1 text-xs text-slate-600">{presentationMode === "internal" ? "Shows protected dealer cost, profit, margin, floor, and bargaining room." : "Shows sell prices, the negotiated merchandise discount, HST, and total only."}</p>
            </div>
            <QuoteTotals result={result} mode={presentationMode} />
            <SalesResult result={result} mode={presentationMode} />
            <div className="rounded-2xl border border-brand-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Project estimate</h2>
              <p className="mt-1 text-sm text-slate-500">Assign all {lines.length} added window line{lines.length === 1 ? "" : "s"} to the selected project. Existing door and window lines stay in the same project.</p>
              {project.status === "finalized" ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">This project is finalized and cannot accept new quote lines.</p> : null}
              <button type="button" className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" onClick={sendToProjectEstimate} disabled={handoffBusy || !lines.length || project.status === "finalized"}>{handoffBusy ? "Assigning to project…" : "Assign to project"}</button>
              {handoffEstimateId ? <p className="mt-3 text-xs text-rose-700">The quote was assigned. <Link href={`/projects/${handoffEstimateId}`} className="font-semibold underline">Open project</Link> to resolve the pricing issue.</p> : null}
              {error && handoffEstimateId ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
            </div>
            {presentationMode === "internal" ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><h2 className="text-base font-semibold text-slate-900">Price-book audit</h2><span className={`rounded-full px-2 py-1 text-xs font-semibold ${result.review_required ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{result.review_required ? "Review required" : "Catalog priced"}</span></div>
              <p className="mt-2 text-xs text-slate-500">{result.price_book_version} · config {result.config_version}</p>
              {result.warnings.length ? <div className="mt-4 space-y-2">{result.warnings.map((warning, index) => <div key={`${warning.code}-${index}`} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{warning.message}</div>)}</div> : <p className="mt-4 text-sm text-emerald-700">All requested components matched supported catalog rules.</p>}
            </div> : null}
            {presentationMode === "internal" ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Line breakdown</h2>
              <div className="mt-4 space-y-4">
                {result.lines.map((line) => <div key={line.line} className="rounded-xl bg-slate-50 p-4"><div className="flex justify-between gap-3 text-sm font-semibold"><span>Line {line.line} · {line.type} × {line.qty}</span><span>{money(line.customer_total, result.currency)}</span></div><div className="mt-3 space-y-1 text-xs text-slate-600">{line.components.map((component, index) => <div key={`${component.label}-${index}`} className="flex justify-between gap-3"><span>{component.label}</span><span>{money(component.dealer)}</span></div>)}</div>{line.source_refs.length ? <p className="mt-3 text-[11px] text-slate-500">Sources: {line.source_refs.join("; ")}</p> : null}</div>)}
              </div>
            </div> : null}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm">Add a line and generate a quote to see the deterministic component breakdown, review warnings, and customer total.</div>
        )}
      </aside>
      </div>
    </div>
  );
}
