/**
 * Layout-first window units: one frame size, divisions, a type per section.
 *
 * Mirrors services/windowcity/layout.py. A layout is a tree: a leaf is one
 * single-frame window ({ op, hinge }), a split divides its space into
 * side-by-side columns ("cols") or stacked rows ("rows"). A division size is
 * inches (24, "23 1/2"), a share of the parent ("1/3", "25%") or "*" for an
 * equal share of what is left.
 */

export type WindowOperation =
  | "fixed"
  | "casement"
  | "awning"
  | "slim_fixed"
  | "single_slider"
  | "double_slider"
  | "single_hung"
  | "double_hung";

export type Hinge = "left" | "right" | "top";

export type DivisionSize = number | string;

export type LayoutLeaf = {
  op: WindowOperation;
  hinge?: Hinge;
  style?: string;
  glazing?: Record<string, unknown>;
  adders?: string[];
};

export type LayoutSplit = {
  split: "cols" | "rows";
  sizes?: DivisionSize[];
  children: LayoutNode[];
};

export type LayoutNode = LayoutLeaf | LayoutSplit;

export type ResolvedSection = {
  index: number;
  path: number[];
  x: number;
  y: number;
  width: number;
  height: number;
  node: LayoutLeaf;
};

export type ResolvedLine = { orient: "v" | "h"; pos: number; start: number; end: number };

/** One draggable boundary between child `index - 1` and `index` of a split. */
export type ResolvedJoint = {
  splitPath: number[];
  index: number;
  orient: "v" | "h";
  pos: number;
  start: number;
  end: number;
  /** Where the split's space begins along its axis, and its resolved sizes. */
  origin: number;
  sizes: number[];
};

export type ResolvedLayout = {
  width: number;
  height: number;
  sections: ResolvedSection[];
  lines: ResolvedLine[];
  joints?: ResolvedJoint[];
};

export type LayoutPreset = {
  id: string;
  code: string | null;
  label: string;
  panels: number;
  width: number;
  height: number;
  layout: LayoutNode;
};

export type LayoutSeries = {
  id: string;
  label: string;
  operations: WindowOperation[];
  styles: Partial<Record<WindowOperation, string>>;
};

export const OPERATION_LABELS: Record<WindowOperation, string> = {
  fixed: "Fixed",
  casement: "Casement",
  awning: "Awning",
  slim_fixed: "Slim fixed",
  single_slider: "Single slider",
  double_slider: "Double slider",
  single_hung: "Single hung",
  double_hung: "Double hung",
};

export const OPERATION_HINGES: Record<WindowOperation, Hinge[]> = {
  fixed: [],
  casement: ["left", "right"],
  awning: ["top"],
  slim_fixed: [],
  single_slider: ["left", "right"],
  double_slider: [],
  single_hung: [],
  double_hung: [],
};

/** Series labels; must match services/windowcity/layout.py SERIES (descriptions compare them). */
export const SERIES_LABELS: Record<string, string> = {
  classic: 'Classic 3 1/4" (WC-100 series)',
  classic_400: "Classic WC-400 series",
  heritage: "Heritage (HC-100 series)",
  heritage_maximum: "Heritage Maximum (HC-400 series)",
};

/** Catalog style code → operation, for drawing legacy window / combination lines. */
export const STYLE_OPERATIONS: Record<string, WindowOperation> = {
  "WC-100": "casement", "WC-400": "casement", "HC-101": "casement", "HC-401": "casement",
  "WC-125": "awning", "WC-425": "awning", "HC-126": "awning", "HC-426": "awning",
  "WC-150": "slim_fixed", "WC-450": "slim_fixed", "HC-151": "slim_fixed", "HC-451": "slim_fixed",
  "WC-175": "fixed", "WC-475": "fixed", "HC-176": "fixed", "HC-476": "fixed",
  "WC-200": "single_slider", "WC-300": "single_slider", "WC-325": "single_slider",
  "WC-201": "single_hung", "WC-250": "double_slider", "WC-350": "double_slider",
  "WC-251": "double_hung",
};

const EPS = 1e-6;

