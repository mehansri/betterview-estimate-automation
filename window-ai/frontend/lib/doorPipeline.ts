/**
 * Palma entrance door pipeline: the step-by-step selection, what each step
 * offers given the steps before it, and the cascade that clears downstream
 * choices an earlier change made invalid.
 *
 * The catalog (GET /api/doors/catalog -> pipeline) carries availability only;
 * the server re-validates and prices every selection, so this module decides
 * what to *show*, never what things cost.
 */

export type DoorMaterial = "steel" | "fiberglass";
export type GlassFamilyMap = Record<string, string[]>;

export type PipelineDoorOffer =
  | { kind: "solid"; height: string; widths: number[] }
  | { kind: "glazed"; height: string; widths: number[]; width_class: string; glass: Record<string, GlassFamilyMap> };

export type PipelineSideliteOffer =
  | { kind: "glazed"; height: string; glass: Record<string, GlassFamilyMap> }
  | { kind: "solid"; height: string; panels: string[] };

export type PipelineModel = { key: string; label: string; offers: PipelineDoorOffer[] };
export type PipelineSideliteModel = { key: string; label: string; direct_glazed: boolean; offers: PipelineSideliteOffer[] };

export type PipelineMaterial = {
  key: DoorMaterial;
  label: string;
  default_frame_type: "smooth" | "textured";
  side_types: Array<{ key: string; label: string }>;
  frame_depths: Array<{ key: string; label: string; standard: boolean; frame_types: string[] }>;
  sills: Array<{ key: string; label: string; not_with: string[] }>;
  handles: Array<{ item: string; label: string; has_dummy: boolean }>;
  models: PipelineModel[];
  sidelite_models: PipelineSideliteModel[];
  designs: Array<{ name: string; group: string }>;
};

export type PipelineConfiguration = {
  key: string;
  label: string;
  doors: number;
  sidelites: number;
  transom: boolean;
  opening_type: "single_door" | "single_1_sidelite" | "single_2_sidelites" | "double_door" | "double_2_sidelites";
};

export type PipelineCatalog = {
  widths: number[];
  standard_widths: number[];
  heights: Array<{ key: string; inches: number }>;
  configurations: PipelineConfiguration[];
  frame_types: Array<{ key: "smooth" | "textured"; label: string }>;
  glass_families: Array<{ key: string; label: string; hint: string; flat_max: boolean; series: Array<{ key: string; label: string }> }>;
  transom_glass: Array<{ key: string; label: string }>;
  paint_presets: string[];
  stain_presets: string[];
  fire_rated_list: number | null;
  default_sidelite_width: number;
  default_transom_height: number;
  discount: number;
  materials: Record<DoorMaterial, PipelineMaterial>;
};

export type PipelineSide = { type?: string; colour?: string };
export type PipelineGlassChoice = { glazed?: boolean; size?: string; family?: string; series?: string; design?: string };
export type PipelineSideliteChoice = PipelineGlassChoice & { model?: string; panel?: string };

export type PipelineSelection = {
  material?: DoorMaterial;
  frame_type?: "smooth" | "textured";
  width?: number;
  height?: string;
  custom_size: { enabled: boolean; width_in?: number; height_in?: number };
  configuration?: string;
  frame_depth?: string;
  model?: string;
  colours: {
    exterior?: PipelineSide;
    interior?: PipelineSide;
    frame: { mode: "match" | "split"; exterior?: PipelineSide; interior?: PipelineSide };
  };
  glass: {
    door: PipelineGlassChoice;
    sidelites: PipelineSideliteChoice[];
    transom?: { shape: "rectangle" | "shapes"; glass?: string; height_in?: number; tempered: boolean };
  };
  standard: {
    brickmould: "regular" | "flat" | "none";
    sill: string;
    sill_extension: boolean;
    hinges: "black" | "standard";
    lock?: "double_bore" | "multipoint";
    handle?: string;
  };
  extras: {
    tedee: boolean;
    tedee_keypad: boolean;
    tedee_bridge: boolean;
    tedee_sensor: boolean;
    screen: "none" | "white" | "painted";
    screen_qty: number;
    astragal_lock: boolean;
    fire_rated: boolean;
    fire_rated_list?: number;
    mail_slot: boolean;
    peep_viewer: boolean;
  };
};

