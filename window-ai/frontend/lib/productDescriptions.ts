import type {
  DoorCatalog,
  DoorOpeningSpec,
  QuoteCatalog,
  QuoteLineInput,
  WindowDetails,
} from "@/lib/api";
import { PRIMED_MAX_IN, type JambProduct } from "@/lib/productOptions";
import { fmt, LayoutNode, layoutSummary, sectionLabel, SERIES_LABELS, tryResolveLayout } from "@/lib/windowLayout";

/** 5.5 -> "5 1/2", 4.75 -> "4 3/4" (sixteenths); mirrors descriptions.py _fraction. */
function fraction(value: number) {
  let whole = Math.floor(value);
  let sixteenths = Math.round((value - whole) * 16);
  if (sixteenths === 16) {
    whole += 1;
    sixteenths = 0;
  }
  if (!sixteenths) return String(whole);
  let num = sixteenths;
  let den = 16;
  while (num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  return whole ? `${whole} ${num}/${den}` : `${num}/${den}`;
}

/**
 * Customer text for an accessory; wood jambs read '5 1/2" primed wood jamb', or
 * 'unfinished' past the product's priming limit (mirrors quote.py wood_jamb_finish).
 */
export function accessoryText(item: Record<string, unknown>, product: JambProduct = "window") {
  const name = text(item.name);
  if (item.kind === "wood_jamb") {
    let depth = item.depth_in != null ? Number(item.depth_in) : NaN;
    let size = "";
    if (Number.isFinite(depth)) size = `${fraction(depth)}"`;
    else {
      const match = name.match(/^([\d/ ]+)"/);
      size = match ? `${match[1].trim()}"` : "";
      const parts = size.replace('"', "").trim().split(/\s+/);
      depth = parts.reduce((sum, part) => sum + (part.includes("/") ? Number(part.split("/")[0]) / Number(part.split("/")[1]) : Number(part)), 0);
    }
    const primed = text(item.finish || "primed").toLowerCase() === "primed" && Number.isFinite(depth) && depth > 0 && depth <= PRIMED_MAX_IN[product] + 1e-6;
    return `${size} ${primed ? "primed" : "unfinished"} wood jamb`.trim();
  }
  return name || pretty(item.kind);
}

function colourText(specs: Array<Record<string, unknown>>) {
  const exterior = join(specs.map((item) => text(item.colour_ext || item.color)));
  const interior = join(specs.map((item) => text(item.colour_int)).filter((colour) => colour && colour.toLocaleLowerCase() !== "white"));
  return [exterior ? `Exterior colour: ${exterior}` : "", interior ? `Interior colour: ${interior}` : ""];
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function pretty(value: unknown) {
  return text(value).replace(/_/g, " ");
}

function join(parts: unknown[]) {
  const seen = new Set<string>();
  return parts
    .map(text)
    .filter((part) => {
      const key = part.toLocaleLowerCase();
      if (!part || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" - ");
}

export function descriptionWithProductDetails(custom: string | undefined, generated: string) {
  const prefix = text(custom);
  if (!prefix || !generated || prefix.toLocaleLowerCase().includes(generated.toLocaleLowerCase())) {
    return prefix || generated;
  }
  return join([prefix, generated]);
}

function size(spec: Record<string, unknown>) {
  const width = spec.width;
  const height = spec.height;
  if (width == null && height == null) return "";
  if (width == null) return `${height} in high`;
  if (height == null) return `${width} in wide`;
  return `${width} x ${height} in`;
}

function windowOptions(spec: Record<string, unknown>) {
  const glazing = spec.glazing && typeof spec.glazing === "object"
    ? spec.glazing as Record<string, unknown>
    : {};
  const options: string[] = [];
  for (const [key, label] of [
    ["loe180", "LoE 180"],
    ["i89", "i89"],
    ["triple", "Triple pane"],
    ["tri_pane_lami", "Tri-pane laminated"],
    ["frost_tint", "Frost / tint"],
  ] as const) {
    if (glazing[key]) options.push(label);
  }
  if (glazing.gas) options.push(`${pretty(glazing.gas)} gas`);
  const product: JambProduct = spec.type === "patio_sliding" || spec.type === "patio_swing" ? "patio" : "window";
  for (const accessory of Array.isArray(spec.accessories) ? spec.accessories : []) {
    if (accessory && typeof accessory === "object") {
      const name = accessoryText(accessory as Record<string, unknown>, product);
      if (name) options.push(name);
    }
  }
  if (spec.kick_lock) options.push("Kick lock");
  return options;
}

/** Mirrors services/descriptions.py unit_description (the estimate compares both). */
function unitParts(spec: Record<string, unknown>): string[] {
  const label = SERIES_LABELS[text(spec.series) || "classic"] || "Window";
  const { resolved } = tryResolveLayout(spec.layout as LayoutNode | undefined, spec.width, spec.height);
  if (!resolved) return [`${label} window`, size(spec)];
  if (resolved.sections.length === 1) {
    return [`${label} ${sectionLabel(resolved.sections[0].node).toLocaleLowerCase()} window`, size(spec)];
  }
  return [
    `${label} ${resolved.sections.length}-section window unit`,
    size(spec),
    layoutSummary(resolved),
    `Sections: ${resolved.sections.map((section) => `${sectionLabel(section.node)} ${fmt(section.width)} x ${fmt(section.height)}`).join(", ")}`,
  ];
}

function windowStyle(style: unknown) {
  return text(style);
}

/** Mirrors services/descriptions.py bay_description. */
function bayParts(spec: Record<string, unknown>): string[] {
  const label = SERIES_LABELS[text(spec.series) || "classic"] || "Window";
  const kind = text(spec.style).toLocaleLowerCase() === "bow" ? "bow" : "bay";
  const { resolved } = tryResolveLayout(spec.layout as LayoutNode | undefined, spec.width, spec.height);
  if (!resolved) return [`${kind === "bow" ? "Bow" : "Bay"} window`, size(spec)];
  return [
    `${label} ${kind} window, ${resolved.sections.length} lites`,
    size(spec),
    `Lites: ${resolved.sections.map((section) => `${sectionLabel(section.node)} ${fmt(section.width)} x ${fmt(section.height)}`).join(", ")}`,
    spec.head_seat ? `Head & seat: ${text(spec.head_seat)}` : "",
  ];
}

/** "Left hinge" for a single casement; "Lite 2 right hinge" inside a combination. */
function handingNotes(details: WindowDetails | null | undefined, combination: boolean) {
  const sections = Array.isArray(details?.sections) ? details.sections : [];
  return sections.flatMap((section, index) => {
    if (!section || (section.handing !== "left" && section.handing !== "right")) return [];
    const kind = section.operation === "casement" ? "hinge" : section.operation === "single_slider" ? "hand" : "";
    if (!kind) return [];
    const side = `${section.handing === "left" ? "Left" : "Right"} ${kind}`;
    return [combination ? `Lite ${index + 1} ${side.toLocaleLowerCase()}` : side];
  });
}

export function describeWindowSpec(spec: QuoteLineInput, catalog?: QuoteCatalog | null, details?: WindowDetails | null) {
  const value = spec as Record<string, unknown>;
  const nestedLites = (Array.isArray(value.lites) ? value.lites : []).filter((lite): lite is Record<string, unknown> => Boolean(lite && typeof lite === "object"));
  const allSpecs = [value, ...nestedLites];
  const common = [...colourText(allSpecs), ...allSpecs.flatMap(windowOptions)];
  // Appended last so the server's generated description (which has no
  // handing) stays a substring and is not repeated.
  const extras = handingNotes(details, value.type === "combination");
  const described = describeByType(value, nestedLites, common);
  return extras.length ? join([described, ...extras]) : described;
}

function describeByType(value: Record<string, unknown>, nestedLites: Record<string, unknown>[], common: string[]) {
  switch (value.type) {
    case "unit":
      return join([...unitParts(value), ...common]);
    case "window":
      return join([windowStyle(value.style) || "Window", size(value), ...common]);
    case "patio_sliding":
      return join(["Sliding patio door", value.nominal_ft != null ? `${value.nominal_ft} ft` : "", text(value.operation).toUpperCase(), ...common]);
    case "patio_swing":
      return join([`${pretty(value.kind) || "Swing"} patio door`, size(value), ...common]);
    case "combination": {
      const lites = nestedLites;
      return join([
        "Combination window assembly",
        lites.length ? `Styles: ${join(lites.map((lite) => windowStyle(lite.style)))}` : "",
        lites[0] ? size(lites[0]) : "",
        ...common,
      ]);
    }
    case "bay_bow": {
      if (value.layout) return join([...bayParts(value), ...common]);
      const lites = nestedLites;
      return join([
        "Bay / bow window assembly",
        lites.length ? `${lites.length} lites` : "",
        lites.length ? `Styles: ${join(lites.map((lite) => windowStyle(lite.style)))}` : "",
        value.head_seat,
        ...common,
      ]);
    }
    default:
      return join([pretty(value.type) || "Window", size(value), ...common]);
  }
}

const OPENING_TYPE_LABELS: Record<DoorOpeningSpec["opening_type"], string> = {
  single_door: "Single door",
  single_1_sidelite: "Single + 1 sidelite",
  single_2_sidelites: "Single + 2 sidelites",
  double_door: "Double door",
  double_2_sidelites: "Double + 2 sidelites",
};

function doorPart(part: Record<string, unknown> | undefined) {
  if (!part) return "";
  const design = part.design ? `design: ${text(part.design)}` : "";
  return join([part.panel || part.series, part.glass, design, part.glass_size, part.height]);
}

function doorFinish(spec: DoorOpeningSpec, catalog?: DoorCatalog | null) {
  const material = catalog?.materials.find((item) => item.key === spec.material);
  const finish = material?.finishes.find((item) => item.key === spec.finish);
  return finish?.label || pretty(spec.finish);
}

export function describeDoorSpec(spec: DoorOpeningSpec, catalog?: DoorCatalog | null) {
  const value = spec as unknown as Record<string, unknown>;
  const details: unknown[] = [
    spec.material === "fiberglass" ? "Fiberglass" : "Steel",
    OPENING_TYPE_LABELS[spec.opening_type] || pretty(spec.opening_type),
    doorFinish(spec, catalog),
  ];
  const door = doorPart(value.door as Record<string, unknown> | undefined);
  if (door) details.push(`Door: ${door}`);
  const door2 = doorPart(value.door2 as Record<string, unknown> | undefined);
  if (door2) details.push(`Second door: ${door2}`);
  (Array.isArray(value.sidelites) ? value.sidelites : []).forEach((sidelite, index) => {
    if (sidelite && typeof sidelite === "object") {
      const part = doorPart(sidelite as Record<string, unknown>);
      if (part) details.push(`Sidelite ${index + 1}: ${part}`);
    }
  });
  const transom = value.transom as Record<string, unknown> | undefined;
  if (transom) details.push(join(["Transom", pretty(transom.shape), pretty(transom.glass), transom.tempered ? "Tempered" : ""]));
  const panelUpcharge = value.panel_upcharge as Record<string, unknown> | undefined;
  if (panelUpcharge) details.push(join(["Panel upcharge", panelUpcharge.panel, panelUpcharge.code]));
  (Array.isArray(value.pull_bars) ? value.pull_bars : []).forEach((pull) => {
    if (pull && typeof pull === "object") {
      const item = pull as Record<string, unknown>;
      details.push(join(["Pull bar", item.length_in ? `${item.length_in} in` : "", pretty(item.finish), pretty(item.shape), pretty(item.block)]));
    }
  });
  (Array.isArray(value.options) ? value.options : []).forEach((option) => {
    if (option && typeof option === "object") {
      const item = option as Record<string, unknown>;
      if (item.item) details.push(`Option: ${text(item.item)}${item.column ? ` (${text(item.column)})` : ""}`);
    }
  });
  return join(details);
}

export function describeDoorLine(
  spec: DoorOpeningSpec,
  catalog?: DoorCatalog | null,
  custom?: string,
) {
  return descriptionWithProductDetails(custom || text(spec.label), describeDoorSpec(spec, catalog));
}
