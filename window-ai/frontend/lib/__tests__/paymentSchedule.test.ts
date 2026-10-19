import { describe, expect, it } from "vitest";
import { PAYMENT_SCHEDULE_PRESETS, sameSchedule, scheduleProblem, scheduleTermsLines } from "@/lib/paymentSchedule";

describe("payment schedules", () => {
  it("words a schedule like the PDF (services/payment_schedule.terms_lines)", () => {
    expect(scheduleTermsLines([{ trigger: "completion", percentage: 40 }, { trigger: "deposit", percentage: 35 }, { trigger: "delivery", percentage: 25 }])).toEqual([
      "35% deposit upon signing.",
      "25% due upon delivery.",
      "40% due upon project completion.",
    ]);
  });

  it("offers 35 / 65 first and every preset adds up", () => {
    expect(PAYMENT_SCHEDULE_PRESETS[0].label).toBe("35 / 65");
    for (const preset of PAYMENT_SCHEDULE_PRESETS) expect(scheduleProblem(preset.schedule)).toBeNull();
  });

  it("explains schedules the API would reject", () => {
    expect(scheduleProblem([{ trigger: "deposit", percentage: 50 }, { trigger: "completion", percentage: 40 }])).toMatch(/90\.00%/);
    expect(scheduleProblem([{ trigger: "delivery", percentage: 50 }, { trigger: "completion", percentage: 50 }])).toMatch(/deposit/);
    expect(scheduleProblem([{ trigger: "deposit", percentage: 100 }])).toMatch(/after the deposit/);
  });

  it("matches presets in any order", () => {
    expect(sameSchedule([{ trigger: "completion", percentage: 50 }, { trigger: "deposit", percentage: 50 }], PAYMENT_SCHEDULE_PRESETS[1].schedule)).toBe(true);
    expect(sameSchedule(null, PAYMENT_SCHEDULE_PRESETS[1].schedule)).toBe(false);
  });
});
