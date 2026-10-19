"use client";

import {
  PAYMENT_DUE_LABELS,
  PAYMENT_SCHEDULE_PRESETS,
  PAYMENT_TRIGGERS,
  sameSchedule,
  scheduleProblem,
  scheduleTermsLines,
  scheduleTotal,
  sortSchedule,
  type PaymentMilestone,
  type PaymentTrigger,
} from "@/lib/paymentSchedule";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

/**
 * Terms of payment as one-click presets plus editable milestones, like the CRM's
 * payment schedule. ``value`` null means the company default (``defaultSchedule``),
 * which is offered as its own choice when ``allowDefault`` is set.
 */
export default function PaymentSchedulePicker({
  value,
  defaultSchedule,
  allowDefault = true,
  typedTerms,
  total,
  disabled,
  onChange,
}: {
  value: PaymentMilestone[] | null | undefined;
  defaultSchedule: PaymentMilestone[];
  allowDefault?: boolean;
  /** Terms typed before schedules existed: printed until a schedule is picked. */
  typedTerms?: string | null;
  /** Estimate total incl. tax, to show each payment in dollars. */
  total?: number | null;
  disabled?: boolean;
  onChange: (value: PaymentMilestone[] | null) => void;
}) {
  const typed = !value?.length && typedTerms?.trim() ? typedTerms.trim() : "";
  const usingDefault = allowDefault && !value?.length && !typed;
  const shown = typed ? [] : sortSchedule(usingDefault ? defaultSchedule : value ?? defaultSchedule);
  const problem = usingDefault || typed ? null : scheduleProblem(shown);
  const free = typed ? [] : PAYMENT_TRIGGERS.filter((trigger) => !shown.some((entry) => entry.trigger === trigger));

  function edit(next: PaymentMilestone[]) {
    onChange(sortSchedule(next));
  }

  function setPercentage(trigger: PaymentTrigger, percentage: number) {
    edit(shown.map((entry) => (entry.trigger === trigger ? { ...entry, percentage } : entry)));
  }

  function setDue(trigger: PaymentTrigger, due: PaymentTrigger) {
    // Two later payments swap due points rather than collide.
    edit(shown.map((entry) => (entry.trigger === trigger ? { ...entry, trigger: due } : entry.trigger === due ? { ...entry, trigger } : entry)));
  }

  function addPayment() {
    const trigger = free[0];
    if (!trigger) return;
    edit([...shown, { trigger, percentage: Math.max(1, Number((100 - scheduleTotal(shown)).toFixed(2))) }]);
  }

  return (
    <div className="payment-picker">
      <div className="payment-picker-presets" role="group" aria-label="Common payment structures">
        <span>Quick pick:</span>
        {allowDefault ? (
          <button type="button" className={`payment-chip${usingDefault ? " active" : ""}`} aria-pressed={usingDefault} disabled={disabled} onClick={() => onChange(null)}>
            Company default ({sortSchedule(defaultSchedule).map((entry) => Number(entry.percentage)).join(" / ")})
          </button>
        ) : null}
        {PAYMENT_SCHEDULE_PRESETS.map((preset) => {
          const active = !usingDefault && sameSchedule(shown, preset.schedule);
          return (
            <button key={preset.id} type="button" className={`payment-chip${active ? " active" : ""}`} aria-pressed={active} disabled={disabled} onClick={() => onChange(preset.schedule.map((entry) => ({ ...entry })))}>
              {preset.label}
            </button>
          );
        })}
      </div>

      <div className="payment-picker-rows">
        {shown.map((entry) => (
          <div key={entry.trigger} className="payment-picker-row">
            <select
              className="project-input"
              aria-label="When due"
              value={entry.trigger}
              disabled={disabled || usingDefault || entry.trigger === "deposit"}
              onChange={(event) => setDue(entry.trigger, event.target.value as PaymentTrigger)}
            >
              {(entry.trigger === "deposit" ? ["deposit"] : ["delivery", "completion"]).map((trigger) => (
                <option key={trigger} value={trigger}>{PAYMENT_DUE_LABELS[trigger as PaymentTrigger]}</option>
              ))}
            </select>
            <label className="payment-picker-percent">
              <input
                className="project-input"
                type="number"
                min={0.01}
                max={100}
                step={0.01}
                aria-label={`${PAYMENT_DUE_LABELS[entry.trigger]} percentage`}
                value={entry.percentage}
                disabled={disabled || usingDefault}
                onChange={(event) => setPercentage(entry.trigger, Number(event.target.value))}
              />
              <span>%</span>
            </label>
            <span className="payment-picker-amount">{total ? money.format((total * (Number(entry.percentage) || 0)) / 100) : ""}</span>
            {!usingDefault && entry.trigger !== "deposit" && shown.length > 2 ? (
              <button type="button" className="payment-picker-remove" disabled={disabled} onClick={() => edit(shown.filter((item) => item.trigger !== entry.trigger))}>Remove</button>
            ) : <span />}
          </div>
        ))}
      </div>

      <div className="payment-picker-footer">
        {!usingDefault && free.length ? <button type="button" className="button secondary" disabled={disabled} onClick={addPayment}>Add a payment</button> : <span />}
        {typed ? (
          <p className="payment-picker-problem">Printing typed terms: “{typed.replace(/\n+/g, " ")}”. The CRM can&apos;t bill from these; pick a schedule to replace them.</p>
        ) : problem ? <p className="payment-picker-problem" role="alert">{problem}</p> : <p className="payment-picker-preview">{scheduleTermsLines(shown).join(" ")}</p>}
      </div>
    </div>
  );
}
