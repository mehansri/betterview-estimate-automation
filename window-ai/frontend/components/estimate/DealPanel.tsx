"use client";

import { ReactNode, useEffect, useState } from "react";
import { DeterministicQuoteResponse, PresentationMode, SalesPreset } from "@/lib/api";
import { marginTone } from "@/components/estimate/ProfitPanel";

type SalesPricing = DeterministicQuoteResponse["sales_pricing"];
type NegotiationMode = "percent" | "dollars" | "price";

/** Priced figures for the whole quote; cost is dealer (or material) plus installation. */
export type DealTotals = { cost: number; profit: number; sell: number; hst: number; customerTotal: number; list?: number | null };
export type DealCustomerLine = { key: string; label: string; detail?: string; total: number };
/** Manager approval inputs for a discount over the limit (windows only today). */
export type DealOverride = { reason: string; token: string; onReason: (value: string) => void; onToken: (value: string) => void; applied: boolean };

export function presetLabel(preset: SalesPreset) {
  if (preset.strategy === "sliding_margin" && preset.sliding) {
    return `${preset.name} · ${preset.sliding.start_margin_percent}% → ${preset.sliding.end_margin_percent}% ${preset.sliding.basis}`;
  }
  return `${preset.name} · ${preset.markup_percent}% markup`;
}

/** Bordered field; `.input` alone is unstyled on some pages. */
const FIELD = "input rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";

function money(value: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(value || 0);
}

