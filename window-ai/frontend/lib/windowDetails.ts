import type {
  QuoteCatalog,
  WindowElevation,
  WindowHanding,
  WindowSectionOperation as WindowOperation,
} from "@/lib/api";

export const DEFAULT_HARDWARE = "Fold-away handle (white)";
export const SPACERS = ["Black", "Grey", "White"];
export const SCREEN_MESH_COLOURS = ["black", "charcoal", "grey"];
export const JAMB_FINISHES = ["primed", "unfinished", "painted", "stained"];
export const HARDWARE_SUGGESTIONS = [
  "Fold-away handle (white)",
  "Fold-away handle (black)",
  "Fold-away handle (bronze)",
  "Multi-point lock, premium hardware",
];
export const ELEVATIONS: Array<{ value: WindowElevation; label: string }> = [
  { value: "front", label: "Front" },
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
  { value: "back", label: "Back" },
  { value: "other", label: "Other" },
];

export type JambKind = "wood_jamb" | "pvc_jamb";
export const DEFAULT_JAMB: { kind: JambKind; name: string } = { kind: "wood_jamb", name: '5 1/2" wood jamb' };
export const DEFAULT_BRICKMOULD = '1" brickmould (classic)';
export const NAILING_FLANGE = "Nailing Flange";
export const SASH_REINFORCEMENT = "Sash Reinforcement";

export const OPERATION_LABELS: Record<WindowOperation, string> = {
  fixed: "Fixed",
  casement: "Casement",
  awning: "Awning",
  single_slider: "Single slider",
  double_slider: "Double slider",
  single_hung: "Single hung",
  double_hung: "Double hung",
};

const OPERATION_BY_NAME: Record<string, WindowOperation> = {
  CASEMENT: "casement",
  AWNING: "awning",
  "SLIM FIXED": "fixed",
  "FIXED CASEMENT": "fixed",
  "CASEMENT FIXED": "fixed",
  "SINGLE SLIDER TILT": "single_slider",
  "SINGLE SLIDER LIFT OUT": "single_slider",
  "DOUBLE SLIDER TILT": "double_slider",
  "DOUBLE SLIDER LIFT OUT": "double_slider",
  "SINGLE HUNG TILT": "single_hung",
  "DOUBLE HUNG TILT": "double_hung",
};

// Used before the catalog loads (and for any style missing from it).
const OPERATION_BY_CODE: Record<string, WindowOperation> = {
  "WC-100": "casement",
  "WC-400": "casement",
  "HC-101": "casement",
  "HC-401": "casement",
  "WC-125": "awning",
  "WC-425": "awning",
  "HC-126": "awning",
  "HC-426": "awning",
  "WC-150": "fixed",
  "WC-175": "fixed",
  "WC-450": "fixed",
  "WC-475": "fixed",
  "HC-151": "fixed",
  "HC-176": "fixed",
  "HC-451": "fixed",
  "HC-476": "fixed",
  "WC-200": "single_slider",
  "WC-300": "single_slider",
  "WC-325": "single_slider",
  "WC-250": "double_slider",
  "WC-350": "double_slider",
  "WC-201": "single_hung",
  "WC-251": "double_hung",
};

export function operationForStyle(style: string, catalog?: QuoteCatalog | null): WindowOperation {
  const code = style.trim().toUpperCase();
  const row = catalog?.styles.find((item) => item.code.toUpperCase() === code);
  const byName = row ? OPERATION_BY_NAME[row.name.trim().toUpperCase()] : undefined;
  return byName || OPERATION_BY_CODE[code] || "fixed";
}

/** Operations whose handing the rep must choose (left / right). */
export function hasSideHanding(operation: WindowOperation) {
  return operation === "casement" || operation === "single_slider";
}

export function handingLabel(operation: WindowOperation) {
  return operation === "single_slider" ? "Operating sash (from outside)" : "Hinge side (from outside)";
}

export function normalizeHanding(
  operation: WindowOperation,
  handing: WindowHanding | undefined,
  fallback: "left" | "right" = "left",
): WindowHanding {
  if (operation === "awning") return "top";
  if (hasSideHanding(operation)) return handing === "left" || handing === "right" ? handing : fallback;
  return null;
}

/** Default side for lite `index` of `count`: the end lites open away from the middle. */
export function defaultSide(index: number, count: number): "left" | "right" {
  return count > 1 && index === count - 1 ? "right" : "left";
}

export function supportsReinforcement(operation: WindowOperation) {
  return operation === "casement" || operation === "awning";
}

export function isOperable(operation: WindowOperation) {
  return operation !== "fixed";
}

export function defaultScreen(operations: WindowOperation[]) {
  return operations.some(isOperable);
}

export function defaultHardware(operations: WindowOperation[]) {
  return operations.some(supportsReinforcement) ? DEFAULT_HARDWARE : "";
}

export function hasReinforcement(adders: unknown) {
  return Array.isArray(adders) && adders.some((adder) => /reinforc/i.test(String(adder)));
}

type CatalogRow = { name: string };

function matches(fragment: string, rows: CatalogRow[]) {
  const needle = fragment.toLowerCase();
  const hits = rows.filter((row) => row.name.toLowerCase().includes(needle));
  if (hits.length === 1) return hits[0];
  const exact = hits.filter((row) => row.name.toLowerCase() === needle);
  return exact.length === 1 ? exact[0] : null;
}

/**
 * The shortest engine name for a catalog row: the name up to its keyword
 * ('5 1/2" wood jamb') when that alone matches one row, otherwise the full
 * row name (the engine also accepts an exact full name).
 */
export function trimFragment(name: string, rows: CatalogRow[], keyword: string) {
  const index = name.toLowerCase().indexOf(keyword.toLowerCase());
  if (index >= 0) {
    const short = name.slice(0, index + keyword.length);
    const hits = rows.filter((row) => row.name.toLowerCase().includes(short.toLowerCase()));
    if (hits.length === 1) return short;
  }
  return name;
}

const JAMB_KEYWORDS: Record<JambKind, string> = { wood_jamb: "wood jamb", pvc_jamb: "PVC jamb" };

export function jambRows(catalog: QuoteCatalog | null | undefined, kind: JambKind) {
  return catalog?.accessories[kind] || [];
}

/** Standard-depth jamb choices (custom sizes need a quoted depth, so they are left out). */
export function jambOptions(catalog: QuoteCatalog | null | undefined, kind: JambKind) {
  const rows = jambRows(catalog, kind);
  return rows
    .filter((row) => !/^custom size/i.test(row.name.trim()))
    .map((row) => trimFragment(row.name, rows, JAMB_KEYWORDS[kind]));
}

/** Map a saved accessory name (full row name or fragment) onto its current option value. */
export function resolveJambName(catalog: QuoteCatalog | null | undefined, kind: JambKind, saved: string) {
  const rows = jambRows(catalog, kind);
  const row = matches(saved, rows);
  return row ? trimFragment(row.name, rows, JAMB_KEYWORDS[kind]) : saved;
}

export function brickmouldOptions(catalog: QuoteCatalog | null | undefined) {
  return (catalog?.accessories.brickmould || []).map((row) => row.name);
}

/** Add a saved value that is no longer offered so a select can still show it. */
export function withCurrent(options: string[], current: string) {
  return current && !options.includes(current) ? [...options, current] : options;
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}
