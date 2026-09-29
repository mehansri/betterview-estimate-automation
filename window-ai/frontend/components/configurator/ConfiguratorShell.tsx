"use client";

import { ReactNode } from "react";
import type { UnitSectionDetails } from "@/lib/api";
import { InternalOnly } from "@/lib/viewMode";
import { money, Stepper } from "@/components/configurator/parts";

/**
 * The editing layout every product shares: a header with numbered steps, the
 * step panel on the left, and a live preview on the right with the drawing,
 * price, energy, room and quantity. Windows, patio doors and bays only swap
 * the step contents, so reps move between products without relearning the
 * screen, and changes to the frame (like hiding costs) are made once.
 */
export type ConfiguratorStep = { id: string; label: string; hint: string };

export type ConfiguratorPrice = {
  pending: boolean;
  error?: string | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
  dealerEach?: number | null;
  sections?: UnitSectionDetails[] | null;
};

type Props = {
  eyebrow: string;
  title: string;
  steps: readonly ConfiguratorStep[];
  step: string;
  onStep: (id: string) => void;
  children: ReactNode;
  preview: {
    heading: string;
    subheading?: string | null;
    badge?: string;
    drawing: ReactNode;
    hint?: string;
    below?: ReactNode;
  };
  price: ConfiguratorPrice;
  /** "window", "door", "bay" -- used in the price card and buttons. */
  noun: string;
  /** Energy ratings per section; omit for products without ratings on file. */
  energy?: UnitSectionDetails[] | null;
  qty: number;
  /** Omit to hide the quantity stepper (one opening per line). */
  onQty?: (qty: number) => void;
  location: string;
  onLocationChange: (value: string) => void;
  /** Add-to-project button; omitted while editing a saved line. */
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  /**
   * Ordered pipelines: per-step completion. Steps past the first incomplete
   * one are locked, and Next waits for the current step. Omit for free
   * navigation (windows, patio doors, bays).
   */
  completed?: boolean[];
  /** Price-card note while the price cannot be computed yet. */
  pricePlaceholder?: string;
};

