import { describe, expect, it } from "vitest";
import { describeWindowSpec } from "@/lib/productDescriptions";
import { CUSTOM_JAMB, defaultJamb, jambAccessory, jambDepthOptions, jambFromAccessories, jambLabel, withColourRules } from "@/lib/productOptions";
import { addLite, bayProblem, BAY_PRESETS, headSeatFor, removeLite } from "@/lib/bayLayout";
import { slidingPanels } from "@/lib/patioLayout";
import type { QuoteCatalog } from "@/lib/api";

const catalog = {
  wood_jamb: {
    default: '5 1/2"',
    finish: "primed",
    depths: [
      { name: '3 3/8"', depth_in: 3.375, price_lf: 4 },
      { name: '5 1/2"', depth_in: 5.5, price_lf: 5 },
      { name: '6 1/4"', depth_in: 6.25, price_lf: 7 },
    ],
    custom_max_in: 7.5,
  },
} as unknown as QuoteCatalog;

describe("colour rules", () => {
  it("pairs a black interior with a black exterior", () => {
    expect(withColourRules({ colour_ext: "white", colour_int: "white" }, { colour_int: "black" })).toEqual({ colour_int: "black", colour_ext: "black" });
  });
  it("puts the interior back to white when the exterior leaves black", () => {
    expect(withColourRules({ colour_ext: "black", colour_int: "black" }, { colour_ext: "charcoal" })).toEqual({ colour_ext: "charcoal", colour_int: "white" });
    expect(withColourRules({ colour_ext: "black", colour_int: "white" }, { colour_ext: "white" })).toEqual({ colour_ext: "white" });
  });
});

describe("wood jamb", () => {
  it("sends a printed depth by name and a custom depth in inches", () => {
    expect(jambAccessory({ wood_jamb: true, jamb_depth: '5 1/2"', jamb_custom: "" }, catalog)).toEqual({ kind: "wood_jamb", name: '5 1/2"', depth_in: 5.5, finish: "primed" });
    expect(jambAccessory({ wood_jamb: true, jamb_depth: CUSTOM_JAMB, jamb_custom: 4.75 }, catalog)).toEqual({ kind: "wood_jamb", depth_in: 4.75, finish: "primed" });
    expect(jambAccessory({ wood_jamb: true, jamb_depth: CUSTOM_JAMB, jamb_custom: "" }, catalog)).toBeNull();
    expect(jambAccessory({ wood_jamb: false, jamb_depth: '5 1/2"', jamb_custom: "" }, catalog)).toBeNull();
  });
  it("reads saved lines back, including older catalog row names", () => {
    expect(jambFromAccessories([{ kind: "wood_jamb", name: '6 1/4" wood jamb 6 1/4" x 3/4"' }], catalog)).toEqual({ wood_jamb: true, jamb_depth: '6 1/4"', jamb_custom: "", jamb_primed: true });
    expect(jambFromAccessories([{ kind: "wood_jamb", depth_in: 4.75, finish: "unfinished" }], catalog)).toEqual({ wood_jamb: true, jamb_depth: CUSTOM_JAMB, jamb_custom: 4.75, jamb_primed: false });
    expect(jambFromAccessories([], catalog)).toEqual({ wood_jamb: false, jamb_depth: '5 1/2"', jamb_custom: "", jamb_primed: true });
  });
  it("primes windows up to 6 1/4 inches and patio doors up to 4 1/2 inches (user rule 2026-09-28)", () => {
    const deep = { wood_jamb: true, jamb_depth: CUSTOM_JAMB, jamb_custom: 7, jamb_primed: true };
    expect(jambAccessory({ ...deep, jamb_depth: '6 1/4"' }, catalog)?.finish).toBe("primed");
    expect(jambAccessory(deep, catalog)?.finish).toBe("unfinished");
    expect(jambAccessory({ ...deep, jamb_depth: '5 1/2"' }, catalog, "patio")?.finish).toBe("unfinished");
    expect(jambAccessory({ ...deep, jamb_depth: '4 1/2"' }, catalog, "patio")).toEqual({ kind: "wood_jamb", name: '4 1/2"', depth_in: 4.5, finish: "primed" });
    expect(jambAccessory({ ...deep, jamb_depth: '4 1/2"', jamb_primed: false }, catalog, "patio")?.finish).toBe("unfinished");
    expect(jambLabel({ ...deep, jamb_depth: '5 1/2"' }, catalog, "patio")).toBe("5 1/2″ unfinished wood jamb");
  });
  it("starts patio doors on a 4 1/2 inch jamb", () => {
    expect(defaultJamb(catalog, "patio")).toBe('4 1/2"');
    expect(jambDepthOptions(catalog, "patio").map((depth) => depth.name)).toEqual(['3 3/8"', '4 1/2"', '5 1/2"', '6 1/4"']);
    expect(jambDepthOptions(catalog).map((depth) => depth.name)).not.toContain('4 1/2"');
    expect(jambFromAccessories([{ kind: "wood_jamb", depth_in: 4.5, finish: "primed" }], catalog, "patio")).toMatchObject({ jamb_depth: '4 1/2"', jamb_primed: true });
  });
});

