"use client";

import { useState } from "react";
import { ApplyVariationResult, CustomerEstimate, CustomerWindowLine, EstimateTier, TierLineGroup, TierOverrides, TierSummary } from "@/lib/api";
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
type Change = NonNullable<TierSummary["kept_as_quoted"]>[number];
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

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
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

function choiceOf(overrides: TierOverrides): Choice {
  return {
    series: overrides.series || "",
    colour_ext: overrides.colour_ext || "",
    colour_int: overrides.colour_int || "",
    glass: glassId(overrides.glazing),
  };
}

function isAsQuoted(overrides: TierOverrides) {
  return !overrides.series && !overrides.colour_ext && !overrides.colour_int && !Object.keys(overrides.glazing || {}).length;
}

/** Groups that actually pick windows and change something. */
function liveGroups(tier: Pick<EstimateTier, "line_groups">): TierLineGroup[] {
  return (tier.line_groups || []).filter((group) => group.line_ids.length && !isAsQuoted(group.overrides));
}

function tierIsAsQuoted(tier: Pick<EstimateTier, "window_overrides" | "line_groups">) {
  return isAsQuoted(tier.window_overrides) && !liveGroups(tier).length;
}

function sameTier(a: Pick<EstimateTier, "window_overrides" | "line_groups">, b: Pick<EstimateTier, "window_overrides" | "line_groups">) {
  const norm = (o: TierOverrides) => ({ s: o.series || "", e: o.colour_ext || "", i: o.colour_int || "", g: Object.entries(o.glazing || {}).sort() });
  const key = (tier: Pick<EstimateTier, "window_overrides" | "line_groups">) => JSON.stringify({
    main: norm(tier.window_overrides),
    groups: liveGroups(tier).map((group) => ({ lines: [...group.line_ids].sort(), o: norm(group.overrides) })),
  });
  return key(a) === key(b);
}

/** Short name for one set of choices, e.g. "Heritage · Black · Triple pane". */
export function variationName(overrides: TierOverrides): string {
  if (isAsQuoted(overrides)) return "As quoted";
  const glass = glassId(overrides.glazing);
  return [
    overrides.series ? SERIES_SHORT_LABELS[overrides.series] || overrides.series : "",
    overrides.colour_int === "black" ? "Black in & out" : overrides.colour_ext ? capitalize(overrides.colour_ext) : "",
    glass === "custom" ? "Custom glass" : WINDOW_GLASS.find((pkg) => pkg.id === glass)?.title || "",
  ].filter(Boolean).join(" · ");
}

function choicesDescription(overrides: TierOverrides): string {
  const pkg = WINDOW_GLASS.find((item) => item.id === glassId(overrides.glazing));
  return [
    overrides.series ? `${SERIES_SHORT_LABELS[overrides.series] || overrides.series} collection` : "",
    overrides.colour_int === "black" ? "black inside and out" : overrides.colour_ext ? `${overrides.colour_ext} exterior` : "",
    pkg ? `${pkg.title.toLowerCase()} glass (${pkg.detail})` : glassId(overrides.glazing) === "custom" ? "upgraded glass" : "",
  ].filter(Boolean).join(", ");
}

function windowLabel(windows: CustomerWindowLine[], lineId: string | null | undefined, location = "") {
  const index = windows.findIndex((line) => line.id === lineId);
  return location || windows[index]?.location || `Window ${index + 1}`;
}

