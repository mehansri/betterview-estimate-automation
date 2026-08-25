import type {
  DoorCatalog,
  DoorOpeningSpec,
  QuoteCatalog,
  QuoteLineInput,
} from "@/lib/api";

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
  for (const accessory of Array.isArray(spec.accessories) ? spec.accessories : []) {
    if (accessory && typeof accessory === "object") {
      const item = accessory as Record<string, unknown>;
      const name = text(item.name || item.kind);
      if (name) options.push(name);
    }
  }
  return options;
}

function windowStyle(style: unknown) {
  return text(style);
}

export function describeWindowSpec(spec: QuoteLineInput, catalog?: QuoteCatalog | null) {
  const value = spec as Record<string, unknown>;
  const nestedLites = (Array.isArray(value.lites) ? value.lites : []).filter((lite): lite is Record<string, unknown> => Boolean(lite && typeof lite === "object"));
  const allSpecs = [value, ...nestedLites];
  const colours = join(allSpecs.map((item) => text(item.colour_ext || item.color)));
  const common = [colours ? `Exterior colour: ${colours}` : "", ...allSpecs.flatMap(windowOptions)];
  switch (value.type) {
    case "window":
      return join([windowStyle(value.style) || "Window", size(value), ...common]);
    case "patio_sliding":
      return join(["Sliding patio door", value.nominal_ft != null ? `${value.nominal_ft} ft` : "", ...common]);
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
