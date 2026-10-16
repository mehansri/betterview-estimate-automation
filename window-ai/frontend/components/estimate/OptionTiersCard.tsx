"use client";

import { useState } from "react";
import { ApplyVariationResult, CustomerEstimate, CustomerWindowLine, EstimateTier, TierOverrides, TierSummary } from "@/lib/api";
import { EXTERIOR_COLOURS, WINDOW_GASES, WINDOW_GLASS, activeGlass } from "@/lib/productOptions";
import { newEstimateLineId } from "@/lib/quoteHandoff";
import { SERIES_SHORT_LABELS, seriesOfStyle } from "@/lib/windowLayout";

const COLLECTIONS = ["classic", "classic_400", "heritage", "heritage_maximum"];
const GLAZING_TOGGLES: Array<{ key: string; label: string }> = [
  { key: "loe180", label: "LoE 180" },
  { key: "i89", label: "i89" },
  { key: "triple", label: "Triple pane" },
  { key: "tri_pane_lami", label: "Laminated tri-pane" },
];
const CHANGE_LABELS: Record<string, string> = { collection: "Collection", colour: "Colour", glazing: "Glass" };

type Choice = { series: string; colour_ext: string; colour_int: string; glass: string };
const EMPTY_CHOICE: Choice = { series: "", colour_ext: "", colour_int: "", glass: "" };

function money(value: number | undefined | null) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value || 0);
}

function capitalize(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/** The collection a window line was quoted in; null for patio doors. */
function lineSeries(line: CustomerWindowLine): string | null {
  const spec = record(line.spec);
  if (spec.type === "patio_sliding" || spec.type === "patio_swing") return null;
  if (spec.layout && (spec.type === "unit" || spec.type === "bay_bow")) return String(spec.series || "classic");
  const lites = Array.isArray(spec.lites) ? spec.lites.map(record) : [];
  return seriesOfStyle(spec.style || lites[0]?.style);
}

function majority(values: string[]): string {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return "";
  if (sorted.length === 1) return sorted[0][0];
  // A clear majority reads as "mostly"; an even mix names the two biggest.
  if (sorted[0][1] * 2 > values.length) return `${sorted[0][0]} (mostly)`;
  return `${sorted[0][0]} + ${sorted[1][0]}${sorted.length > 2 ? " + more" : ""}`;
}

/** "Classic · White · Double pane": what the estimate was quoted in. */
function quotedBaseline(windows: CustomerWindowLine[]) {
  const series = windows.map(lineSeries).filter((value): value is string => Boolean(value));
  const colours = windows.map((line) => {
    const spec = record(line.spec);
    const lites = Array.isArray(spec.lites) ? spec.lites.map(record) : [];
    return capitalize(String(spec.colour_ext || lites[0]?.colour_ext || "white"));
  });
  const glass = windows.map((line) => {
    const glazing = { loe180: false, i89: false, gas: "argon", triple: false, tri_pane_lami: false, ...record(record(line.spec).glazing) };
    return activeGlass(WINDOW_GLASS, glazing)?.title || "Custom glass";
  });
  const mainSeries = majority(series.map((value) => SERIES_SHORT_LABELS[value] || value));
  return {
    series: Array.from(new Set(series)),
    label: [mainSeries, majority(colours), majority(glass)].filter(Boolean).join(" · "),
  };
}

function glassId(glazing: Record<string, unknown> | undefined): string {
  if (!glazing || !Object.keys(glazing).length) return "";
  const match = WINDOW_GLASS.find((pkg) => Object.keys(pkg.patch).length === Object.keys(glazing).length
    && Object.entries(pkg.patch).every(([key, value]) => glazing[key] === value));
  return match?.id || "custom";
}

function overridesFrom(choice: Choice): TierOverrides {
  const pkg = WINDOW_GLASS.find((item) => item.id === choice.glass);
  const blackInside = choice.colour_int === "black";
  return {
    ...(choice.series ? { series: choice.series } : {}),
    ...(blackInside ? { colour_ext: "black", colour_int: "black" } : {
      ...(choice.colour_ext ? { colour_ext: choice.colour_ext } : {}),
      ...(choice.colour_int ? { colour_int: choice.colour_int } : {}),
    }),
    glazing: pkg ? { ...pkg.patch } : {},
  };
}

function isAsQuoted(overrides: TierOverrides) {
  return !overrides.series && !overrides.colour_ext && !overrides.colour_int && !Object.keys(overrides.glazing || {}).length;
}

function sameOverrides(a: TierOverrides, b: TierOverrides) {
  const norm = (o: TierOverrides) => JSON.stringify({ s: o.series || "", e: o.colour_ext || "", i: o.colour_int || "", g: Object.entries(o.glazing || {}).sort() });
  return norm(a) === norm(b);
}

/** Short option name built from what changes, e.g. "Heritage · Black · Triple pane". */
export function variationName(overrides: TierOverrides): string {
  if (isAsQuoted(overrides)) return "As quoted";
  const glass = glassId(overrides.glazing);
  return [
    overrides.series ? SERIES_SHORT_LABELS[overrides.series] || overrides.series : "",
    overrides.colour_int === "black" ? "Black in & out" : overrides.colour_ext ? capitalize(overrides.colour_ext) : "",
    glass === "custom" ? "Custom glass" : WINDOW_GLASS.find((pkg) => pkg.id === glass)?.title || "",
  ].filter(Boolean).join(" · ");
}

/** Customer-facing line under the option name. */
function variationDescription(overrides: TierOverrides): string {
  if (isAsQuoted(overrides)) return "Windows as quoted";
  const pkg = WINDOW_GLASS.find((item) => item.id === glassId(overrides.glazing));
  return [
    overrides.series ? `${SERIES_SHORT_LABELS[overrides.series] || overrides.series} collection` : "",
    overrides.colour_int === "black" ? "black inside and out" : overrides.colour_ext ? `${overrides.colour_ext} exterior` : "",
    pkg ? `${pkg.title.toLowerCase()} glass (${pkg.detail})` : glassId(overrides.glazing) === "custom" ? "upgraded glass" : "",
  ].filter(Boolean).join(", ").replace(/^./, (letter) => letter.toUpperCase());
}

function makeTier(overrides: TierOverrides): EstimateTier {
  return { id: newEstimateLineId("tier"), name: variationName(overrides), description: variationDescription(overrides), window_overrides: overrides };
}

function glassPatch(id: string): Record<string, unknown> {
  return { ...(WINDOW_GLASS.find((pkg) => pkg.id === id)?.patch || {}) };
}

function starterTiers(): EstimateTier[] {
  return [
    { id: newEstimateLineId("tier"), name: "Good", description: "Windows as quoted", window_overrides: {} },
    { id: newEstimateLineId("tier"), name: "Better", description: "LoE 180 + i89 low-e glass for more comfort", window_overrides: { glazing: glassPatch("double_i89") } },
    { id: newEstimateLineId("tier"), name: "Best", description: "Triple-pane glass for the quietest, most efficient home", window_overrides: { glazing: glassPatch("triple") } },
  ];
}

/** Tri-state toggle: inherit the line's own setting, force on, or force off. */
function GlazingOverride({ value, onChange, disabled }: { value: unknown; onChange: (value: boolean | undefined) => void; disabled: boolean }) {
  const current = value === true ? "on" : value === false ? "off" : "";
  return (
    <select className="project-input" value={current} disabled={disabled} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value === "on")}>
      <option value="">As quoted</option>
      <option value="on">Yes</option>
      <option value="off">No</option>
    </select>
  );
}