function listNames(names: string[]) {
  const unique = Array.from(new Set(names));
  if (unique.length > 4) return plural(names.length, "window");
  return unique.length === 1 ? unique[0] : `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

/** Option name from all its choices: "Heritage · Black on 3 windows", "Triple pane + Heritage on 2 windows". */
function tierName(tier: Pick<EstimateTier, "window_overrides" | "line_groups">): string {
  const groups = liveGroups(tier);
  if (!groups.length) return variationName(tier.window_overrides);
  const picked = groups.map((group) => `${variationName(group.overrides)} on ${plural(group.line_ids.length, "window")}`).join(" + ");
  return isAsQuoted(tier.window_overrides) ? picked : `${picked}, ${variationName(tier.window_overrides)} elsewhere`;
}

/** Customer-facing line under the option name. */
function tierDescription(tier: Pick<EstimateTier, "window_overrides" | "line_groups">, windows: CustomerWindowLine[]): string {
  if (tierIsAsQuoted(tier)) return "Windows as quoted";
  const groups = liveGroups(tier);
  const main = choicesDescription(tier.window_overrides);
  const parts = groups.map((group) => `${listNames(group.line_ids.map((id) => windowLabel(windows, id)))}: ${choicesDescription(group.overrides)}`);
  if (main) parts.unshift(groups.length ? `Other windows: ${main}` : main);
  return parts.join("; ").replace(/^./, (letter) => letter.toUpperCase());
}

function makeTier(overrides: TierOverrides, windows: CustomerWindowLine[], groups: TierLineGroup[] = []): EstimateTier {
  const tier = { window_overrides: overrides, line_groups: groups };
  return { id: newEstimateLineId("tier"), name: tierName(tier), description: tierDescription(tier, windows), ...tier };
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

/** Collection / exterior / interior / glass pickers, shared by the composer, each option and each window group. */
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

/** Toggle chips, one per window: "3 · Kitchen". Windows taken by another group are shown but locked. */
function WindowPicker({ windows, picked, takenBy, disabled, onToggle, onSetAll }: {
  windows: CustomerWindowLine[];
  picked: string[];
  takenBy?: Map<string, string>;
  disabled: boolean;
  onToggle: (lineId: string) => void;
  onSetAll: (lineIds: string[]) => void;
}) {
  const free = windows.filter((line) => !takenBy?.has(line.id)).map((line) => line.id);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {windows.map((line, index) => {
          const on = picked.includes(line.id);
          const taken = takenBy?.get(line.id);
          return (
            <button
              key={line.id}
              type="button"
              aria-pressed={on}
              disabled={disabled || Boolean(taken)}
              title={taken ? `Already in ${taken}` : line.description || undefined}
              onClick={() => onToggle(line.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? "border-brand-500 bg-brand-500 text-white" : taken ? "border-dashed border-slate-200 text-slate-300" : "border-slate-300 bg-white text-slate-700 hover:border-brand-400"}`}
            >
              {on ? "✓ " : ""}{index + 1} · {line.location || "No location"}
            </button>
          );
        })}
      </div>
      {!disabled ? (
        <div className="mt-1 flex gap-3 text-[11px] font-semibold text-brand-700">
          <button type="button" className="hover:underline" onClick={() => onSetAll(free)}>Select all</button>
          <button type="button" className="hover:underline" onClick={() => onSetAll([])}>Clear</button>
        </div>
      ) : null}
    </div>
  );
}

