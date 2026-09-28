import type { LayoutLeaf, LayoutNode, LayoutPreset, LayoutSplit } from "@/lib/windowLayout";

/** Layout-first bays and bows: 3 to 6 lites side by side (book 57-61). */

export const MIN_LITES = 3;
export const MAX_LITES = 6;

const casement = (hinge: "left" | "right"): LayoutLeaf => ({ op: "casement", hinge });
const fixed: LayoutLeaf = { op: "fixed" };
const cols = (sizes: Array<string | number>, children: LayoutLeaf[]): LayoutSplit => ({ split: "cols", sizes, children });

export const BAY_PRESETS: Array<LayoutPreset & { style: "bay" | "bow" }> = [
  { id: "bay3_cfc", code: "Bay3", label: "Casement · picture · casement", panels: 3, width: 96, height: 60, style: "bay", layout: cols(["1/4", "1/2", "*"], [casement("left"), fixed, casement("right")]) },
  { id: "bay3_fff", code: "Bay3", label: "Three fixed lites", panels: 3, width: 96, height: 60, style: "bay", layout: cols(["1/4", "1/2", "*"], [fixed, fixed, fixed]) },
  { id: "bay3_dh", code: "Bay3", label: "Double hung flankers", panels: 3, width: 96, height: 60, style: "bay", layout: cols(["1/4", "1/2", "*"], [{ op: "double_hung" }, fixed, { op: "double_hung" }]) },
  { id: "bow4", code: "Bow4", label: "4-lite bow", panels: 4, width: 96, height: 60, style: "bow", layout: cols(["*", "*", "*", "*"], [casement("left"), fixed, fixed, casement("right")]) },
  { id: "bow5", code: "Bow5", label: "5-lite bow", panels: 5, width: 120, height: 60, style: "bow", layout: cols(["*", "*", "*", "*", "*"], [casement("left"), fixed, fixed, fixed, casement("right")]) },
  { id: "bow6", code: "Bow6", label: "6-lite bow", panels: 6, width: 144, height: 60, style: "bow", layout: cols(["*", "*", "*", "*", "*", "*"], [casement("left"), fixed, fixed, fixed, fixed, casement("right")]) },
] as Array<LayoutPreset & { style: "bay" | "bow" }>;

export const DEFAULT_BAY = BAY_PRESETS[0];

/** Head & seat plywood size for an overall width (book 61). */
export function headSeatFor(width: number, sizes: string[]): string {
  const pick = width <= 96 ? "up to 8ft wide" : width <= 120 ? "8ft to 10ft wide" : "over 10ft wide (2 pieces)";
  return sizes.includes(pick) ? pick : sizes[0] || pick;
}

function liteList(layout: LayoutNode): { children: LayoutNode[]; sizes: Array<string | number> } {
  if ("split" in layout && layout.split === "cols") {
    return { children: layout.children, sizes: layout.sizes && layout.sizes.length === layout.children.length ? layout.sizes : layout.children.map(() => "*") };
  }
  return { children: [layout], sizes: ["*"] };
}

export function liteCount(layout: LayoutNode): number {
  return liteList(layout).children.length;
}

/** Add a fixed lite at the end; the new lite shares the width equally. */
export function addLite(layout: LayoutNode): LayoutNode {
  const { children } = liteList(layout);
  if (children.length >= MAX_LITES) return layout;
  const next = [...children, { op: "fixed" } as LayoutLeaf];
  return { split: "cols", sizes: next.map(() => "*"), children: next };
}

export function removeLite(layout: LayoutNode, index: number): LayoutNode {
  const { children } = liteList(layout);
  if (children.length <= MIN_LITES) return layout;
  const next = children.filter((_, i) => i !== index);
  return { split: "cols", sizes: next.map(() => "*"), children: next };
}

/** A bay is valid when it is one row of 3-6 single lites. */
export function bayProblem(layout: LayoutNode): string | null {
  if (!("split" in layout) || layout.split !== "cols") return "A bay is 3 to 6 lites side by side.";
  if (layout.children.some((child) => "split" in child)) return "Bay lites cannot be split; each lite is one window.";
  if (layout.children.length < MIN_LITES || layout.children.length > MAX_LITES) return "A bay or bow has 3 to 6 lites.";
  return null;
}
