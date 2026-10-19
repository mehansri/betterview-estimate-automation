/**
 * Payment schedules, as services/payment_schedule.py and the CRM's
 * src/domain/payment-schedule.ts: the CRM bills against the schedule chosen here.
 */

export type PaymentTrigger = "deposit" | "delivery" | "completion";
export type PaymentMilestone = { trigger: PaymentTrigger; percentage: number };

export const PAYMENT_TRIGGERS: PaymentTrigger[] = ["deposit", "delivery", "completion"];

export const PAYMENT_DUE_LABELS: Record<PaymentTrigger, string> = {
  deposit: "At signing",
  delivery: "At delivery",
  completion: "At completion",
};

/** One-click structures: 35 / 65 is the company default; the rest match the CRM's presets. */
export const PAYMENT_SCHEDULE_PRESETS: Array<{ id: string; label: string; schedule: PaymentMilestone[] }> = [
  { id: "35-65", label: "35 / 65", schedule: [{ trigger: "deposit", percentage: 35 }, { trigger: "completion", percentage: 65 }] },
  { id: "50-50", label: "50 / 50", schedule: [{ trigger: "deposit", percentage: 50 }, { trigger: "completion", percentage: 50 }] },
  { id: "50-25-25", label: "50 / 25 / 25", schedule: [{ trigger: "deposit", percentage: 50 }, { trigger: "delivery", percentage: 25 }, { trigger: "completion", percentage: 25 }] },
  { id: "35-25-40", label: "35 / 25 / 40", schedule: [{ trigger: "deposit", percentage: 35 }, { trigger: "delivery", percentage: 25 }, { trigger: "completion", percentage: 40 }] },
];

export function sortSchedule(schedule: PaymentMilestone[]): PaymentMilestone[] {
  return [...schedule].sort((a, b) => PAYMENT_TRIGGERS.indexOf(a.trigger) - PAYMENT_TRIGGERS.indexOf(b.trigger));
}

export function sameSchedule(left: PaymentMilestone[] | null | undefined, right: PaymentMilestone[] | null | undefined): boolean {
  const key = (schedule: PaymentMilestone[]) => sortSchedule(schedule).map((entry) => `${entry.trigger}:${Number(entry.percentage)}`).join("|");
  return Boolean(left?.length && right?.length) && key(left!) === key(right!);
}

export function scheduleTotal(schedule: PaymentMilestone[]): number {
  return schedule.reduce((sum, entry) => sum + (Number(entry.percentage) || 0), 0);
}

/** null when the schedule can be saved, else what to fix (the API checks the same rules). */
export function scheduleProblem(schedule: PaymentMilestone[]): string | null {
  if (schedule.length < 2) return "Add at least one payment after the deposit.";
  if (!schedule.some((entry) => entry.trigger === "deposit")) return "The schedule needs a deposit.";
  if (schedule.some((entry) => !(Number(entry.percentage) > 0))) return "Every payment needs a percentage.";
  if (Math.abs(scheduleTotal(schedule) - 100) > 0.01) return `Payments add up to ${scheduleTotal(schedule).toFixed(2)}%, not 100%.`;
  return null;
}

/** The wording printed on the estimate, matching services/payment_schedule.terms_lines. */
export function scheduleTermsLines(schedule: PaymentMilestone[]): string[] {
  return sortSchedule(schedule).map((entry) => {
    const percent = `${Number(entry.percentage)}%`;
    if (entry.trigger === "deposit") return `${percent} deposit upon signing.`;
    if (entry.trigger === "delivery") return `${percent} due upon delivery.`;
    return `${percent} due upon project completion.`;
  });
}
