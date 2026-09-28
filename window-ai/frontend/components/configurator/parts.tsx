"use client";

import { ReactNode, useState } from "react";
import type { NumericInputValue } from "@/lib/numericInput";
import { fmtInches, parseInches } from "@/lib/windowLayout";

/** Controls shared by the window, patio door and bay configurators. */

export function money(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 }).format(value);
}

export function SectionTitle({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
      {note ? <span className="normal-case tracking-normal text-slate-400"> — {note}</span> : null}
    </p>
  );
}

/** A text field for inches that accepts 35 1/2, 35.5 or 35½ and shows fractions. */
export function InchInput({ value, onChange, label, min = 1, hint }: { value: NumericInputValue; onChange: (value: NumericInputValue) => void; label: string; min?: number; hint?: string }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value === "" ? "" : fmtInches(Number(value)));
  function commit(raw: string) {
    setText(null);
    if (!raw.trim()) return onChange("");
    const parsed = parseInches(raw);
    if (Number.isFinite(parsed) && parsed >= min) onChange(Math.round(parsed * 1000) / 1000);
  }
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="relative block">
        <input
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-10 text-2xl font-semibold tabular-nums text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
          inputMode="decimal"
          value={shown}
          onChange={(event) => setText(event.target.value)}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }}
          aria-label={`${label} in inches`}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg text-slate-400">″</span>
      </span>
      {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (value: number) => void; min: number; max: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <div className="flex items-center rounded-lg border border-slate-300 bg-white">
        <button type="button" className="px-2.5 py-1 text-lg leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-40" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>−</button>
        <span className="w-6 text-center text-sm font-semibold tabular-nums">{value}</span>
        <button type="button" className="px-2.5 py-1 text-lg leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-40" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}

export function OptionCard({ active, onClick, children, className = "", disabled }: { active: boolean; onClick: () => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={`group relative rounded-xl border bg-white text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-brand-500 ring-2 ring-brand-200 shadow-sm" : "border-slate-200 hover:border-brand-300 hover:shadow-sm"} ${className}`}
    >
      {active ? <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">✓</span> : null}
      {children}
    </button>
  );
}

export function ToolButton({ onClick, children, title, tone = "default", disabled }: { onClick: () => void; children: ReactNode; title: string; tone?: "default" | "danger"; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${tone === "danger" ? "border-rose-200 bg-white text-rose-700 hover:bg-rose-50" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50"}`}
    >
      {children}
    </button>
  );
}

/** Tiny glyphs for the split tools. */
export function Glyph({ kind }: { kind: "cols2" | "cols3" | "rows2" | "transom" | "merge" | "plus" | "minus" }) {
  const stroke = { stroke: "currentColor", strokeWidth: 1.6, fill: "none" };
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} aria-hidden>
      {kind === "plus" || kind === "minus" ? null : <rect x={2} y={2} width={16} height={16} rx={1.5} {...stroke} />}
      {kind === "cols2" ? <line x1={10} y1={2} x2={10} y2={18} {...stroke} /> : null}
      {kind === "cols3" ? <><line x1={7.3} y1={2} x2={7.3} y2={18} {...stroke} /><line x1={12.7} y1={2} x2={12.7} y2={18} {...stroke} /></> : null}
      {kind === "rows2" ? <line x1={2} y1={10} x2={18} y2={10} {...stroke} /> : null}
      {kind === "transom" ? <line x1={2} y1={6.5} x2={18} y2={6.5} {...stroke} /> : null}
      {kind === "merge" ? <path d="M6 10h8M8 7.5 5.5 10 8 12.5M12 7.5l2.5 2.5-2.5 2.5" {...stroke} /> : null}
      {kind === "plus" ? <path d="M10 4v12M4 10h12" {...stroke} /> : null}
      {kind === "minus" ? <path d="M4 10h12" {...stroke} /> : null}
    </svg>
  );
}

/** A row of pill buttons for a small set of choices (gas, handing, angle). */
export function ChipGroup<T extends string | number>({ label, options, value, onChange }: { label?: string; options: Array<{ id: T; label: string; disabled?: boolean }>; value: T; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label ? <span className="text-xs font-semibold text-slate-600">{label}</span> : null}
      {options.map((option) => (
        <button
          key={String(option.id)}
          type="button"
          disabled={option.disabled}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${value === option.id ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
