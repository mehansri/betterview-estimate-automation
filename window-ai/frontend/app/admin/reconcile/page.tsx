"use client";

import { FormEvent, useState } from "react";
import type { ReactNode } from "react";
import { ReconcileResult, reconcileSupplierOrder } from "@/lib/api";

const INPUT =
  "input block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm " +
  "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

const PRIMARY_BUTTON =
  "rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60";

const SECONDARY_BUTTON =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

const TEMPLATE_HEADER =
  "ref,type,style,width,height,qty,loe180,i89,gas,triple,colour_ext,colour_int,brickmould,wood_jamb,nominal_ft,kind,supplier_unit_cost";

const TEMPLATE_ROWS = [
  "W1,window,HC-101,30,60,2,yes,no,argon,no,white,,no,no,,,298.37",
  "W2,window,HC-126,36,24,1,yes,yes,argon,no,black,white,yes,no,,,344.96",
];

const COLUMN_HELP: Array<[string, string]> = [
  ["ref", "Your reference for the line (e.g. the supplier line number)."],
  ["type", "window, patio_sliding or patio_swing (default window)."],
  ["style", "Supplier style code, e.g. HC-101 (windows)."],
  ["width, height", "Unit size in inches."],
  ["qty", "Quantity on the order (default 1)."],
  ["loe180, i89, triple", "yes / no glazing options."],
  ["gas", "argon, 50/50 or krypton."],
  ["colour_ext, colour_int", "Exterior / interior colour, e.g. white, black."],
  ["brickmould, wood_jamb", "yes / no accessories."],
  ["nominal_ft", "Patio sliding doors only: nominal width in feet."],
  ["kind", "Patio swing doors only: single or double."],
  ["supplier_unit_cost", "Required. What the supplier charged per unit, before tax."],
];

type Line = ReconcileResult["lines"][number];

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatMoney(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : money.format(value);
}

function differenceTone(value: number | null | undefined) {
  if (!value) return "text-slate-700";
  // Positive = the engine charges more than the supplier did; negative = the supplier charged more.
  return value < 0 ? "text-rose-700" : "text-amber-700";
}

function downloadTemplate() {
  const csv = `${[TEMPLATE_HEADER, ...TEMPLATE_ROWS].join("\r\n")}\r\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "supplier-cost-check-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Stat({ label, value, hint, tone = "text-slate-900" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${tone}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: Line["status"] }) {
  const styles: Record<Line["status"], string> = {
    ok: "bg-emerald-100 text-emerald-800",
    drift: "bg-amber-100 text-amber-800",
    error: "bg-rose-100 text-rose-800",
  };
  const labels: Record<Line["status"], string> = { ok: "OK", drift: "Drift", error: "Error" };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status]}`}>{labels[status]}</span>;
}

function Summary({ result }: { result: ReconcileResult }) {
  const { summary } = result;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Lines" value={summary.lines} hint={`Tolerance ±${result.tolerance_percent}%`} />
      <Stat label="Matched" value={summary.matched} tone="text-emerald-700" hint="Within tolerance" />
      <Stat label="Drift" value={summary.drift} tone={summary.drift ? "text-amber-700" : "text-slate-900"} hint="Outside tolerance" />
      <Stat label="Errors" value={summary.errors} tone={summary.errors ? "text-rose-700" : "text-slate-900"} hint="Could not be priced" />
      <Stat label="Engine total" value={money.format(summary.engine_total)} hint="Price-book dealer cost × qty" />
      <Stat label="Supplier total" value={money.format(summary.supplier_total)} hint="Supplier cost × qty" />
      <Stat
        label="Difference"
        value={formatMoney(summary.difference)}
        tone={differenceTone(summary.difference)}
        hint="Engine − supplier (priced lines)"
      />
      <Stat
        label="Difference %"
        value={formatPercent(summary.difference_percent)}
        tone={differenceTone(summary.difference_percent)}
        hint={summary.difference < 0 ? "Supplier charges more than the price book" : summary.difference > 0 ? "Price book is higher than the supplier" : "No difference"}
      />
    </div>
  );
}

