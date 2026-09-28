"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CustomerEstimate, EstimateAdder, JobAdder, fetchJobAdders } from "@/lib/api";
import { newEstimateLineId } from "@/lib/quoteHandoff";
import { InternalOnly } from "@/lib/viewMode";

const UNIT_LABELS: Record<string, string> = {
  per_job: "per job",
  per_opening: "per opening",
  per_window: "per window",
  per_door: "per door",
  each: "each",
};

function money(value: number | undefined | null) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(value || 0);
}

/** Quantity the server will use when the salesperson leaves it on "auto". */
function autoQuantity(unit: string, estimate: CustomerEstimate): number {
  const windows = estimate.windows.reduce((total, line) => total + (Number(line.spec.qty) || 1), 0);
  const doors = estimate.doors.length;
  if (unit === "per_job") return 1;
  if (unit === "per_window") return windows;
  if (unit === "per_door") return doors;
  if (unit === "per_opening") return windows + doors;
  return 1;
}

export default function JobItemsCard({
  estimate,
  editable,
  onChange,
}: {
  estimate: CustomerEstimate;
  editable: boolean;
  onChange: (adders: EstimateAdder[]) => void;
}) {
  const [catalog, setCatalog] = useState<JobAdder[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [custom, setCustom] = useState({ name: "", price: "", cost: "", qty: "1" });
  const adders = estimate.adders || [];
  const byId = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const priced = new Map((estimate.pricing?.sections.adders?.lines || []).map((line) => [line.id, line]));

  useEffect(() => {
    fetchJobAdders(true).then((result) => setCatalog(result.adders)).catch((reason) => setLoadError(reason instanceof Error ? reason.message : "Could not load job items."));
  }, []);

  function update(id: string, patch: Partial<EstimateAdder>) {
    onChange(adders.map((adder) => (adder.id === id ? { ...adder, ...patch } : adder)));
  }

  function addCatalogItem() {
    if (!choice) return;
    onChange([...adders, { id: newEstimateLineId("adder"), adder_id: choice, qty: null, note: "" }]);
    setChoice("");
  }

  function addCustomItem() {
    const price = Number(custom.price);
    if (!custom.name.trim() || !Number.isFinite(price) || price < 0) return;
    onChange([...adders, {
      id: newEstimateLineId("adder"),
      custom: true,
      name: custom.name.trim(),
      price,
      cost: Math.max(0, Number(custom.cost) || 0),
      qty: Math.max(0, Number(custom.qty) || 1),
      note: "",
    }]);
    setCustom({ name: "", price: "", cost: "", qty: "1" });
  }

  const grouped = catalog.reduce<Record<string, JobAdder[]>>((groups, item) => {
    (groups[item.category] ||= []).push(item);
    return groups;
  }, {});

  return (
    <div className="editor-card">
      <div className="card-heading">
        <div><p className="eyebrow">Job scope</p><h3>Removal, finishing &amp; site work</h3></div>
        {estimate.pricing?.sections.adders?.subtotal ? <span className="status-pill">{money(estimate.pricing.sections.adders.subtotal)}</span> : null}
      </div>
      <p className="project-help">Everything the job needs beyond the products, so the price covers the real cost of the install. Items are fixed-price and never discounted.</p>
      {loadError ? <p className="project-error">{loadError}</p> : null}
      {!loadError && catalog.length === 0 ? (
        <p className="review-box">No job items are priced yet. A manager can set prices and activate them in <Link href="/admin/settings" className="font-semibold underline">Settings</Link>. You can still add a custom item below.</p>
      ) : null}

      {adders.length ? (
        <ul className="mt-2 space-y-2">
          {adders.map((adder) => {
            const item = adder.adder_id ? byId.get(adder.adder_id) : undefined;
            const name = adder.custom ? adder.name : item?.name || adder.adder_id || "Job item";
            const unit = adder.custom ? "each" : item?.unit || "each";
            const auto = autoQuantity(unit, estimate);
            const line = priced.get(adder.id);
            return (
              <li key={adder.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{name}</p>
                    <p className="text-xs text-slate-500">
                      {adder.custom ? `Custom · ${money(adder.price)} each` : item ? `${money(item.price)} ${UNIT_LABELS[unit]}` : "No longer in the catalog — remove it"}
                    </p>
                  </div>
                  <div className="text-right">
                    {line ? <p className="font-semibold">{money(line.line_total)}</p> : null}
                    {editable ? <button type="button" className="text-xs font-semibold text-rose-600 hover:underline" onClick={() => onChange(adders.filter((entry) => entry.id !== adder.id))}>Remove</button> : null}
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
                  <label className="project-field"><span>Qty{adder.qty == null ? ` (auto: ${auto})` : ""}</span>
                    <input
                      className="project-input"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={adder.qty ?? ""}
                      placeholder={String(auto)}
                      onChange={(event) => update(adder.id, { qty: event.target.value === "" ? null : Math.max(0, Number(event.target.value)) })}
                      disabled={!editable}
                    />
                  </label>
                  <label className="project-field"><span>Note on the estimate (optional)</span>
                    <input className="project-input" value={adder.note || ""} onChange={(event) => update(adder.id, { note: event.target.value })} disabled={!editable} placeholder="e.g. 3 basement windows in brick" />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {editable ? (
        <div className="mt-3 space-y-3">
          {catalog.length ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="project-field min-w-[14rem] flex-1"><span>Add a job item</span>
                <select className="project-input" value={choice} onChange={(event) => setChoice(event.target.value)}>
                  <option value="">Choose…</option>
                  {Object.entries(grouped).map(([category, items]) => (
                    <optgroup key={category} label={category}>
                      {items.map((item) => <option key={item.id} value={item.id}>{item.name} — {money(item.price)} {UNIT_LABELS[item.unit]}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <button type="button" className="button secondary" onClick={addCatalogItem} disabled={!choice}>Add</button>
            </div>
          ) : null}
          <details className="rounded-lg border border-dashed border-slate-300 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">Add a custom item</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <label className="project-field sm:col-span-2"><span>Description</span><input className="project-input" value={custom.name} onChange={(event) => setCustom({ ...custom, name: event.target.value })} placeholder="Remove old awning" /></label>
              <label className="project-field"><span>Price (each)</span><input className="project-input" type="number" min={0} step="0.01" inputMode="decimal" value={custom.price} onChange={(event) => setCustom({ ...custom, price: event.target.value })} /></label>
              <InternalOnly><label className="project-field"><span>Your cost (each)</span><input className="project-input" type="number" min={0} step="0.01" inputMode="decimal" value={custom.cost} onChange={(event) => setCustom({ ...custom, cost: event.target.value })} /></label></InternalOnly>
              <label className="project-field"><span>Qty</span><input className="project-input" type="number" min={0} step="any" inputMode="decimal" value={custom.qty} onChange={(event) => setCustom({ ...custom, qty: event.target.value })} /></label>
            </div>
            <div className="project-actions mt-2"><button type="button" className="button secondary" onClick={addCustomItem} disabled={!custom.name.trim() || custom.price === ""}>Add custom item</button></div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
