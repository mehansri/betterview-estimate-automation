import type { QuoteCatalog } from "@/lib/api";
import type { NumericInputValue } from "@/lib/numericInput";
import { fmtInches } from "@/lib/windowLayout";

/** Options every product line shares: colours, glass, and trim. */

export const EXTERIOR_COLOURS = ["white", "black", "dark bronze", "charcoal", "sandstone"];
export const INTERIOR_COLOURS = ["white", "black"];

/** New line items start with a 5 1/2" primed wood jamb (user rule 2026-09-28). */
export const DEFAULT_JAMB_DEPTH = '5 1/2"';
export const CUSTOM_JAMB = "custom";

export type FinishOptions = {
  colour_ext: string;
  colour_int: string;
  loe180: boolean;
  i89: boolean;
  gas: string;
  triple: boolean;
  tri_pane_lami: boolean;
  frost_tint: boolean;
  brickmould: boolean;
  wood_jamb: boolean;
  /** A catalog depth name ('5 1/2"') or "custom". */
  jamb_depth: string;
  jamb_custom: NumericInputValue;
};

export function defaultJamb(catalog?: QuoteCatalog | null): string {
  return catalog?.wood_jamb?.default || DEFAULT_JAMB_DEPTH;
}

/**
 * Window City sells an interior colour only as matching black in / black out:
 * picking a black interior also makes the exterior black, and moving the
 * exterior off black puts the interior back to white.
 */
export function withColourRules<T extends Pick<FinishOptions, "colour_ext" | "colour_int">>(current: T, patch: Partial<T>): Partial<T> {
  const next = { ...current, ...patch };
  if (patch.colour_int && patch.colour_int !== "white") return { ...patch, colour_ext: patch.colour_int };
  if (patch.colour_ext && next.colour_int !== "white" && patch.colour_ext !== next.colour_int) return { ...patch, colour_int: "white" };
  return patch;
}

/** The styles offering black in / black out (HC-4xx, WC-100/125/175). */
export function blackInteriorStyles(catalog?: QuoteCatalog | null): Set<string> {
  return new Set(catalog?.colours?.black_interior_styles || ["HC-401", "HC-426", "HC-451", "HC-476", "WC-100", "WC-125", "WC-175"]);
}

export function jambDepthIn(options: Pick<FinishOptions, "jamb_depth" | "jamb_custom">, catalog?: QuoteCatalog | null): number | null {
  if (options.jamb_depth === CUSTOM_JAMB) {
    const value = Number(options.jamb_custom);
    return options.jamb_custom !== "" && Number.isFinite(value) && value > 0 ? value : null;
  }
  const row = catalog?.wood_jamb?.depths.find((item) => item.name === options.jamb_depth);
  if (row) return row.depth_in;
  const match = options.jamb_depth.match(/^(\d+)(?:\s+(\d+)\/(\d+))?/);
  return match ? Number(match[1]) + (match[2] ? Number(match[2]) / Number(match[3]) : 0) : null;
}

/** The wood-jamb accessory for a line: a printed depth by name, a custom depth by inches. */
export function jambAccessory(options: Pick<FinishOptions, "wood_jamb" | "jamb_depth" | "jamb_custom">, catalog?: QuoteCatalog | null): { kind: "wood_jamb"; name?: string; depth_in?: number } | null {
  if (!options.wood_jamb) return null;
  const depth = jambDepthIn(options, catalog);
  if (options.jamb_depth === CUSTOM_JAMB) return depth ? { kind: "wood_jamb", depth_in: depth } : null;
  return { kind: "wood_jamb", name: options.jamb_depth, ...(depth ? { depth_in: depth } : {}) };
}

export function jambLabel(options: Pick<FinishOptions, "wood_jamb" | "jamb_depth" | "jamb_custom">, catalog?: QuoteCatalog | null): string {
  if (!options.wood_jamb) return "no wood jamb";
  const depth = jambDepthIn(options, catalog);
  return depth ? `${fmtInches(depth)}″ primed wood jamb` : "wood jamb (enter a depth)";
}

