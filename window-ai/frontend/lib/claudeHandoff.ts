import type { LayoutPreset, LayoutSeries } from "@/lib/windowLayout";

/**
 * Windows Claude drafted in the CRM from a typed description ("2 awnings 36x24
 * kitchen, casement 30x60 hinge right"). The CRM's "Open in estimating tool"
 * button links to the project's measure sheet with them in the URL fragment
 * (#claude=<base64url JSON>), which never reaches a server. The measure sheet
 * adds them as rows for the rep to check; nothing is priced until the rep
 * presses Add to estimate.
 */

export type ClaudeWindow = {
  location: string;
  /** A single window type (casement, awning, fixed, ...) or a combination (twin_casement, ...). */
  type: string;
  width: number;
  height: number;
  qty: number;
  /** Hinge side as viewed from outside, when the person said it. */
  hinge: "left" | "right" | null;
  roughOpening: boolean;
  note: string;
};

export type ClaudeHandoff = {
  /** The CRM draft id: the same link opened twice adds its rows once. */
  id: string;
  windows: ClaudeWindow[];
  colourExt: string | null;
  colourInt: string | null;
  triple: boolean | null;
};

export const CLAUDE_FRAGMENT_KEY = "claude";
const MAX_WINDOWS = 60;
const EXTERIOR_COLOURS = ["white", "black", "dark bronze", "charcoal", "sandstone"];
const INTERIOR_COLOURS = ["white", "black"];

/** Combination names Claude uses → the layout presets they start from. */
export const CLAUDE_COMBINATIONS: Record<string, string> = {
  fixed_plus_casement: "C3",
  casement_plus_fixed: "casement_fixed",
  twin_casement: "twin_casement",
  casement_fixed_casement: "C5",
  picture_with_casement_flankers: "picture_flankers",
  fixed_over_awning: "fixed_over_awning",
  awning_over_awning: "awning_stack",
  fixed_over_two_awnings: "AW5",
  fixed_over_slider: "slider_transom",
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function decodeBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function inches(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 && number < 400 ? number : null;
}

/** Reads the hand-off from a location hash ("#claude=..."); null when there is none or it doesn't read. */
export function readClaudeHandoff(hash: string): ClaudeHandoff | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const raw = params.get(CLAUDE_FRAGMENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(raw)) as Record<string, unknown>;
    const id = text(parsed.id, 64);
    if (!id || !Array.isArray(parsed.windows)) return null;
    const windows: ClaudeWindow[] = [];
    for (const item of parsed.windows.slice(0, MAX_WINDOWS)) {
      if (!item || typeof item !== "object") continue;
      const value = item as Record<string, unknown>;
      const width = inches(value.width);
      const height = inches(value.height);
      const type = text(value.type, 40);
      if (!width || !height || !type) continue;
      const qty = Math.max(1, Math.min(99, Math.round(Number(value.qty) || 1)));
      windows.push({
        location: text(value.location, 120),
        type,
        width,
        height,
        qty,
        hinge: value.hinge === "left" || value.hinge === "right" ? value.hinge : null,
        roughOpening: value.roughOpening === true,
        note: text(value.note, 200),
      });
    }
    if (!windows.length) return null;
    const colourExt = text(parsed.colourExt, 20).toLowerCase();
    const colourInt = text(parsed.colourInt, 20).toLowerCase();
    return {
      id,
      windows,
      colourExt: EXTERIOR_COLOURS.includes(colourExt) ? colourExt : null,
      colourInt: INTERIOR_COLOURS.includes(colourInt) ? colourInt : null,
      triple: typeof parsed.triple === "boolean" ? parsed.triple : null,
    };
  } catch {
    return null;
  }
}

type CatalogLayout = { series: LayoutSeries[]; default_series: string; presets: LayoutPreset[] } | null | undefined;

/** The measure sheet's style for a Claude window type: a catalog style code, "preset:<id>", or "" when it has none. */
export function claudeStyleFor(type: string, layout: CatalogLayout): string {
  const preset = CLAUDE_COMBINATIONS[type];
  if (preset) return layout?.presets.some((item) => item.id === preset) ? `preset:${preset}` : "";
  const series = layout?.series.find((item) => item.id === layout.default_series);
  return (series?.styles as Record<string, string | undefined> | undefined)?.[type] ?? "";
}

function typeLabel(type: string) {
  return type.replace(/_/g, " ");
}

/**
 * The row's room / location, carrying what the measure sheet has no column for
 * (notes, a type it couldn't match, a hinge side the line can't hold) so the rep
 * sees it while checking. hingeOnLine: the hinge goes on the line's order details instead.
 */
export function claudeRowLocation(window: ClaudeWindow, style: string, hingeOnLine = false): string {
  return [
    window.location,
    window.hinge && !hingeOnLine ? `hinge ${window.hinge}` : "",
    style ? "" : `${typeLabel(window.type)}?`,
    window.note,
  ].filter(Boolean).join(" · ");
}

/** "35.5" for 35 1/2: rounded to the nearest 1/8" like a tape reading. */
export function claudeInches(value: number): string {
  return `${Math.round(value * 8) / 8}`;
}

/** localStorage key that marks a hand-off as already added to this device's sheet. */
export function claudeHandoffSeenKey(estimateId: string, handoffId: string) {
  return `bv-claude-handoff:${estimateId}:${handoffId}`;
}
