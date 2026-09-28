import type { LayoutNode } from "@/lib/windowLayout";

/** Mirrors services/windowcity/layout.py patio_layout (viewed from outside). */

export type SlidingOperation = "XO" | "OX" | "OXXO";

export const SLIDING_FALLBACK = [
  { nominal_ft: 5, panels: 2, frame_width: 59.625, frame_height: 79.5, operations: ["XO", "OX"], triple: true, tint: true },
  { nominal_ft: 6, panels: 2, frame_width: 71.625, frame_height: 79.5, operations: ["XO", "OX"], triple: true, tint: true },
  { nominal_ft: 8, panels: 2, frame_width: 95.625, frame_height: 79.5, operations: ["XO", "OX"], triple: false, tint: false },
  { nominal_ft: 10, panels: 4, frame_width: 118.375, frame_height: 79.5, operations: ["OXXO"], triple: true, tint: true },
  { nominal_ft: 12, panels: 4, frame_width: 142.375, frame_height: 79.5, operations: ["OXXO"], triple: true, tint: true },
  { nominal_ft: 16, panels: 4, frame_width: 190.375, frame_height: 79.5, operations: ["OXXO"], triple: false, tint: false },
];

export function slidingPanels(operation: string): LayoutNode {
  const panels: Record<string, LayoutNode[]> = {
    XO: [{ op: "single_slider", hinge: "left" }, { op: "fixed" }],
    OX: [{ op: "fixed" }, { op: "single_slider", hinge: "right" }],
    OXXO: [{ op: "fixed" }, { op: "single_slider", hinge: "right" }, { op: "single_slider", hinge: "left" }, { op: "fixed" }],
  };
  const children = panels[operation] || panels.XO;
  return { split: "cols", sizes: children.map(() => "*"), children };
}

export function swingPanels(kind: string, hinge: string): LayoutNode {
  if (kind === "double") return { split: "cols", sizes: ["*", "*"], children: [{ op: "casement", hinge: "left" }, { op: "casement", hinge: "right" }] };
  return { op: "casement", hinge: hinge === "right" ? "right" : "left" };
}

export const OPERATION_TEXT: Record<string, string> = {
  XO: "XO · left panel slides",
  OX: "OX · right panel slides",
  OXXO: "OXXO · centre panels slide",
};