/** Read a saved accessory list back into jamb options (older lines kept the catalog row name). */
export function jambFromAccessories(accessories: Array<Record<string, unknown>>, catalog?: QuoteCatalog | null): Pick<FinishOptions, "wood_jamb" | "jamb_depth" | "jamb_custom"> {
  const jamb = accessories.find((item) => String(item.kind || "") === "wood_jamb");
  if (!jamb) return { wood_jamb: false, jamb_depth: defaultJamb(catalog), jamb_custom: "" };
  const name = String(jamb.name || "");
  const depths = catalog?.wood_jamb?.depths || [];
  const byName = depths.find((item) => name === item.name || name.startsWith(`${item.name} wood jamb`));
  if (byName) return { wood_jamb: true, jamb_depth: byName.name, jamb_custom: "" };
  const depth = Number(jamb.depth_in);
  const byDepth = Number.isFinite(depth) ? depths.find((item) => Math.abs(item.depth_in - depth) < 1e-6) : undefined;
  if (byDepth) return { wood_jamb: true, jamb_depth: byDepth.name, jamb_custom: "" };
  return { wood_jamb: true, jamb_depth: CUSTOM_JAMB, jamb_custom: Number.isFinite(depth) ? depth : "" };
}

export type GlassPackage = {
  id: string;
  title: string;
  detail: string;
  note: string;
  panes: 2 | 3;
  patch: Partial<FinishOptions>;
};

export const WINDOW_GLASS: GlassPackage[] = [
  { id: "double", title: "Double pane", detail: "LoE 180 · argon", note: "Standard. ER 31–36 on the Classic series.", panes: 2, patch: { loe180: true, i89: false, gas: "argon", triple: false, tri_pane_lami: false } },
  { id: "double_i89", title: "Double pane + i89", detail: "LoE 180 · i89 room-side coat · argon", note: "Warmer interior glass, less condensation.", panes: 2, patch: { loe180: true, i89: true, gas: "argon", triple: false, tri_pane_lami: false } },
  { id: "triple", title: "Triple pane", detail: "2 × LoE 180 · 90/5 argon-krypton", note: "ENERGY STAR Most Efficient on casement, awning and fixed.", panes: 3, patch: { loe180: true, i89: false, gas: "90/5", triple: true, tri_pane_lami: false } },
];

/** WC-500 sliding doors: the three glass packages on Window City's order. */
export const DOOR_GLASS: GlassPackage[] = [
  { id: "double", title: "Regular", detail: "LoE 180 · argon, tempered", note: "Standard sliding door glass.", panes: 2, patch: { loe180: true, i89: false, gas: "argon", triple: false, tri_pane_lami: false } },
  { id: "double_i89", title: "ENERGY STAR", detail: "LoE 180 · i89 · argon, tempered", note: "Warmer room-side glass; ENERGY STAR (ER 36) on WC-500 doors.", panes: 2, patch: { loe180: true, i89: true, gas: "argon", triple: false, tri_pane_lami: false } },
  { id: "triple", title: "Triple pane", detail: "2 × LoE 180 · argon, tempered", note: "Not offered on 8 ft and 16 ft doors.", panes: 3, patch: { loe180: true, i89: false, gas: "argon", triple: true, tri_pane_lami: false } },
];

export const WINDOW_GASES = [
  { id: "argon", label: "Argon" },
  { id: "90/5", label: "90/5 argon-krypton" },
  { id: "krypton", label: "Krypton" },
];

export function activeGlass(packages: GlassPackage[], value: Partial<FinishOptions>): GlassPackage | undefined {
  return packages.find((pkg) => Object.entries(pkg.patch).every(([key, v]) => value[key as keyof FinishOptions] === v));
}
