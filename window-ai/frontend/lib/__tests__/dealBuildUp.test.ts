import { describe, expect, it } from "vitest";
import { priceBuildUp } from "@/components/estimate/DealPanel";
import type { DeterministicQuoteResponse, SalesPreset } from "@/lib/api";

type SalesPricing = DeterministicQuoteResponse["sales_pricing"];

// Palma quote 53326, door 1: list $9,371, 60% off, $750 install.
const sp = {
  strategy: "sliding_margin",
  dealer_cost: 3748.4,
  install_cost: 750,
  merchandise_discount_amount: 0,
  negotiated_discount_percent: 0,
  sliding: { margin_percent: 40.2 },
  sales_config_version: "test",
} as unknown as SalesPricing;
const totals = { cost: 4498.4, profit: 3024.01, sell: 7522.41, hst: 977.91, customerTotal: 8500.32, list: 9371 };

describe("deal price build-up", () => {
  it("adds up from list to the sell price", () => {
    const steps = priceBuildUp(sp, totals, { id: "sliding", strategy: "sliding_margin" } as SalesPreset, 30)!;
    expect(steps.listOff).toBeCloseTo(60, 6);
    expect(steps.cost).toBeCloseTo(4498.4, 2);
    expect(steps.baseMarkup).toBeCloseTo(1349.52, 2); // 30% on dealer + install
    expect(steps.cost + steps.baseMarkup + steps.extra - steps.discount).toBeCloseTo(totals.sell, 2);
    expect(steps.profit).toBeCloseTo(3024.01, 2);
    expect(steps.margin).toBeCloseTo(40.2, 1);
  });

  it("uses the preset's own markup, with any floor top-up as extra profit", () => {
    const flat = { ...sp, strategy: "markup" } as SalesPricing;
    const floored = { ...totals, sell: 6298.4 }; // $1,800 profit floor on $4,498.40
    const steps = priceBuildUp(flat, floored, { id: "standard", strategy: "markup", markup_percent: 30 } as SalesPreset, 30)!;
    expect(steps.baseMarkup).toBeCloseTo(1349.52, 2);
    expect(steps.extra).toBeCloseTo(1800 - 1349.52, 2);
  });

  it("needs the dealer and install split", () => {
    expect(priceBuildUp({ ...sp, dealer_cost: null } as SalesPricing, totals, undefined, 30)).toBeNull();
  });
});
