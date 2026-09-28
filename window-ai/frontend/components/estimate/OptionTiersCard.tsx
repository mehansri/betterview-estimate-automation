"use client";

import { CustomerEstimate, EstimateTier, TierSummary } from "@/lib/api";
import { newEstimateLineId } from "@/lib/quoteHandoff";

const COLOURS = ["", "white", "black", "dark bronze", "charcoal", "sandstone"];
const GAS = ["", "argon", "50/50", "krypton"];
const GLAZING_TOGGLES: Array<{ key: string; label: string }> = [
  { key: "loe180", label: "LoE 180" },
  { key: "i89", label: "i89" },
  { key: "triple", label: "Triple pane" },
  { key: "tri_pane_lami", label: "Laminated tri-pane" },
];

function money(value: number | undefined | null) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value || 0);
}

function starterTiers(): EstimateTier[] {
  return [
    { id: newEstimateLineId("tier"), name: "Good", description: "Windows as quoted", window_overrides: {} },
    { id: newEstimateLineId("tier"), name: "Better", description: "LoE 180 + i89 low-e glass for more comfort", window_overrides: { glazing: { loe180: true, i89: true } } },
    { id: newEstimateLineId("tier"), name: "Best", description: "Triple-pane glass for the quietest, most efficient home", window_overrides: { glazing: { loe180: true, triple: true } } },
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

export default function OptionTiersCard({
  estimate,
  editable,
  internal,
  onChange,
}: {
  estimate: CustomerEstimate;
  editable: boolean;
  internal: boolean;
  onChange: (tiers: EstimateTier[], selectedTier: string | null) => void;
}) {
  const tiers = estimate.tiers || [];
  const summaries = new Map<string, TierSummary>((estimate.pricing?.tiers || []).map((tier) => [tier.id, tier]));
  const selected = estimate.selected_tier;

  function update(id: string, patch: Partial<EstimateTier>) {
    onChange(tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)), selected);
  }

  function updateGlazing(tier: EstimateTier, key: string, value: unknown) {
    const glazing = { ...(tier.window_overrides.glazing || {}) };
    if (value === undefined || value === "") delete glazing[key];
    else glazing[key] = value;
    update(tier.id, { window_overrides: { ...tier.window_overrides, glazing } });
  }

  return (
    <div className="editor-card">
      <div className="card-heading">
        <div><p className="eyebrow">Options</p><h3>Good / Better / Best</h3></div>
        <span className="status-pill">{tiers.length ? `${tiers.length} options` : "Single price"}</span>
      </div>
      <p className="project-help">
        Offer the same job at different glass and colour levels. Each option re-prices the windows with its upgrades at the same discount; the customer picks one when accepting online.
      </p>
      {!estimate.windows.length ? <p className="review-box">Add windows to offer upgrade options.</p> : null}

      {tiers.length === 0 && editable && estimate.windows.length ? (
        <button type="button" className="button secondary mt-2" onClick={() => onChange(starterTiers(), null)}>Add Good / Better / Best options</button>
      ) : null}

      <div className="mt-2 space-y-3">
        {tiers.map((tier) => {
          const summary = summaries.get(tier.id);
          const isSelected = selected === tier.id;
          const glazing = tier.window_overrides.glazing || {};
          return (
            <div key={tier.id} className={`rounded-lg border p-3 ${isSelected ? "border-brand-500 bg-brand-50" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <label className="project-field"><span>Option name</span><input className="project-input" value={tier.name} onChange={(event) => update(tier.id, { name: event.target.value })} disabled={!editable} /></label>
                  <label className="project-field"><span>Customer description</span><input className="project-input" value={tier.description || ""} onChange={(event) => update(tier.id, { description: event.target.value })} disabled={!editable} /></label>
                </div>
                <div className="min-w-[9rem] text-right">
                  {summary?.error ? <p className="text-xs text-rose-700">{summary.error}</p> : null}
                  {summary && !summary.error ? (
                    <>
                      <p className="text-lg font-bold text-slate-900">{money(summary.total)}</p>
                      {internal ? <p className={`text-xs font-semibold ${Number(summary.margin_percent) < 20 ? "text-rose-700" : "text-emerald-700"}`}>{summary.margin_percent?.toFixed(1)}% margin · {money(summary.profit)} profit</p> : null}
                      {summary.review_required ? <p className="text-xs text-amber-700">Needs review</p> : null}
                    </>
                  ) : null}
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {GLAZING_TOGGLES.map((toggle) => (
                  <label key={toggle.key} className="project-field"><span>{toggle.label}</span>
                    <GlazingOverride value={glazing[toggle.key]} disabled={!editable} onChange={(value) => updateGlazing(tier, toggle.key, value)} />
                  </label>
                ))}
                <label className="project-field"><span>Gas</span>
                  <select className="project-input" value={String(glazing.gas || "")} disabled={!editable} onChange={(event) => updateGlazing(tier, "gas", event.target.value || undefined)}>
                    {GAS.map((gas) => <option key={gas} value={gas}>{gas || "As quoted"}</option>)}
                  </select>
                </label>
                <label className="project-field"><span>Exterior colour</span>
                  <select className="project-input" value={tier.window_overrides.colour_ext || ""} disabled={!editable} onChange={(event) => update(tier.id, { window_overrides: { ...tier.window_overrides, colour_ext: event.target.value || null } })}>
                    {COLOURS.map((colour) => <option key={colour} value={colour}>{colour || "As quoted"}</option>)}
                  </select>
                </label>
              </div>
              {editable ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={`button ${isSelected ? "primary" : "secondary"}`} onClick={() => onChange(tiers, isSelected ? null : tier.id)}>
                    {isSelected ? "Main price (click to unset)" : "Use as main price"}
                  </button>
                  <button type="button" className="button secondary" onClick={() => onChange(tiers.filter((entry) => entry.id !== tier.id), isSelected ? null : selected)}>Remove option</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {tiers.length > 0 && editable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="button secondary" onClick={() => onChange([...tiers, { id: newEstimateLineId("tier"), name: `Option ${tiers.length + 1}`, description: "", window_overrides: {} }], selected)}>Add option</button>
          <button type="button" className="button secondary" onClick={() => onChange([], null)}>Remove all options</button>
        </div>
      ) : null}
    </div>
  );
}