describe("bays and patio doors", () => {
  it("keeps a bay at 3 to 6 side-by-side lites", () => {
    const bay = BAY_PRESETS[0].layout;
    expect(bayProblem(bay)).toBeNull();
    expect(bayProblem(removeLite(bay, 0))).toBeNull(); // cannot go below 3: unchanged
    let big = bay;
    for (let i = 0; i < 5; i += 1) big = addLite(big);
    expect("split" in big && big.children.length).toBe(6);
    expect(bayProblem({ split: "cols", children: [{ op: "fixed" }, { op: "fixed" }] })).toContain("3 to 6");
    expect(headSeatFor(96, ["up to 8ft wide", "8ft to 10ft wide", "over 10ft wide (2 pieces)"])).toBe("up to 8ft wide");
    expect(headSeatFor(110, ["up to 8ft wide", "8ft to 10ft wide", "over 10ft wide (2 pieces)"])).toBe("8ft to 10ft wide");
  });
  it("draws the sliding panel on the operating side", () => {
    const ox = slidingPanels("OX");
    expect("split" in ox && ox.children.map((child) => ("op" in child ? child.op : ""))).toEqual(["fixed", "single_slider"]);
  });
});

describe("descriptions match the backend", () => {
  it("describes interior colour, jamb depth and a layout bay like descriptions.py", () => {
    // tests/test_patio_bay_colour.py asserts the same text on the backend.
    const spec = {
      type: "bay_bow" as const, style: "bay", series: "classic", width: 96, height: 60,
      colour_ext: "black", colour_int: "black", glazing: { loe180: true, gas: "argon" },
      head_seat: "up to 8ft wide",
      layout: BAY_PRESETS[0].layout,
      accessories: [{ kind: "wood_jamb", name: '5 1/2"' }],
    };
    expect(describeWindowSpec(spec)).toBe(
      'Classic 3 1/4" (WC-100 series) bay window, 3 lites - 96 x 60 in - Lites: Casement (left) 24 x 60, Fixed 48 x 60, Casement (right) 24 x 60 - Head & seat: up to 8ft wide - Exterior colour: black - Interior colour: black - LoE 180 - argon gas - 5 1/2" primed wood jamb',
    );
  });
  it("describes a sliding door with its handing and kick lock", () => {
    expect(describeWindowSpec({ type: "patio_sliding", nominal_ft: 6, operation: "OX", colour_ext: "white", kick_lock: true, accessories: [{ kind: "wood_jamb", depth_in: 4.75 }] })).toBe(
      'Sliding patio door - 6 ft - OX - Exterior colour: white - 4 3/4" unfinished wood jamb - Kick lock',
    );
  });
});

describe("sliding margin preview matches margin.py", () => {
  it("has the same breakpoints and curve", async () => {
    const { breakpoints, slidingPlan, slidingProblem, DEFAULT_SLIDING } = await import("@/lib/slidingMargin");
    const [c1, c2] = breakpoints(DEFAULT_SLIDING, 1800);
    expect(c1).toBeCloseTo(2200, 6);
    expect(c2).toBeCloseTo(9333.3333, 3);
    expect(slidingPlan(500, DEFAULT_SLIDING, 1800).profit).toBeCloseTo(1800, 6);
    expect(slidingPlan(5766.6667, DEFAULT_SLIDING, 1800).marginPercent).toBeCloseTo(37.5, 3);
    expect(slidingPlan(20000, DEFAULT_SLIDING, 1800).marginPercent).toBeCloseTo(30, 6);
    expect(slidingProblem(DEFAULT_SLIDING, 1800)).toBeNull();
    expect(slidingProblem({ start_margin_percent: 90, end_margin_percent: 10, cap_profit: 13, basis: "margin" }, 1000)).toContain("cheaper");
  });
});