export const PIPELINE_STEPS = [
  { id: "material", label: "Material", hint: "Steel or fiberglass — sets the frame default" },
  { id: "size", label: "Size", hint: "Slab width and height filter the slab models" },
  { id: "configuration", label: "Configuration", hint: "Door layout and frame depth" },
  { id: "model", label: "Slab model", hint: "Only models built in this material and size are shown" },
  { id: "colours", label: "Colours", hint: "Exterior and interior finish" },
  { id: "glass", label: "Glass", hint: "Solid or glazed, then glass for each part" },
  { id: "standard", label: "Standard", hint: "Pre-filled defaults — lock prep is the rep's call" },
  { id: "extras", label: "Extras", hint: "Upcharges offered for this door" },
] as const;

export type PipelineStepId = (typeof PIPELINE_STEPS)[number]["id"];

export function emptySelection(): PipelineSelection {
  return {
    custom_size: { enabled: false },
    colours: { frame: { mode: "match" } },
    glass: { door: {}, sidelites: [] },
    standard: { brickmould: "regular", sill: "black_anodized", sill_extension: false, hinges: "black" },
    extras: {
      tedee: false,
      tedee_keypad: false,
      tedee_bridge: false,
      tedee_sensor: false,
      screen: "none",
      screen_qty: 1,
      astragal_lock: false,
      fire_rated: false,
      mail_slot: false,
      peep_viewer: false,
    },
  };
}

// ---------------------------------------------------------------- lookups

export function materialOf(catalog: PipelineCatalog, sel: PipelineSelection): PipelineMaterial | null {
  return sel.material ? catalog.materials[sel.material] || null : null;
}

export function configurationOf(catalog: PipelineCatalog, sel: PipelineSelection): PipelineConfiguration | null {
  return catalog.configurations.find((item) => item.key === sel.configuration) || null;
}

export function heightInches(catalog: PipelineCatalog, height?: string) {
  return catalog.heights.find((item) => item.key === height)?.inches ?? 80;
}

/** Slab models built in the selected material, width and height. */
export function availableModels(catalog: PipelineCatalog, sel: PipelineSelection): PipelineModel[] {
  const material = materialOf(catalog, sel);
  if (!material || !sel.width || !sel.height) return [];
  return material.models.filter((model) => model.offers.some((offer) => offer.height === sel.height && offer.widths.includes(sel.width!)));
}

export function modelOf(catalog: PipelineCatalog, sel: PipelineSelection): PipelineModel | null {
  return availableModels(catalog, sel).find((model) => model.key === sel.model) || null;
}

export function doorOffers(model: PipelineModel | null, sel: PipelineSelection) {
  const match = (offer: PipelineDoorOffer) => offer.height === sel.height && sel.width != null && offer.widths.includes(sel.width);
  const solid = model?.offers.find((offer) => offer.kind === "solid" && match(offer));
  const glazed = model?.offers.find((offer) => offer.kind === "glazed" && match(offer)) as Extract<PipelineDoorOffer, { kind: "glazed" }> | undefined;
  return { solid: Boolean(solid), glazed: glazed || null };
}

export function sideliteModels(catalog: PipelineCatalog, sel: PipelineSelection): PipelineSideliteModel[] {
  const material = materialOf(catalog, sel);
  if (!material || !sel.height) return [];
  return material.sidelite_models.filter((model) => model.offers.some((offer) => offer.height === sel.height));
}

export function sideliteOffers(model: PipelineSideliteModel | undefined, height?: string) {
  const solid = model?.offers.find((offer) => offer.kind === "solid" && offer.height === height) as Extract<PipelineSideliteOffer, { kind: "solid" }> | undefined;
  const glazed = model?.offers.find((offer) => offer.kind === "glazed" && offer.height === height) as Extract<PipelineSideliteOffer, { kind: "glazed" }> | undefined;
  return { solid: solid || null, glazed: glazed || null };
}

export function frameDepths(catalog: PipelineCatalog, sel: PipelineSelection) {
  const material = materialOf(catalog, sel);
  const frameType = sel.frame_type || material?.default_frame_type;
  return (material?.frame_depths || []).filter((depth) => !frameType || depth.frame_types.includes(frameType));
}

