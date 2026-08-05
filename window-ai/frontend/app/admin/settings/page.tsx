"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SalesPreset,
  fetchAdminSalesPresets,
  saveAdminSalesPresets,
} from "@/lib/api";

const EMPTY_PRESET: SalesPreset = {
  id: "new-strategy",
  name: "New strategy",
  description: "",
  markup_percent: 30,
  default_discount_percent: 0,
  max_discount_percent: 10,
  minimum_markup_percent: 20,
  active: true,
};

function percent(value: number) {
  return `${Number(value).toFixed(1)}%`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

export default function SalesSettingsPage() {
  const [currency, setCurrency] = useState("CAD");
  const [minimumMarkup, setMinimumMarkup] = useState(20);
  const [presets, setPresets] = useState<SalesPreset[]>([]);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminSalesPresets()
      .then((payload) => {
        setCurrency(payload.currency || "CAD");
        setMinimumMarkup(payload.minimum_markup_percent ?? 20);
        setPresets(payload.presets);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load sales settings."))
      .finally(() => setLoading(false));
  }, []);

  const activeCount = useMemo(() => presets.filter((preset) => preset.active).length, [presets]);
  const lossSaleCount = useMemo(
    () => presets.filter((preset) => preset.active && preset.minimum_markup_percent < 0).length,
    [presets]
  );

  function updatePreset<K extends keyof SalesPreset>(index: number, key: K, value: SalesPreset[K]) {
    setPresets((current) =>
      current.map((preset, presetIndex) => (presetIndex === index ? { ...preset, [key]: value } : preset))
    );
    setMessage(null);
  }

  function addPreset() {
    const suffix = presets.length + 1;
    setPresets((current) => [
      ...current,
      { ...EMPTY_PRESET, id: `strategy-${suffix}`, name: `Strategy ${suffix}` },
    ]);
    setMessage(null);
  }

  function removePreset(index: number) {
    if (presets.length <= 1) {
      setError("Keep at least one sales strategy configured.");
      return;
    }
    setPresets((current) => current.filter((_, presetIndex) => presetIndex !== index));
    setMessage(null);
  }

  async function save() {
    setError(null);
    setMessage(null);

    if (!token.trim()) {
      setError("Enter the pricing admin token to save sales controls.");
      return;
    }
    if (!presets.length) {
      setError("Keep at least one sales strategy configured.");
      return;
    }
    if (minimumMarkup < -99) {
      setError("The global minimum markup floor cannot be below -99%.");
      return;
    }

    const ids = new Set<string>();
    for (const preset of presets) {
      const id = preset.id.trim().toLowerCase();
      if (!id || ids.has(id)) {
        setError("Each strategy needs a unique ID before it can be saved.");
        return;
      }
      if (!preset.name.trim()) {
        setError(`Give strategy “${id}” a name before saving.`);
        return;
      }
      if (preset.default_discount_percent > preset.max_discount_percent) {
        setError(`${preset.name}: default discount cannot exceed the maximum discount.`);
        return;
      }
      if (preset.markup_percent < preset.minimum_markup_percent) {
        setError(`${preset.name}: base markup cannot be below its minimum floor.`);
        return;
      }
      ids.add(id);
    }

    setSaving(true);
    try {
      const payload = await saveAdminSalesPresets(
        {
          currency,
          minimum_markup_percent: Number(minimumMarkup),
          presets: presets.map((preset) => ({
            ...preset,
            id: preset.id.trim().toLowerCase(),
            name: preset.name.trim(),
            description: preset.description.trim(),
          })),
        },
        token.trim()
      );
      setPresets(payload.presets);
      setCurrency(payload.currency || currency);
      setMinimumMarkup(payload.minimum_markup_percent ?? minimumMarkup);
      setMessage(`Saved sales controls · version ${payload.sales_config_version}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sales settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading sales settings…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Manager controls</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Sales pricing settings</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Set the default markup, maximum customer discount, and minimum markup floor for each sales strategy.
            A negative floor deliberately allows a controlled loss on a sale; the quote still records the result and
            keeps the catalog cost unchanged.
          </p>
        </div>
        <a href="/" className="text-sm font-semibold text-brand-700 hover:underline">← Back to quote builder</a>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Strategies</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{presets.length}</p>
          <p className="mt-1 text-xs text-slate-500">{activeCount} active for sales</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Loss-sale enabled</p>
          <p className={`mt-2 text-2xl font-semibold ${lossSaleCount ? "text-rose-700" : "text-slate-900"}`}>{lossSaleCount}</p>
          <p className="mt-1 text-xs text-slate-500">Active strategies with a negative floor</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Important</p>
          <p className="mt-2 text-sm font-semibold text-amber-900">Negative floors mean real loss</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">Use only for approved strategic deals. Prices below the floor require manager authorization in the quote builder.</p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Global defaults</h3>
            <p className="mt-1 text-sm text-slate-500">Used when a preset does not provide its own minimum markup floor.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{currency}</span>
        </div>
        <div className="mt-5 max-w-sm">
          <Field
            label="Default minimum markup floor (%)"
            hint="Use a negative value to allow the configured strategy to sell below total dealer and installation cost. Minimum: -99%."
          >
            <input
              className="input"
              type="number"
              min={-99}
              step={0.5}
              value={minimumMarkup}
              onChange={(event) => setMinimumMarkup(Number(event.target.value))}
            />
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Sales strategies</h3>
            <p className="mt-1 text-sm text-slate-500">The active strategies appear in the quote builder for the sales team.</p>
          </div>
          <button type="button" onClick={addPreset} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">+ Add strategy</button>
        </div>

        {presets.map((preset, index) => {
          const lossEnabled = preset.minimum_markup_percent < 0;
          return (
            <article key={`preset-${index}`} className={`rounded-2xl border bg-white p-5 shadow-sm ${lossEnabled ? "border-rose-200" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold text-slate-900">{preset.name || "Unnamed strategy"}</h4>
                    {lossEnabled ? <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-800">Loss sale enabled</span> : null}
                    {!preset.active ? <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Inactive</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">ID: {preset.id}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2 font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={preset.active}
                      onChange={(event) => updatePreset(index, "active", event.target.checked)}
                    />
                    Active
                  </label>
                  <button type="button" onClick={() => removePreset(index)} className="font-semibold text-rose-600 hover:underline">Remove</button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Strategy ID">
                  <input className="input" value={preset.id} onChange={(event) => updatePreset(index, "id", event.target.value)} />
                </Field>
                <Field label="Name">
                  <input className="input" value={preset.name} onChange={(event) => updatePreset(index, "name", event.target.value)} />
                </Field>
                <Field label="Base markup (%)" hint="Markup before any discount.">
                  <input className="input" type="number" min={0} step={0.5} value={preset.markup_percent} onChange={(event) => updatePreset(index, "markup_percent", Number(event.target.value))} />
                </Field>
                <Field label="Default discount (%)">
                  <input className="input" type="number" min={0} max={100} step={0.5} value={preset.default_discount_percent} onChange={(event) => updatePreset(index, "default_discount_percent", Number(event.target.value))} />
                </Field>
                <Field label="Maximum discount (%)" hint="Salespeople cannot exceed this without manager approval.">
                  <input className="input" type="number" min={0} max={100} step={0.5} value={preset.max_discount_percent} onChange={(event) => updatePreset(index, "max_discount_percent", Number(event.target.value))} />
                </Field>
                <Field label="Minimum markup floor (%)" hint={lossEnabled ? `Allows up to ${percent(Math.abs(preset.minimum_markup_percent))} below cost.` : "Set below 0 to permit a controlled loss."}>
                  <input className={`input ${lossEnabled ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500" : ""}`} type="number" min={-99} step={0.5} value={preset.minimum_markup_percent} onChange={(event) => updatePreset(index, "minimum_markup_percent", Number(event.target.value))} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Description" hint="Shown to the sales team when they choose the strategy.">
                    <input className="input" value={preset.description} onChange={(event) => updatePreset(index, "description", event.target.value)} placeholder="When should this strategy be used?" />
                  </Field>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="max-w-2xl">
          <h3 className="text-base font-semibold text-slate-900">Save changes</h3>
          <p className="mt-1 text-sm text-slate-500">A pricing admin token is required. Saving updates the shared sales controls used by every quote builder.</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Pricing admin token">
              <input className="input sm:w-80" type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Manager token" />
            </Field>
            <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60">{saving ? "Saving…" : "Save sales controls"}</button>
          </div>
          {message ? <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
          {error ? <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        </div>
      </section>
    </div>
  );
}