export function isSplit(node: LayoutNode): node is LayoutSplit {
  return typeof node === "object" && node !== null && "split" in node;
}

function sizeSpec(raw: DivisionSize | undefined, total: number): number | null {
  if (raw === undefined || raw === null || raw === "*" || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  const text = String(raw).trim();
  if (text.endsWith("%")) return (total * Number(text.slice(0, -1))) / 100;
  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (fraction && Number(fraction[1]) < Number(fraction[2])) return (total * Number(fraction[1])) / Number(fraction[2]);
  return parseInches(text);
}

/** "23 1/2", "23.5", '23½"' → inches (NaN if unreadable). */
export function parseInches(value: string): number {
  const text = value.trim().replace(/["”]$/, "").replace("½", " 1/2").replace("¼", " 1/4").replace("¾", " 3/4");
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(text);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  return NaN;
}

export class LayoutError extends Error {}

export function resolveSizes(sizes: DivisionSize[] | undefined, count: number, total: number): number[] {
  const raw = sizes && sizes.length ? sizes : Array.from({ length: count }, () => "*");
  if (raw.length !== count) throw new LayoutError(`${count} sections need ${count} division sizes`);
  const fixed = raw.map((item) => sizeSpec(item, total));
  if (fixed.some((value) => value !== null && !Number.isFinite(value))) throw new LayoutError(`Division sizes ${raw.join(" : ")} include a value that is not a size`);
  const stars = fixed.filter((value) => value === null).length;
  const used = fixed.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  let out: number[];
  if (stars) {
    const share = (total - used) / stars;
    if (share <= EPS) throw new LayoutError(`Divisions leave no room for the remaining sections in ${fmt(total)}"`);
    out = fixed.map((value) => value ?? share);
  } else {
    if (Math.abs(used - total) > 0.01) throw new LayoutError(`Divisions add up to ${fmt(used)}", not ${fmt(total)}"`);
    out = fixed as number[];
  }
  if (out.some((value) => value <= EPS)) throw new LayoutError("A division has no size");
  return out;
}

export function resolveLayout(layout: LayoutNode | undefined, width: number, height: number): ResolvedLayout {
  if (!(width > 0) || !(height > 0)) throw new LayoutError("Enter the overall width and height");
  const sections: ResolvedSection[] = [];
  const segments: ResolvedLine[] = [];
  const joints: ResolvedJoint[] = [];

  function walk(node: LayoutNode, x: number, y: number, w: number, h: number, path: number[]) {
    if (!isSplit(node)) {
      if (!(node && node.op in OPERATION_LABELS)) throw new LayoutError("Every section needs a window type");
      sections.push({ index: 0, path, x, y, width: w, height: h, node });
      return;
    }
    if (node.children.length < 2) throw new LayoutError("A division needs at least two sections");
    const sizes = resolveSizes(node.sizes, node.children.length, node.split === "cols" ? w : h);
    let offset = 0;
    node.children.forEach((child, i) => {
      if (i > 0) {
        joints.push(node.split === "cols"
          ? { splitPath: path, index: i, orient: "v", pos: x + offset, start: y, end: y + h, origin: x, sizes }
          : { splitPath: path, index: i, orient: "h", pos: y + offset, start: x, end: x + w, origin: y, sizes });
      }
      if (node.split === "cols") {
        if (i > 0) segments.push({ orient: "v", pos: x + offset, start: y, end: y + h });
        walk(child, x + offset, y, sizes[i], h, [...path, i]);
      } else {
        if (i > 0) segments.push({ orient: "h", pos: y + offset, start: x, end: x + w });
        walk(child, x, y + offset, w, sizes[i], [...path, i]);
      }
      offset += sizes[i];
    });
  }

  walk(layout || { op: "fixed" }, 0, 0, width, height, []);
  sections.sort((a, b) => (Math.abs(a.y - b.y) > EPS ? a.y - b.y : a.x - b.x));
  sections.forEach((section, i) => { section.index = i + 1; });
  return { width, height, sections, lines: mergeLines(segments), joints };
}

function mergeLines(lines: ResolvedLine[]): ResolvedLine[] {
  const merged: ResolvedLine[] = [];
  for (const orient of ["v", "h"] as const) {
    const byPos = new Map<number, ResolvedLine[]>();
    for (const line of lines.filter((item) => item.orient === orient)) {
      const key = Math.round(line.pos * 1e6) / 1e6;
      byPos.set(key, [...(byPos.get(key) || []), line]);
    }
    for (const [pos, group] of Array.from(byPos.entries()).sort((a, b) => a[0] - b[0])) {
      const sorted = [...group].sort((a, b) => a.start - b.start);
      let current = { ...sorted[0], pos };
      for (const seg of sorted.slice(1)) {
        if (seg.start <= current.end + EPS) current.end = Math.max(current.end, seg.end);
        else { merged.push(current); current = { ...seg, pos }; }
      }
      merged.push(current);
    }
  }
  return merged;
}

export function tryResolveLayout(layout: LayoutNode | undefined, width: unknown, height: unknown): { resolved: ResolvedLayout | null; error: string | null } {
  try {
    return { resolved: resolveLayout(layout, Number(width), Number(height)), error: null };
  } catch (error) {
    return { resolved: null, error: error instanceof Error ? error.message : "Invalid layout" };
  }
}

export function fmt(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export function sectionLabel(node: LayoutLeaf): string {
  const label = OPERATION_LABELS[node.op] || "Window";
  return node.hinge && node.hinge !== "top" ? `${label} (${node.hinge})` : label;
}

/** "Casement (left) | Fixed | Casement (right)", rows separated by " / ". */
export function layoutSummary(resolved: ResolvedLayout): string {
  const rows = new Map<number, ResolvedSection[]>();
  for (const section of resolved.sections) {
    const key = Math.round(section.y * 1e6) / 1e6;
    rows.set(key, [...(rows.get(key) || []), section]);
  }
  return Array.from(rows.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row.map((section) => sectionLabel(section.node)).join(" | "))
    .join(" / ");
}

// ---------------------------------------------------------------- tree edits
export function nodeAt(root: LayoutNode, path: number[]): LayoutNode {
  let node = root;
  for (const index of path) {
    if (!isSplit(node)) throw new LayoutError("Invalid section path");
    node = node.children[index];
  }
  return node;
}

export function replaceAt(root: LayoutNode, path: number[], replacement: LayoutNode): LayoutNode {
  if (!path.length) return replacement;
  if (!isSplit(root)) throw new LayoutError("Invalid section path");
  const [head, ...rest] = path;
  return { ...root, children: root.children.map((child, i) => (i === head ? replaceAt(child, rest, replacement) : child)) };
}

export function updateLeaf(root: LayoutNode, path: number[], patch: Partial<LayoutLeaf>): LayoutNode {
  const node = nodeAt(root, path);
  if (isSplit(node)) return root;
  const next: LayoutLeaf = { ...node, ...patch };
  if (patch.op) {
    const hinges = OPERATION_HINGES[patch.op];
    if (!hinges.length) delete next.hinge;
    else if (!next.hinge || !hinges.includes(next.hinge)) next.hinge = hinges[0];
  }
  for (const key of Object.keys(next) as Array<keyof LayoutLeaf>) {
    if (next[key] === undefined) delete next[key];
  }
  return replaceAt(root, path, next);
}

/** Divide a section into `count` equal parts, each a copy of it. */
export function splitSection(root: LayoutNode, path: number[], direction: "cols" | "rows", count = 2): LayoutNode {
  const node = nodeAt(root, path);
  if (isSplit(node)) return root;
  const children = Array.from({ length: count }, () => ({ ...node }));
  if (node.op === "casement" && direction === "cols" && count === 2) {
    children[0] = { ...node, hinge: "left" };
    children[1] = { ...node, hinge: "right" };
  }
  return replaceAt(root, path, { split: direction, sizes: Array.from({ length: count }, () => "*"), children });
}

/** Remove the division a section belongs to, keeping that section's type for the merged space. */
export function mergeSection(root: LayoutNode, path: number[]): LayoutNode {
  if (!path.length) return root;
  const node = nodeAt(root, path);
  return replaceAt(root, path.slice(0, -1), isSplit(node) ? node : { ...node });
}

export function setDivisionSizes(root: LayoutNode, splitPath: number[], sizes: DivisionSize[]): LayoutNode {
  const node = nodeAt(root, splitPath);
  if (!isSplit(node)) return root;
  return replaceAt(root, splitPath, { ...node, sizes });
}

export const MIN_SECTION = 10;
const SNAP_FRACTIONS: Array<[number, string]> = [[1 / 4, "1/4"], [1 / 3, "1/3"], [1 / 2, "1/2"], [2 / 3, "2/3"], [3 / 4, "3/4"]];

/**
 * Division sizes after dragging a joint to `pos` (inches from the unit edge).
 * Snaps to 1/8" and to quarter / third / half points of the split; the last
 * part stays "*" so the division still fits if the overall size changes.
 */
export function dragJoint(joint: ResolvedJoint, pos: number): { sizes: DivisionSize[]; snapped: string | null; value: number; pair: [number, number] } {
  const before = joint.sizes.slice(0, joint.index - 1).reduce((a, b) => a + b, 0);
  const lo = joint.origin + before + MIN_SECTION;
  const pairTotal = joint.sizes[joint.index - 1] + joint.sizes[joint.index];
  const hi = joint.origin + before + pairTotal - MIN_SECTION;
  let value = Math.min(Math.max(pos, lo), hi);
  const total = joint.sizes.reduce((a, b) => a + b, 0);
  let snapped: string | null = null;
  const tolerance = Math.max(total * 0.012, 0.4);
  for (const [fraction, label] of SNAP_FRACTIONS) {
    const target = joint.origin + total * fraction;
    if (Math.abs(value - target) <= tolerance && target >= lo && target <= hi) {
      value = target;
      snapped = label;
      break;
    }
  }
  if (!snapped) value = Math.round(value * 8) / 8;
  const sizes = [...joint.sizes];
  const first = value - joint.origin - before;
  sizes[joint.index - 1] = first;
  sizes[joint.index] = pairTotal - first;
  const rounded: DivisionSize[] = sizes.map((size) => Math.round(size * 1000) / 1000);
  rounded[rounded.length - 1] = "*";
  return { sizes: rounded, snapped, value, pair: [first, pairTotal - first] };
}

/** Scale inch division sizes along one axis (shares and "*" already scale). */
export function scaleLayout(node: LayoutNode, axis: "cols" | "rows", factor: number): LayoutNode {
  if (!isSplit(node) || !Number.isFinite(factor) || factor <= 0) return node;
  const sizes = node.split === axis && node.sizes
    ? node.sizes.map((size) => (typeof size === "number" ? Math.round(size * factor * 1000) / 1000 : size))
    : node.sizes;
  return { ...node, ...(sizes ? { sizes } : {}), children: node.children.map((child) => scaleLayout(child, axis, factor)) };
}

/** An even grid of `cols` x `rows` sections of one type. */
export function gridLayout(cols: number, rows: number, leaf: LayoutLeaf = { op: "fixed" }): LayoutNode {
  const row = (): LayoutNode => (cols === 1 ? { ...leaf } : { split: "cols", sizes: Array.from({ length: cols }, () => "*"), children: Array.from({ length: cols }, () => ({ ...leaf })) });
  return rows === 1 ? row() : { split: "rows", sizes: Array.from({ length: rows }, () => "*"), children: Array.from({ length: rows }, row) };
}

/** Chain dimensions: section widths along the bottom edge, heights along the right edge. */
export function chainDimensions(resolved: ResolvedLayout): { across: number[]; down: number[] } {
  const bottom = resolved.sections.filter((s) => Math.abs(s.y + s.height - resolved.height) < 0.01).sort((a, b) => a.x - b.x);
  const right = resolved.sections.filter((s) => Math.abs(s.x + s.width - resolved.width) < 0.01).sort((a, b) => a.y - b.y);
  return { across: bottom.map((s) => s.width), down: right.map((s) => s.height) };
}

/** 35.5 -> 35 1/2 (nearest 1/16"). */
export function fmtInches(value: number): string {
  if (!Number.isFinite(value)) return "";
  const sixteenths = Math.round(value * 16);
  const whole = Math.floor(sixteenths / 16);
  let num = sixteenths % 16;
  let den = 16;
  if (!num) return String(whole);
  while (num % 2 === 0) { num /= 2; den /= 2; }
  return whole ? `${whole} ${num}/${den}` : `${num}/${den}`;
}

export function leafCount(node: LayoutNode): number {
  return isSplit(node) ? node.children.reduce((sum, child) => sum + leafCount(child), 0) : 1;
}

/** Layout tree for a legacy line (window / combination) so it can be drawn. */
export function layoutFromLegacySpec(spec: Record<string, unknown>): { layout: LayoutNode; width: number; height: number } | null {
  const opFor = (style: unknown): WindowOperation => STYLE_OPERATIONS[String(style || "").toUpperCase()] || "fixed";
  if (spec.type === "unit") {
    const width = Number(spec.width);
    const height = Number(spec.height);
    return Number.isFinite(width) && Number.isFinite(height) ? { layout: (spec.layout as LayoutNode) || { op: "fixed" }, width, height } : null;
  }
  if (spec.type === "window") {
    const width = Number(spec.width);
    const height = Number(spec.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    const op = opFor(spec.style);
    return { layout: { op, ...(OPERATION_HINGES[op][0] ? { hinge: OPERATION_HINGES[op][0] } : {}) }, width, height };
  }
  if (spec.type === "combination") {
    const layoutSpec = (spec.layout || {}) as Record<string, unknown>;
    const cols = Number(layoutSpec.cols) || 1;
    const rows = Number(layoutSpec.rows) || 1;
    const lites = (Array.isArray(spec.lites) ? spec.lites : []) as Array<Record<string, unknown>>;
    if (lites.length !== cols * rows) return null;
    const leaf = (lite: Record<string, unknown>): LayoutLeaf => ({ op: opFor(lite.style) });
    const row = (r: number): LayoutNode => {
      const items = lites.slice(r * cols, (r + 1) * cols);
      return cols === 1 ? leaf(items[0]) : { split: "cols", sizes: items.map((lite) => Number(lite.width)), children: items.map(leaf) };
    };
    const widths = lites.slice(0, cols).map((lite) => Number(lite.width));
    const heights = Array.from({ length: rows }, (_, r) => Number(lites[r * cols]?.height));
    const width = widths.reduce((a, b) => a + b, 0);
    const height = heights.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return { layout: rows === 1 ? row(0) : { split: "rows", sizes: heights, children: Array.from({ length: rows }, (_, r) => row(r)) }, width, height };
  }
  return null;
}

type SizeRangeStyle = {
  code: string;
  size_ranges?: Array<{ label?: string | null; ranges: Array<{ min: number; max: number }> }>;
};

/** The printed size range a section must fit ("12-84 x 12-90"), or null when it fits. */
export function sectionSizeProblem(style: SizeRangeStyle | undefined, width: number, height: number, triple: boolean): string | null {
  if (!style) return null;
  // Same rule as the engine's _check_limits: the first labelled row for the
  // pane count; widths are the even ranges, heights the odd ones.
  const row = (style.size_ranges || []).find((item) => item.ranges.length && (triple !== (item.label || "").toLowerCase().startsWith("double")));
  if (!row) return null;
  const widths = row.ranges.filter((_, i) => i % 2 === 0);
  const heights = row.ranges.filter((_, i) => i % 2 === 1);
  const fits = (ranges: Array<{ min: number; max: number }>, value: number) => ranges.some((r) => r.min <= value + EPS && value <= r.max + EPS);
  if (fits(widths, width) && fits(heights, height)) return null;
  const span = (ranges: Array<{ min: number; max: number }>) => `${fmt(Math.min(...ranges.map((r) => r.min)))}–${fmt(Math.max(...ranges.map((r) => r.max)))}"`;
  return `${style.code} is made ${span(widths)} wide × ${span(heights)} high${triple ? " in triple pane" : ""}`;
}
