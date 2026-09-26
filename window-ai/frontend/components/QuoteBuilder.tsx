"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  appendCustomerEstimateLines,
  CustomerEstimate,
  CustomerEstimateDraft,
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
  updateCustomerEstimate,
  WindowDetails,
  WindowElevation,
  WindowHanding,
  WindowOperation,
} from "@/lib/api";
import { newEstimateLineId } from "@/lib/quoteHandoff";
import { describeWindowSpec } from "@/lib/productDescriptions";
import ProjectAccessGate from "@/components/ProjectAccessGate";
import LocationInput from "@/components/LocationInput";
import { isBetween, isAtLeast, numericInputValue, NumericInputValue } from "@/lib/numericInput";
import { groupWindowStyles, windowStyleLabel } from "@/lib/styleOptions";
import { getCombinationSuggestion } from "@/lib/windowSuggestions";
import {
  brickmouldOptions,
  DEFAULT_BRICKMOULD,
  DEFAULT_JAMB,
  defaultHardware,
  defaultScreen,
  defaultSide,
  ELEVATIONS,
  handingLabel,
  hasReinforcement,
  hasSideHanding,
  HARDWARE_SUGGESTIONS,
  JAMB_FINISHES,
  JambKind,
  jambOptions,
  NAILING_FLANGE,
  normalizeHanding,
  OPERATION_LABELS,
  operationForStyle,
  resolveJambName,
  round2,
  SASH_REINFORCEMENT,
  SCREEN_MESH_COLOURS,
  SPACERS,
  supportsReinforcement,
  withCurrent,
} from "@/lib/windowDetails";

const COLORS = ["white", "black", "dark bronze", "charcoal", "sandstone"];
const GAS = ["argon", "50/50", "krypton"];
const MIN_COMBINATION_LITES = 2;
const MAX_COMBINATION_LITES = 4;

/** One lite of a combination, left to right as viewed from outside. */
type LiteDraft = {
  style: string;
  width: NumericInputValue;
  handing: WindowHanding;
  reinforcement: boolean;
};

type Draft = {
  type: QuoteLineType;
  style: string;
  width: NumericInputValue;
  height: NumericInputValue;
  qty: NumericInputValue;
  colour_ext: string;
  colour_int: string;
  loe180: boolean;
  i89: boolean;
  gas: string;
  triple: boolean;
  tri_pane_lami: boolean;
  frost_tint: boolean;
  // Single window operation (combinations keep theirs per lite).
  handing: WindowHanding;
  reinforcement: boolean;
  lites: LiteDraft[];
  // Priced trim (window + combination).
  jamb_kind: "none" | JambKind;
  jamb_name: string;
  brickmould: boolean;
  brickmould_name: string;
  nailing_flange: boolean;
  // Presentation-only order details.
  jamb_finish: string;
  screen: boolean;
  screen_frame: string;
  screen_mesh: string;
  hardware: string;
  spacer: string;
  tag: string;
  elevation: WindowElevation | "";
  notes: string;
  sliding_ft: number;
  swing_kind: string;
  head_seat: string;
  lite_count: NumericInputValue;
};

type QuoteLineDraft = {
  id: string;
  spec: QuoteLineInput;
  details: WindowDetails | null;
  location: string;
  description: string;
};

type Accessory = { kind: string; name: string; lineal_ft?: number };

function liteDraft(style: string, width: NumericInputValue, index: number, count: number, catalog?: QuoteCatalog | null): LiteDraft {
  const operation = operationForStyle(style, catalog);
  return { style, width, handing: normalizeHanding(operation, null, defaultSide(index, count)), reinforcement: false };
}

function splitWidth(width: NumericInputValue, count: number): NumericInputValue {
  return width === "" ? "" : Math.round((width / count) * 1000) / 1000;
}

function draftOperations(draft: Pick<Draft, "type" | "style" | "lites">, catalog?: QuoteCatalog | null): WindowOperation[] {
  if (draft.type === "window") return [operationForStyle(draft.style, catalog)];
  if (draft.type === "combination") return draft.lites.map((lite) => operationForStyle(lite.style, catalog));
  return [];
}

/**
 * Keep the operation-driven defaults (screen, hardware) in step with the
 * chosen styles unless the rep has already overridden them.
 */
function withOperationDefaults(previous: Draft, next: Draft, catalog?: QuoteCatalog | null): Draft {
  const before = draftOperations(previous, catalog);
  const after = draftOperations(next, catalog);
  return {
    ...next,
    screen: previous.screen === defaultScreen(before) ? defaultScreen(after) : next.screen,
    hardware: previous.hardware === defaultHardware(before) ? defaultHardware(after) : next.hardware,
  };
}

function withStyle(draft: Draft, style: string, catalog?: QuoteCatalog | null): Draft {
  const operation = operationForStyle(style, catalog);
  return withOperationDefaults(draft, {
    ...draft,
    style,
    handing: normalizeHanding(operation, draft.handing),
    reinforcement: supportsReinforcement(operation) && draft.reinforcement,
  }, catalog);
}

function withLites(draft: Draft, lites: LiteDraft[], catalog?: QuoteCatalog | null): Draft {
  const normalized = lites.map((lite, index) => {
    const operation = operationForStyle(lite.style, catalog);
    return {
      ...lite,
      handing: normalizeHanding(operation, lite.handing, defaultSide(index, lites.length)),
      reinforcement: supportsReinforcement(operation) && lite.reinforcement,
    };
  });
  return withOperationDefaults(draft, { ...draft, lites: normalized }, catalog);
}

function withType(draft: Draft, type: QuoteLineType, catalog?: QuoteCatalog | null): Draft {
  if (type === draft.type) return draft;
  const next = { ...draft, type };
  if (type === "combination" && draft.type !== "combination") {
    // Start from the current style split into two equal lites.
    const width = splitWidth(draft.width, MIN_COMBINATION_LITES);
    next.lites = [0, 1].map((index) => liteDraft(draft.style, width, index, MIN_COMBINATION_LITES, catalog));
  }
  return withOperationDefaults(draft, next, catalog);
}

