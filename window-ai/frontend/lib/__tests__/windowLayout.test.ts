import { describe, expect, it } from "vitest";
import {
  layoutFromLegacySpec,
  layoutSummary,
  LayoutNode,
  mergeSection,
  resolveLayout,
  resolveSizes,
  sectionSizeProblem,
  setDivisionSizes,
  splitSection,
  updateLeaf,
} from "@/lib/windowLayout";
import { describeWindowSpec } from "@/lib/productDescriptions";

const AW5: LayoutNode = {
  split: "rows",
  sizes: ["2/3", "*"],
  children: [{ op: "fixed" }, { split: "cols", children: [{ op: "awning", hinge: "top" }, { op: "awning", hinge: "top" }] }],
};

describe("window layouts", () => {
  it("resolves division sizes like the engine", () => {
    expect(resolveSizes(undefined, 2, 72)).toEqual([36, 36]);
    expect(resolveSizes(["1/3", "*"], 2, 72)).toEqual([24, 48]);
    expect(resolveSizes(["25%", "*"], 2, 80)).toEqual([20, 60]);
    expect(resolveSizes(["23 1/2", "*"], 2, 72)).toEqual([23.5, 48.5]);
    expect(() => resolveSizes([30, 30], 2, 72)).toThrow();
    expect(() => resolveSizes([72, "*"], 2, 72)).toThrow();
    expect(() => resolveSizes(["abc", "*"], 2, 72)).toThrow();
  });

  it("places sections in reading order and merges joints", () => {
    const resolved = resolveLayout(AW5, 72, 72);
    expect(resolved.sections.map((s) => [s.node.op, s.width, s.height])).toEqual([["fixed", 72, 48], ["awning", 36, 24], ["awning", 36, 24]]);
    expect(layoutSummary(resolved)).toBe("Fixed / Awning | Awning");
    const four = resolveLayout({ split: "rows", children: [
      { split: "cols", children: [{ op: "fixed" }, { op: "fixed" }] },
      { split: "cols", children: [{ op: "casement" }, { op: "casement" }] },
    ] }, 60, 72);
    expect(four.lines.filter((l) => l.orient === "v")).toEqual([{ orient: "v", pos: 30, start: 0, end: 72 }]);
  });

  it("splits, edits and merges sections", () => {
    let layout: LayoutNode = { op: "casement", hinge: "left" };
    layout = splitSection(layout, [], "cols", 2);
    expect(resolveLayout(layout, 48, 48).sections.map((s) => s.node.hinge)).toEqual(["left", "right"]);
    layout = updateLeaf(layout, [0], { op: "fixed" });
    expect(resolveLayout(layout, 48, 48).sections[0].node).toEqual({ op: "fixed" });
    layout = setDivisionSizes(layout, [], ["1/3", "*"]);
    expect(resolveLayout(layout, 48, 48).sections.map((s) => s.width)).toEqual([16, 32]);
    layout = mergeSection(layout, [1]);
    expect(layout).toEqual({ op: "casement", hinge: "right" });
  });

  it("draws legacy lines", () => {
    const combo = layoutFromLegacySpec({ type: "combination", layout: { cols: 2, rows: 1 }, lites: [
      { style: "WC-175", width: 30, height: 60 }, { style: "WC-100", width: 30, height: 60 }] });
    expect(combo?.width).toBe(60);
    expect(resolveLayout(combo!.layout, combo!.width, combo!.height).sections.map((s) => s.node.op)).toEqual(["fixed", "casement"]);
  });

  it("checks printed size ranges like the engine", () => {
    const style = { code: "WC-100", size_ranges: [{ label: "Double", ranges: [{ min: 12.5, max: 32 }, { min: 13, max: 72 }, { min: 32, max: 36 }, { min: 72, max: 78 }] }] };
    expect(sectionSizeProblem(style, 30, 60, false)).toBeNull();
    expect(sectionSizeProblem(style, 40, 60, false)).toContain("12.5–36");
  });

  it("describes units exactly like the backend", () => {
    const spec = { type: "unit" as const, series: "classic", width: 72, height: 72, colour_ext: "white", glazing: { loe180: true, gas: "argon" }, layout: AW5 };
    expect(describeWindowSpec(spec)).toBe(
      'Classic 3 1/4" (WC-100 series) 3-section window unit - 72 x 72 in - Fixed / Awning | Awning - Sections: Fixed 72 x 48, Awning 36 x 24, Awning 36 x 24 - Exterior colour: white - LoE 180 - argon gas',
    );
    expect(describeWindowSpec({ ...spec, width: 24, height: 48, layout: { op: "casement", hinge: "left" } })).toBe(
      'Classic 3 1/4" (WC-100 series) casement (left) window - 24 x 48 in - Exterior colour: white - LoE 180 - argon gas',
    );
  });
});

describe("configurator helpers", () => {
  it("drags a joint with snapping and keeps the last part flexible", async () => {
    const { dragJoint, gridLayout, scaleLayout, fmtInches } = await import("@/lib/windowLayout");
    const resolved = resolveLayout(gridLayout(2, 1), 72, 60);
    const joint = resolved.joints![0];
    expect(joint.pos).toBe(36);
    const snapped = dragJoint(joint, 24.4);
    expect(snapped.snapped).toBe("1/3");
    expect(snapped.pair).toEqual([24, 48]);
    expect(snapped.sizes).toEqual([24, "*"]);
    const free = dragJoint(joint, 30.06);
    expect(free.snapped).toBeNull();
    expect(free.pair[0]).toBe(30);
    expect(dragJoint(joint, 2).pair[0]).toBe(10); // minimum section
    const scaled = scaleLayout(setDivisionSizes(gridLayout(2, 1), [], [24, "*"]), "cols", 1.5);
    expect(resolveLayout(scaled, 108, 60).sections.map((s) => s.width)).toEqual([36, 72]);
    expect(fmtInches(35.5)).toBe("35 1/2");
    expect(fmtInches(23.4838)).toBe("23 1/2");
  });

  it("builds even grids", async () => {
    const { gridLayout } = await import("@/lib/windowLayout");
    expect(resolveLayout(gridLayout(3, 2), 90, 60).sections).toHaveLength(6);
    expect(gridLayout(1, 1)).toEqual({ op: "fixed" });
  });
});
