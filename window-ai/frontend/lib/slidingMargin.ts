import type { SlidingMarginSettings } from "@/lib/api";

/** Mirrors services/windowcity/margin.py so managers can preview the curve they save. */

export const DEFAULT_SLIDING: SlidingMarginSettings = {
  start_margin_percent: 45,
  end_margin_percent: 30,
  cap_profit: 4000,
  basis: "margin",
};

function profitAt(cost: number, rate: number, basis: SlidingMarginSettings["basis"]) {
  return basis === "margin" ? (cost * rate) / (1 - rate) : cost * rate;
}

export function breakpoints(settings: SlidingMarginSettings, floor: number): [number, number] {
  const start = settings.start_margin_percent / 100;
  const end = settings.end_margin_percent / 100;
  if (settings.basis === "margin") return [(floor * (1 - start)) / start, (settings.cap_profit * (1 - end)) / end];
  return [floor / start, settings.cap_profit / end];
}

export type SlidingPlan = { cost: number; sell: number; profit: number; marginPercent: number; markupPercent: number; band: "floor" | "sliding" | "flat" };

export function slidingPlan(cost: number, settings: SlidingMarginSettings, floor: number): SlidingPlan {
  const start = settings.start_margin_percent / 100;
  const end = settings.end_margin_percent / 100;
  const [c1, c2] = breakpoints(settings, floor);
  const c = Math.max(0, cost);
  let band: SlidingPlan["band"];
  let profit: number;
  if (c <= c1) {
    band = "floor";
    profit = c > 0 ? Math.max(floor, profitAt(c, start, settings.basis)) : floor;
  } else if (c >= c2) {
    band = "flat";
    profit = profitAt(c, end, settings.basis);
  } else {
    band = "sliding";
    profit = profitAt(c, start + ((end - start) * (c - c1)) / (c2 - c1), settings.basis);
  }
  const sell = c + profit;
  return { cost: c, sell, profit, marginPercent: sell ? (profit / sell) * 100 : 0, markupPercent: c ? (profit / c) * 100 : 0, band };
}

/** The first problem with a set of sliding settings, or null when they give a sensible curve. */
export function slidingProblem(settings: SlidingMarginSettings, floor: number): string | null {
  const { start_margin_percent: start, end_margin_percent: end, cap_profit: cap } = settings;
  const upper = settings.basis === "margin" ? 95 : 1000;
  if (![start, end, cap, floor].every(Number.isFinite)) return "Enter every sliding-margin value.";
  if (!(end > 0 && end <= start && start < upper)) return `The margin must start at or above where it ends, between 0 and ${upper}%.`;
  if (cap <= 0 || floor < 0) return "The profit cap must be positive and the floor cannot be negative.";
  const [c1, c2] = breakpoints(settings, floor);
  if (c2 < c1) return "The cap is reached on a smaller project than the floor — raise the cap or lower the floor.";
  let previous = -Infinity;
  const top = Math.max(c2 * 1.5, 1);
  for (let step = 0; step <= 400; step += 1) {
    const sell = slidingPlan((top * step) / 400, settings, floor).sell;
    if (sell < previous - 0.005) return "These settings would quote a bigger project cheaper than a smaller one.";
    previous = sell;
  }
  return null;
}