export function sills(catalog: PipelineCatalog, sel: PipelineSelection) {
  return (materialOf(catalog, sel)?.sills || []).filter((sill) => !sel.frame_depth || !sill.not_with.includes(sel.frame_depth));
}

/** Interior finishes offered once the exterior is known (fiberglass: no painted-out / stained-in). */
export function interiorTypes(catalog: PipelineCatalog, sel: PipelineSelection, exterior?: string) {
  const material = materialOf(catalog, sel);
  const types = material?.side_types || [];
  if (material?.key === "fiberglass" && exterior === "painted") return types.filter((type) => type.key === "painted");
  return types;
}

export function familyInfo(catalog: PipelineCatalog, key?: string) {
  return catalog.glass_families.find((family) => family.key === key) || null;
}

/** Decorative designs whose pricing group is offered in this glass size. */
export function designsFor(catalog: PipelineCatalog, sel: PipelineSelection, series: string[]) {
  const letters = new Set(series.filter((key) => key.startsWith("group_")).map((key) => key.slice(-1).toUpperCase()));
  return (materialOf(catalog, sel)?.designs || []).filter((design) => letters.has(design.group));
}

export function customSizeProblem(catalog: PipelineCatalog, sel: PipelineSelection): string | null {
  if (!sel.custom_size.enabled || !sel.width || !sel.height) return null;
  const { width_in, height_in } = sel.custom_size;
  const maxHeight = heightInches(catalog, sel.height);
  if (width_in != null && (width_in <= 0 || width_in > sel.width)) return `Custom width must be at most the ${sel.width}" slab it is cut from.`;
  if (height_in != null && (height_in <= 0 || height_in > maxHeight)) return `Custom height must be at most the ${sel.height} (${maxHeight}") slab it is cut from.`;
  return null;
}

export function isCutDown(catalog: PipelineCatalog, sel: PipelineSelection) {
  if (!sel.custom_size.enabled || !sel.width || !sel.height) return false;
  const { width_in, height_in } = sel.custom_size;
  return (width_in != null && width_in < sel.width) || (height_in != null && height_in < heightInches(catalog, sel.height));
}

// ---------------------------------------------------------------- finish

/** Mirror of the server's colour -> price column mapping, for display only. */
export function finishKey(sel: PipelineSelection): string | null {
  const ext = sel.colours.exterior?.type;
  const int = sel.colours.interior?.type;
  if (!sel.material || !ext || !int) return null;
  const same = (sel.colours.exterior?.colour || "").trim().toLowerCase() === (sel.colours.interior?.colour || "").trim().toLowerCase();
  if (sel.material === "steel") {
    const painted = [ext === "painted", int === "painted"].filter(Boolean).length;
    if (painted === 0) return "factory_white";
    if (painted === 1) return "paint_1s";
    return same ? "paint_2s_1c" : "paint_2s_2c";
  }
  if (ext === "painted" && int === "stained") return null;
  if (ext === "stained" && int === "painted") return "stain_out_paint_in";
  if (ext === "painted") return same ? "paint_2s_1c" : "paint_2s_2c";
  return same ? "stain_2s_1c" : "stain_2s_2c";
}

export const FINISH_LABELS: Record<string, string> = {
  factory_white: "Factory white",
  paint_1s: "Painted 1 side",
  paint_2s_1c: "Painted 2 sides, 1 colour",
  paint_2s_2c: "Painted 2 sides, 2 colours",
  stain_2s_1c: "Stained 2 sides, 1 colour",
  stain_2s_2c: "Stained 2 sides, 2 colours",
  stain_out_paint_in: "Stained outside / painted inside",
};

// ---------------------------------------------------------------- step status

function glassDecided(catalog: PipelineCatalog, sel: PipelineSelection, choice: PipelineGlassChoice, offer: { glass: Record<string, GlassFamilyMap> } | null, solidOk: boolean) {
  if (choice.glazed === false) return solidOk;
  if (choice.glazed !== true || !offer || !choice.size || !choice.family) return false;
  const series = offer.glass[choice.size]?.[choice.family];
  if (!series) return false;
  return familyInfo(catalog, choice.family)?.flat_max || !choice.series || series.includes(choice.series);
}

