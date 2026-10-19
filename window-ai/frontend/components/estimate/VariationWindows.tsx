"use client";

import { useState } from "react";
import type { CustomerWindowLine, Profitability, TierSummary, WindowSectionLine } from "@/lib/api";
import WindowUnitDrawing from "@/components/WindowUnitDrawing";

type WindowLineCost = NonNullable<Profitability["window_line_costs"]>[number];
type Status = "built" | "adjusted" | "partly" | "blocked" | "same" | "untouched";
type Filter = "all" | "built" | "partly" | "blocked";

const STATUS: Record<Status, { label: string; badge: string; card: string }> = {
  built: { label: "✓ Built", badge: "bg-emerald-100 text-emerald-800", card: "border-emerald-200" },
  adjusted: { label: "✓ Built, adjusted", badge: "bg-sky-100 text-sky-800", card: "border-sky-200" },
  partly: { label: "◐ Partly built", badge: "bg-amber-100 text-amber-900", card: "border-amber-300" },
  blocked: { label: "✕ Can't be built", badge: "bg-rose-100 text-rose-800", card: "border-rose-300 bg-rose-50/40" },
  same: { label: "No change", badge: "bg-slate-100 text-slate-600", card: "border-slate-200" },
  untouched: { label: "Stays as quoted", badge: "bg-slate-100 text-slate-600", card: "border-slate-200" },
};
const CHANGE_LABELS: Record<string, string> = { collection: "Collection", colour: "Colour", glazing: "Glass" };

function money(value: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}

/**
 * Window by window: what each window becomes in a variation, and which ones
 * can't be built that way (and why). Uses the variation's priced snapshot,
 * so the drawing, description and price are exactly what the customer buys.
 */
