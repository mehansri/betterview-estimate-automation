"use client";

import { useMemo, useState } from "react";
import {
  BatchResponse,
  WindowSpec,
  predictBatch,
} from "@/lib/api";

const WINDOW_TYPES = [
  "Casement",
  "Awning",
  "Fixed",
  "Slider",
  "Double Hung",
  "Picture",
  "Patio Door",
];
const FRAMES = ["Vinyl", "Aluminum", "Fiberglass", "Wood"];
const GLASS = ["Single", "Double", "Triple"];
const COLORS = ["White", "Black", "Dark Bronze", "Brown", "Beige", "Gray"];
const GRIDS = ["None", "Colonial", "Prairie", "Diamond"];
const SHAPES = ["Rectangular", "Arched", "Custom"];
const INSTALLATIONS = ["New Construction", "Replacement", "Retrofit"];
const GAS_FILLS = ["Argon", "Krypton", "None"];

const emptyForm = (): WindowSpec => ({
  type: "Casement",
  width: 48,
  height: 60,
  frame: "Vinyl",
  glass: "Double",
  color: "White",
  tempered: false,
  grid: "None",
  shape: "Rectangular",
  installation: "Replacement",
  quantity: 1,
  brickmould: true,
  wood_jamb: true,
  screen: true,
  mulled: false,
  nailing_flange: false,
  gas_fill: "Argon",
  color_upcharge: false,
});