function Row({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "border-t border-slate-200 pt-1 font-semibold" : ""}`}>
      <span className={strong ? "text-slate-800" : "text-slate-500"}>{label}{hint ? <span className="block text-[10px] font-normal text-slate-400">{hint}</span> : null}</span>
      <span className={strong ? "text-slate-900" : "font-medium text-slate-800"}>{value}</span>
    </div>
  );
}

/**
 * How the price is built, top to bottom: list → dealer cost → + install →
 * cost → + base markup → + extra profit (sliding margin or profit floor) →
 * − discount → sell, then profit and margin. Each step adds up exactly to the
 * sell price shown above, so the extra-profit line takes the rounding.
 */
export function priceBuildUp(sp: SalesPricing | null | undefined, totals: DealTotals, preset: SalesPreset | undefined, standardMarkup: number) {
  const dealer = sp?.dealer_cost ?? null;
  const install = sp?.install_cost ?? null;
  if (dealer == null || install == null) return null;
  const cost = dealer + install;
  const basePercent = (sp?.strategy ?? preset?.strategy) === "sliding_margin" ? standardMarkup : preset?.markup_percent ?? standardMarkup;
  const baseMarkup = cost * (basePercent / 100);
  const discount = sp?.merchandise_discount_amount ?? 0;
  const extra = totals.sell + discount - cost - baseMarkup;
  const list = totals.list ?? null;
  return {
    list,
    listOff: list && list > 0 ? (1 - dealer / list) * 100 : null,
    dealer,
    install,
    cost,
    basePercent,
    baseMarkup,
    extra,
    discount,
    sell: totals.sell,
    profit: totals.sell - cost,
    margin: totals.sell ? ((totals.sell - cost) / totals.sell) * 100 : 0,
    markupOnCost: cost ? ((totals.sell - cost) / cost) * 100 : 0,
  };
}

/**
 * The one place a rep reads the price and negotiates: customer total, what the
 * job costs and earns, the discount control, the walk-away price, and Save.
 * Audit and per-line costs sit in a collapsed "Details" section.
 */
export default function DealPanel({
  mode,
  sp,
  totals,
  currency = "CAD",
  presets,
  presetId,
  onPresetChange,
  discount,
  onDiscountChange,
  pricing,
  stale,
  priceError,
  emptyText,
  override,
  reviewRequired,
  details,
  customerLines,
  footer,
}: {
  mode: PresentationMode;
  sp: SalesPricing | null | undefined;
  totals: DealTotals | null;
  currency?: string;
  presets: SalesPreset[];
  presetId: string;
  onPresetChange: (presetId: string) => void;
  discount: number;
  onDiscountChange: (percent: number) => void;
  pricing: boolean;
  stale: boolean;
  priceError?: string | null;
  emptyText: string;
  override?: DealOverride;
  reviewRequired?: boolean;
  details?: ReactNode;
  customerLines?: DealCustomerLine[];
  footer: ReactNode;
}) {
  const internal = mode === "internal";
  const [negotiationMode, setNegotiationMode] = useState<NegotiationMode>("percent");
  const [text, setText] = useState("0");
  const preset = presets.find((item) => item.id === presetId) || presets[0];

  // Live negotiation preview, recomputed from the last price.
  const priced = Boolean(totals && sp && sp.base_merchandise_sell != null);
  const baseMerch = sp?.base_merchandise_sell ?? 0;
  const protectedInstall = sp?.protected_install_sell ?? 0;
  const hstRate = totals?.sell ? totals.hst / totals.sell : 0.13;
  const configuredCap = sp?.configured_max_discount_percent ?? preset?.max_discount_percent ?? 0;
  const floorCap = sp?.floor_derived_max_discount_percent ?? configuredCap;
  const allowedMax = sp?.maximum_allowed_discount_percent ?? configuredCap;
  const percent = Math.max(0, discount);
  const overLimit = percent > allowedMax + 1e-9;
  const previewDiscount = baseMerch * (percent / 100);
  const previewTotal = (baseMerch * (1 - percent / 100) + protectedInstall) * (1 + hstRate);
  const walkAway = (baseMerch * (1 - allowedMax / 100) + protectedInstall) * (1 + hstRate);
  const roomLeft = Math.max(0, previewTotal - walkAway);
  const customerTotal = totals ? (stale && priced ? previewTotal : totals.customerTotal) : 0;
  const margin = sp?.gross_margin_percent ?? (totals?.sell ? (totals.profit / totals.sell) * 100 : 0);
  // The "Standard" preset's markup is the base the extra profit is measured from.
  const standardMarkup = presets.find((item) => item.id === "standard")?.markup_percent ?? 30;
  const buildUp = totals ? priceBuildUp(sp, totals, preset, standardMarkup) : null;

  // Which limit binds: the preset's cap, or the floor (profit floor or minimum markup).
  const floorBinds = floorCap < configuredCap - 1e-9;
  const floorMarkup = sp?.profit_floor && sp.cost_basis ? (sp.profit_floor / sp.cost_basis) * 100 : null;
  const profitFloorBinds = floorMarkup != null && (sp?.minimum_markup_percent ?? 0) <= floorMarkup + 1e-6;
  const limitText = floorBinds
    ? profitFloorBinds ? `${money(sp?.profit_floor ?? 0, currency)} profit floor` : `${(sp?.minimum_markup_percent ?? 0).toFixed(1)}% minimum markup`
    : `preset cap ${configuredCap.toFixed(1)}%`;

  const status = overLimit
    ? override?.applied && !stale ? "Manager approved" : override?.reason.trim() ? "Awaiting manager" : "Over limit"
    : sp?.floor_status === "manager_override" ? "Manager approved" : "Within floor";
  const statusTone = status === "Within floor" ? "bg-emerald-100 text-emerald-800" : status === "Manager approved" ? "bg-brand-100 text-brand-800" : "bg-rose-100 text-rose-800";

  function cap(value: number) {
    return Math.max(0, Math.min(allowedMax, value));
  }
  function commit() {
    const value = parseFloat(text) || 0;
    if (negotiationMode === "percent") onDiscountChange(Math.max(0, value));
    else if (baseMerch <= 0) onDiscountChange(0);
    else if (negotiationMode === "dollars") onDiscountChange(cap((value / baseMerch) * 100));
    else onDiscountChange(cap(((baseMerch + protectedInstall - value / (1 + hstRate)) / baseMerch) * 100));
  }

  // Keep the field freely editable without repricing on each keystroke.
  useEffect(() => {
    if (negotiationMode === "percent") setText(String(discount));
    else if (negotiationMode === "dollars") setText(String(Number(previewDiscount.toFixed(2))));
    else setText(String(Number(previewTotal.toFixed(2))));
  }, [negotiationMode, discount, previewDiscount, previewTotal]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{internal ? "Deal" : "Your price"}</h2>
        {internal && totals ? (
          <div className="flex flex-wrap items-center gap-1">
            {reviewRequired ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Review</span> : null}
            {sp?.floor_applied ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700" title={`Priced up to the ${money(sp.profit_floor ?? 0, currency)} project profit floor, so a lower markup does not lower the price.`}>Floor applied</span> : null}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>{status}</span>
          </div>
        ) : null}
      </div>

      {priceError ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">{totals ? "Price not updated — figures are for your previous selections." : "These selections could not be priced."}</p>
          <p className="mt-1">{priceError}</p>
        </div>
      ) : null}

      {!totals ? <p className="mt-3 text-sm text-slate-500">{pricing ? "Pricing…" : emptyText}</p> : (
        <>
          <div className={`mt-3 ${stale || pricing ? "opacity-70" : ""}`}>
            <p className="text-3xl font-bold text-slate-900">{money(customerTotal, currency)}</p>
            <p className="mt-0.5 text-xs text-slate-500">incl. HST{totals.hst && !stale ? ` · sell ${money(totals.sell, currency)} + HST ${money(totals.hst, currency)}` : ""}{overLimit && stale && !override?.applied ? " · preview until a manager approves" : stale || pricing ? " · updating…" : ""}</p>
          </div>

          {internal ? (
            <div className={`mt-4 grid grid-cols-3 divide-x divide-slate-100 rounded-xl bg-slate-50 py-2 text-center ${stale ? "opacity-70" : ""}`}>
              <div><p className="text-[11px] text-slate-500">Cost</p><p className="text-sm font-semibold text-slate-900">{money(totals.cost, currency)}</p></div>
              <div><p className="text-[11px] text-slate-500">Profit</p><p className="text-sm font-semibold text-slate-900">{money(totals.profit, currency)}</p></div>
              <div><p className="text-[11px] text-slate-500">Margin</p><p className={`text-sm font-bold ${marginTone(margin)}`}>{margin.toFixed(1)}%</p></div>
            </div>
          ) : null}
        </>
      )}

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        {internal ? (
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-600">Pricing preset</span>
            <select className={`${FIELD} w-full`} value={preset?.id || presetId} onChange={(event) => onPresetChange(event.target.value)} title={preset?.description || undefined}>
              {presets.map((item) => <option key={item.id} value={item.id}>{presetLabel(item)}</option>)}
            </select>
          </label>
        ) : null}

        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">Discount <span className="font-normal text-slate-400">· product only, never installation</span></span>
          <div className="flex gap-2">
            <div className="flex flex-1 rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold">
              {([["percent", "% off"], ["dollars", "$ off"], ["price", "Total"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`flex-1 rounded-md px-2 py-1.5 ${negotiationMode === key ? "bg-brand-600 text-white" : "text-slate-600"}`}
                  onClick={() => {
                    setNegotiationMode(key);
                    if (key !== "percent") onDiscountChange(cap(discount));
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="w-24 shrink-0">
              <input
                type="number"
                min={0}
                step={negotiationMode === "percent" ? 0.1 : negotiationMode === "dollars" ? 1 : 0.01}
                className={`${FIELD} w-full`}
                value={text}
                disabled={negotiationMode !== "percent" && !priced}
                aria-label={negotiationMode === "percent" ? "Discount percent" : negotiationMode === "dollars" ? "Discount dollars" : "Customer total including tax"}
                onChange={(event) => setText(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
              />
            </div>
          </div>
          {negotiationMode === "percent" ? (
            <input type="range" min={0} max={Math.max(allowedMax, discount, 5) + 0.5} step={0.5} value={discount} onChange={(event) => onDiscountChange(Number(event.target.value))} className="mt-2 w-full" aria-label="Discount slider" />
          ) : null}
          {priced ? <p className="mt-1 text-xs text-slate-600">{money(previewDiscount, currency)} off the product ({percent.toFixed(1)}%)</p> : null}
        </div>

        {priced && internal ? (
          <div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg border border-slate-200 py-2"><p className="text-[11px] text-slate-500">Walk-away price</p><p className="text-sm font-semibold text-slate-900">{money(walkAway, currency)}</p></div>
              <div className={`rounded-lg border py-2 ${roomLeft > 0.005 ? "border-emerald-200 bg-emerald-50" : "border-slate-200"}`}><p className="text-[11px] text-slate-500">Room left</p><p className={`text-sm font-semibold ${roomLeft > 0.005 ? "text-emerald-800" : "text-slate-900"}`}>{money(roomLeft, currency)}</p></div>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">Lowest price without a manager · limit: {limitText}</p>
          </div>
        ) : null}

        {overLimit ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs font-semibold text-rose-800">{internal ? `Over the ${allowedMax.toFixed(1)}% limit — this` : "This"} discount needs manager approval.</p>
            {override ? (
              <>
                <input type="text" className={`${FIELD} mt-2 w-full`} placeholder="Manager approval reason (required)" value={override.reason} onChange={(event) => override.onReason(event.target.value)} />
                <input type="password" className={`${FIELD} mt-2 w-full`} placeholder="Manager authorization token (required)" value={override.token} onChange={(event) => override.onToken(event.target.value)} autoComplete="off" />
                <p className="mt-1 text-[11px] text-rose-700">The override, reason and price are recorded in the audit log.</p>
              </>
            ) : <p className="mt-1 text-xs text-rose-700">Reduce the discount to price this quote.</p>}
          </div>
        ) : null}
      </div>

      {!internal && customerLines?.length ? (
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
          {customerLines.map((line) => (
            <div key={line.key} className="flex justify-between gap-3">
              <span className="min-w-0"><span className="block truncate text-slate-800">{line.label}</span>{line.detail ? <span className="block text-xs text-slate-500">{line.detail}</span> : null}</span>
              <span className="shrink-0 font-semibold text-slate-900">{money(line.total, currency)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4">{footer}</div>

      {internal && totals ? (
        <details className="group mt-4 border-t border-slate-100 pt-3 text-xs">
          <summary className="cursor-pointer select-none font-semibold text-slate-600 hover:text-slate-900">Details</summary>
          {buildUp ? (
            <div className="mt-3 space-y-1">
              {buildUp.list != null ? <Row label="List" value={money(buildUp.list, currency)} /> : null}
              <Row label={`Dealer cost${buildUp.listOff != null ? ` (${buildUp.listOff.toFixed(0)}% off list)` : ""}`} value={money(buildUp.dealer, currency)} />
              <Row label="+ Install" value={money(buildUp.install, currency)} />
              <Row label="= Cost (dealer + install)" value={money(buildUp.cost, currency)} strong />
              <Row label={`+ Markup ${buildUp.basePercent.toFixed(0)}% on cost`} value={money(buildUp.baseMarkup, currency)} />
              {Math.abs(buildUp.extra) >= 0.005 ? (
                <Row
                  label={`+ Extra profit`}
                  hint={sp?.floor_applied ? `up to the ${money(sp.profit_floor ?? 0, currency)} profit floor` : sp?.strategy === "sliding_margin" && sp.sliding ? `sliding margin target ${sp.sliding.margin_percent.toFixed(1)}%` : undefined}
                  value={money(buildUp.extra, currency)}
                />
              ) : null}
              {buildUp.discount > 0.005 ? <Row label={`− Discount (${(sp?.negotiated_discount_percent ?? 0).toFixed(1)}% off product)`} value={`−${money(buildUp.discount, currency)}`} /> : null}
              <Row label="= Sell (pre-tax)" value={money(buildUp.sell, currency)} strong />
              <Row label="Profit (sell − cost)" value={money(buildUp.profit, currency)} />
              <Row label="Margin (profit ÷ sell)" value={`${buildUp.margin.toFixed(1)}%`} />
              <Row label="Markup (profit ÷ cost)" value={`${buildUp.markupOnCost.toFixed(1)}%`} />
            </div>
          ) : null}
          <div className="mt-3 space-y-1 border-t border-slate-100 pt-2">
            {!buildUp && totals.list != null ? <Row label="List" value={money(totals.list, currency)} /> : null}
            <Row label={sp?.strategy === "sliding_margin" ? "Target margin" : "Markup"} value={sp?.strategy === "sliding_margin" && sp.sliding ? `${sp.sliding.margin_percent.toFixed(1)}%` : `${(sp?.markup_percent ?? 0).toFixed(1)}%`} />
            <Row label="Minimum markup" value={`${(sp?.minimum_markup_percent ?? 0).toFixed(1)}%`} />
            <Row label="Floor price (pre-tax)" value={money(sp?.minimum_floor_sell ?? 0, currency)} />
            {sp?.cost_basis != null ? <Row label="Project cost basis" value={money(sp.cost_basis, currency)} /> : null}
            {sp?.profit_floor ? <Row label="Profit floor" value={money(sp.profit_floor, currency)} /> : null}
          </div>
          {details ? <div className="mt-4 space-y-4">{details}</div> : null}
        </details>
      ) : null}
    </div>
  );
}