/** Whether each step is complete, in pipeline order. */
export function stepComplete(catalog: PipelineCatalog, sel: PipelineSelection): boolean[] {
  const material = materialOf(catalog, sel);
  const layout = configurationOf(catalog, sel);
  const model = modelOf(catalog, sel);
  const offers = doorOffers(model, sel);
  const colours = sel.colours;
  const frameOk = colours.frame.mode === "match" || Boolean(colours.frame.exterior?.type && colours.frame.interior?.type);
  const sidelitesOk = layout
    ? Array.from({ length: layout.sidelites }).every((_, index) => {
        const part = sel.glass.sidelites[index] || {};
        const sidelite = sideliteModels(catalog, sel).find((item) => item.key === part.model);
        const { solid, glazed } = sideliteOffers(sidelite, sel.height);
        if (!sidelite) return false;
        if (part.glazed === false) return Boolean(solid && (!part.panel || solid.panels.includes(part.panel)));
        return glassDecided(catalog, sel, part, glazed, false);
      })
    : false;
  const transomOk = !layout?.transom || Boolean(sel.glass.transom?.glass);
  return [
    Boolean(material && sel.frame_type),
    Boolean(sel.width && sel.height && !customSizeProblem(catalog, sel)),
    Boolean(layout && sel.frame_depth && frameDepths(catalog, sel).some((depth) => depth.key === sel.frame_depth)),
    Boolean(model),
    Boolean(colours.exterior?.type && colours.interior?.type && finishKey(sel) && frameOk),
    glassDecided(catalog, sel, sel.glass.door, offers.glazed, offers.solid) && sidelitesOk && transomOk,
    Boolean(sel.standard.lock && (sel.standard.lock !== "multipoint" || material?.handles.some((handle) => handle.item === sel.standard.handle))),
    !sel.extras.fire_rated || Boolean((sel.extras.fire_rated_list ?? catalog.fire_rated_list ?? 0) > 0),
  ];
}

/** Index of the first incomplete step (steps.length when everything is complete). */
export function firstIncomplete(catalog: PipelineCatalog, sel: PipelineSelection) {
  const done = stepComplete(catalog, sel);
  const index = done.findIndex((value) => !value);
  return index === -1 ? done.length : index;
}

export function isPriceable(catalog: PipelineCatalog, sel: PipelineSelection) {
  return firstIncomplete(catalog, sel) >= PIPELINE_STEPS.length;
}

// ---------------------------------------------------------------- cascade

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Keep a glass choice only where the offer still has it; returns a reason when something was dropped. */
function revalidateGlass(catalog: PipelineCatalog, choice: PipelineGlassChoice, offer: { glass: Record<string, GlassFamilyMap> } | null, solidOk: boolean, label: string): { choice: PipelineGlassChoice; reason: string | null } {
  if (choice.glazed === undefined) return { choice, reason: null };
  if (choice.glazed === false) return solidOk ? { choice, reason: null } : { choice: {}, reason: `${label}: solid is not offered on this slab` };
  if (!offer) return { choice: {}, reason: `${label}: glass is not offered on this slab in this size` };
  const next = { ...choice };
  let reason: string | null = null;
  if (next.size && !offer.glass[next.size]) {
    reason = `${label}: glass size ${next.size} is not offered`;
    delete next.size;
    delete next.family;
    delete next.series;
    delete next.design;
  }
  if (next.size && next.family && !offer.glass[next.size][next.family]) {
    reason = `${label}: ${familyInfo(catalog, next.family)?.label || next.family} is not offered in ${next.size}`;
    delete next.family;
    delete next.series;
    delete next.design;
  }
  const series = next.size && next.family ? offer.glass[next.size][next.family] : null;
  if (series && next.series && !series.includes(next.series)) {
    next.series = series[0];
    reason = reason || `${label}: glass option changed to one offered in ${next.size}`;
  }
  return { choice: next, reason };
}

/**
 * Re-validate every step after a change, in order. Anything an earlier step
 * made unavailable is cleared (or reset to its default) and reported, so the
 * rep sees exactly what they need to choose again.
 */