export default function ConfiguratorShell({ eyebrow, title, steps, step, onStep, children, preview, price, noun, energy, qty, onQty, location, onLocationChange, primaryAction, completed, pricePlaceholder }: Props) {
  const stepIndex = Math.max(0, steps.findIndex((item) => item.id === step));
  const firstOpen = completed ? (completed.findIndex((value) => !value) === -1 ? steps.length : completed.findIndex((value) => !value)) : steps.length;
  const locked = (index: number) => Boolean(completed) && index > firstOpen;
  const canAdvance = !completed || Boolean(completed[stepIndex]);
  const rated = energy && energy.length > 0 && energy.every((section) => section.energy);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-5 py-4 backdrop-blur">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">{eyebrow}</p>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        <ol className="flex flex-wrap items-center gap-1" aria-label="Configuration steps">
          {steps.map((item, index) => {
            const active = index === stepIndex;
            const done = completed ? Boolean(completed[index]) && index < firstOpen : index < stepIndex;
            const isLocked = locked(index);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onStep(item.id)}
                  disabled={isLocked}
                  title={isLocked ? "Finish the earlier steps first" : undefined}
                  aria-current={active ? "step" : undefined}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? "bg-brand-600 text-white shadow-sm" : done ? "bg-brand-50 text-brand-700 hover:bg-brand-100" : "text-slate-500 hover:bg-slate-100"}`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${active ? "bg-white/20" : done ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600"}`}>{done && !active ? "✓" : index + 1}</span>
                  {item.label}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* ------------------------------------------------ step panel */}
        <div className="border-b border-slate-200 p-5 xl:border-b-0 xl:border-r">
          <p className="mb-4 text-sm text-slate-500">{steps[stepIndex]?.hint}.</p>
          {children}
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
            <button type="button" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40" onClick={() => onStep(steps[Math.max(0, stepIndex - 1)].id)} disabled={stepIndex === 0}>← Back</button>
            {stepIndex < steps.length - 1 ? (
              <button type="button" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onStep(steps[stepIndex + 1].id)} disabled={!canAdvance} title={canAdvance ? undefined : "Complete this step first"}>Next: {steps[stepIndex + 1].label} →</button>
            ) : primaryAction ? (
              <button type="button" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>{primaryAction.label}</button>
            ) : null}
          </div>
        </div>

        {/* ------------------------------------------------ live preview */}
        <div className="bg-[radial-gradient(circle_at_top,_#f1f5f9,_#ffffff_65%)] p-5">
          <div className="xl:sticky xl:top-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Viewed from outside</p>
                <p className="text-base font-semibold text-slate-900">{preview.heading}</p>
                {preview.subheading ? <p className="text-xs text-slate-500">{preview.subheading}</p> : null}
              </div>
              {preview.badge ? <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold capitalize text-slate-600 ring-1 ring-slate-200">{preview.badge}</span> : null}
            </div>

            <div className="mt-4 flex min-h-[18rem] items-center justify-center rounded-2xl border border-slate-200 bg-white p-4 shadow-inner">
              {preview.drawing}
            </div>
            {preview.hint ? <p className="mt-2 text-center text-[11px] text-slate-500">{preview.hint}</p> : null}
            {preview.below}

            <div className={`mt-4 grid gap-3 ${energy !== undefined ? "sm:grid-cols-2" : ""}`}>
              <div className="rounded-2xl bg-slate-900 p-4 text-white">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Price per {noun}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{price.pending && price.unitPrice == null ? "…" : money(price.unitPrice)}</p>
                {price.unitPrice == null && !price.pending && pricePlaceholder ? <p className="mt-1 text-xs text-slate-300">{pricePlaceholder}</p> : <p className="mt-1 text-xs text-slate-300">{onQty ? <>{qty} × = <b className="text-white">{money(price.lineTotal)}</b> incl. install, before HST</> : "Incl. install, before HST"}</p>}
                <InternalOnly>
                  {price.dealerEach != null ? <p className="mt-2 border-t border-white/10 pt-2 text-[11px] text-slate-400">Dealer cost {money(price.dealerEach)} each</p> : null}
                </InternalOnly>
                {price.pending ? <p className="mt-1 text-[11px] text-slate-400">Updating…</p> : null}
                {price.error ? <p className="mt-1 text-[11px] text-amber-300">{price.error}</p> : null}
              </div>
              {energy !== undefined ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Energy</p>
                  {energy && energy.length ? (
                    <div className="mt-1 space-y-1">
                      {energy.map((section) => (
                        <p key={section.index} className="flex justify-between gap-2 text-xs text-emerald-950">
                          <span>{energy.length > 1 ? `${section.index} · ` : ""}{section.label}</span>
                          <span className="font-semibold tabular-nums">{section.energy ? `ER ${section.energy.er} · U ${section.energy.u_ip}` : "not on file"}</span>
                        </p>
                      ))}
                      {rated && energy.every((section) => section.energy?.energy_star) ? (
                        <p className="mt-1 inline-block rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{energy.every((s) => s.energy?.energy_star === "most_efficient") ? "ENERGY STAR Most Efficient" : "ENERGY STAR"}</p>
                      ) : null}
                    </div>
                  ) : <p className="mt-1 text-xs text-emerald-900">{price.pending ? "Calculating…" : "Ratings appear once priced."}</p>}
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Room / location</span>
                <input className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100" value={location} onChange={(event) => onLocationChange(event.target.value)} placeholder="e.g. Living room — front" />
              </label>
              {onQty ? <div className="flex items-end">
                <Stepper label="Qty" value={qty} onChange={onQty} min={1} max={99} />
              </div> : null}
            </div>
            {primaryAction ? (
              <button type="button" className="mt-4 w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>{primaryAction.label}</button>
            ) : (
              <p className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-center text-xs text-brand-800">Changes apply to this line. Save the changes to update the project.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