/** One line per distinct reason, naming the windows it hits: "North side ×4, Kitchen". */
function ChangeList({ rows, windows }: { rows: Change[]; windows: CustomerWindowLine[] }) {
  const byReason = new Map<string, { change: string; reason: string; lines: Change[] }>();
  rows.forEach((row) => {
    const key = `${row.change}|${row.reason}`;
    if (!byReason.has(key)) byReason.set(key, { change: row.change, reason: row.reason, lines: [] });
    byReason.get(key)!.lines.push(row);
  });
  const where = (lines: Change[]) => {
    if (lines.length === windows.length && windows.length > 1) return `all ${windows.length} windows`;
    const counts = new Map<string, number>();
    lines.forEach((row) => {
      const name = windowLabel(windows, row.line_id, row.location);
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(", ");
  };
  return (
    <ul className="mt-1 space-y-0.5">
      {Array.from(byReason.values()).map((group) => (
        <li key={`${group.change}-${group.reason}`}>
          <span className="font-semibold">{where(group.lines)}</span> · {CHANGE_LABELS[group.change] || group.change}: {group.reason}
        </li>
      ))}
    </ul>
  );
}

/** What happened when a variation was written into the windows. */
function BakedNotice({ name, result, windows, onClose }: { name: string; result: ApplyVariationResult; windows: CustomerWindowLine[]; onClose: () => void }) {
  const kept = result.kept_as_quoted;
  const adjusted = result.adjusted || [];
  return (
    <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${kept.length ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">
          “{name}” is now the quoted estimate. {plural(result.applied_lines, "window")} changed.
          {kept.length ? " Some changes couldn't be made, so these stay as they were:" : ""}
        </p>
        <button type="button" className="text-slate-500 hover:text-slate-800" aria-label="Dismiss" onClick={onClose}>✕</button>
      </div>
      {kept.length ? <ChangeList rows={kept} windows={windows} /> : null}
      {adjusted.length ? <><p className="mt-1.5 font-semibold">Adjusted to fit:</p><ChangeList rows={adjusted} windows={windows} /></> : null}
    </div>
  );
}

function ResultList({ summary, windows, targeted, asQuoted }: { summary: TierSummary; windows: CustomerWindowLine[]; targeted: number; asQuoted: boolean }) {
  const kept = summary.kept_as_quoted || [];
  const adjusted = summary.adjusted || [];
  if (asQuoted && !summary.error) return <p className="mt-2 text-xs text-slate-500">The estimate exactly as quoted, for comparison.</p>;
  if (summary.error) return <p className="mt-2 rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-800">{summary.error}</p>;
  if (summary.applied_lines === undefined) return null;
  const scope = targeted === windows.length ? `all ${plural(targeted, "window")}` : plural(targeted, "picked window");
  return (
    <>
      {!kept.length ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">✓ Applied to {scope}</p>
      ) : (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          <p className="font-semibold">
            {summary.applied_lines >= targeted ? `Applied to ${scope}, except what isn't made that way:` : `Applied to ${summary.applied_lines} of ${plural(targeted, "window")}. Kept as quoted because they aren't made that way:`}
          </p>
          <ChangeList rows={kept} windows={windows} />
        </div>
      )}
      {adjusted.length ? (
        <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-900">
          <p className="font-semibold">Adjusted so {adjusted.length === 1 ? "it fits" : "they fit"}:</p>
          <ChangeList rows={adjusted} windows={windows} />
        </div>
      ) : null}
      {summary.customer_note ? <p className="mt-1.5 text-xs italic text-slate-600">Customer sees: “{summary.customer_note}”</p> : null}
    </>
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
  const windows = estimate.windows;
  const summaries = new Map<string, TierSummary>((estimate.pricing?.tiers || []).map((tier) => [tier.id, tier]));
  const selected = estimate.selected_tier;
  const baseline = quotedBaseline(windows);
  const [draft, setDraft] = useState<Choice>(EMPTY_CHOICE);
  const [draftScope, setDraftScope] = useState<"all" | "picked">("all");
  const [draftPicked, setDraftPicked] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [baked, setBaked] = useState<{ name: string; result: ApplyVariationResult } | null>(null);

  const asQuotedTier = tiers.find(tierIsAsQuoted);
  const baseTotal = asQuotedTier ? summaries.get(asQuotedTier.id)?.total : !selected ? estimate.pricing?.totals?.total : undefined;

  function update(id: string, patch: Partial<EstimateTier>) {
    onChange(tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)), selected);
  }

  /** New choices; a name or description still matching the old automatic text follows along. */
  function retune(tier: EstimateTier, next: Pick<EstimateTier, "window_overrides" | "line_groups">) {
    update(tier.id, {
      ...next,
      name: tier.name === tierName(tier) ? tierName(next) : tier.name,
      description: !tier.description || tier.description === tierDescription(tier, windows) ? tierDescription(next, windows) : tier.description,
    });
  }

  function nextOverrides(current: TierOverrides, patch: Partial<Choice>) {
    const next = { ...choiceOf(current), ...patch };
    const overrides = overridesFrom(next);
    // Keep fine-tuned glass when only collection or colour changed.
    if (next.glass === "custom") overrides.glazing = current.glazing;
    return overrides;
  }

  function changeChoice(tier: EstimateTier, patch: Partial<Choice>) {
    retune(tier, { window_overrides: nextOverrides(tier.window_overrides, patch), line_groups: tier.line_groups });
  }

  function updateGlazing(tier: EstimateTier, key: string, value: unknown) {
    const glazing = { ...(tier.window_overrides.glazing || {}) };
    if (value === undefined || value === "") delete glazing[key];
    else glazing[key] = value;
    retune(tier, { window_overrides: { ...tier.window_overrides, glazing }, line_groups: tier.line_groups });
  }

  function updateGroup(tier: EstimateTier, groupId: string, patch: Partial<TierLineGroup>) {
    const line_groups = (tier.line_groups || []).map((group) => (group.id === groupId ? { ...group, ...patch } : group));
    retune(tier, { window_overrides: tier.window_overrides, line_groups });
  }

  function addGroup(tier: EstimateTier) {
    const line_groups = [...(tier.line_groups || []), { id: newEstimateLineId("group"), line_ids: [], overrides: { glazing: {} } }];
    retune(tier, { window_overrides: tier.window_overrides, line_groups });
  }

  function removeGroup(tier: EstimateTier, groupId: string) {
    retune(tier, { window_overrides: tier.window_overrides, line_groups: (tier.line_groups || []).filter((group) => group.id !== groupId) });
  }

  /** Add variations, with "As quoted" first so the customer can still pick the original. */
  function addVariations(list: EstimateTier[]) {
    const fresh = list.filter((candidate) => !tiers.some((tier) => sameTier(tier, candidate)));
    if (!fresh.length) {
      setNotice("That variation is already on the estimate.");
      return false;
    }
    const base = !asQuotedTier && !fresh.some(tierIsAsQuoted) ? [makeTier({}, windows)] : [];
    onChange([...tiers, ...base, ...fresh], selected);
    setNotice(base.length ? "Added, along with “As quoted” so the customer can still choose the original." : null);
    return true;
  }

  function addFromComposer() {
    const overrides = overridesFrom(draft);
    const added = draftScope === "picked"
      ? addVariations([makeTier({ glazing: {} }, windows, [{ id: newEstimateLineId("group"), line_ids: draftPicked, overrides }])])
      : addVariations([makeTier(overrides, windows)]);
    if (added) {
      setDraft(EMPTY_CHOICE);
      setDraftPicked([]);
    }
  }

  async function bake(tier: EstimateTier, summary: TierSummary | undefined) {
    if (!onBake) return;
    const kept = summary?.kept_as_quoted?.length || 0;
    const adjusted = summary?.adjusted?.length || 0;
    const ok = window.confirm(
      `Make “${tier.name}” the quoted estimate?\n\n`
      + "This changes the windows themselves (not just an option)."
      + (kept ? ` ${plural(kept, "change")} can't be made and will stay as quoted, as listed on the card.` : " Every window it covers can take it.")
      + (adjusted ? ` ${plural(adjusted, "window")} will get a white interior so ${adjusted === 1 ? "it fits" : "they fit"}.` : "")
      + "\n\nThe current version won't be offered anymore. To keep it as a choice for the customer, add it back as a variation afterwards.",
    );
    if (!ok) return;
    const result = await onBake(tier.id);
    if (result) setBaked({ name: tier.name, result });
  }

  const draftOverrides = overridesFrom(draft);
  const draftReady = !isAsQuoted(draftOverrides) && (draftScope === "all" || draftPicked.length > 0);
  const draftLabel = draftScope === "picked"
    ? `${variationName(draftOverrides)} on ${plural(draftPicked.length, "window")}`
    : variationName(draftOverrides);
  const windowCount = windows.length;

  return (
    <div className="editor-card">
      <div className="card-heading">
        <div><p className="eyebrow">Options</p><h3>Estimate variations</h3></div>
        <span className="status-pill">{tiers.length ? `${tiers.length} option${tiers.length === 1 ? "" : "s"}` : "Single price"}</span>
      </div>
      <p className="project-help">
        Re-price this same job in another collection, colour or glass, for every window at once or only the ones you pick (say Heritage at the front, Classic everywhere else). A window that isn&apos;t made with a choice keeps its quoted product, and the card shows which ones. Every option uses the same discount, and the customer picks one when accepting.
      </p>
      {baked ? <BakedNotice name={baked.name} result={baked.result} windows={windows} onClose={() => setBaked(null)} /> : null}
      {!windowCount ? <p className="review-box">Add windows to offer variations.</p> : null}

      {windowCount ? (
        <p className="mb-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Quoted in:</span> {baseline.label || "—"}
          {baseTotal != null ? <> · <span className="font-semibold text-slate-800">{money(baseTotal)}</span></> : null}
        </p>
      ) : null}

      {editable && windowCount ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">New variation</p>
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Apply to">
              {(["all", "picked"] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  aria-pressed={draftScope === scope}
                  onClick={() => setDraftScope(scope)}
                  className={`rounded-md px-2.5 py-1 ${draftScope === scope ? "bg-brand-500 text-white" : "text-slate-600 hover:text-slate-900"}`}
                >
                  {scope === "all" ? "All windows" : "Picked windows"}
                </button>
              ))}
            </div>
          </div>
          {draftScope === "picked" ? (
            <div className="mb-2">
              <p className="mb-1 text-xs text-slate-600">Pick the windows that change. The rest stay as quoted (you can give them their own choice afterwards).</p>
              <WindowPicker
                windows={windows}
                picked={draftPicked}
                disabled={false}
                onToggle={(id) => setDraftPicked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
                onSetAll={setDraftPicked}
              />
            </div>
          ) : null}
          <ChoiceFields value={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} disabled={false} quotedSeries={baseline.series} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className="button primary" disabled={!draftReady} onClick={addFromComposer}>
              {draftReady ? `Add “${draftLabel}”` : draftScope === "picked" && !draftPicked.length ? "Pick windows and a change" : "Pick a change to add"}
            </button>
            <span className="text-xs text-slate-500">or quick sets:</span>
            <button type="button" className="button secondary" onClick={() => addVariations(COLLECTIONS.filter((id) => !(baseline.series.length === 1 && baseline.series[0] === id)).map((series) => makeTier({ series, glazing: {} }, windows)))}>Compare collections</button>
            <button type="button" className="button secondary" onClick={() => (tiers.length ? addVariations(starterTiers().slice(1).map((tier) => makeTier(tier.window_overrides, windows))) : onChange(starterTiers(), null))}>Good / Better / Best glass</button>
          </div>
          {notice ? <p className="mt-2 text-xs text-slate-600">{notice}</p> : null}
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {tiers.map((tier) => {
          const summary = summaries.get(tier.id);
          const isSelected = selected === tier.id;
          const glazing = tier.window_overrides.glazing || {};
          const groups = tier.line_groups || [];
          const pickedIds = new Set(liveGroups(tier).flatMap((group) => group.line_ids));
          const targeted = isAsQuoted(tier.window_overrides) ? pickedIds.size : windowCount;
          const asQuoted = tierIsAsQuoted(tier);
          const diff = summary?.total != null && baseTotal != null && !asQuoted ? summary.total - baseTotal : null;
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

              {groups.map((group, index) => {
                const takenBy = new Map<string, string>();
                groups.forEach((other, otherIndex) => {
                  if (other.id !== group.id) other.line_ids.forEach((id) => takenBy.set(id, `group ${otherIndex + 1}`));
                });
                return (
                  <div key={group.id} className="mt-2 rounded-md border border-brand-200 bg-white p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-brand-800">
                        {groups.length > 1 ? `Group ${index + 1} · ` : ""}{group.line_ids.length ? plural(group.line_ids.length, "picked window") : "Pick windows for this choice"}
                      </p>
                      {editable ? <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeGroup(tier, group.id)}>Remove group</button> : null}
                    </div>
                    <WindowPicker
                      windows={windows}
                      picked={group.line_ids}
                      takenBy={takenBy}
                      disabled={!editable}
                      onToggle={(id) => updateGroup(tier, group.id, { line_ids: group.line_ids.includes(id) ? group.line_ids.filter((item) => item !== id) : [...group.line_ids, id] })}
                      onSetAll={(ids) => updateGroup(tier, group.id, { line_ids: ids })}
                    />
                    <div className="mt-2">
                      <ChoiceFields value={choiceOf(group.overrides)} onChange={(patch) => updateGroup(tier, group.id, { overrides: nextOverrides(group.overrides, patch) })} disabled={!editable} quotedSeries={baseline.series} />
                    </div>
                  </div>
                );
              })}

              <div className="mt-2">
                {groups.length ? <p className="mb-1 text-xs font-bold text-slate-700">All other windows</p> : null}
                <ChoiceFields value={choiceOf(tier.window_overrides)} onChange={(patch) => changeChoice(tier, patch)} disabled={!editable} quotedSeries={baseline.series} />
              </div>
              {editable && windowCount > 1 ? (
                <button type="button" className="mt-1.5 text-xs font-semibold text-brand-700 hover:underline" onClick={() => addGroup(tier)}>
                  + Different choice for some windows
                </button>
              ) : null}

              {summary && !updating ? <ResultList summary={summary} windows={windows} targeted={targeted} asQuoted={asQuoted} /> : null}

              <details className="mt-2 text-xs">
                <summary className="cursor-pointer font-semibold text-slate-600">Customer description &amp; fine-tune glass</summary>
                <div className="mt-2 space-y-2">
                  <label className="project-field"><span>Customer description</span>
                    <input className="project-input" value={tier.description || ""} onChange={(event) => update(tier.id, { description: event.target.value })} disabled={!editable} />
                  </label>
                  <p className="text-slate-500">Fine-tune glass{groups.length ? " (all other windows)" : ""}:</p>
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
                  {onBake && !asQuoted ? (
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
