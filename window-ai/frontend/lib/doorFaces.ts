/**
 * Door slab faces: the panels, planks, grooves, inlays and slots drawn on a
 * slab, in fractions of the slab (x across from the left, y down from the top)
 * so they scale to any width and height. Measured from Palma's panel selector
 * photos (palmadoor.com/panel-selector, Nov 2026).
 *
 * The library is config/door_faces.json; doorFaces.data.json is its copy for
 * the browser (doorFaces.test.ts keeps them identical) and
 * services/doors/faces.py is the Python twin that puts the resolved face on a
 * priced door's drawing geometry, so the PDF and the Better View CRM draw the same.
 */
import data from "./doorFaces.data.json";

export type FaceElement =
  | { t: "p"; x: number; y: number; w: number; h: number; s?: "raised" | "shaker"; top?: "square" | "arch" | "camber" | "scroll"; planks?: number[] }
  | { t: "g"; x1: number; y1: number; x2: number; y2: number; taper?: boolean }
  | { t: "i"; x1: number; y1: number; x2: number; y2: number }
  | { t: "slot"; x: number; y: number; w: number };
export type FacePanel = Extract<FaceElement, { t: "p" }>;
export type DoorFace = { key: string; label: string; pattern: { code: string; label: string; chosen: boolean } | null; elements: FaceElement[] };
export type SlabDesign = { code: string; label: string };

type PatternItem = {
  label: string;
  elements?: FaceElement[];
  rows?: { count: number; from: number; step: number; x1: number; x2: number };
  columns?: { count: number; from: number; step: number; y1: number; y2: number };
};
type PatternGroup = { label: string; default: string; note: string; items: Record<string, PatternItem> };
type Library = {
  faces: Record<string, { label: string; elements: FaceElement[] }>;
  patterns: Record<string, PatternGroup>;
  models: Record<string, Record<string, string | { pattern: string }>>;
};
const library = data as unknown as Library;

// Element sizes in inches, shared with services/doors/faces.py.
export const GROOVE_IN = 0.35;
export const INLAY_IN = 0.45;
export const SLOT_IN = 1.1;
export const TAPER_IN: [number, number] = [0.9, 0.2];
const TOP_RISE: Record<string, number> = { arch: 0.16, camber: 0.06, scroll: 0.12 };

/** Python round(x, 4) for the shorthand rows, so both sides produce the same numbers. */
const round4 = (value: number) => Math.round(value * 10000) / 10000;

function expand(item: PatternItem): FaceElement[] {
  const out: FaceElement[] = [];
  if (item.rows) {
    const { count, from, step, x1, x2 } = item.rows;
    for (let i = 0; i < count; i += 1) {
      const y = round4(from + i * step);
      out.push({ t: "g", x1, y1: y, x2, y2: y });
    }
  }
  if (item.columns) {
    const { count, from, step, y1, y2 } = item.columns;
    for (let i = 0; i < count; i += 1) {
      const x = round4(from + i * step);
      out.push({ t: "g", x1: x, y1, x2: x, y2 });
    }
  }
  return [...out, ...(item.elements ?? []).map((element) => ({ ...element }))];
}

function patternGroup(material?: string | null, model?: string | null) {
  const entry = library.models[material ?? ""]?.[model ?? ""];
  return entry && typeof entry === "object" ? { key: entry.pattern, ...library.patterns[entry.pattern] } : null;
}

/** The Grooved / Stainless Steel Oak patterns a rep can pick for a model (empty when it has none). */
export function slabDesigns(material?: string | null, model?: string | null): SlabDesign[] {
  const group = patternGroup(material, model);
  return group ? Object.entries(group.items).map(([code, item]) => ({ code, label: item.label })) : [];
}

/** The pattern group's heading, default and Palma note ("one price, confirm with Palma"), or null. */
export function slabDesignGroup(material?: string | null, model?: string | null) {
  const group = patternGroup(material, model);
  return group ? { label: group.label, default: group.default, note: group.note } : null;
}

/** A catalog model's face; null when the model isn't in the library (the drawing falls back to generic panels). */
export function doorFace(material?: string | null, model?: string | null, pattern?: string | null): DoorFace | null {
  const entry = library.models[material ?? ""]?.[model ?? ""];
  if (entry === undefined) return null;
  if (typeof entry === "object") {
    const group = library.patterns[entry.pattern];
    const code = pattern && group.items[pattern] ? pattern : group.default;
    const item = group.items[code];
    return { key: `${entry.pattern}:${code}`, label: `${group.label} ${code} (${item.label})`, pattern: { code, label: item.label, chosen: pattern === code }, elements: expand(item) };
  }
  const face = library.faces[entry];
  return { key: entry, label: face.label, pattern: null, elements: face.elements.map((element) => ({ ...element })) };
}