export function normalizeSelection(catalog: PipelineCatalog, input: PipelineSelection): { selection: PipelineSelection; cleared: string[] } {
  const sel = clone(input);
  const cleared: string[] = [];
  const material = materialOf(catalog, sel);

  // Step 1
  if (!material) {
    return { selection: { ...emptySelection(), width: sel.width, height: sel.height, custom_size: sel.custom_size }, cleared };
  }
  if (!sel.frame_type || !catalog.frame_types.some((item) => item.key === sel.frame_type)) sel.frame_type = material.default_frame_type;

  // Step 2
  if (sel.width != null && !catalog.widths.includes(sel.width)) delete sel.width;
  if (sel.height != null && !catalog.heights.some((item) => item.key === sel.height)) delete sel.height;

  // Step 3
  const layout = configurationOf(catalog, sel);
  if (sel.frame_depth && !frameDepths(catalog, sel).some((depth) => depth.key === sel.frame_depth)) {
    const label = material.frame_depths.find((depth) => depth.key === sel.frame_depth)?.label || sel.frame_depth;
    cleared.push(`Frame depth ${label} is not offered on this ${material.label.toLowerCase()} ${sel.frame_type} frame`);
    delete sel.frame_depth;
  }

  // Step 4
  if (sel.model && !modelOf(catalog, sel)) {
    // The model may belong to the previous material, so look in both.
    const label = Object.values(catalog.materials).flatMap((item) => item.models).find((model) => model.key === sel.model)?.label || sel.model;
    cleared.push(`Slab model ${label} is not built ${sel.width ? `${sel.width}" x ${sel.height}` : "in this size"}${material ? ` in ${material.label.toLowerCase()}` : ""}`);
    delete sel.model;
  }

  // Step 5
  const sideKeys = new Set(material.side_types.map((type) => type.key));
  for (const side of ["exterior", "interior"] as const) {
    if (sel.colours[side]?.type && !sideKeys.has(sel.colours[side]!.type!)) {
      cleared.push(`${side === "exterior" ? "Exterior" : "Interior"} finish ${sel.colours[side]!.type} is not offered on ${material.label.toLowerCase()}`);
      delete sel.colours[side];
    }
  }
  if (sel.colours.interior?.type && !interiorTypes(catalog, sel, sel.colours.exterior?.type).some((type) => type.key === sel.colours.interior!.type)) {
    cleared.push("Interior finish: Palma does not stain the inside of a door painted outside");
    delete sel.colours.interior;
  }
  if (sel.colours.frame.mode === "split") {
    for (const side of ["exterior", "interior"] as const) {
      const type = sel.colours.frame[side]?.type;
      if (type && !(sideKeys.has(type) || type === "white")) delete sel.colours.frame[side];
    }
  }

  // Step 6
  const model = modelOf(catalog, sel);
  if (!model) {
    if (sel.glass.door.glazed !== undefined) sel.glass.door = {};
  } else {
    const offers = doorOffers(model, sel);
    const door = revalidateGlass(catalog, sel.glass.door, offers.glazed, offers.solid, "Door glass");
    sel.glass.door = door.choice;
    if (door.reason) cleared.push(door.reason);
    const series = sel.glass.door.size && sel.glass.door.family ? offers.glazed?.glass[sel.glass.door.size]?.[sel.glass.door.family] || [] : [];
    if (sel.glass.door.design && !designsFor(catalog, sel, series).some((design) => design.name === sel.glass.door.design)) delete sel.glass.door.design;
  }
  const sidelites = layout?.sidelites ?? 0;
  const models = sideliteModels(catalog, sel);
  sel.glass.sidelites = Array.from({ length: sidelites }, (_, index) => {
    let part: PipelineSideliteChoice = sel.glass.sidelites[index] || {};
    const label = sidelites > 1 ? `Sidelite ${index + 1}` : "Sidelite";
    if (part.model && !models.some((item) => item.key === part.model)) {
      cleared.push(`${label}: that sidelite is not offered at ${sel.height}`);
      part = {};
    }
    const sidelite = models.find((item) => item.key === part.model);
    if (!sidelite) return part;
    const { solid, glazed } = sideliteOffers(sidelite, sel.height);
    const result = revalidateGlass(catalog, part, glazed, Boolean(solid), label);
    if (result.reason) cleared.push(result.reason);
    const next: PipelineSideliteChoice = { ...result.choice, model: part.model };
    if (next.glazed === false && solid && next.panel && !solid.panels.includes(next.panel)) next.panel = solid.panels[0];
    return next;
  });
  if (layout?.transom) {
    sel.glass.transom = sel.glass.transom || { shape: "rectangle", tempered: false };
  } else if (sel.glass.transom) {
    delete sel.glass.transom;
  }

  // Step 7
  if (!sills(catalog, sel).some((sill) => sill.key === sel.standard.sill)) {
    const old = material.sills.find((sill) => sill.key === sel.standard.sill)?.label || sel.standard.sill;
    cleared.push(`Sill ${old.toLowerCase()} does not fit this frame — back to black anodized`);
    sel.standard.sill = "black_anodized";
  }
  if (sel.standard.lock !== "multipoint") delete sel.standard.handle;
  else if (sel.standard.handle && !material.handles.some((handle) => handle.item === sel.standard.handle)) delete sel.standard.handle;

  // Step 8
  if (sel.extras.tedee && sel.standard.lock !== "multipoint") {
    cleared.push("Tedee smart lock removed — it needs the multipoint lock");
    sel.extras = { ...sel.extras, tedee: false, tedee_keypad: false, tedee_bridge: false, tedee_sensor: false };
  }
  if (sel.extras.astragal_lock && layout && layout.doors !== 2) {
    cleared.push("Astragal mortise lock removed — it is for double doors");
    sel.extras.astragal_lock = false;
  }
  return { selection: sel, cleared };
}

// ---------------------------------------------------------------- defaults

/** A sensible first choice for a new sidelite: the door's own style when there is one. */
export function defaultSidelite(catalog: PipelineCatalog, sel: PipelineSelection): PipelineSideliteChoice {
  const models = sideliteModels(catalog, sel);
  const doorLabel = modelOf(catalog, sel)?.label || "";
  const glazedModels = models.filter((model) => !model.direct_glazed && sideliteOffers(model, sel.height).glazed);
  const model = glazedModels.find((item) => item.label === doorLabel) || glazedModels.find((item) => /flush/i.test(item.label)) || glazedModels[0] || models[0];
  if (!model) return {};
  return { model: model.key };
}

// ---------------------------------------------------------------- spec

export type PipelineOpeningSpec = {
  label?: string;
  material: DoorMaterial;
  finish?: string;
  opening_type: PipelineConfiguration["opening_type"];
  sidelites: never[];
  pull_bars: never[];
  options: never[];
  pipeline: PipelineSelection;
};

/** The opening spec the quote API takes; null until every required step is complete. */
export function specFromSelection(catalog: PipelineCatalog, sel: PipelineSelection, label: string): PipelineOpeningSpec | null {
  const layout = configurationOf(catalog, sel);
  if (!sel.material || !layout || !isPriceable(catalog, sel)) return null;
  return {
    label,
    material: sel.material,
    finish: finishKey(sel) || undefined,
    opening_type: layout.opening_type,
    sidelites: [],
    pull_bars: [],
    options: [],
    pipeline: clone(sel),
  };
}

/** Short summary lines for the preview panel and project list. */
export function selectionSummary(catalog: PipelineCatalog, sel: PipelineSelection): string[] {
  const material = materialOf(catalog, sel);
  const layout = configurationOf(catalog, sel);
  const model = material?.models.find((item) => item.key === sel.model);
  const door = sel.glass.door;
  const glass = door.glazed === false ? "Solid slab" : door.glazed && door.family ? `${familyInfo(catalog, door.family)?.label}${door.size ? ` ${door.size}` : ""}` : null;
  const finish = finishKey(sel);
  return [
    material?.label,
    sel.width && sel.height ? `${sel.width}" x ${sel.height}${sel.custom_size.enabled ? " (cut down)" : ""}` : null,
    layout?.label,
    model ? `${model.label} slab` : null,
    glass,
    finish ? FINISH_LABELS[finish] : null,
  ].filter(Boolean) as string[];
}