function LinesTable({ lines }: { lines: Line[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">Ref</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Item</th>
            <th scope="col" className="px-4 py-3 text-right">Qty</th>
            <th scope="col" className="px-4 py-3 text-right">Engine unit cost</th>
            <th scope="col" className="px-4 py-3 text-right">Supplier unit cost</th>
            <th scope="col" className="px-4 py-3 text-right">Difference</th>
            <th scope="col" className="px-4 py-3 text-right">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((line) => (
            <tr key={`${line.row}-${line.ref}`} className={line.status === "error" ? "bg-rose-50/50" : line.status === "drift" ? "bg-amber-50/40" : undefined}>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                {line.ref}
                <span className="block text-[11px] font-normal text-slate-400">CSV row {line.row}</span>
              </td>
              <td className="px-4 py-3"><StatusBadge status={line.status} /></td>
              {line.status === "error" ? (
                <td colSpan={6} className="px-4 py-3 text-rose-800">{line.error || "This line could not be priced."}</td>
              ) : (
                <>
                  <td className="px-4 py-3 text-slate-700">{line.description || "—"}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{line.qty ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatMoney(line.engine_unit_cost)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatMoney(line.supplier_unit_cost)}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${line.status === "ok" ? "text-slate-700" : differenceTone(line.difference)}`}>
                    {formatMoney(line.difference)}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${line.status === "ok" ? "text-emerald-700" : differenceTone(line.difference_percent)}`}>
                    {formatPercent(line.difference_percent)}
                  </td>
                </>
              )}
            </tr>
          ))}
          {!lines.length ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-slate-500">The file had no order lines.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function ReconcilePage() {
  const [file, setFile] = useState<File | null>(null);
  const [tolerance, setTolerance] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconcileResult | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose the CSV file with the supplier order lines.");
      return;
    }
    const tolerancePercent = Number(tolerance);
    if (tolerance.trim() === "" || !Number.isFinite(tolerancePercent) || tolerancePercent < 0) {
      setError("Tolerance must be a number, 0 or more.");
      return;
    }
    setBusy(true);
    try {
      setResult(await reconcileSupplierOrder(file, tolerancePercent));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "The cost check failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Manager controls</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Supplier cost check</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Upload the lines of a supplier order confirmation to check that the price book still matches what the supplier
          actually charges. Lines outside the tolerance are flagged so the price book can be updated.
        </p>
      </div>

      <section aria-labelledby="template-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h3 id="template-title" className="text-base font-semibold text-slate-900">1. Fill in the template</h3>
            <p className="mt-1 text-sm text-slate-500">
              One row per order line. Copy the product details and the supplier&apos;s unit cost from the order confirmation.
              Leave columns that don&apos;t apply blank.
            </p>
          </div>
          <button type="button" onClick={downloadTemplate} className={SECONDARY_BUTTON}>Download CSV template</button>
        </div>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold text-brand-700">Column reference</summary>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {COLUMN_HELP.map(([column, help]) => (
              <div key={column} className="min-w-0">
                <dt className="font-mono text-xs font-semibold text-slate-800">{column}</dt>
                <dd className="text-xs text-slate-600">{help}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>

      <section aria-labelledby="upload-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h3 id="upload-title" className="text-base font-semibold text-slate-900">2. Check the order</h3>
        <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <label className="block min-w-0 text-sm">
            <span className="mb-1 block font-medium text-slate-700">Supplier order CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="block w-full min-w-0 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="block min-w-0 text-sm">
            <span className="mb-1 block font-medium text-slate-700">Tolerance (%)</span>
            <input
              className={INPUT}
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              aria-describedby="tolerance-hint"
            />
          </label>
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>{busy ? "Checking…" : "Check costs"}</button>
        </form>
        <p id="tolerance-hint" className="mt-2 text-xs text-slate-500">
          Lines whose engine cost differs from the supplier cost by more than this percentage are flagged as drift.
        </p>
        <div aria-live="polite" role="status">
          {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        </div>
      </section>

      {result ? (
        <section aria-labelledby="results-title" className="space-y-4">
          <h3 id="results-title" className="text-base font-semibold text-slate-900">Results</h3>
          <Summary result={result} />
          <LinesTable lines={result.lines} />
          <p className="text-xs text-slate-500">
            Difference = engine unit cost − supplier unit cost. A negative difference means the supplier charged more than the
            price book predicts, so quotes may be under-priced.
          </p>
        </section>
      ) : null}
    </div>
  );
}