export default function VariationWindows({ summary, windows, baseLines, costs, baseCosts, targeted }: {
  summary: TierSummary;
  windows: CustomerWindowLine[];
  /** The same windows as quoted, to show what changed and the price difference. */
  baseLines?: WindowSectionLine[];
  /** Internal: factory and install cost of each window in this variation, and as quoted. */
  costs?: WindowLineCost[];
  baseCosts?: WindowLineCost[];
  /** Whether the variation asks to change this window at all. */
  targeted: (lineId: string) => boolean;
}) {
  const [filter, setFilter] = useState<Filter | null>(null);
  const after = new Map((summary.scope?.sections.windows.lines || []).map((line) => [line.id, line]));
  const before = new Map((baseLines || []).map((line) => [line.id, line]));
  const changed = new Set(summary.changed_line_ids || []);
  const costAfter = new Map((costs || []).map((row) => [row.id, row]));
  const costBefore = new Map((baseCosts || []).map((row) => [row.id, row]));

  const rows = windows.map((window, index) => {
    const kept = (summary.kept_as_quoted || []).filter((row) => row.line_id === window.id);
    const adjusted = (summary.adjusted || []).filter((row) => row.line_id === window.id);
    const isChanged = changed.has(window.id);
    const status: Status = !targeted(window.id) ? "untouched"
      : kept.length && !isChanged ? "blocked"
      : kept.length ? "partly"
      : isChanged && adjusted.length ? "adjusted"
      : isChanged ? "built"
      : "same";
    return { window, index, kept, adjusted, status, after: after.get(window.id), before: before.get(window.id) };
  });

  const count = (statuses: Status[]) => rows.filter((row) => statuses.includes(row.status)).length;
  // Three buckets that don't overlap, so they add up to the windows the option touches.
  const BUCKETS: Record<Exclude<Filter, "all">, Status[]> = { built: ["built", "adjusted"], partly: ["partly"], blocked: ["blocked"] };
  const shown = rows.filter((row) => !filter || filter === "all" || BUCKETS[filter].includes(row.status));
  const chip = (key: Exclude<Filter, "all">, label: string, on: string, off: string) => {
    const n = count(BUCKETS[key]);
    return (
      <button type="button" onClick={() => setFilter(filter === key ? "all" : key)} disabled={!n} aria-pressed={filter === key}
        className={`rounded-full px-2 py-0.5 font-semibold ${!n ? "bg-slate-100 text-slate-400" : filter === key ? on : off}`}>
        {label.replace("#", String(n))}
      </button>
    );
  };

  if (!summary.scope) return null;
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setFilter(filter ? null : "all")} aria-expanded={Boolean(filter)}>
          {filter ? "▾ Hide windows" : `▸ See all ${windows.length} windows`}
        </button>
        <span className="text-slate-300">|</span>
        {chip("built", "✓ # built", "bg-emerald-600 text-white", "bg-emerald-100 text-emerald-800 hover:bg-emerald-200")}
        {chip("partly", "◐ # partly built", "bg-amber-500 text-white", "bg-amber-100 text-amber-900 hover:bg-amber-200")}
        {chip("blocked", "✕ # can't be built", "bg-rose-600 text-white", "bg-rose-100 text-rose-800 hover:bg-rose-200")}
      </div>

      {filter ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {shown.map(({ window, index, kept, adjusted, status, after: line, before: was }) => {
            const style = STATUS[status];
            const diff = line && was ? line.line_total - was.line_total : null;
            const cost = costAfter.get(window.id);
            const costWas = costBefore.get(window.id);
            const factoryDiff = cost && costWas ? cost.factory - costWas.factory : null;
            return (
              <div key={window.id} className={`flex gap-2.5 rounded-lg border bg-white p-2 ${style.card}`}>
                <div className="w-[72px] shrink-0">
                  {line?.drawing ? (
                    <WindowUnitDrawing geometry={line.drawing} colour={line.drawing.exterior_colour || undefined} size={72} showDimensions={false} showIndexes={false} />
                  ) : <div className="flex h-[72px] items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">No drawing</div>}
                </div>
                <div className="min-w-0 flex-1 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-slate-900">{index + 1} · {window.location || "No location"}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${style.badge}`}>{style.label}</span>
                  </div>
                  {line ? <p className="mt-0.5 line-clamp-2 text-slate-700" title={line.description}>{line.description}</p> : null}
                  {was && line && was.description !== line.description ? (
                    <p className="mt-0.5 line-clamp-1 text-slate-400" title={was.description}>Was: {was.description}</p>
                  ) : null}
                  {status === "same" ? (
                    <p className="mt-1 text-slate-500">{/^patio/.test(String((window.spec as Record<string, unknown>).type)) ? "Patio doors aren't part of the window collections; they keep their own product." : "Already matches this option."}</p>
                  ) : null}
                  {kept.map((row) => (
                    <p key={`k-${row.change}`} className="mt-1 text-rose-700"><span className="font-semibold">{CHANGE_LABELS[row.change] || row.change} not changed:</span> {row.reason}</p>
                  ))}
                  {adjusted.map((row) => (
                    <p key={`a-${row.change}`} className="mt-1 text-sky-800"><span className="font-semibold">Adjusted:</span> {row.reason}</p>
                  ))}
                  {line ? (
                    <p className="mt-1 font-semibold text-slate-800">
                      {money(line.line_total)}
                      {diff ? <span className={`ml-1 font-normal ${diff > 0 ? "text-slate-500" : "text-emerald-700"}`}>({diff > 0 ? "+" : "−"}{money(Math.abs(diff))})</span> : null}
                    </p>
                  ) : null}
                  {cost ? (
                    <p className="text-[11px] text-slate-500">
                      Factory {money(cost.factory)}
                      {factoryDiff && Math.abs(factoryDiff) >= 0.5 ? <span className="font-semibold text-slate-700"> ({factoryDiff > 0 ? "+" : "−"}{money(Math.abs(factoryDiff))})</span> : null}
                      {" · "}Install {money(cost.install)}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!shown.length ? <p className="text-xs text-slate-500">No windows here.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