/** Collection / exterior / interior / glass pickers, shared by the composer and each option. */
function ChoiceFields({ value, onChange, disabled, quotedSeries }: { value: Choice; onChange: (patch: Partial<Choice>) => void; disabled: boolean; quotedSeries: string[] }) {
  const blackInside = value.colour_int === "black";
  return (
    <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
      <label className="project-field"><span>Collection</span>
        <select className="project-input" value={value.series} disabled={disabled} onChange={(event) => onChange({ series: event.target.value })}>
          <option value="">As quoted</option>
          {COLLECTIONS.map((id) => <option key={id} value={id}>{SERIES_SHORT_LABELS[id]}{quotedSeries.length === 1 && quotedSeries[0] === id ? " (quoted)" : ""}</option>)}
        </select>
      </label>
      <label className="project-field"><span>Exterior colour</span>
        <select className="project-input" value={blackInside ? "black" : value.colour_ext} disabled={disabled || blackInside} onChange={(event) => onChange({ colour_ext: event.target.value })}>
          <option value="">As quoted</option>
          {EXTERIOR_COLOURS.map((colour) => <option key={colour} value={colour}>{capitalize(colour)}</option>)}
        </select>
      </label>
      <label className="project-field"><span>Interior colour</span>
        <select className="project-input" value={value.colour_int} disabled={disabled} onChange={(event) => onChange({ colour_int: event.target.value })}>
          <option value="">As quoted</option>
          <option value="white">White</option>
          <option value="black">Black (in &amp; out)</option>
        </select>
      </label>
      <label className="project-field"><span>Glass</span>
        <select className="project-input" value={value.glass} disabled={disabled} onChange={(event) => onChange({ glass: event.target.value })}>
          <option value="">As quoted</option>
          {WINDOW_GLASS.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.title}</option>)}
          {value.glass === "custom" ? <option value="custom">Custom (fine-tuned)</option> : null}
        </select>
      </label>
    </div>
  );
}

