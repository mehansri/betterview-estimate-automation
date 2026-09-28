"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import {
  BusinessSettings,
  CompanySettings,
  JobAdder,
  JobAdderUnit,
  SalesPreset,
  fetchAdminSalesPresets,
  fetchBusinessSettings,
  fetchJobAdders,
  saveAdminSalesPresets,
  saveBusinessSettings,
  saveJobAdders,
} from "@/lib/api";
import { breakpoints, DEFAULT_SLIDING, slidingPlan, slidingProblem } from "@/lib/slidingMargin";

// ---------------------------------------------------------------- shared helpers

const INPUT =
  "input block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm " +
  "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500";

const SECONDARY_BUTTON =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";

const PRIMARY_BUTTON =
  "rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

const EMPTY_PRESET: SalesPreset = {
  id: "new-strategy",
  name: "New strategy",
  description: "",
  markup_percent: 30,
  default_discount_percent: 0,
  max_discount_percent: 10,
  minimum_markup_percent: 20,
  active: true,
  strategy: "markup",
};

/** Cost, margin, profit and sell at the points that matter on a sliding curve. */
function SlidingPreview({ preset, floor }: { preset: SalesPreset; floor: number }) {
  const settings = preset.sliding || DEFAULT_SLIDING;
  const problem = slidingProblem(settings, floor);
  if (problem) return <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{problem}</p>;
  const [c1, c2] = breakpoints(settings, floor);
  const points: Array<[string, number]> = [
    ["Small job", Math.round(c1 / 2)],
    ["Floor ends", c1],
    ["Halfway", (c1 + c2) / 2],
    ["Flat rate starts", c2],
    ["Large job", Math.round(c2 * 2)],
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-50 text-slate-500">
          <tr><th className="px-3 py-2">Project</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Margin</th><th className="px-3 py-2 text-right">Markup</th><th className="px-3 py-2 text-right">Profit</th><th className="px-3 py-2 text-right">Sell</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {points.map(([label, cost]) => {
            const plan = slidingPlan(cost, settings, floor);
            return (
              <tr key={label}>
                <td className="px-3 py-2 font-medium text-slate-700">{label}</td>
                <td className="px-3 py-2 text-right">{money.format(plan.cost)}</td>
                <td className="px-3 py-2 text-right font-semibold">{percent(plan.marginPercent)}</td>
                <td className="px-3 py-2 text-right">{percent(plan.markupPercent)}</td>
                <td className="px-3 py-2 text-right">{money.format(plan.profit)}</td>
                <td className="px-3 py-2 text-right">{money.format(plan.sell)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
        Cost is the project&apos;s dealer cost plus installation for windows and doors. Up to {money.format(c1)} the job earns the {money.format(floor)} floor; the {settings.basis} slides from {settings.start_margin_percent}% to {settings.end_margin_percent}% up to {money.format(c2)}, then stays at {settings.end_margin_percent}%.
      </p>
    </div>
  );
}

const UNIT_LABELS: Record<JobAdderUnit, string> = {
  per_job: "Per job",
  per_opening: "Per opening",
  per_window: "Per window",
  per_door: "Per door",
  each: "Each",
};

let keySequence = 0;
function nextKey() {
  keySequence += 1;
  return `row-${keySequence}`;
}

function percent(value: number) {
  return `${Number(value).toFixed(1)}%`;
}

function formatRate(value: number) {
  return `${Number(value.toFixed(3))}%`;
}

function isNumber(value: number) {
  return typeof value === "number" && Number.isFinite(value);
}

/** Standard amortized payment: P·r / (1 − (1 + r)^−n), with r = APR / 12 / 100. */
function monthlyPayment(principal: number, aprPercent: number, months: number) {
  if (!months || months <= 0) return 0;
  const rate = aprPercent / 12 / 100;
  if (rate === 0) return principal / months;
  return (principal * rate) / (1 - Math.pow(1 + rate, -months));
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

/**
 * Number input that keeps the typed text (so a field can be cleared or hold "0.")
 * and reports NaN while the text is not a number. Validation catches NaN on save.
 */
function NumberInput({
  value,
  onValueChange,
  className = INPUT,
  ...rest
}: {
  value: number;
  onValueChange: (value: number) => void;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(() => (isNumber(value) ? String(value) : ""));

  useEffect(() => {
    if (Number.isNaN(value)) return;
    setText((current) => (current.trim() !== "" && Number(current) === value ? current : String(value)));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      className={className}
      value={text}
      onChange={(event) => {
        const raw = event.target.value;
        setText(raw);
        onValueChange(raw.trim() === "" ? Number.NaN : Number(raw));
      }}
    />
  );
}

type SaveStatus = { kind: "ok" | "error"; text: string } | null;

/** Validates, checks the shared manager token, runs the save and reports inline. */
function useSaveAction(token: string) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<SaveStatus>(null);

  const run = useCallback(
    async (validate: () => string | null, action: (token: string) => Promise<string>) => {
      const problem = validate();
      if (problem) {
        setStatus({ kind: "error", text: problem });
        return;
      }
      const trimmed = token.trim();
      if (!trimmed) {
        setStatus({ kind: "error", text: "Enter the manager token at the top of the page to save." });
        return;
      }
      setSaving(true);
      setStatus(null);
      try {
        setStatus({ kind: "ok", text: await action(trimmed) });
      } catch (err) {
        setStatus({ kind: "error", text: err instanceof Error ? err.message : "Could not save." });
      } finally {
        setSaving(false);
      }
    },
    [token]
  );

  const clearStatus = useCallback(() => setStatus(null), []);
  return { saving, status, run, clearStatus };
}

function StatusMessage({ status }: { status: SaveStatus }) {
  return (
    <div aria-live="polite" role="status">
      {status ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            status.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"
          }`}
        >
          {status.text}
        </p>
      ) : null}
    </div>
  );
}

function SectionCard({
  id,
  title,
  description,
  children,
  saveLabel,
  saving,
  status,
  onSave,
}: {
  id: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
  saveLabel: string;
  saving: boolean;
  status: SaveStatus;
  onSave: () => void;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-24 min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
    >
      <div className="max-w-3xl">
        <h3 id={`${id}-title`} className="text-base font-semibold text-slate-900">{title}</h3>
        <div className="mt-1 text-sm leading-6 text-slate-500">{description}</div>
      </div>
      <div className="mt-5 min-w-0">{children}</div>
      <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center">
        <button type="button" onClick={onSave} disabled={saving} className={`${PRIMARY_BUTTON} sm:w-auto`}>
          {saving ? "Saving…" : saveLabel}
        </button>
        <div className="min-w-0 flex-1">
          <StatusMessage status={status} />
        </div>
      </div>
    </section>
  );
}

function LoadingCard({ id, title, error }: { id: string; title: string; error?: string | null }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {error ? (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- company details

function CompanySection({ initial, token }: { initial: CompanySettings; token: string }) {
  const [draft, setDraft] = useState<CompanySettings>(initial);
  const { saving, status, run, clearStatus } = useSaveAction(token);

  function update<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    clearStatus();
  }

  function save() {
    const cleaned: CompanySettings = {
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      address: draft.address.trim(),
      website: draft.website.trim(),
    };
    run(
      () => {
        if (!cleaned.name) return "Enter the company name.";
        if (cleaned.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)) return "Enter a valid email address.";
        return null;
      },
      async (adminToken) => {
        setDraft(await saveBusinessSettings("company", cleaned, adminToken));
        return "Company details saved.";
      }
    );
  }

  return (
    <SectionCard
      id="company"
      title="Company details"
      description="Shown on customer estimates, the customer portal, PDFs and estimate emails."
      saveLabel="Save company details"
      saving={saving}
      status={status}
      onSave={save}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company name">
          <input className={INPUT} value={draft.name} onChange={(e) => update("name", e.target.value)} autoComplete="organization" />
        </Field>
        <Field label="Phone">
          <input className={INPUT} type="tel" value={draft.phone} onChange={(e) => update("phone", e.target.value)} autoComplete="tel" />
        </Field>
        <Field label="Email">
          <input className={INPUT} type="email" value={draft.email} onChange={(e) => update("email", e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Website" hint="Optional, e.g. https://betterview.ca">
          <input className={INPUT} type="url" value={draft.website} onChange={(e) => update("website", e.target.value)} autoComplete="url" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Address">
            <input className={INPUT} value={draft.address} onChange={(e) => update("address", e.target.value)} autoComplete="street-address" />
          </Field>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- sales process

type SalesProcess = BusinessSettings["sales_process"];

function SalesProcessSection({ initial, token }: { initial: SalesProcess; token: string }) {
  const [draft, setDraft] = useState<SalesProcess>(initial);
  const { saving, status, run, clearStatus } = useSaveAction(token);

  function update<K extends keyof SalesProcess>(key: K, value: SalesProcess[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    clearStatus();
  }

  function save() {
    run(
      () => {
        if (!isNumber(draft.deposit_percent) || draft.deposit_percent < 0 || draft.deposit_percent > 100)
          return "Deposit must be between 0 and 100%.";
        if (!Number.isInteger(draft.follow_up_days) || draft.follow_up_days < 0)
          return "Follow-up days must be a whole number, 0 or more.";
        if (!Number.isInteger(draft.estimate_valid_days) || draft.estimate_valid_days < 1)
          return "Estimates must be valid for at least 1 day (whole days).";
        return null;
      },
      async (adminToken) => {
        setDraft(await saveBusinessSettings("sales_process", draft, adminToken));
        return "Sales process saved.";
      }
    );
  }

  const exampleDeposit = isNumber(draft.deposit_percent) ? (10000 * draft.deposit_percent) / 100 : null;

  return (
    <SectionCard
      id="sales-process"
      title="Sales process"
      description="Defaults applied to new estimates: the deposit requested when a customer accepts, when a follow-up is due after sending, and how long the price is honoured."
      saveLabel="Save sales process"
      saving={saving}
      status={status}
      onSave={save}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Deposit on acceptance (%)"
          hint={exampleDeposit !== null ? `${money.format(exampleDeposit)} on a $10,000 estimate. Use 0 for no deposit.` : "0 to 100."}
        >
          <NumberInput min={0} max={100} step={1} value={draft.deposit_percent} onValueChange={(v) => update("deposit_percent", v)} />
        </Field>
        <Field label="Follow up after (days)" hint="Days after sending before a follow-up is due. 0 = same day.">
          <NumberInput min={0} step={1} value={draft.follow_up_days} onValueChange={(v) => update("follow_up_days", v)} />
        </Field>
        <Field label="Estimate valid for (days)" hint="Sets the “valid until” date on new estimates.">
          <NumberInput min={1} step={1} value={draft.estimate_valid_days} onValueChange={(v) => update("estimate_valid_days", v)} />
        </Field>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- financing

type Financing = BusinessSettings["financing"];
type TermRow = { key: string; months: number };

function FinancingSection({ initial, token }: { initial: Financing; token: string }) {
  const [draft, setDraft] = useState<Omit<Financing, "terms_months">>(() => ({
    enabled: initial.enabled,
    apr_percent: initial.apr_percent,
    minimum_amount: initial.minimum_amount,
    disclaimer: initial.disclaimer,
  }));
  const [terms, setTerms] = useState<TermRow[]>(() => initial.terms_months.map((months) => ({ key: nextKey(), months })));
  const { saving, status, run, clearStatus } = useSaveAction(token);

  function update<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    clearStatus();
  }

  function updateTerm(key: string, months: number) {
    setTerms((current) => current.map((term) => (term.key === key ? { ...term, months } : term)));
    clearStatus();
  }

  function addTerm() {
    const last = terms.length ? terms[terms.length - 1].months : 0;
    setTerms((current) => [...current, { key: nextKey(), months: isNumber(last) && last > 0 ? last + 12 : 12 }]);
    clearStatus();
  }

  function removeTerm(key: string) {
    setTerms((current) => current.filter((term) => term.key !== key));
    clearStatus();
  }

  function save() {
    run(
      () => {
        if (!isNumber(draft.apr_percent) || draft.apr_percent < 0) return "APR must be 0 or more.";
        if (!isNumber(draft.minimum_amount) || draft.minimum_amount < 0) return "Minimum amount must be 0 or more.";
        if (terms.some((term) => !Number.isInteger(term.months) || term.months <= 0))
          return "Each financing term must be a whole number of months greater than 0.";
        if (draft.enabled && !terms.length) return "Add at least one term before enabling financing.";
        return null;
      },
      async (adminToken) => {
        const terms_months = Array.from(new Set(terms.map((term) => term.months))).sort((a, b) => a - b);
        const saved = await saveBusinessSettings(
          "financing",
          { ...draft, disclaimer: draft.disclaimer.trim(), terms_months },
          adminToken
        );
        setDraft({
          enabled: saved.enabled,
          apr_percent: saved.apr_percent,
          minimum_amount: saved.minimum_amount,
          disclaimer: saved.disclaimer,
        });
        setTerms(saved.terms_months.map((months) => ({ key: nextKey(), months })));
        return saved.enabled ? "Financing saved and shown on estimates." : "Financing saved (currently turned off).";
      }
    );
  }

  const validTerms = terms.filter((term) => Number.isInteger(term.months) && term.months > 0);
  const apr = isNumber(draft.apr_percent) && draft.apr_percent >= 0 ? draft.apr_percent : null;

  return (
    <SectionCard
      id="financing"
      title="Financing"
      description="When enabled, estimates at or above the minimum amount show an estimated monthly payment for each term."
      saveLabel="Save financing"
      saving={saving}
      status={status}
      onSave={save}
    >
      <div className="space-y-5">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={draft.enabled}
            onChange={(e) => update("enabled", e.target.checked)}
          />
          Show financing options on estimates
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="APR (%)" hint="Annual percentage rate. 0 = interest-free (total ÷ months).">
            <NumberInput min={0} step={0.01} value={draft.apr_percent} onValueChange={(v) => update("apr_percent", v)} />
          </Field>
          <Field label="Minimum estimate total (CAD)" hint="Financing is only offered at or above this total.">
            <NumberInput min={0} step={50} value={draft.minimum_amount} onValueChange={(v) => update("minimum_amount", v)} />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">Terms (months)</legend>
          <div className="flex flex-wrap items-center gap-2">
            {terms.map((term, index) => (
              <div key={term.key} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                <NumberInput
                  aria-label={`Term ${index + 1} in months`}
                  className={`${INPUT} w-24`}
                  min={1}
                  step={1}
                  value={term.months}
                  onValueChange={(v) => updateTerm(term.key, v)}
                />
                <button
                  type="button"
                  onClick={() => removeTerm(term.key)}
                  aria-label={`Remove term ${index + 1}`}
                  className="rounded-md px-2 py-1 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" onClick={addTerm} className={SECONDARY_BUTTON}>+ Add term</button>
          </div>
        </fieldset>

        <Field label="Disclaimer" hint="Printed under the financing options on customer documents.">
          <textarea
            className={`${INPUT} min-h-[4.5rem]`}
            rows={3}
            value={draft.disclaimer}
            onChange={(e) => update("disclaimer", e.target.value)}
          />
        </Field>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">Example: monthly payment on $10,000</p>
          {apr === null || !validTerms.length ? (
            <p className="mt-2 text-sm text-slate-500">Enter a valid APR and at least one term to see an example.</p>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {validTerms.map((term) => {
                const payment = monthlyPayment(10000, apr, term.months);
                return (
                  <li key={term.key} className="rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-slate-200">
                    <span className="font-semibold text-slate-900">{money.format(payment)}/mo</span>
                    <span className="text-slate-500"> × {term.months} months</span>
                    <span className="block text-xs text-slate-500">Total paid {money.format(payment * term.months)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-500">At {apr ?? 0}% APR. Payments are estimates; the lender sets the final terms.</p>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- tax rates

type TaxSettings = BusinessSettings["tax"];
type TaxComponentRow = { key: string; label: string; rate: number };
type TaxProvinceRow = { key: string; code: string; name: string; components: TaxComponentRow[] };

function toTaxRows(tax: TaxSettings): TaxProvinceRow[] {
  return Object.entries(tax.rates).map(([code, entry]) => ({
    key: nextKey(),
    code,
    name: entry.name,
    components: entry.components.map((component) => ({ key: nextKey(), label: component.label, rate: component.rate })),
  }));
}

function TaxSection({ initial, token }: { initial: TaxSettings; token: string }) {
  const [defaultProvince, setDefaultProvince] = useState(initial.default_province);
  const [rows, setRows] = useState<TaxProvinceRow[]>(() => toTaxRows(initial));
  const { saving, status, run, clearStatus } = useSaveAction(token);

  function updateRow(key: string, change: (row: TaxProvinceRow) => TaxProvinceRow) {
    setRows((current) => current.map((row) => (row.key === key ? change(row) : row)));
    clearStatus();
  }

  function updateComponent(rowKey: string, componentKey: string, change: Partial<TaxComponentRow>) {
    updateRow(rowKey, (row) => ({
      ...row,
      components: row.components.map((component) => (component.key === componentKey ? { ...component, ...change } : component)),
    }));
  }

  function addProvince() {
    setRows((current) => [
      ...current,
      { key: nextKey(), code: "", name: "", components: [{ key: nextKey(), label: "GST", rate: 5 }] },
    ]);
    clearStatus();
  }

  function removeProvince(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
    clearStatus();
  }

  function save() {
    run(
      () => {
        if (!rows.length) return "Keep at least one province or territory.";
        const codes = new Set<string>();
        for (const row of rows) {
          const code = row.code.trim().toUpperCase();
          if (!code) return "Every province needs a code (e.g. ON).";
          if (codes.has(code)) return `Province code ${code} is listed twice.`;
          codes.add(code);
          if (!row.name.trim()) return `${code}: enter the province name.`;
          if (!row.components.length) return `${code}: add at least one tax component.`;
          for (const component of row.components) {
            if (!component.label.trim()) return `${code}: every tax component needs a label (e.g. HST).`;
            if (!isNumber(component.rate) || component.rate < 0 || component.rate >= 100)
              return `${code}: tax rates must be between 0 and 100%.`;
          }
        }
        if (!codes.has(defaultProvince.trim().toUpperCase())) return "Choose a default province that is in the table.";
        return null;
      },
      async (adminToken) => {
        const rates: TaxSettings["rates"] = {};
        for (const row of rows) {
          rates[row.code.trim().toUpperCase()] = {
            name: row.name.trim(),
            components: row.components.map((component) => ({ label: component.label.trim(), rate: component.rate })),
          };
        }
        const saved = await saveBusinessSettings(
          "tax",
          { default_province: defaultProvince.trim().toUpperCase(), rates },
          adminToken
        );
        setDefaultProvince(saved.default_province);
        setRows(toTaxRows(saved));
        return "Tax rates saved. They apply the next time an estimate is priced.";
      }
    );
  }

  const selectableCodes = rows.map((row) => row.code.trim().toUpperCase()).filter(Boolean);

  return (
    <SectionCard
      id="tax"
      title="Tax rates"
      description="Sales tax by province or territory. Each estimate uses its project province, or the default below."
      saveLabel="Save tax rates"
      saving={saving}
      status={status}
      onSave={save}
    >
      <div className="max-w-xs">
        <Field label="Default province">
          <select
            className={INPUT}
            value={defaultProvince}
            onChange={(e) => {
              setDefaultProvince(e.target.value);
              clearStatus();
            }}
          >
            {!selectableCodes.includes(defaultProvince) ? <option value={defaultProvince}>{defaultProvince || "Choose…"}</option> : null}
            {rows
              .filter((row) => row.code.trim())
              .map((row) => (
                <option key={row.key} value={row.code.trim().toUpperCase()}>
                  {row.code.trim().toUpperCase()} · {row.name || "Unnamed"}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-3">Code</th>
              <th scope="col" className="px-3 py-3">Province / territory</th>
              <th scope="col" className="px-3 py-3">Tax components</th>
              <th scope="col" className="px-3 py-3 text-right">Combined</th>
              <th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const combined = row.components.reduce((sum, component) => sum + (isNumber(component.rate) ? component.rate : 0), 0);
              const code = row.code.trim().toUpperCase();
              const label = code || "new province";
              return (
                <tr key={row.key} className="align-top">
                  <td className="px-3 py-3">
                    <input
                      aria-label={`Province code for ${row.name || label}`}
                      className={`${INPUT} w-16 uppercase`}
                      maxLength={3}
                      value={row.code}
                      onChange={(e) => updateRow(row.key, (r) => ({ ...r, code: e.target.value.toUpperCase() }))}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      aria-label={`Name for ${label}`}
                      className={`${INPUT} min-w-[10rem]`}
                      value={row.name}
                      onChange={(e) => updateRow(row.key, (r) => ({ ...r, name: e.target.value }))}
                    />
                    {code && code === defaultProvince ? (
                      <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Default</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="space-y-2">
                      {row.components.map((component, index) => (
                        <div key={component.key} className="flex items-center gap-2">
                          <input
                            aria-label={`${label} tax component ${index + 1} label`}
                            className={`${INPUT} w-24`}
                            value={component.label}
                            onChange={(e) => updateComponent(row.key, component.key, { label: e.target.value })}
                          />
                          <NumberInput
                            aria-label={`${label} tax component ${index + 1} rate in percent`}
                            className={`${INPUT} w-28`}
                            min={0}
                            max={99.999}
                            step={0.001}
                            value={component.rate}
                            onValueChange={(v) => updateComponent(row.key, component.key, { rate: v })}
                          />
                          <span className="text-slate-500">%</span>
                          <button
                            type="button"
                            disabled={row.components.length <= 1}
                            onClick={() => updateRow(row.key, (r) => ({ ...r, components: r.components.filter((c) => c.key !== component.key) }))}
                            aria-label={`Remove ${component.label || "component"} from ${label}`}
                            className="rounded-md px-2 py-1 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          updateRow(row.key, (r) => ({ ...r, components: [...r.components, { key: nextKey(), label: "PST", rate: 0 }] }))
                        }
                        className="text-xs font-semibold text-brand-700 hover:underline"
                      >
                        + Add component
                      </button>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-slate-900">{formatRate(combined)}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => removeProvince(row.key)}
                      aria-label={`Remove ${label}`}
                      className="text-xs font-semibold text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Installed-product contracts in PST provinces can be taxed differently — confirm rates with your accountant.
        </p>
        <button type="button" onClick={addProvince} className={SECONDARY_BUTTON}>+ Add province / territory</button>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- measuring

type Measurement = BusinessSettings["measurement"];

function MeasurementSection({ initial, token }: { initial: Measurement; token: string }) {
  const [deduction, setDeduction] = useState(initial.rough_opening_deduction_in);
  const { saving, status, run, clearStatus } = useSaveAction(token);

  function save() {
    run(
      () =>
        !isNumber(deduction) || deduction < 0 || deduction >= 6
          ? "The rough-opening deduction must be at least 0 and less than 6 inches."
          : null,
      async (adminToken) => {
        const saved = await saveBusinessSettings("measurement", { rough_opening_deduction_in: deduction }, adminToken);
        setDeduction(saved.rough_opening_deduction_in);
        return "Measuring settings saved.";
      }
    );
  }

  const valid = isNumber(deduction) && deduction >= 0 && deduction < 6;

  return (
    <SectionCard
      id="measuring"
      title="Measuring"
      description="The measure sheet subtracts this allowance from each rough-opening dimension (width and height) to get the unit size ordered from the supplier."
      saveLabel="Save measuring"
      saving={saving}
      status={status}
      onSave={save}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rough-opening deduction (inches)" hint="Between 0 and 6 inches, e.g. 0.5 for ½ in.">
          <NumberInput
            min={0}
            max={5.999}
            step={0.125}
            value={deduction}
            onValueChange={(v) => {
              setDeduction(v);
              clearStatus();
            }}
          />
        </Field>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {valid ? (
            <>
              A <strong>36 × 60 in</strong> rough opening orders as{" "}
              <strong>
                {Number((36 - deduction).toFixed(3))} × {Number((60 - deduction).toFixed(3))} in
              </strong>
              .
            </>
          ) : (
            "Enter a deduction between 0 and 6 inches to see an example."
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- job items catalog

type AdderRow = JobAdder & { key: string; isNew: boolean };

function toAdderRows(adders: JobAdder[]): AdderRow[] {
  return [...adders]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((adder) => ({ ...adder, key: nextKey(), isNew: false }));
}

function normalizeAdderId(id: string) {
  return id.trim().toLowerCase().replace(/\s+/g, "_");
}

function JobAddersSection({ token }: { token: string }) {
  const [rows, setRows] = useState<AdderRow[]>([]);
  const [units, setUnits] = useState<JobAdderUnit[]>(Object.keys(UNIT_LABELS) as JobAdderUnit[]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { saving, status, run, clearStatus } = useSaveAction(token);

  useEffect(() => {
    fetchJobAdders()
      .then((payload) => {
        if (payload.units?.length) setUnits(payload.units);
        setRows(toAdderRows(payload.adders));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load job items."))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof JobAdder>(key: string, field: K, value: JobAdder[K]) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    clearStatus();
  }

  function move(index: number, direction: -1 | 1) {
    setRows((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    clearStatus();
  }

  function addRow() {
    let n = rows.length + 1;
    const ids = new Set(rows.map((row) => normalizeAdderId(row.id)));
    while (ids.has(`new_item_${n}`)) n += 1;
    setRows((current) => [
      ...current,
      {
        key: nextKey(),
        isNew: true,
        id: `new_item_${n}`,
        name: "",
        category: "General",
        unit: "each",
        cost: 0,
        price: 0,
        description: "",
        active: false,
        sort_order: current.length,
      },
    ]);
    clearStatus();
  }

  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
    clearStatus();
  }

  function save() {
    run(
      () => {
        const ids = new Set<string>();
        for (const row of rows) {
          const id = normalizeAdderId(row.id);
          if (!id) return "Every job item needs an ID.";
          if (ids.has(id)) return `The ID “${id}” is used twice.`;
          ids.add(id);
          if (!row.name.trim()) return `${id}: enter a name.`;
          if (!isNumber(row.cost) || row.cost < 0) return `${row.name || id}: cost must be 0 or more.`;
          if (!isNumber(row.price) || row.price < 0) return `${row.name || id}: price must be 0 or more.`;
        }
        return null;
      },
      async (adminToken) => {
        const payload: JobAdder[] = rows.map((row, index) => ({
          id: normalizeAdderId(row.id),
          name: row.name.trim(),
          category: row.category.trim() || "General",
          unit: row.unit,
          cost: row.cost,
          price: row.price,
          description: row.description.trim(),
          active: row.active,
          sort_order: index,
        }));
        const saved = await saveJobAdders(payload, adminToken);
        if (saved.units?.length) setUnits(saved.units);
        setRows(toAdderRows(saved.adders));
        const active = saved.adders.filter((adder) => adder.active).length;
        return `Saved ${saved.adders.length} job items · ${active} active for salespeople.`;
      }
    );
  }

  if (loading || loadError) return <LoadingCard id="job-items" title="Job items catalog" error={loadError} />;

  const activeCount = rows.filter((row) => row.active).length;
  const unpricedCount = rows.filter((row) => !row.active && row.price <= 0).length;

  return (
    <SectionCard
      id="job-items"
      title="Job items catalog"
      description="Priced work beyond the products themselves — removal, capping, permits, delivery. Salespeople add active items to an estimate; the quantity follows the unit (per job, per window…) unless they override it. Job items are fixed-price and never discounted."
      saveLabel="Save job items"
      saving={saving}
      status={status}
      onSave={save}
    >
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <p className="font-semibold">Price and activate items before salespeople can use them.</p>
        <p className="mt-1">
          The starter items arrive <strong>inactive at $0</strong>. Enter your cost and customer price, tick <em>Active</em>,
          then save. An item cannot be activated with a price of $0 — the server will reject the save and the message will
          appear below.
          {unpricedCount ? ` ${unpricedCount} inactive item${unpricedCount === 1 ? " still needs" : "s still need"} a price.` : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          <strong className="text-slate-900">{activeCount}</strong> of {rows.length} active
        </p>
        <button type="button" onClick={addRow} className={SECONDARY_BUTTON}>+ Add job item</button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-3">Order</th>
              <th scope="col" className="px-3 py-3">ID</th>
              <th scope="col" className="px-3 py-3">Name</th>
              <th scope="col" className="px-3 py-3">Category</th>
              <th scope="col" className="px-3 py-3">Unit</th>
              <th scope="col" className="px-3 py-3">Cost</th>
              <th scope="col" className="px-3 py-3">Price</th>
              <th scope="col" className="px-3 py-3 text-right">Margin</th>
              <th scope="col" className="px-3 py-3">Active</th>
              <th scope="col" className="px-3 py-3">Description</th>
              <th scope="col" className="px-3 py-3"><span className="sr-only">Delete</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => {
              const label = row.name || row.id || `item ${index + 1}`;
              const margin = isNumber(row.price) && row.price > 0 && isNumber(row.cost) ? ((row.price - row.cost) / row.price) * 100 : null;
              const needsPrice = row.active && !(row.price > 0);
              return (
                <tr key={row.key} className={`align-top ${row.active ? "" : "bg-slate-50/60"}`}>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${label} up`}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === rows.length - 1}
                        aria-label={`Move ${label} down`}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {row.isNew ? (
                      <input
                        aria-label={`ID for ${label}`}
                        className={`${INPUT} w-36 font-mono text-xs`}
                        value={row.id}
                        onChange={(e) => update(row.key, "id", e.target.value)}
                      />
                    ) : (
                      <code className="block whitespace-nowrap pt-2 text-xs text-slate-600">{row.id}</code>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <input aria-label={`Name for ${label}`} className={`${INPUT} w-56`} value={row.name} onChange={(e) => update(row.key, "name", e.target.value)} />
                  </td>
                  <td className="px-3 py-3">
                    <input aria-label={`Category for ${label}`} className={`${INPUT} w-32`} value={row.category} onChange={(e) => update(row.key, "category", e.target.value)} />
                  </td>
                  <td className="px-3 py-3">
                    <select
                      aria-label={`Unit for ${label}`}
                      className={`${INPUT} w-32`}
                      value={row.unit}
                      onChange={(e) => update(row.key, "unit", e.target.value as JobAdderUnit)}
                    >
                      {units.map((unit) => (
                        <option key={unit} value={unit}>{UNIT_LABELS[unit] ?? unit}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <NumberInput aria-label={`Cost for ${label} in dollars`} className={`${INPUT} w-28`} min={0} step={0.01} value={row.cost} onValueChange={(v) => update(row.key, "cost", v)} />
                  </td>
                  <td className="px-3 py-3">
                    <NumberInput
                      aria-label={`Price for ${label} in dollars`}
                      className={`${INPUT} w-28 ${needsPrice ? "border-rose-300" : ""}`}
                      min={0}
                      step={0.01}
                      value={row.price}
                      onValueChange={(v) => update(row.key, "price", v)}
                    />
                    {needsPrice ? <span className="mt-1 block text-[11px] font-medium text-rose-700">Needs a price to be active</span> : null}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-3 pt-5 text-right font-semibold ${margin !== null && margin < 0 ? "text-rose-700" : "text-slate-900"}`}>
                    {margin === null ? "—" : percent(margin)}
                  </td>
                  <td className="px-3 py-3 pt-4">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={row.active} onChange={(e) => update(row.key, "active", e.target.checked)} />
                      <span className="sr-only">Active: {label}</span>
                      <span aria-hidden="true">{row.active ? "Yes" : "No"}</span>
                    </label>
                  </td>
                  <td className="px-3 py-3">
                    <input aria-label={`Description for ${label}`} className={`${INPUT} w-64`} value={row.description} onChange={(e) => update(row.key, "description", e.target.value)} placeholder="Optional note for salespeople" />
                  </td>
                  <td className="px-3 py-3 pt-4 text-right">
                    <button type="button" onClick={() => removeRow(row.key)} aria-label={`Delete ${label}`} className="text-xs font-semibold text-rose-600 hover:underline">
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-slate-500">No job items yet. Add one to get started.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Row order is the order salespeople see. Deleted rows are removed when you save.</p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- sales pricing (presets)

function SalesPricingSection({ token }: { token: string }) {
  const [currency, setCurrency] = useState("CAD");
  const [minimumMarkup, setMinimumMarkup] = useState(20);
  const [profitFloor, setProfitFloor] = useState(1800);
  const [defaultPresetId, setDefaultPresetId] = useState("");
  const [presets, setPresets] = useState<SalesPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminSalesPresets()
      .then((payload) => {
        setCurrency(payload.currency || "CAD");
        setMinimumMarkup(payload.minimum_markup_percent ?? 20);
        setProfitFloor(payload.project_profit_floor ?? 0);
        setDefaultPresetId(payload.default_preset_id || "");
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
    if (!Number.isFinite(profitFloor) || profitFloor < 0) {
      setError("The project profit floor must be $0 or more.");
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
      if (preset.strategy === "sliding_margin") {
        const problem = slidingProblem(preset.sliding || DEFAULT_SLIDING, profitFloor);
        if (problem) {
          setError(`${preset.name}: ${problem}`);
          return;
        }
      } else if (preset.markup_percent < preset.minimum_markup_percent) {
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
          project_profit_floor: Number(profitFloor),
          default_preset_id: defaultPresetId || null,
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
      setProfitFloor(payload.project_profit_floor ?? profitFloor);
      setDefaultPresetId(payload.default_preset_id || defaultPresetId);
      setMessage(`Saved sales controls · version ${payload.sales_config_version}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sales settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section id="sales-pricing" className="scroll-mt-24">
        <p className="text-sm text-slate-500">Loading sales settings…</p>
      </section>
    );
  }

  return (
    <section id="sales-pricing" aria-labelledby="sales-pricing-title" className="scroll-mt-24 space-y-6">
      <div className="max-w-3xl">
        <h3 id="sales-pricing-title" className="text-lg font-semibold text-slate-900">Sales pricing strategies</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Set how each strategy prices a project — a fixed markup, or a margin that slides with the size of the
          project — plus the maximum customer discount and the floors. No project quote earns less than the project
          profit floor unless a manager approves it.
        </p>
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

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Global defaults</h4>
            <p className="mt-1 text-sm text-slate-500">The profit floor applies to every strategy. The default strategy is used for new projects.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{currency}</span>
        </div>
        <div className="mt-5 grid max-w-3xl gap-4 sm:grid-cols-3">
          <Field label="Project profit floor ($)" hint="Hard floor: small projects are priced up to it, and no discount may take a project below it without a manager. 0 turns it off.">
            <input className={INPUT} type="number" min={0} step={50} value={profitFloor} onChange={(event) => setProfitFloor(Number(event.target.value))} />
          </Field>
          <Field label="Default strategy" hint="Pre-selected for new projects and quotes.">
            <select className={INPUT} value={defaultPresetId} onChange={(event) => setDefaultPresetId(event.target.value)}>
              {presets.filter((preset) => preset.active).map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
            </select>
          </Field>
          <Field
            label="Default minimum markup floor (%)"
            hint="Use a negative value to allow the configured strategy to sell below total dealer and installation cost. Minimum: -99%."
          >
            <input
              className={INPUT}
              type="number"
              min={-99}
              step={0.5}
              value={minimumMarkup}
              onChange={(event) => setMinimumMarkup(Number(event.target.value))}
            />
          </Field>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Sales strategies</h4>
            <p className="mt-1 text-sm text-slate-500">The active strategies appear in the quote builder for the sales team.</p>
          </div>
          <button type="button" onClick={addPreset} className={SECONDARY_BUTTON}>+ Add strategy</button>
        </div>

        {presets.map((preset, index) => {
          const lossEnabled = preset.minimum_markup_percent < 0;
          return (
            <article key={`preset-${index}`} className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${lossEnabled ? "border-rose-200" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h5 className="text-base font-semibold text-slate-900">{preset.name || "Unnamed strategy"}</h5>
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
                  <input className={INPUT} value={preset.id} onChange={(event) => updatePreset(index, "id", event.target.value)} />
                </Field>
                <Field label="Name">
                  <input className={INPUT} value={preset.name} onChange={(event) => updatePreset(index, "name", event.target.value)} />
                </Field>
                <Field label="Pricing method">
                  <select className={INPUT} value={preset.strategy || "markup"} onChange={(event) => {
                    const strategy = event.target.value as "markup" | "sliding_margin";
                    updatePreset(index, "strategy", strategy);
                    if (strategy === "sliding_margin" && !preset.sliding) updatePreset(index, "sliding", { ...DEFAULT_SLIDING });
                  }}>
                    <option value="markup">Markup on cost</option>
                    <option value="sliding_margin">Sliding margin (by project size)</option>
                  </select>
                </Field>
                {preset.strategy === "sliding_margin" ? null : (
                  <Field label="Base markup (%)" hint="Markup before any discount.">
                    <input className={INPUT} type="number" min={0} step={0.5} value={preset.markup_percent} onChange={(event) => updatePreset(index, "markup_percent", Number(event.target.value))} />
                  </Field>
                )}
                <Field label="Default discount (%)">
                  <input className={INPUT} type="number" min={0} max={100} step={0.5} value={preset.default_discount_percent} onChange={(event) => updatePreset(index, "default_discount_percent", Number(event.target.value))} />
                </Field>
                <Field label="Maximum discount (%)" hint="Salespeople cannot exceed this without manager approval.">
                  <input className={INPUT} type="number" min={0} max={100} step={0.5} value={preset.max_discount_percent} onChange={(event) => updatePreset(index, "max_discount_percent", Number(event.target.value))} />
                </Field>
                <Field label="Minimum markup floor (%)" hint={lossEnabled ? `Allows up to ${percent(Math.abs(preset.minimum_markup_percent))} below cost.` : "Set below 0 to permit a controlled loss."}>
                  <input className={`${INPUT} ${lossEnabled ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500" : ""}`} type="number" min={-99} step={0.5} value={preset.minimum_markup_percent} onChange={(event) => updatePreset(index, "minimum_markup_percent", Number(event.target.value))} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Description" hint="Shown to the sales team when they choose the strategy.">
                    <input className={INPUT} value={preset.description} onChange={(event) => updatePreset(index, "description", event.target.value)} placeholder="When should this strategy be used?" />
                  </Field>
                </div>
              </div>
              {preset.strategy === "sliding_margin" ? (() => {
                const sliding = preset.sliding || DEFAULT_SLIDING;
                const setSliding = (patch: Partial<typeof sliding>) => updatePreset(index, "sliding", { ...sliding, ...patch });
                return (
                  <div className="mt-5 space-y-4 rounded-xl border border-brand-100 bg-brand-50/50 p-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Starting margin (%)" hint="Small projects.">
                        <input className={INPUT} type="number" min={1} max={94} step={0.5} value={sliding.start_margin_percent} onChange={(event) => setSliding({ start_margin_percent: Number(event.target.value) })} />
                      </Field>
                      <Field label="Ending margin (%)" hint="Large projects.">
                        <input className={INPUT} type="number" min={1} max={94} step={0.5} value={sliding.end_margin_percent} onChange={(event) => setSliding({ end_margin_percent: Number(event.target.value) })} />
                      </Field>
                      <Field label="Flat past profit of ($)" hint="Once profit at the ending margin passes this, the margin stays flat.">
                        <input className={INPUT} type="number" min={1} step={100} value={sliding.cap_profit} onChange={(event) => setSliding({ cap_profit: Number(event.target.value) })} />
                      </Field>
                      <Field label="Basis" hint={sliding.basis === "margin" ? "Profit as a share of the sell price: sell = cost ÷ (1 − margin)." : "Profit as a share of cost: sell = cost × (1 + markup)."}>
                        <select className={INPUT} value={sliding.basis} onChange={(event) => setSliding({ basis: event.target.value as "margin" | "markup" })}>
                          <option value="margin">Margin (on sell price)</option>
                          <option value="markup">Markup (on cost)</option>
                        </select>
                      </Field>
                    </div>
                    <SlidingPreview preset={preset} floor={profitFloor} />
                  </div>
                );
              })() : null}
            </article>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="max-w-2xl">
          <h4 className="text-base font-semibold text-slate-900">Save sales strategies</h4>
          <p className="mt-1 text-sm text-slate-500">Uses the manager token at the top of the page. Saving updates the shared sales controls used by every quote builder.</p>
          <div className="mt-4">
            <button type="button" onClick={save} disabled={saving} className={PRIMARY_BUTTON}>{saving ? "Saving…" : "Save sales controls"}</button>
          </div>
          <div aria-live="polite" role="status">
            {message ? <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
            {error ? <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- page

const SECTIONS = [
  { id: "sales-pricing", label: "Sales strategies" },
  { id: "company", label: "Company" },
  { id: "sales-process", label: "Sales process" },
  { id: "financing", label: "Financing" },
  { id: "tax", label: "Tax rates" },
  { id: "measuring", label: "Measuring" },
  { id: "job-items", label: "Job items" },
];

export default function SalesSettingsPage() {
  const [token, setToken] = useState("");
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    fetchBusinessSettings()
      .then(setSettings)
      .catch((err) => setSettingsError(err instanceof Error ? err.message : "Could not load business settings."));
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Manager controls</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Business &amp; sales settings</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Pricing strategies, company details, the sales process, financing, tax, measuring and the job items
            salespeople can add. Each section saves on its own.
          </p>
        </div>
        <a href="/" className="text-sm font-semibold text-brand-700 hover:underline">← Back to quote builder</a>
      </div>

      <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto">
        <ul className="flex gap-2 px-1 pb-1">
          {SECTIONS.map((section) => (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                className="block rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-500 hover:text-brand-700"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="token-title" className="rounded-2xl border border-brand-100 bg-brand-50 p-4 sm:p-6">
        <h3 id="token-title" className="text-base font-semibold text-slate-900">Manager token</h3>
        <p className="mt-1 text-sm text-slate-600">
          Every Save button on this page needs the pricing admin token. It is kept only in this browser tab and never stored.
        </p>
        <div className="mt-4 max-w-sm">
          <Field label="Pricing admin token">
            <input
              className={INPUT}
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Manager token"
            />
          </Field>
        </div>
      </section>

      <SalesPricingSection token={token} />

      {settings ? (
        <>
          <CompanySection initial={settings.company} token={token} />
          <SalesProcessSection initial={settings.sales_process} token={token} />
          <FinancingSection initial={settings.financing} token={token} />
          <TaxSection initial={settings.tax} token={token} />
          <MeasurementSection initial={settings.measurement} token={token} />
        </>
      ) : (
        <LoadingCard id="company" title="Business settings" error={settingsError} />
      )}

      <JobAddersSection token={token} />
    </div>
  );
}