function money(n: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function confidenceTone(c: number) {
  if (c >= 95) return "bg-emerald-100 text-emerald-800";
  if (c >= 85) return "bg-amber-100 text-amber-900";
  return "bg-rose-100 text-rose-800";
}

function specsEqual(a: WindowSpec, b: WindowSpec): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateLines(windows: WindowSpec[]): string | null {
  for (const w of windows) {
    if (!w.width || !w.height || w.width <= 0 || w.height <= 0) {
      return "Width and height must be greater than 0 for every line.";
    }
    if (!w.quantity || w.quantity < 1) {
      return "Quantity must be at least 1 for every line.";
    }
  }
  return null;
}

/**
 * Build the list of lines to price.
 * - No lines yet → price the current form.
 * - Lines exist and form still matches the last line → re-price existing lines only
 *   (user clicked Generate again without changing specs).
 * - Lines exist and form differs (e.g. switched Awning → Patio Door) → append form
 *   as a new line so the quote updates and line count goes up.
 */
function buildQuotePayload(
  lines: WindowSpec[],
  form: WindowSpec
): WindowSpec[] {
  if (!lines.length) {
    return [{ ...form }];
  }
  const last = lines[lines.length - 1];
  if (specsEqual(last, form)) {
    return lines;
  }
  return [...lines, { ...form }];
}

export default function QuoteBuilder() {
  const [form, setForm] = useState<WindowSpec>(emptyForm());
  const [lines, setLines] = useState<WindowSpec[]>([]);
  const [result, setResult] = useState<BatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const area = useMemo(
    () => (form.width * form.height) / 144,
    [form.width, form.height]
  );

  const formIsNewLine = useMemo(() => {
    if (!lines.length) return false;
    return !specsEqual(lines[lines.length - 1], form);
  }, [lines, form]);

  function update<K extends keyof WindowSpec>(key: K, value: WindowSpec[K]) {
    setForm((f) => {
      const next = { ...f, [key]: value };
      // Exterior non-white colors usually carry a color upcharge on Window City
      if (key === "color") {
        const c = String(value);
        next.color_upcharge = !["White", "Beige"].includes(c);
      }
      if (key === "nailing_flange" && value === true) {
        next.installation = "New Construction";
      }
      if (key === "installation" && value === "New Construction") {
        next.nailing_flange = true;
      }
      return next;
    });
  }

  function addLine() {
    setLines((prev) => {
      // Avoid duplicate consecutive lines if user double-clicks Add
      if (prev.length && specsEqual(prev[prev.length - 1], form)) {
        return prev;
      }
      return [...prev, { ...form }];
    });
    setResult(null);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  }

  async function generateQuote() {
    const payload = buildQuotePayload(lines, form);
    const validationError = validateLines(payload);
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await predictBatch(payload);
      setLines(payload);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Prediction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-5">
      <section className="lg:col-span-3 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Window specifications
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Fields match drivers seen on Window City / Keystone order PDFs.
            Size and type dominate price; options below refine the estimate.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Window type">
              <select
                className="input"
                value={form.type}
                onChange={(e) => update("type", e.target.value)}
              >
                {WINDOW_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Frame">
              <select
                className="input"
                value={form.frame}
                onChange={(e) => update("frame", e.target.value)}
              >
                {FRAMES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Width (in)">
              <input
                type="number"
                min={1}
                step={0.1}
                className="input"
                value={form.width}
                onChange={(e) => update("width", Number(e.target.value))}
              />
            </Field>
            <Field label="Height (in)">
              <input
                type="number"
                min={1}
                step={0.1}
                className="input"
                value={form.height}
                onChange={(e) => update("height", Number(e.target.value))}
              />
            </Field>
            <Field label="Glass">
              <select
                className="input"
                value={form.glass}
                onChange={(e) => update("glass", e.target.value)}
              >
                {GLASS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Exterior color">
              <select
                className="input"
                value={form.color}
                onChange={(e) => update("color", e.target.value)}
              >
                {COLORS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Gas fill">
              <select
                className="input"
                value={form.gas_fill}
                onChange={(e) => update("gas_fill", e.target.value)}
              >
                {GAS_FILLS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Grid">
              <select
                className="input"
                value={form.grid}
                onChange={(e) => update("grid", e.target.value)}
              >
                {GRIDS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Shape">
              <select
                className="input"
                value={form.shape}
                onChange={(e) => update("shape", e.target.value)}
              >
                {SHAPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Installation">
              <select
                className="input"
                value={form.installation}
                onChange={(e) => update("installation", e.target.value)}
              >
                {INSTALLATIONS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Quantity">
              <input
                type="number"
                min={1}
                className="input"
                value={form.quantity}
                onChange={(e) => update("quantity", Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-slate-700">
              Options (common on manufacturer PDFs)
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Check
                label="Tempered glass"
                checked={form.tempered}
                onChange={(v) => update("tempered", v)}
              />
              <Check
                label="Brickmould"
                checked={form.brickmould}
                onChange={(v) => update("brickmould", v)}
              />
              <Check
                label="Wood jamb extension"
                checked={form.wood_jamb}
                onChange={(v) => update("wood_jamb", v)}
              />
              <Check
                label="Full screen"
                checked={form.screen}
                onChange={(v) => update("screen", v)}
              />
              <Check
                label="Mulled / multi-unit"
                checked={form.mulled}
                onChange={(v) => update("mulled", v)}
              />
              <Check
                label="Nailing flange (new construction)"
                checked={form.nailing_flange}
                onChange={(v) => update("nailing_flange", v)}
              />
              <Check
                label="Color upcharge (exterior)"
                checked={form.color_upcharge}
                onChange={(v) => update("color_upcharge", v)}
              />
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Area ≈ {area.toFixed(2)} sq ft ({form.width}″ × {form.height}″) —
            size is the strongest price driver in your PDFs (area corr ≈ 0.95).
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={addLine}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Add to quote
            </button>
            <button
              type="button"
              onClick={generateQuote}
              disabled={loading}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
            >
              {loading
                ? "Predicting…"
                : formIsNewLine
                  ? "Add & generate quote"
                  : "Generate quote"}
            </button>
          </div>
          {formIsNewLine && (
            <p className="mt-3 text-xs text-slate-500">
              Form specs differ from the last quote line (
              {lines[lines.length - 1]?.type}). Generate will add{" "}
              <strong>{form.type}</strong> as line {lines.length + 1} and
              re-price the full quote.
            </p>
          )}
          {error && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>

        {lines.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">
              Quote lines ({lines.length})
            </h3>
            <ul className="mt-4 divide-y divide-slate-100">
              {lines.map((line, idx) => (
                <li
                  key={idx}
                  className="flex items-start justify-between gap-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {line.quantity}× {line.type} · {line.width}″ × {line.height}″
                    </p>
                    <p className="text-slate-500">
                      {line.frame} · {line.glass} · {line.color}
                      {line.tempered ? " · Tempered" : ""}
                      {line.mulled ? " · Mulled" : ""}
                      {line.brickmould ? " · BM" : ""}
                      {line.wood_jamb ? " · Jamb" : ""}
                      {line.screen ? " · Screen" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="text-xs font-medium text-rose-600 hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className="lg:col-span-2">
        <div className="sticky top-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Estimated quote
          </h2>
          {!result ? (
            <p className="mt-3 text-sm text-slate-500">
              Click <strong>Generate quote</strong> to get AI price predictions with
              confidence bands.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {result.lines.map((line, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-800">
                      Line {idx + 1}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${confidenceTone(
                        line.confidence
                      )}`}
                    >
                      {line.confidence}% conf.
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                    {money(line.line_total, line.currency)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Unit {money(line.predicted_price, line.currency)} × {line.quantity}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Range{" "}
                    {money(line.low * (line.quantity || 1), line.currency)} –{" "}
                    {money(line.high * (line.quantity || 1), line.currency)}
                  </p>
                </div>
              ))}
              <div className="border-t border-slate-200 pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Quote subtotal
                </p>
                <p className="mt-1 text-3xl font-bold text-brand-700">
                  {money(result.quote_subtotal, result.currency)}
                </p>
                {result.lines[0]?.model_name && (
                  <p className="mt-2 text-xs text-slate-400">
                    Model: {result.lines[0].model_name}
                    {result.lines[0].model_version
                      ? ` · ${result.lines[0].model_version.slice(0, 19)}`
                      : ""}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #e2e8f0;
          background: #fff;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #0f172a;
        }
        .input:focus {
          outline: 2px solid #93c5fd;
          outline-offset: 0;
          border-color: #3b82f6;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600"
      />
      {label}
    </label>
  );
}