function choiceOf(overrides: TierOverrides): Choice {
  return {
    series: overrides.series || "",
    colour_ext: overrides.colour_ext || "",
    colour_int: overrides.colour_int || "",
    glass: glassId(overrides.glazing),
  };
}

function lineLabel(windows: CustomerWindowLine[], lineId: string | null | undefined, location: string) {
  return location || `Window ${windows.findIndex((line) => line.id === lineId) + 1}`;
}

/** What happened when a variation was written into the windows. */
function BakedNotice({ name, result, windows, onClose }: { name: string; result: ApplyVariationResult; windows: CustomerWindowLine[]; onClose: () => void }) {
  const kept = result.kept_as_quoted;
  return (
    <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${kept.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">
          “{name}” is now the quoted estimate. {result.applied_lines} window{result.applied_lines === 1 ? "" : "s"} changed.
          {kept.length ? " Some changes couldn't be made, so these stay as they were:" : ""}
        </p>
        <button type="button" className="text-slate-500 hover:text-slate-800" aria-label="Dismiss" onClick={onClose}>✕</button>
      </div>
      {kept.length ? (
        <ul className="mt-1 space-y-0.5">
          {kept.map((row) => (
            <li key={`${row.line_id}-${row.change}`}><span className="font-semibold">{lineLabel(windows, row.line_id, row.location)}</span> · {CHANGE_LABELS[row.change] || row.change}: {row.reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function KeptList({ summary, windows, asQuoted }: { summary: TierSummary; windows: CustomerWindowLine[]; asQuoted: boolean }) {
  const kept = summary.kept_as_quoted || [];
  const total = windows.length;
  if (asQuoted && !summary.error) return <p className="mt-2 text-xs text-slate-500">The estimate exactly as quoted, for comparison.</p>;
  if (summary.error) return <p className="mt-2 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-800">{summary.error}</p>;
  if (summary.applied_lines === undefined) return null;
  if (!kept.length) {
    return <p className="mt-2 text-xs font-semibold text-emerald-700">✓ Applied to all {total} window{total === 1 ? "" : "s"}</p>;
  }
  return (
    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
      <p className="font-semibold">
        {summary.applied_lines === total ? `Applied to all ${total} windows, except what isn't made that way:` : `Applied to ${summary.applied_lines} of ${total} windows. Kept as quoted because they aren't made that way:`}
      </p>
      <ul className="mt-1 space-y-0.5">
        {kept.map((row) => (
          <li key={`${row.line_id}-${row.change}`}>
            <span className="font-semibold">{lineLabel(windows, row.line_id, row.location)}</span> · {CHANGE_LABELS[row.change] || row.change}: {row.reason}
          </li>
        ))}
      </ul>
      {summary.customer_note ? <p className="mt-1.5 italic text-amber-800">Customer sees: “{summary.customer_note}”</p> : null}
    </div>
  );
}

export default function OptionTiersCard({
  estimate,
  editable,
  internal,
  updating = false,
  onBake,
  onChange,
}: {
  estimate: CustomerEstimate;
  editable: boolean;
  internal: boolean;
  /** Pricing is being refreshed; shown prices are from before the last change. */
  updating?: boolean;
  /** Write a variation into the window lines; omitted until the estimate is saved. */
  onBake?: (tierId: string) => Promise<ApplyVariationResult | null>;
  onChange: (tiers: EstimateTier[], selectedTier: string | null) => void;
}) {
  const tiers = estimate.tiers || [];
  const summaries = new Map<string, TierSummary>((estimate.pricing?.tiers || []).map((tier) => [tier.id, tier]));
  const selected = estimate.selected_tier;
  const baseline = quotedBaseline(estimate.windows);
  const [draft, setDraft] = useState<Choice>(EMPTY_CHOICE);
  const [notice, setNotice] = useState<string | null>(null);
  const [baked, setBaked] = useState<{ name: string; result: ApplyVariationResult } | null>(null);

  const asQuotedTier = tiers.find((tier) => isAsQuoted(tier.window_overrides));
  const baseTotal = asQuotedTier ? summaries.get(asQuotedTier.id)?.total : !selected ? estimate.pricing?.totals?.total : undefined;

  function update(id: string, patch: Partial<EstimateTier>) {
    onChange(tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)), selected);
  }

  async function bake(tier: EstimateTier, summary: TierSummary | undefined) {
    if (!onBake) return;
    const kept = summary?.kept_as_quoted?.length || 0;
    const ok = window.confirm(
      `Make “${tier.name}” the quoted estimate?

`
      + `This changes the windows themselves (not just an option).`
      + (kept ? ` ${kept} change${kept === 1 ? "" : "s"} can't be made and will stay as quoted, as listed on the card.` : " Every window can take it.")
      + `

The current version won't be offered anymore. To keep it as a choice for the customer, add it back as a variation afterwards.`,
    );
    if (!ok) return;
    const result = await onBake(tier.id);
    if (result) setBaked({ name: tier.name, result });
  }

  /** New overrides; a name or description still matching the old auto text follows along. */
  function setOverrides(tier: EstimateTier, overrides: TierOverrides) {
    const old = tier.window_overrides;
    update(tier.id, {
      window_overrides: overrides,
      name: tier.name === variationName(old) ? variationName(overrides) : tier.name,
      description: !tier.description || tier.description === variationDescription(old) ? variationDescription(overrides) : tier.description,
    });
  }

  function changeChoice(tier: EstimateTier, patch: Partial<Choice>) {
    const next = { ...choiceOf(tier.window_overrides), ...patch };
    const overrides = overridesFrom(next);
    // Keep fine-tuned glass when only collection or colour changed.
    if (next.glass === "custom") overrides.glazing = tier.window_overrides.glazing;
    setOverrides(tier, overrides);
  }

  function updateGlazing(tier: EstimateTier, key: string, value: unknown) {
    const glazing = { ...(tier.window_overrides.glazing || {}) };
    if (value === undefined || value === "") delete glazing[key];
    else glazing[key] = value;
    setOverrides(tier, { ...tier.window_overrides, glazing });
  }

  /** Add variations, with "As quoted" first so the customer can still pick the original. */
  function addVariations(list: TierOverrides[]) {
    const fresh = list.filter((overrides) => !tiers.some((tier) => sameOverrides(tier.window_overrides, overrides)));
    if (!fresh.length) {
      setNotice("That variation is already on the estimate.");
      return;
    }
    const base = !asQuotedTier && !fresh.some(isAsQuoted) ? [makeTier({})] : [];
    onChange([...tiers, ...base, ...fresh.map(makeTier)], selected);
    setNotice(base.length ? "Added, along with “As quoted” so the customer can still choose the original." : null);
  }

  function addFromComposer() {
    addVariations([overridesFrom(draft)]);
    setDraft(EMPTY_CHOICE);
  }

  function compareCollections() {
    addVariations(COLLECTIONS.filter((id) => !(baseline.series.length === 1 && baseline.series[0] === id)).map((series) => ({ series, glazing: {} })));
  }

  const draftEmpty = isAsQuoted(overridesFrom(draft));
  const windowCount = estimate.windows.length;

  return (
    <div className="editor-card">
      <div className="card-heading">
        <div><p className="eyebrow">Options</p><h3>Estimate variations</h3></div>
        <span className="status-pill">{tiers.length ? `${tiers.length} option${tiers.length === 1 ? "" : "s"}` : "Single price"}</span>
      </div>
      <p className="project-help">
        Re-price this same job in another collection, colour or glass. Each change goes to every window at once, so there&apos;s no need to edit windows one by one. A window that isn&apos;t made with a choice keeps its quoted product, and the card shows which ones. Every option uses the same discount, and the customer picks one when accepting.
      </p>
      {baked ? <BakedNotice name={baked.name} result={baked.result} windows={estimate.windows} onClose={() => setBaked(null)} /> : null}
      {!windowCount ? <p className="review-box">Add windows to offer variations.</p> : null}

      {windowCount ? (
        <p className="mb-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Quoted in:</span> {baseline.label || "—"}
          {baseTotal != null ? <> · <span className="font-semibold text-slate-800">{money(baseTotal)}</span></> : null}
        </p>
      ) : null}

      {editable && windowCount ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">New variation · apply to all windows</p>
          <ChoiceFields value={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} disabled={false} quotedSeries={baseline.series} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="button primary" disabled={draftEmpty} onClick={addFromComposer}>
              {draftEmpty ? "Pick a change to add" : `Add “${variationName(overridesFrom(draft))}”`}
            </button>
            <span className="text-xs text-slate-500">or quick sets:</span>
            <button type="button" className="button secondary" onClick={compareCollections}>Compare collections</button>
            <button type="button" className="button secondary" onClick={() => (tiers.length ? addVariations(starterTiers().slice(1).map((tier) => tier.window_overrides)) : onChange(starterTiers(), null))}>Good / Better / Best glass</button>
          </div>
          {notice ? <p className="mt-2 text-xs text-slate-600">{notice}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {tiers.map((tier) => {
          const summary = summaries.get(tier.id);
          const isSelected = selected === tier.id;
          const glazing = tier.window_overrides.glazing || {};
          const choice = choiceOf(tier.window_overrides);
          const diff = summary?.total != null && baseTotal != null && !isAsQuoted(tier.window_overrides) ? summary.total - baseTotal : null;
          return (
            <div key={tier.id} className={`rounded-lg border p-3 ${isSelected ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label className="project-field min-w-[12rem] flex-1"><span>Option name</span>
                  <input className="project-input font-semibold" value={tier.name} onChange={(event) => update(tier.id, { name: event.target.value })} disabled={!editable} />
                </label>
                <div className={`min-w-[9rem] text-right ${updating ? "opacity-50" : ""}`}>
                  {summary && !summary.error && summary.total != null ? (
                    <>
                      <p className="text-lg font-bold text-slate-900">{money(summary.total)}</p>
                      {diff != null ? <p className={`text-xs font-semibold ${diff > 0 ? "text-slate-700" : "text-emerald-700"}`}>{diff >= 0 ? "+" : "−"}{money(Math.abs(diff))} vs as quoted</p> : null}
                      {internal && summary.margin_percent != null ? <p className={`text-xs font-semibold ${Number(summary.margin_percent) < 20 ? "text-rose-700" : "text-emerald-700"}`}>{summary.margin_percent.toFixed(1)}% margin · {money(summary.profit)} profit</p> : null}
                      {summary.review_required ? <p className="text-xs text-amber-700">Needs review</p> : null}
                    </>
                  ) : !summary || updating ? <p className="text-xs text-slate-500">Pricing…</p> : null}
                  {updating && summary ? <p className="text-[11px] text-slate-500">Updating…</p> : null}
                </div>
              </div>

              <div className="mt-2">
                <ChoiceFields value={choice} onChange={(patch) => changeChoice(tier, patch)} disabled={!editable} quotedSeries={baseline.series} />
              </div>

              {summary && !updating ? <KeptList summary={summary} windows={estimate.windows} asQuoted={isAsQuoted(tier.window_overrides)} /> : null}

              <details className="mt-2 text-xs">
                <summary className="cursor-pointer font-semibold text-slate-600">Customer description &amp; fine-tune glass</summary>
                <div className="mt-2 space-y-2">
                  <label className="project-field"><span>Customer description</span>
                    <input className="project-input" value={tier.description || ""} onChange={(event) => update(tier.id, { description: event.target.value })} disabled={!editable} />
                  </label>
                  <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
                    {GLAZING_TOGGLES.map((toggle) => (
                      <label key={toggle.key} className="project-field"><span>{toggle.label}</span>
                        <GlazingOverride value={glazing[toggle.key]} disabled={!editable} onChange={(value) => updateGlazing(tier, toggle.key, value)} />
                      </label>
                    ))}
                    <label className="project-field"><span>Gas</span>
                      <select className="project-input" value={String(glazing.gas || "")} disabled={!editable} onChange={(event) => updateGlazing(tier, "gas", event.target.value || undefined)}>
                        <option value="">As quoted</option>
                        {WINDOW_GASES.map((gas) => <option key={gas.id} value={gas.id}>{gas.label}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              </details>

              {editable ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={`button ${isSelected ? "primary" : "secondary"}`} onClick={() => onChange(tiers, isSelected ? null : tier.id)}>
                    {isSelected ? "Main price ✓ (click to unset)" : "Use as main price"}
                  </button>
                  {onBake && !isAsQuoted(tier.window_overrides) ? (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={updating || !summary || Boolean(summary.error)}
                      title="Change the windows themselves to this variation, instead of offering it as an option"
                      onClick={() => bake(tier, summary)}
                    >
                      Make this the quoted estimate
                    </button>
                  ) : null}
                  <button type="button" className="button secondary" onClick={() => onChange(tiers.filter((entry) => entry.id !== tier.id), isSelected ? null : selected)}>Remove</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {tiers.length > 0 && editable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="button secondary" onClick={() => { onChange([], null); setNotice(null); }}>Remove all variations</button>
        </div>
      ) : null}
    </div>
  );
}