function emptyDraft(style = "WC-100", type: QuoteLineType = "window"): Draft {
  const operation = operationForStyle(style);
  const lites = [liteDraft(style, 30, 0, 2), liteDraft(style, 30, 1, 2)];
  const operations = draftOperations({ type, style, lites });
  return {
    type,
    style,
    width: 30,
    height: 60,
    qty: 1,
    colour_ext: "white",
    colour_int: "white",
    loe180: true,
    i89: false,
    gas: "argon",
    triple: false,
    tri_pane_lami: false,
    frost_tint: false,
    handing: normalizeHanding(operation, null),
    reinforcement: false,
    lites,
    jamb_kind: DEFAULT_JAMB.kind,
    jamb_name: DEFAULT_JAMB.name,
    brickmould: false,
    brickmould_name: DEFAULT_BRICKMOULD,
    nailing_flange: true,
    jamb_finish: "primed",
    screen: defaultScreen(operations),
    screen_frame: "white",
    screen_mesh: "black",
    hardware: defaultHardware(operations),
    spacer: "Black",
    tag: "",
    elevation: "",
    notes: "",
    sliding_ft: 6,
    swing_kind: "single",
    head_seat: "up to 8ft wide",
    lite_count: 3,
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function draftFromSpec(spec: QuoteLineInput, catalog: QuoteCatalog, details?: WindowDetails | null): Draft {
  const raw = recordValue(spec);
  const nestedLites = Array.isArray(raw.lites)
    ? raw.lites.map(recordValue).filter((lite) => Object.keys(lite).length > 0)
    : [];
  const source = nestedLites[0] || raw;
  const glazing = recordValue(source.glazing);
  const accessories = Array.isArray(source.accessories) ? source.accessories.map(recordValue) : [];
  const type = spec.type;
  const style = String(source.style || raw.style || catalog.styles[0]?.code || "WC-100");
  const defaultDraft = emptyDraft(style, type);
  const bayWidth = nestedLites.reduce((total, lite) => total + finiteNumber(lite.width, 0), 0);
  const saved = details || null;
  const sections = Array.isArray(saved?.sections) ? saved.sections : [];

  const operation = operationForStyle(style, catalog);
  const lites: LiteDraft[] = type === "combination" && nestedLites.length
    ? nestedLites.map((lite, index) => {
        const liteStyle = String(lite.style || style);
        const liteOperation = operationForStyle(liteStyle, catalog);
        return {
          style: liteStyle,
          width: finiteNumber(lite.width, 30),
          handing: normalizeHanding(liteOperation, sections[index]?.handing, defaultSide(index, nestedLites.length)),
          reinforcement: supportsReinforcement(liteOperation) && hasReinforcement(lite.adders),
        };
      })
    : defaultDraft.lites;
  const operations = draftOperations({ type, style, lites }, catalog);

  const kindOf = (item: Record<string, unknown>) => String(item.kind || "");
  const jamb = accessories.find((item) => kindOf(item) === "wood_jamb" || kindOf(item) === "pvc_jamb");
  const jambKind: Draft["jamb_kind"] = jamb ? kindOf(jamb) as JambKind : "none";
  const brickmould = accessories.find((item) => kindOf(item) === "brickmould");
  const flange = accessories.some((item) => kindOf(item) === "misc" && /nailing flange/i.test(String(item.name || "")));
  const elevation = ELEVATIONS.find((item) => item.value === saved?.elevation)?.value || "";

  return {
    ...defaultDraft,
    width: finiteNumber(type === "bay_bow" ? bayWidth : source.width, defaultDraft.width as number),
    height: finiteNumber(source.height, defaultDraft.height as number),
    qty: finiteNumber(raw.qty, defaultDraft.qty as number),
    colour_ext: String(source.colour_ext || raw.colour_ext || defaultDraft.colour_ext),
    colour_int: String(source.colour_int || raw.colour_int || defaultDraft.colour_int),
    loe180: Boolean(glazing.loe180),
    i89: Boolean(glazing.i89),
    gas: String(glazing.gas || defaultDraft.gas),
    triple: Boolean(glazing.triple),
    tri_pane_lami: Boolean(glazing.tri_pane_lami),
    frost_tint: Boolean(glazing.frost_tint),
    handing: normalizeHanding(operation, sections[0]?.handing),
    reinforcement: type === "window" && supportsReinforcement(operation) && hasReinforcement(source.adders),
    lites,
    jamb_kind: jambKind,
    jamb_name: jamb && jambKind !== "none" ? resolveJambName(catalog, jambKind, String(jamb.name || "")) : defaultDraft.jamb_name,
    brickmould: Boolean(brickmould),
    brickmould_name: brickmould ? String(brickmould.name || DEFAULT_BRICKMOULD) : defaultDraft.brickmould_name,
    nailing_flange: flange,
    // Lines saved before order details existed fall back to the defaults.
    jamb_finish: saved?.jamb_finish || defaultDraft.jamb_finish,
    screen: saved ? Boolean(saved.screen) : defaultScreen(operations),
    screen_frame: saved?.screen?.frame_colour || defaultDraft.screen_frame,
    screen_mesh: saved?.screen?.mesh_colour || defaultDraft.screen_mesh,
    hardware: saved ? saved.hardware || "" : defaultHardware(operations),
    spacer: saved?.spacer || defaultDraft.spacer,
    tag: saved?.tag || "",
    elevation,
    notes: saved?.notes || "",
    sliding_ft: finiteNumber(raw.nominal_ft, defaultDraft.sliding_ft),
    swing_kind: String(raw.kind || defaultDraft.swing_kind),
    head_seat: String(raw.head_seat || defaultDraft.head_seat),
    lite_count: nestedLites.length || defaultDraft.lite_count,
  };
}

function descriptionForUpdatedSpec(
  line: CustomerWindowLine,
  nextSpec: QuoteLineInput,
  nextDetails: WindowDetails | null | undefined,
  catalog: QuoteCatalog | null,
  description = line.description,
) {
  const existingDescription = description.trim();
  const generatedDescription = describeWindowSpec(line.spec, catalog, line.details);
  return existingDescription === generatedDescription.trim()
    ? describeWindowSpec(nextSpec, catalog, nextDetails)
    : description;
}

function money(n: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function glazingFor(draft: Draft) {
  return {
    loe180: draft.loe180,
    i89: draft.i89,
    gas: draft.gas,
    triple: draft.triple,
    tri_pane_lami: draft.tri_pane_lami,
    frost_tint: draft.frost_tint,
  };
}

function windowLine(
  draft: Draft,
  lite: Pick<LiteDraft, "style" | "width" | "reinforcement">,
  qty: NumericInputValue = 1,
  accessories: Accessory[] = [],
  catalog?: QuoteCatalog | null,
): QuoteLineInput {
  const reinforced = lite.reinforcement && supportsReinforcement(operationForStyle(lite.style, catalog));
  return {
    type: "window",
    style: lite.style,
    width: lite.width,
    height: draft.height,
    qty,
    colour_ext: draft.colour_ext,
    colour_int: draft.colour_int,
    glazing: glazingFor(draft),
    adders: reinforced ? [SASH_REINFORCEMENT] : [],
    accessories,
  };
}

/** Jamb, brickmould and nailing flange as engine accessories. */
function trimAccessories(draft: Draft, linealFt?: number): Accessory[] {
  const accessories: Accessory[] = [];
  if (draft.jamb_kind !== "none" && draft.jamb_name) accessories.push({ kind: draft.jamb_kind, name: draft.jamb_name });
  if (draft.brickmould && draft.brickmould_name) accessories.push({ kind: "brickmould", name: draft.brickmould_name });
  if (draft.nailing_flange) accessories.push({ kind: "misc", name: NAILING_FLANGE });
  return linealFt == null ? accessories : accessories.map((accessory) => ({ ...accessory, lineal_ft: linealFt }));
}

/**
 * Overall assembly width, rounded to the nearest 1/8": Window City sizes mulled
 * lites a hair under nominal (47.975 + 23.975 on a 72" frame) and bills trim on
 * the nominal frame (23.00 ft for 72 x 66). The CRM rounds the same way.
 */
function combinationWidth(lites: LiteDraft[]): NumericInputValue {
  if (lites.some((lite) => lite.width === "")) return "";
  return Math.round(lites.reduce((total, lite) => total + (lite.width as number), 0) * 8) / 8;
}

function toQuoteLine(draft: Draft, catalog: QuoteCatalog | null): QuoteLineInput {
  if (draft.type === "window") {
    return windowLine(draft, draft, draft.qty, trimAccessories(draft), catalog);
  }

  if (draft.type === "combination") {
    // Window City bills trim once around the whole assembly: lite 1 carries
    // it with the assembly perimeter, the other lites carry none.
    const overallWidth = combinationWidth(draft.lites);
    const linealFt = overallWidth === "" || draft.height === "" ? undefined : round2((2 * (overallWidth + draft.height)) / 12);
    return {
      type: "combination",
      qty: draft.qty,
      layout: { cols: draft.lites.length, rows: 1 },
      lites: draft.lites.map((lite, index) => windowLine(draft, lite, 1, index === 0 ? trimAccessories(draft, linealFt) : [], catalog)),
    };
  }

  if (draft.type === "patio_sliding") {
    return {
      type: "patio_sliding",
      qty: draft.qty,
      nominal_ft: draft.sliding_ft,
      colour_ext: draft.colour_ext,
      colour_int: draft.colour_int,
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
    windowLine(draft, {
      width: liteWidth,
      style: catalog?.styles[index % Math.max(catalog.styles.length, 1)]?.code || draft.style,
      reinforcement: false,
    })
  );
  return {
    type: "bay_bow",
    qty: draft.qty,
    lites,
    head_seat: draft.head_seat,
  };
}

/** Presentation-only order details; never part of the priced spec. */
function toWindowDetails(draft: Draft, catalog: QuoteCatalog | null): WindowDetails {
  const common: WindowDetails = {
    tag: draft.tag.trim() || null,
    elevation: draft.elevation || null,
    notes: draft.notes.trim() || null,
  };
  if (draft.type !== "window" && draft.type !== "combination") return common;
  const operation = operationForStyle(draft.style, catalog);
  const sections = draft.type === "window"
    ? [{ operation, handing: normalizeHanding(operation, draft.handing) }]
    : draft.lites.map((lite, index) => {
        const liteOperation = operationForStyle(lite.style, catalog);
        return { operation: liteOperation, handing: normalizeHanding(liteOperation, lite.handing, defaultSide(index, draft.lites.length)) };
      });
  return {
    ...common,
    sections,
    screen: draft.screen ? { frame_colour: draft.screen_frame || null, mesh_colour: draft.screen_mesh || null } : null,
    hardware: draft.hardware.trim() || null,
    spacer: draft.spacer || null,
    jamb_finish: draft.jamb_kind !== "none" ? draft.jamb_finish.trim() || null : null,
  };
}

/** Fill an unset opening number with the line's 1-based position in the project. */
function withDefaultTag(details: WindowDetails | null | undefined, position: number): WindowDetails {
  return { ...(details || {}), tag: details?.tag?.trim() || String(position) };
}

function sameLine(line: QuoteLineDraft | undefined, spec: QuoteLineInput, details: WindowDetails) {
  return Boolean(line)
    && JSON.stringify(line?.spec) === JSON.stringify(spec)
    && JSON.stringify(line?.details ?? null) === JSON.stringify(details);
}

function lineLabel(line: QuoteLineInput) {
  const lites = Array.isArray(line.lites) ? line.lites.map(recordValue) : [];
  if (line.type === "window") return `${line.style} ${line.width}×${line.height}`;
  if (line.type === "patio_sliding") return `WC-500 ${line.nominal_ft}' sliding patio door`;
  if (line.type === "patio_swing") return `${line.kind} swing patio door ${line.width}×${line.height}`;
  if (line.type === "combination") {
    const width = Math.round(lites.reduce((total, lite) => total + finiteNumber(lite.width, 0), 0) * 1000) / 1000;
    const styles = lites.map((lite) => String(lite.style || "?")).join(" + ");
    return `${lites.length}-lite combination ${styles} ${width}×${lites[0]?.height ?? ""}`;
  }
  return `Bay/bow (${lites.length} lites)`;
}

function tagPrefix(details: WindowDetails | null | undefined) {
  return details?.tag ? `#${details.tag} · ` : "";
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

/** Operation, handing and sash reinforcement for one section (lite) of a window. */
function SectionOptions({
  operation,
  handing,
  reinforcement,
  onHanding,
  onReinforcement,
}: {
  operation: WindowOperation;
  handing: WindowHanding;
  reinforcement: boolean;
  onHanding: (value: "left" | "right") => void;
  onReinforcement: (value: boolean) => void;
}) {
  return (
    <>
      {hasSideHanding(operation) ? (
        <Field label={handingLabel(operation)}>
          <select className="input" value={handing === "right" ? "right" : "left"} onChange={(e) => onHanding(e.target.value as "left" | "right")}>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </Field>
      ) : (
        <div className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Operation</span>
          <p className="py-2 text-slate-600">{OPERATION_LABELS[operation]}{operation === "awning" ? " · hinged at top" : ""}</p>
        </div>
      )}
      {supportsReinforcement(operation) ? (
        <div className="flex items-end pb-2"><Toggle label="Sash reinforcement" value={reinforcement} onChange={onReinforcement} /></div>
      ) : null}
    </>
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

export default function QuoteBuilder({ projectId, editWindowId, editWindows = false }: { projectId?: string; editWindowId?: string; editWindows?: boolean }) {
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
  const [hydratedEditId, setHydratedEditId] = useState<string | null>(null);
  const [selectedEditLineId, setSelectedEditLineId] = useState<string | null>(editWindowId || null);
  const autoPriceRequestRef = useRef(0);
  const editMode = Boolean(editWindows || editWindowId);

  useEffect(() => {
    Promise.all([fetchQuoteCatalog(), fetchSalesPresets()])
      .then(([catalogPayload, salesPayload]) => {
        setCatalog(catalogPayload);
        setSalesPresets(salesPayload.presets);
        if (!editMode) {
          // Edit mode hydrates the draft from the saved line; a late catalog
          // response (e.g. the dev double-fetch) must not overwrite its style.
          setDraft((current) => withStyle(current, catalogPayload.styles[0]?.code || current.style, catalogPayload));
          const standard = salesPayload.presets.find((preset) => preset.id === "standard") || salesPayload.presets[0];
          if (standard) {
            setSelectedPresetId(standard.id);
            setNegotiatedDiscount(standard.default_discount_percent);
          }
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

  const editHydrationKey = editMode && project ? `${project.id}:${editWindowId || "all"}` : null;
  const editingLine = useMemo(
    () => editMode && selectedEditLineId ? lines.find((line) => line.id === selectedEditLineId) || null : null,
    [editMode, lines, selectedEditLineId],
  );

  useEffect(() => {
    if (!editMode) {
      setHydratedEditId(null);
      setSelectedEditLineId(null);
      return;
    }
    if (!project || !catalog || !editHydrationKey || hydratedEditId === editHydrationKey) return;
    if (!project.windows.length) {
      setError("This project does not have any saved window lines to edit.");
      setHydratedEditId(editHydrationKey);
      return;
    }
    const requestedLine = editWindowId ? project.windows.find((line) => line.id === editWindowId) : null;
    if (editWindowId && !requestedLine) {
      setError("The selected window line could not be found in this project.");
      setHydratedEditId(editHydrationKey);
      return;
    }
    const loadedLines: QuoteLineDraft[] = project.windows.map((line) => ({
      id: line.id,
      location: line.location,
      description: line.description,
      spec: line.spec,
      details: line.details ?? null,
    }));
    const selectedLine = requestedLine || project.windows[0];
    setLines(loadedLines);
    setSelectedEditLineId(selectedLine.id);
    setDraft(draftFromSpec(selectedLine.spec, catalog, selectedLine.details));
    setSelectedPresetId(project.commercial.preset_id || "standard");
    setNegotiatedDiscount(project.commercial.negotiated_discount_percent || 0);
    setResult(null);
    setHydratedEditId(editHydrationKey);
  }, [catalog, editMode, editHydrationKey, editWindowId, hydratedEditId, project]);

  const currentLine = useMemo(() => toQuoteLine(draft, catalog), [draft, catalog]);
  const currentDetails = useMemo(() => toWindowDetails(draft, catalog), [draft, catalog]);
  const combinationSuggestion = useMemo(
    () => getCombinationSuggestion(catalog?.styles.find((style) => style.code === draft.style), draft.width, draft.height),
    [catalog, draft.style, draft.width, draft.height],
  );
  const selectedPreset = useMemo(
    () => salesPresets.find((preset) => preset.id === selectedPresetId) || salesPresets[0],
    [salesPresets, selectedPresetId]
  );
  const autoPricingDiscountLimit = selectedPreset?.max_discount_percent ?? Number.POSITIVE_INFINITY;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  function patchDraft(change: (current: Draft) => Draft) {
    setDraft(change);
    setResult(null);
  }

  function updateLite(index: number, patch: Partial<LiteDraft>) {
    patchDraft((current) => withLites(current, current.lites.map((lite, liteIndex) => liteIndex === index ? { ...lite, ...patch } : lite), catalog));
  }

  function addLite() {
    patchDraft((current) => {
      if (current.lites.length >= MAX_COMBINATION_LITES) return current;
      const last = current.lites[current.lites.length - 1];
      const lites = [...current.lites, liteDraft(last?.style || current.style, last?.width ?? 30, current.lites.length, current.lites.length + 1, catalog)];
      return withLites(current, lites, catalog);
    });
  }

  function removeLite(index: number) {
    patchDraft((current) => current.lites.length <= MIN_COMBINATION_LITES
      ? current
      : withLites(current, current.lites.filter((_, liteIndex) => liteIndex !== index), catalog));
  }

  const draftIsValid =
    isAtLeast(draft.qty, 1) &&
    (draft.type === "patio_sliding" ||
      (draft.type === "combination"
        ? isAtLeast(draft.height, 1) &&
          draft.lites.length >= MIN_COMBINATION_LITES &&
          draft.lites.length <= MAX_COMBINATION_LITES &&
          draft.lites.every((lite) => isAtLeast(lite.width, 1))
        : isAtLeast(draft.width, 1) &&
          isAtLeast(draft.height, 1) &&
          (draft.type !== "bay_bow" || isBetween(draft.lite_count, 3, 6))));

  // Opening numbers default to the line's position in the project list.
  const selectedEditIndex = editMode ? lines.findIndex((line) => line.id === selectedEditLineId) : -1;
  const defaultTag = String(editMode
    ? (selectedEditIndex >= 0 ? selectedEditIndex + 1 : lines.length + 1)
    : (project?.windows.length ?? 0) + lines.length + 1);

  function addLine() {
    if (!draftIsValid) return;
    setLines((current) => [
      ...current,
      { id: newEstimateLineId("window"), spec: currentLine, details: currentDetails, location: "", description: describeWindowSpec(currentLine, catalog, currentDetails) },
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

  function selectEditLine(lineId: string) {
    if (!editMode || !catalog || lineId === selectedEditLineId) return;
    const nextLine = lines.find((line) => line.id === lineId);
    if (!nextLine) return;
    if (selectedEditLineId && draftIsValid) {
      setLines((current) => current.map((line) => line.id === selectedEditLineId ? { ...line, spec: currentLine, details: currentDetails } : line));
    }
    setSelectedEditLineId(lineId);
    setDraft(draftFromSpec(nextLine.spec, catalog, nextLine.details));
    setResult(null);
  }

  async function generateQuote() {
    if (!editMode && !lines.length && !draftIsValid) {
      setError("Enter a valid quantity and dimensions before generating the quote.");
      return;
    }
    const savedSpecs = lines.map((line) => line.spec);
    const currentAlreadyAdded = sameLine(lines[lines.length - 1], currentLine, currentDetails);
    const payload = editMode
      ? lines.map((line) => line.id === selectedEditLineId ? currentLine : line.spec)
      : currentAlreadyAdded ? savedSpecs : [...savedSpecs, currentLine];
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
       if (editMode) {
         setLines((current) => current.map((line, index) => ({
           ...line,
           spec: payload[index],
           details: line.id === selectedEditLineId ? currentDetails : line.details,
         })));
       } else {
         setLines((current) => payload.map((spec, index) => {
           // Past the saved lines, the payload's extra entry is the current draft.
           const details = index < current.length ? current[index].details : currentDetails;
           return {
             id: current[index]?.id || newEstimateLineId("window"),
             location: current[index]?.location || "",
             description: current[index]?.description || describeWindowSpec(spec, catalog, details),
             spec,
             details,
           };
         }));
       }
       setResult(priced);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not price the quote.");
    } finally {
      setPricing(false);
    }
  }

  // Keep the FastAPI price preview in sync with every valid window selection.
  // The short debounce prevents number inputs and rapid option changes from
  // producing a request for every keystroke.
  useEffect(() => {
    const requestId = ++autoPriceRequestRef.current;
    if (!catalog || !draftIsValid) {
      setPricing(false);
      return;
    }
    if (editMode && (!editingLine || hydratedEditId !== editHydrationKey)) {
      setPricing(false);
      return;
    }

    const savedSpecs = lines.map((line) => line.spec);
    const currentAlreadyAdded = sameLine(lines[lines.length - 1], currentLine, currentDetails);
    const payload = editMode
      ? lines.map((line) => line.id === selectedEditLineId ? currentLine : line.spec)
      : currentAlreadyAdded ? savedSpecs : [...savedSpecs, currentLine];
    if (!payload.length) return;

    const requested = Math.max(0, negotiatedDiscount);
    if (requested > autoPricingDiscountLimit + 1e-9 && !overrideReason.trim()) {
      setPricing(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setPricing(true);
      priceDeterministicQuote({
        lines: payload,
        commercial: {
          preset_id: selectedPreset?.id || selectedPresetId,
          negotiated_discount_percent: requested,
          manager_override_reason: requested > autoPricingDiscountLimit + 1e-9 ? overrideReason.trim() : undefined,
          presentation_mode: "internal",
        },
      })
        .then((priced) => {
          if (autoPriceRequestRef.current !== requestId) return;
          setResult(priced);
          setError(null);
        })
        .catch(() => {
          // An incomplete/intermediate selection should not replace the last
          // useful price with a validation error while the user is typing.
        })
        .finally(() => {
          if (autoPriceRequestRef.current === requestId) setPricing(false);
        });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [autoPricingDiscountLimit, catalog, currentDetails, currentLine, draftIsValid, editHydrationKey, editMode, editingLine, hydratedEditId, lines, negotiatedDiscount, overrideReason, selectedEditLineId, selectedPreset, selectedPresetId]);

  async function saveEditedWindows() {
    if (!projectId || !project || !editMode || !editingLine || project.status === "finalized" || !result) return;
    if (stale) {
      setError("Regenerate the quote after changing the discount before saving the windows.");
      return;
    }
    setHandoffBusy(true);
    setHandoffEstimateId(null);
    setError(null);
    const updatedWindows = project.windows.map((line, index) => {
      const bufferedLine = lines.find((item) => item.id === line.id);
      const nextSpec = line.id === selectedEditLineId ? currentLine : bufferedLine?.spec || line.spec;
      const nextDetails = line.id === selectedEditLineId ? currentDetails : bufferedLine ? bufferedLine.details : line.details;
      const nextDescription = descriptionForUpdatedSpec(
        line,
        nextSpec,
        nextDetails,
        catalog,
        bufferedLine ? bufferedLine.description : line.description,
      );
      return { ...line, description: nextDescription, spec: nextSpec, details: withDefaultTag(nextDetails, index + 1) };
    });
    const draftPayload: CustomerEstimateDraft = {
      customer_name: project.customer_name,
      company_name: project.company_name,
      email: project.email,
      phone: project.phone,
      project_name: project.project_name,
      project_address: project.project_address,
      salesperson: project.salesperson,
      estimate_date: project.estimate_date,
      valid_until: project.valid_until,
      description: project.description,
      notes: project.notes,
      terms: project.terms,
      windows: updatedWindows,
      doors: project.doors,
      commercial: {
        ...project.commercial,
        preset_id: result.sales_pricing.preset_id || project.commercial.preset_id,
        negotiated_discount_percent: result.sales_pricing.negotiated_discount_percent,
        manager_override_reason: result.sales_pricing.manager_override_reason || undefined,
        presentation_mode: "internal",
      },
    };
    try {
      const saved = await updateCustomerEstimate(project.id, draftPayload);
      try {
        const priced = await priceCustomerEstimate(saved.id);
        window.location.href = `/projects/${priced.id}`;
      } catch (pricingError) {
        setHandoffEstimateId(saved.id);
        setError(pricingError instanceof Error ? `Window changes saved, but project pricing needs attention: ${pricingError.message}` : "Window changes saved, but project pricing needs attention.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the edited window lines.");
    } finally {
      setHandoffBusy(false);
    }
  }

  async function sendToProjectEstimate() {
    if (!projectId || !project || project.status === "finalized" || !result || (!lines.length && !editingLine)) return;
    if (editMode && editingLine) {
      await saveEditedWindows();
      return;
    }
    setHandoffBusy(true);
    setHandoffEstimateId(null);
    setError(null);
    const windows: CustomerWindowLine[] = lines.map((line, index) => ({
      id: line.id,
      location: line.location,
      description: line.description,
      spec: line.spec,
      details: withDefaultTag(line.details, project.windows.length + index + 1),
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

  const singleOperation = operationForStyle(draft.style, catalog);
  const trimmed = draft.type === "window" || draft.type === "combination";
  const woodJambOptions = withCurrent(jambOptions(catalog, "wood_jamb"), draft.jamb_kind === "wood_jamb" ? draft.jamb_name : "");
  const pvcJambOptions = withCurrent(jambOptions(catalog, "pvc_jamb"), draft.jamb_kind === "pvc_jamb" ? draft.jamb_name : "");
  const brickmouldChoices = withCurrent(brickmouldOptions(catalog), draft.brickmould_name);
  const comboWidth = combinationWidth(draft.lites);
  const comboLinealFt = comboWidth === "" || draft.height === "" ? null : round2((2 * (comboWidth + draft.height)) / 12);

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
  const visibleLines: QuoteLineDraft[] = lines;
  const customerLines = Array.isArray(cp.lines)
    ? (cp.lines as Array<{ line: number; type: string; qty: number; unit_price: number; line_total: number }>).map((line, index) => ({
        ...line,
        location: visibleLines[index]?.location || "",
        description: visibleLines[index]?.description || (visibleLines[index]
          ? describeWindowSpec(visibleLines[index].spec, catalog, visibleLines[index].details)
          : describeWindowSpec(currentLine, catalog, currentDetails)),
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
  if (editMode && editHydrationKey && hydratedEditId === editHydrationKey && !editingLine) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700"><p>{error || "The project does not have any saved window lines to edit."}</p><Link href={`/projects/${project.id}`} className="mt-3 inline-block font-semibold underline">Open project</Link></div>;
  }

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
        <div><span className="text-brand-700">{editMode ? "Editing windows in " : "Assigning this quote to "}</span><strong className="text-brand-900">{project.project_name || project.customer_name || "Selected project"}</strong>{project.estimate_number ? <span className="ml-2 text-xs text-brand-700">{project.estimate_number}</span> : null}</div>
        <Link href={`/projects/${project.id}`} className="font-semibold text-brand-700 hover:underline">Open project</Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        {presentationMode === "internal" ? (
        <section className="space-y-6 lg:col-span-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{editMode ? "Edit catalog-backed window quotes" : "Build a catalog-backed window quote"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {editMode ? "All saved window lines are loaded below. Select a line to prefill its options, change the product, then generate and save the complete window set back to this project." : "Prices come from Window City v18 with component traceability. Unsupported options are flagged for review."}
            </p>

          {loading ? <p className="mt-6 text-sm text-slate-500">Loading price-book catalog…</p> : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Line type">
              <select className="input" value={draft.type} onChange={(e) => { const type = e.target.value as QuoteLineType; patchDraft((current) => withType(current, type, catalog)); }}>
                <option value="window">Window</option>
                <option value="combination">Combination</option>
                <option value="patio_sliding">Sliding patio door</option>
                <option value="patio_swing">Swing patio door</option>
                <option value="bay_bow">Bay / bow assembly</option>
              </select>
            </Field>

            {(draft.type === "window" || draft.type === "bay_bow") && (
              <Field label="Window style">
                <select className="input" value={draft.style} onChange={(e) => { const style = e.target.value; patchDraft((current) => withStyle(current, style, catalog)); }}>
                  {catalog ? groupWindowStyles(catalog.styles).map((group) => (
                    <optgroup key={group.collection} label={group.label}>
                      {group.styles.map((style) => <option key={style.code} value={style.code}>{windowStyleLabel(style)}</option>)}
                    </optgroup>
                  )) : null}
                </select>
              </Field>
            )}

            {draft.type === "window" ? (
              <SectionOptions
                operation={singleOperation}
                handing={draft.handing}
                reinforcement={draft.reinforcement}
                onHanding={(value) => update("handing", value)}
                onReinforcement={(value) => update("reinforcement", value)}
              />
            ) : null}

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

            {draft.type !== "patio_sliding" && draft.type !== "combination" ? (
              <Field label="Width (in)"><input className="input" type="number" min={1} step={0.125} value={draft.width} onChange={(e) => update("width", numericInputValue(e.target.value))} /></Field>
            ) : null}
            {draft.type !== "patio_sliding" ? (
              <Field label="Height (in)"><input className="input" type="number" min={1} step={0.125} value={draft.height} onChange={(e) => update("height", numericInputValue(e.target.value))} /></Field>
            ) : null}

            <Field label="Quantity"><input className="input" type="number" min={1} step={1} value={draft.qty} onChange={(e) => update("qty", numericInputValue(e.target.value))} /></Field>
            <Field label="Exterior colour">
              <select className="input" value={draft.colour_ext} onChange={(e) => update("colour_ext", e.target.value)}>
                {withCurrent(COLORS, draft.colour_ext).map((color) => <option key={color} value={color}>{color}</option>)}
              </select>
            </Field>
            {draft.type !== "patio_swing" ? (
              <Field label="Interior colour">
                <select className="input" value={draft.colour_int} onChange={(e) => update("colour_int", e.target.value)}>
                  {withCurrent(COLORS, draft.colour_int).map((color) => <option key={color} value={color}>{color}</option>)}
                </select>
              </Field>
            ) : null}
            {draft.type === "window" && combinationSuggestion ? <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p className="font-semibold">This {combinationSuggestion.styleCode} size may be a two-lite combination.</p><p className="mt-1">For {combinationSuggestion.overallWidth} × {combinationSuggestion.height} overall, price two {combinationSuggestion.styleCode} lites at {combinationSuggestion.liteWidth} × {combinationSuggestion.height} each.</p><button type="button" className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100" onClick={() => patchDraft((current) => withLites(withType(current, "combination", catalog), [0, 1].map((index) => liteDraft(current.style, combinationSuggestion.liteWidth, index, 2, catalog)), catalog))}>Use two-lite combination</button></div> : null}
          </div>

          {draft.type === "combination" ? (
            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">Lites, left to right (viewed from outside)</p>
                <span className="text-xs text-slate-500">Overall {comboWidth === "" ? "—" : comboWidth} × {draft.height === "" ? "—" : draft.height} in</span>
              </div>
              <div className="space-y-3">
                {draft.lites.map((lite, index) => {
                  const operation = operationForStyle(lite.style, catalog);
                  return (
                    <div key={index} className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lite {index + 1}</p>
                        {draft.lites.length > MIN_COMBINATION_LITES ? <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeLite(index)}>Remove lite</button> : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Style">
                          <select className="input" value={lite.style} onChange={(e) => updateLite(index, { style: e.target.value })}>
                            {catalog ? groupWindowStyles(catalog.styles).map((group) => (
                              <optgroup key={group.collection} label={group.label}>
                                {group.styles.map((style) => <option key={style.code} value={style.code}>{windowStyleLabel(style)}</option>)}
                              </optgroup>
                            )) : <option value={lite.style}>{lite.style}</option>}
                          </select>
                        </Field>
                        <Field label="Width (in)"><input className="input" type="number" min={1} step={0.125} value={lite.width} onChange={(e) => updateLite(index, { width: numericInputValue(e.target.value) })} /></Field>
                        <SectionOptions
                          operation={operation}
                          handing={lite.handing}
                          reinforcement={lite.reinforcement}
                          onHanding={(value) => updateLite(index, { handing: value })}
                          onReinforcement={(value) => updateLite(index, { reinforcement: value })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60" onClick={addLite} disabled={draft.lites.length >= MAX_COMBINATION_LITES}>Add lite</button>
              <p className="mt-2 text-xs text-slate-500">Height, colours and glazing are shared by every lite. Up to {MAX_COMBINATION_LITES} lites in one row.</p>
            </div>
          ) : null}

          {draft.type !== "bay_bow" ? (
            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Glazing</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle label="LoE 180" value={draft.loe180} onChange={(value) => update("loe180", value)} />
                <Toggle label="i89" value={draft.i89} onChange={(value) => update("i89", value)} />
                <Toggle label="Triple pane" value={draft.triple} onChange={(value) => update("triple", value)} />
                <Toggle label="Tri-pane laminated" value={draft.tri_pane_lami} onChange={(value) => update("tri_pane_lami", value)} />
                <Toggle label="Frost / tint" value={draft.frost_tint} onChange={(value) => update("frost_tint", value)} />
                <Field label="Gas"><select className="input" value={draft.gas} onChange={(e) => update("gas", e.target.value)}>{withCurrent(GAS, draft.gas).map((gas) => <option key={gas} value={gas}>{gas}</option>)}</select></Field>
              </div>
            </div>
          ) : null}

          {trimmed ? (
            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Trim</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Jamb">
                  <select
                    className="input"
                    value={draft.jamb_kind === "none" ? "none" : `${draft.jamb_kind}::${draft.jamb_name}`}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "none") {
                        update("jamb_kind", "none");
                        return;
                      }
                      const [kind, ...name] = value.split("::");
                      patchDraft((current) => ({ ...current, jamb_kind: kind as JambKind, jamb_name: name.join("::") }));
                    }}
                  >
                    <option value="none">No jamb</option>
                    <optgroup label="Wood jamb">
                      {woodJambOptions.map((name) => <option key={name} value={`wood_jamb::${name}`}>{name}</option>)}
                    </optgroup>
                    <optgroup label="PVC jamb">
                      {pvcJambOptions.map((name) => <option key={name} value={`pvc_jamb::${name}`}>{name}</option>)}
                    </optgroup>
                  </select>
                </Field>
                {draft.jamb_kind !== "none" ? (
                  <Field label="Jamb finish">
                    <input className="input" list="jamb-finish-options" value={draft.jamb_finish} onChange={(e) => update("jamb_finish", e.target.value)} placeholder="primed" />
                    <datalist id="jamb-finish-options">{JAMB_FINISHES.map((finish) => <option key={finish} value={finish} />)}</datalist>
                  </Field>
                ) : <div className="hidden sm:block" />}
                <div className="flex items-end pb-2"><Toggle label="Brickmould" value={draft.brickmould} onChange={(value) => update("brickmould", value)} /></div>
                {draft.brickmould ? (
                  <Field label="Brickmould profile">
                    <select className="input" value={draft.brickmould_name} onChange={(e) => update("brickmould_name", e.target.value)}>
                      {brickmouldChoices.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </Field>
                ) : <div className="hidden sm:block" />}
                <Toggle label="Nailing flange" value={draft.nailing_flange} onChange={(value) => update("nailing_flange", value)} />
              </div>
              {draft.type === "combination" ? <p className="mt-3 text-xs text-slate-500">Trim is billed once around the whole assembly{comboLinealFt != null ? ` (${comboLinealFt} lf)` : ""} and carried on lite 1.</p> : null}
            </div>
          ) : null}

          {draft.type === "bay_bow" ? (
            <div className="mt-6 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
              <Field label="Lite count"><input className="input" type="number" min={3} max={6} value={draft.lite_count} onChange={(e) => update("lite_count", numericInputValue(e.target.value))} /></Field>
              <Field label="Head / seat"><select className="input" value={draft.head_seat} onChange={(e) => update("head_seat", e.target.value)}>{catalog?.baybow.head_seat_sizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></Field>
            </div>
          ) : null}

          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Order details</p>
            <p className="mb-3 mt-1 text-xs text-slate-500">Printed on the estimate and the manufacturer order. These do not change the price.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Opening #"><input className="input" value={draft.tag} onChange={(e) => update("tag", e.target.value)} placeholder={defaultTag} /></Field>
              <Field label="Elevation">
                <select className="input" value={draft.elevation} onChange={(e) => update("elevation", e.target.value as Draft["elevation"])}>
                  <option value="">Not set</option>
                  {ELEVATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              {trimmed ? (
                <>
                  <div className="flex items-end pb-2 sm:col-span-2"><Toggle label="Screen" value={draft.screen} onChange={(value) => update("screen", value)} /></div>
                  {draft.screen ? (
                    <>
                      <Field label="Screen frame colour">
                        <select className="input" value={draft.screen_frame} onChange={(e) => update("screen_frame", e.target.value)}>
                          {withCurrent(COLORS, draft.screen_frame).map((color) => <option key={color} value={color}>{color}</option>)}
                        </select>
                      </Field>
                      <Field label="Screen mesh colour">
                        <select className="input" value={draft.screen_mesh} onChange={(e) => update("screen_mesh", e.target.value)}>
                          {withCurrent(SCREEN_MESH_COLOURS, draft.screen_mesh).map((color) => <option key={color} value={color}>{color}</option>)}
                        </select>
                      </Field>
                    </>
                  ) : null}
                  <Field label="Hardware">
                    <input className="input" list="hardware-options" value={draft.hardware} onChange={(e) => update("hardware", e.target.value)} placeholder="None" />
                    <datalist id="hardware-options">{HARDWARE_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
                  </Field>
                  <Field label="Spacer">
                    <select className="input" value={draft.spacer} onChange={(e) => update("spacer", e.target.value)}>
                      {withCurrent(SPACERS, draft.spacer).map((spacer) => <option key={spacer} value={spacer}>{spacer}</option>)}
                    </select>
                  </Field>
                </>
              ) : null}
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">Notes</span>
                <textarea className="input" rows={2} value={draft.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Order notes for this opening" />
              </label>
            </div>
          </div>

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
                <p className="mt-3 text-xs text-slate-500">Your FastAPI price will appear automatically, then you can enter the discount in dollars or as a total customer price.</p>
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
                  Price is updating for the changed discount…
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
            {!editMode ? <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" onClick={addLine} disabled={!draftIsValid}>Add window to project list</button> : null}
            <button type="button" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60" onClick={generateQuote} disabled={pricing || loading || !draftIsValid}>{pricing ? "Updating price…" : "Refresh price"}</button>
          </div>
        </div>

        {lines.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
             <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-slate-900">{editMode ? "Project windows" : "Window quote lines"}</h2><span className="text-sm text-slate-500">{lines.length} line{lines.length === 1 ? "" : "s"}</span></div>
            <div className="mt-4 space-y-2">
               {lines.map((line, index) => <div key={line.id} className={`rounded-lg px-3 py-3 text-sm ${editMode && line.id === selectedEditLineId ? "border border-brand-300 bg-brand-50" : "bg-slate-50"}`}>
                 <div className="flex items-center justify-between gap-3"><div><button type="button" className={`font-medium ${editMode ? "text-left text-brand-800 hover:underline" : "text-slate-800"}`} onClick={() => editMode ? selectEditLine(line.id) : undefined}>{tagPrefix(line.details)}{line.description || lineLabel(line.spec)}</button>{line.description ? <p className="mt-1 text-xs text-slate-500">{lineLabel(line.spec)}</p> : null}</div>{editMode ? <span className="text-xs font-semibold text-brand-700">{line.id === selectedEditLineId ? "Editing" : "Select to edit"}</span> : <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeLine(index)}>Remove</button>}</div>
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
              <p className="mt-1 text-sm text-slate-500">{editMode ? `Save all ${lines.length} window line${lines.length === 1 ? "" : "s"} back to the same estimate. Select a line from the project windows list to edit its options.` : `Assign all ${lines.length} added window line${lines.length === 1 ? "" : "s"} to the selected project. Existing door and window lines stay in the same project.`}</p>
              {project.status === "finalized" ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">This project is finalized and cannot accept new quote lines.</p> : null}
              <button type="button" className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" onClick={sendToProjectEstimate} disabled={handoffBusy || (!lines.length && !editingLine) || project.status === "finalized"}>{handoffBusy ? (editMode ? "Saving changes…" : "Saving windows…") : editMode ? "Save window changes" : `Save ${lines.length || "all"} window${lines.length === 1 ? "" : "s"} to project`}</button>
              {handoffEstimateId ? <p className="mt-3 text-xs text-rose-700">{editMode ? "The window changes were saved." : "The quote was assigned."} <Link href={`/projects/${handoffEstimateId}`} className="font-semibold underline">Open project</Link> to resolve the pricing issue.</p> : null}
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
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm">Choose valid window options to see the live FastAPI component breakdown, review warnings, and customer total.</div>
        )}
      </aside>
      </div>
    </div>
  );
}