/** (x, y, w, h) in slab fractions; lines get a hair of thickness. */
export function elementBox(element: FaceElement): [number, number, number, number] {
  if (element.t === "p") return [element.x, element.y, element.w, element.h];
  if (element.t === "slot") return [element.x, element.y - 0.008, element.w, 0.016];
  const x1 = Math.min(element.x1, element.x2), x2 = Math.max(element.x1, element.x2);
  const y1 = Math.min(element.y1, element.y2), y2 = Math.max(element.y1, element.y2);
  return [x1, y1, Math.max(x2 - x1, 0.004), Math.max(y2 - y1, 0.004)];
}

/** Drop the elements a door's glass covers by a quarter or more (lites in slab inches); the glass takes that panel's place. */
export function withoutGlass(elements: FaceElement[], lites: Array<{ x: number; y: number; w: number; h: number }>, slabW: number, slabH: number) {
  if (!lites.length) return elements;
  return elements.filter((element) => {
    const [x, y, w, h] = elementBox(element);
    const ex = x * slabW, ey = y * slabH, ew = w * slabW, eh = h * slabH;
    const covered = lites.reduce((sum, lite) => sum + Math.max(0, Math.min(ex + ew, lite.x + lite.w) - Math.max(ex, lite.x)) * Math.max(0, Math.min(ey + eh, lite.y + lite.h) - Math.max(ey, lite.y)), 0);
    return covered < 0.25 * ew * eh;
  });
}

function rise(panel: FacePanel) {
  const value = (TOP_RISE[panel.top ?? ""] ?? 0) * panel.w;
  return Math.min((value * 36) / 80, panel.h * 0.3);
}

function curve(top: string, t: number) {
  return top === "scroll" ? (1 + Math.cos(2 * Math.PI * t)) / 2 : 1 - Math.sin(Math.PI * t);
}

/** The frame left beside a sidelite's panels (SIDELITE_STILE_IN in services/doors/faces.py). */
export const SIDELITE_STILE_IN = 2.5;

/**
 * A sidelite panel's face from its catalog model: one panel across the sidelite for each row of the
 * door's panels, and the door's grooves that run across. Mirrors sidelite_face() in services/doors/faces.py.
 */
export function sideliteFace(material: string | null | undefined, model: string | null | undefined, sideW: number): DoorFace | null {
  const face = doorFace(material, model);
  if (!face) return null;
  const margin = sideW > 0 ? Math.min(SIDELITE_STILE_IN, sideW * 0.25) / sideW : 0.2;
  const rows = new Map<string, FacePanel>();
  const elements: FaceElement[] = [];
  for (const element of face.elements) {
    if (element.t === "p") {
      const key = `${element.y.toFixed(3)}|${element.h.toFixed(3)}`;
      if (!rows.has(key)) rows.set(key, element);
    } else if (element.t === "g" && Math.abs(element.y1 - element.y2) < 0.01 && !element.taper) {
      elements.push({ t: "g", x1: 0, y1: element.y1, x2: 1, y2: element.y2 });
    }
  }
  Array.from(rows.values()).sort((a, b) => a.y - b.y || a.h - b.h).forEach((element) => {
    elements.push({ t: "p", x: margin, y: element.y, w: 1 - 2 * margin, h: element.h, s: element.s ?? "raised", ...(element.top ? { top: element.top } : {}) });
  });
  return { key: face.key, label: face.label, pattern: null, elements };
}

/** The y (slab fraction) of a panel's top edge at slab fraction x, for curved tops. */
export function panelTop(panel: FacePanel, x: number) {
  const top = panel.top ?? "square";
  if (top === "square" || panel.w <= 0) return panel.y;
  const t = Math.min(1, Math.max(0, (x - panel.x) / panel.w));
  return panel.y + rise(panel) * curve(top, t);
}

/** A panel's outline in slab inches, clockwise from its bottom-left corner. */
export function panelOutline(panel: FacePanel, slabW: number, slabH: number, steps = 16): Array<[number, number]> {
  const x = panel.x * slabW, y = panel.y * slabH, w = panel.w * slabW, h = panel.h * slabH;
  const top = panel.top ?? "square";
  const points: Array<[number, number]> = [[x, y + h]];
  if (top === "square") points.push([x, y], [x + w, y]);
  else for (let i = 0; i <= steps; i += 1) points.push([x + (w * i) / steps, y + rise(panel) * slabH * curve(top, i / steps)]);
  points.push([x + w, y + h]);
  return points;
}

/** A panel shrunk by `inset` inches on every side. */
export function insetPanel(panel: FacePanel, inset: number, slabW: number, slabH: number): FacePanel {
  return { ...panel, x: panel.x + inset / slabW, y: panel.y + inset / slabH, w: Math.max(panel.w - (2 * inset) / slabW, 0.01), h: Math.max(panel.h - (2 * inset) / slabH, 0.01) };
}

/** Perceived brightness 0–1 of a #rrggbb colour (dark slabs get light grooves and panel edges). */
export function brightness(hex: string) {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0xf8fafc;
  const r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
