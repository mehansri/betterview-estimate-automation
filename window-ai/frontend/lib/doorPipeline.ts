/**
 * Palma entrance door pipeline: the step-by-step selection, what each step
 * offers given the steps before it, and the cascade that clears downstream
 * choices an earlier change made invalid.
 *
 * The catalog (GET /api/doors/catalog -> pipeline) carries availability only;
 * the server re-validates and prices every selection, so this module decides
 * what to *show*, never what things cost.
 */

import { isCustomColour } from "@/lib/palmaColours";

export type DoorMaterial = "steel" | "fiberglass";
export type GlassFamilyMap = Record<string, string[]>;

export type PipelineDoorOffer =
  | { kind: "solid"; height: string; widths: number[] }
  | { kind: "glazed"; height: string; widths: number[]; width_class: string; glass: Record<string, GlassFamilyMap> };

export type PipelineSideliteOffer =
  | { kind: "glazed"; height: string; glass: Record<string, GlassFamilyMap> }
  | { kind: "solid"; height: string; panels: string[] };

export type PipelineModel = { key: string; label: string; smooth?: boolean; offers: PipelineDoorOffer[] };
export type PipelineSideliteModel = { key: string; label: string; direct_glazed: boolean; offers: PipelineSideliteOffer[] };

export type Choice = { key: string; label: string };
export type PipelinePullBarOptions = { styles: Choice[]; blocks: Choice[]; lengths: number[]; finishes: Choice[]; shapes: Choice[] };
export type PipelineAccent = { key: string; label: string; model: string; widths: number[]; finishes: Choice[] };
export type PipelineMaterialExtras = {
  fire_rating: boolean;
  accents: PipelineAccent[];
  vertical_accent: { model: string; size: string; finishes: Choice[] } | null;
  reeded_accent: { model: string } | null;
  triple_glazing: boolean;
  glass_frames: Choice[];
  screens: Choice[];
  retractable_screen_depths: string[];
};

export type PipelineMaterial = {
  key: DoorMaterial;
  label: string;
  widths?: number[];
  default_frame_type: "smooth" | "textured";
  side_types: Array<{ key: string; label: string }>;
  frame_depths: Array<{ key: string; label: string; standard: boolean; frame_types: string[]; retractable_screen?: boolean }>;
  sills: Array<{ key: string; label: string; not_with: string[] }>;
  handles: Array<{ item: string; label: string; has_dummy: boolean; tedee?: "yes" | "miami_only" | "no" }>;
  pull_bars?: PipelinePullBarOptions;
  models: PipelineModel[];
  sidelite_models: PipelineSideliteModel[];
  extras?: PipelineMaterialExtras;
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
  glass_families: Array<{ key: string; label: string; hint: string; flat_max: boolean; per_square?: boolean; series: Array<{ key: string; label: string }> }>;
  glass_patterns?: Record<string, string[]>;
  transom_glass: Array<{ key: string; label: string }>;
  brickmoulds?: Choice[];
  hinges?: Choice[];
  paint_presets: string[];
  stain_presets: string[];
  paint_colours?: Array<{ name: string; code: string; hex: string }>;
  stain_colours?: Array<{ name: string; hex: string }>;
  multipoint_required?: { materials: string[]; heights: string[] };
  fire_rated_list: number | null;
  default_sidelite_width: number;
  default_transom_height: number;
  discount: number;
  materials: Record<DoorMaterial, PipelineMaterial>;
};

export type PipelineSide = { type?: string; colour?: string };
export type PipelineGlassChoice = { glazed?: boolean; size?: string; family?: string; series?: string; design?: string; squares?: number };
export type PipelineSideliteChoice = PipelineGlassChoice & { model?: string; panel?: string };
export type PipelinePullBar = { style: string; block?: string; length_in: number; finish: string; shape: string };
export type PipelineAccentChoice = { design?: string; finish?: string; sides?: "exterior" | "both" };

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
    brickmould: "regular" | "flat" | "none" | "custom_pvc" | "custom_textured";
    sill: string;
    sill_extension: boolean;
    hinges: "black" | "satin_nickel" | "standard";
    lock?: "double_bore" | "multipoint" | "pull_bar";
    handle?: string;
    pull_bar?: PipelinePullBar;
  };
  extras: {
    tedee: boolean;
    tedee_keypad: boolean;
    tedee_bridge: boolean;
    tedee_sensor: boolean;
    tedee_knob: boolean;
    key_alike: boolean;
    screen: "none" | "white" | "painted" | "sliding_white" | "sliding_painted_1s" | "sliding_painted_2s";
    screen_qty: number;
    astragal_lock: boolean;
    fire_rated: boolean;
    fire_rated_list?: number;
    mail_slot: boolean;
    peep_viewer: boolean;
    dentil_shelf: boolean;
    kick_panel: boolean;
    casing: boolean;
    casing_backband: boolean;
    glass_frame?: string;
    operating_sidelite: number;
    triple_glazing?: "lowe_1x" | "lowe_2x";
    accent?: PipelineAccentChoice;
    vertical_accent?: string;
    reeded_accent: boolean;
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
      tedee_knob: false,
      key_alike: false,
      screen: "none",
      screen_qty: 1,
      astragal_lock: false,
      fire_rated: false,
      mail_slot: false,
      peep_viewer: false,
      dentil_shelf: false,
      kick_panel: false,
      casing: false,
      casing_backband: false,
      operating_sidelite: 0,
      reeded_accent: false,
    },
  };
}

export const DEFAULT_PULL_BAR: PipelinePullBar = { style: "straight", length_in: 36, finish: "satin", shape: "round" };

// Saved before the 2026-09-30 audit: parse-artefact models (X3), the WG49/OAK3P
// split (X12) and vented units without their sub-type (M5). Mirrors
// LEGACY_MODELS / LEGACY_SERIES in services/doors/pipeline.py.
const LEGACY_MODELS: Record<string, Record<string, { keys: string[]; sizes: Record<string, string> }>> = {
  steel: {
    "camber-4-panel-bt": { keys: ["4-panel-bt"], sizes: { "22x10": "22x10 Camber" } },
    "oval-flush": { keys: ["flush"], sizes: { "18x42": "18x42 Oval" } },
  },
  fiberglass: {
    "camber-oak-4-panel-bt": { keys: ["oak-4-panel-bt"], sizes: { "22x10": "22x10 Camber" } },
    "4-panel-3-4-wg49": { keys: ["oak-3-4-4-panel"], sizes: {} },
    "oak-3-4-panel": { keys: ["oak-3-4-panel", "oak-3-4-4-panel"], sizes: {} },
  },
};
const LEGACY_SERIES: Record<string, string[]> = {
  venting_q550_peak470: ["q550", "peak470"],
  venting_elite_ezlift: ["elite", "ezlift"],
  venting_elevation: ["elevation"],
};

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

/** Slab widths sold in the selected material (steel adds the non-standard flush widths). */
export function widthsFor(catalog: PipelineCatalog, sel: PipelineSelection): number[] {
  return materialOf(catalog, sel)?.widths || catalog.widths;
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

/** Configurations buildable at the chosen height (e.g. no fiberglass sidelites at 7'0"). */
export function configurationOffered(catalog: PipelineCatalog, sel: PipelineSelection, layout: PipelineConfiguration) {
  return !layout.sidelites || !sel.height || sideliteModels(catalog, sel).length > 0;
}

export function frameDepths(catalog: PipelineCatalog, sel: PipelineSelection) {
  const material = materialOf(catalog, sel);
  const frameType = sel.frame_type || material?.default_frame_type;
  return (material?.frame_depths || []).filter((depth) => !frameType || depth.frame_types.includes(frameType));
}

export function sills(catalog: PipelineCatalog, sel: PipelineSelection) {
  return (materialOf(catalog, sel)?.sills || []).filter((sill) => !sel.frame_depth || !sill.not_with.includes(sel.frame_depth));
}

/** Exterior/interior finishes offered; no stain on smooth fiberglass skins (Palma: stains are for woodgrain). */
export function sideTypes(catalog: PipelineCatalog, sel: PipelineSelection) {
  const material = materialOf(catalog, sel);
  const smooth = modelOf(catalog, sel)?.smooth;
  return (material?.side_types || []).filter((type) => !(smooth && type.key === "stained"));
}

/** Interior finishes offered once the exterior is known (fiberglass: no painted-out / stained-in). */
export function interiorTypes(catalog: PipelineCatalog, sel: PipelineSelection, exterior?: string) {
  const material = materialOf(catalog, sel);
  const types = sideTypes(catalog, sel);
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

/** Named patterns for glass the book prices as one table (obscure, Solution series sandblast). */
export function patternsFor(catalog: PipelineCatalog, choice: PipelineGlassChoice): string[] {
  const patterns = catalog.glass_patterns || {};
  if (choice.family === "obscure" || choice.series === "sdl_obscure") return patterns.obscure || [];
  if (choice.series === "solution_sandblast") return patterns.solution_sandblast || [];
  return [];
}

/** Palma: "Multipoint locks are necessary for all fiberglass doors and all 8' doors". */
export function multipointRequired(catalog: PipelineCatalog, sel: PipelineSelection) {
  const rule = catalog.multipoint_required;
  if (!rule) return false;
  return Boolean((sel.material && rule.materials.includes(sel.material)) || (sel.height && rule.heights.includes(sel.height)));
}

export function handleOf(catalog: PipelineCatalog, sel: PipelineSelection) {
  return materialOf(catalog, sel)?.handles.find((handle) => handle.item === sel.standard.handle) || null;
}

/** Tedee "is only compatible with all FERCO handles, Miami handles and all Pull Bars". */
export function tedeeAllowed(catalog: PipelineCatalog, sel: PipelineSelection) {
  if (sel.standard.lock === "pull_bar") return sel.standard.pull_bar?.block !== "with_roller_latches_and_deadbolt_bore";
  if (sel.standard.lock !== "multipoint") return false;
  return handleOf(catalog, sel)?.tedee !== "no";
}

export function pullBarLengths(catalog: PipelineCatalog, sel: PipelineSelection) {
  const lengths = materialOf(catalog, sel)?.pull_bars?.lengths || [];
  // 84" bars are for 8' doors only.
  return lengths.filter((length) => length < 84 || sel.height === "8'0\"");
}

export function accentsFor(catalog: PipelineCatalog, sel: PipelineSelection): PipelineAccent[] {
  return (materialOf(catalog, sel)?.extras?.accents || []).filter((accent) => accent.model === sel.model);
}

export function verticalAccentAllowed(catalog: PipelineCatalog, sel: PipelineSelection) {
  const rule = materialOf(catalog, sel)?.extras?.vertical_accent;
  return Boolean(rule && sel.model === rule.model && sel.glass.door.glazed && sel.glass.door.size === rule.size);
}

export function reededAccentAllowed(catalog: PipelineCatalog, sel: PipelineSelection) {
  const rule = materialOf(catalog, sel)?.extras?.reeded_accent;
  return Boolean(rule && sel.model === rule.model);
}

export function retractableScreenAllowed(catalog: PipelineCatalog, sel: PipelineSelection) {
  const depths = materialOf(catalog, sel)?.extras?.retractable_screen_depths;
  return !depths || !sel.frame_depth || depths.includes(sel.frame_depth);
}

/** Door and sidelite lites that take a glass frame (direct-glazed sidelites have none). */
export function framedLites(catalog: PipelineCatalog, sel: PipelineSelection) {
  const layout = configurationOf(catalog, sel);
  let count = sel.glass.door.glazed ? layout?.doors ?? 1 : 0;
  const models = materialOf(catalog, sel)?.sidelite_models || [];
  for (const part of sel.glass.sidelites) {
    if (part.glazed && !models.find((model) => model.key === part.model)?.direct_glazed) count += 1;
  }
  return count;
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

/** Typed colours that are not on Palma's lists: each adds a custom colour match. */
export function customColours(sel: PipelineSelection): string[] {
  const sides = [sel.colours.exterior, sel.colours.interior];
  if (sel.colours.frame.mode === "split") sides.push(sel.colours.frame.exterior, sel.colours.frame.interior);
  const found = new Map<string, string>();
  for (const side of sides) {
    if (side && isCustomColour(side.type, side.colour)) found.set(`${side.type}:${side.colour!.trim().toLowerCase()}`, side.colour!.trim());
  }
  return Array.from(found.values());
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
  const family = familyInfo(catalog, choice.family);
  // SDLs add a charge per square, so the count is part of the choice.
  if (family?.per_square && !(Number(choice.squares) >= 1)) return false;
  return family?.flat_max || !choice.series || series.includes(choice.series);
}

function lockDecided(catalog: PipelineCatalog, sel: PipelineSelection) {
  const material = materialOf(catalog, sel);
  if (sel.standard.lock === "multipoint") return Boolean(material?.handles.some((handle) => handle.item === sel.standard.handle));
  if (sel.standard.lock === "pull_bar") return Boolean(sel.standard.pull_bar?.block);
  return sel.standard.lock === "double_bore";
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
  // Steel uses the book's 20-minute rating; a fiberglass fire rating is a legacy rep-entered price.
  const fireOk = !sel.extras.fire_rated || material?.extras?.fire_rating || Boolean((sel.extras.fire_rated_list ?? catalog.fire_rated_list ?? 0) > 0);
  return [
    Boolean(material && sel.frame_type),
    Boolean(sel.width && sel.height && !customSizeProblem(catalog, sel)),
    Boolean(layout && sel.frame_depth && frameDepths(catalog, sel).some((depth) => depth.key === sel.frame_depth)),
    Boolean(model),
    Boolean(colours.exterior?.type && colours.interior?.type && finishKey(sel) && frameOk),
    glassDecided(catalog, sel, sel.glass.door, offers.glazed, offers.solid) && sidelitesOk && transomOk,
    lockDecided(catalog, sel),
    Boolean(fireOk),
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
    delete next.squares;
  }
  if (next.size && next.family && !offer.glass[next.size][next.family]) {
    reason = `${label}: ${familyInfo(catalog, next.family)?.label || next.family} is not offered in ${next.size}`;
    delete next.family;
    delete next.series;
    delete next.design;
    delete next.squares;
  }
  const series = next.size && next.family ? offer.glass[next.size][next.family] : null;
  if (series && next.series && !series.includes(next.series)) {
    const prefixes = LEGACY_SERIES[next.series];
    if (prefixes) {
      next.series = series.find((key) => prefixes.some((prefix) => key.startsWith(prefix))) || series[0];
      reason = reason || `${label}: vented units are now priced by sub-type — check ${familyInfo(catalog, next.family)?.series.find((item) => item.key === next.series)?.label || "the unit"}`;
    } else {
      next.series = series[0];
      reason = reason || `${label}: glass option changed to one offered in ${next.size}`;
    }
  }
  if (next.family && !familyInfo(catalog, next.family)?.per_square) delete next.squares;
  if (next.design && next.family !== "decorative" && patternsFor(catalog, next).length && !patternsFor(catalog, next).includes(next.design)) delete next.design;
  return { choice: next, reason };
}

/** Map a model key (and its glass sizes) saved before the audit fixes to today's key. */
function upgradeLegacyModel(catalog: PipelineCatalog, sel: PipelineSelection) {
  const legacy = sel.material && sel.model ? LEGACY_MODELS[sel.material]?.[sel.model] : undefined;
  if (!legacy) return;
  const door = sel.glass.door;
  if (door.size && legacy.sizes[door.size]) door.size = legacy.sizes[door.size];
  const models = materialOf(catalog, sel)?.models || [];
  const match = legacy.keys.find((key) => {
    const model = models.find((item) => item.key === key);
    return model && (!door.glazed || model.offers.some((offer) => offer.kind === "glazed" && door.size && offer.glass[door.size]));
  });
  sel.model = match || legacy.keys[0];
}

/**
 * Re-validate every step after a change, in order. Anything an earlier step
 * made unavailable is cleared (or reset to its default) and reported, so the
 * rep sees exactly what they need to choose again.
 */
export function normalizeSelection(catalog: PipelineCatalog, input: PipelineSelection): { selection: PipelineSelection; cleared: string[] } {
  const defaults = emptySelection();
  const raw = clone(input);
  // Selections saved by older versions lack the newer fields.
  const sel: PipelineSelection = {
    ...raw,
    custom_size: raw.custom_size || defaults.custom_size,
    colours: { ...raw.colours, frame: raw.colours?.frame || defaults.colours.frame },
    glass: { ...defaults.glass, ...raw.glass, door: raw.glass?.door || {}, sidelites: raw.glass?.sidelites || [] },
    standard: { ...defaults.standard, ...raw.standard },
    extras: { ...defaults.extras, ...raw.extras },
  };
  const cleared: string[] = [];
  const material = materialOf(catalog, sel);

  // Step 1
  if (!material) {
    return { selection: { ...emptySelection(), width: sel.width, height: sel.height, custom_size: sel.custom_size }, cleared };
  }
  if (!sel.frame_type || !catalog.frame_types.some((item) => item.key === sel.frame_type)) sel.frame_type = material.default_frame_type;

  // Step 2
  if (sel.width != null && !widthsFor(catalog, sel).includes(sel.width)) {
    cleared.push(`${sel.width}" slabs are not made in ${material.label.toLowerCase()}`);
    delete sel.width;
  }
  if (sel.height != null && !catalog.heights.some((item) => item.key === sel.height)) delete sel.height;

  // Step 3
  let layout = configurationOf(catalog, sel);
  if (layout && !configurationOffered(catalog, sel, layout)) {
    cleared.push(`${layout.label}: no ${material.label.toLowerCase()} sidelites are made at ${sel.height}`);
    delete sel.configuration;
    layout = null;
  }
  if (sel.frame_depth && !frameDepths(catalog, sel).some((depth) => depth.key === sel.frame_depth)) {
    const label = material.frame_depths.find((depth) => depth.key === sel.frame_depth)?.label || sel.frame_depth;
    cleared.push(`Frame depth ${label} is not offered on this ${material.label.toLowerCase()} ${sel.frame_type} frame`);
    delete sel.frame_depth;
  }

  // Step 4
  upgradeLegacyModel(catalog, sel);
  if (sel.model && !modelOf(catalog, sel)) {
    // The model may belong to the previous material, so look in both.
    const label = Object.values(catalog.materials).flatMap((item) => item.models).find((model) => model.key === sel.model)?.label || sel.model;
    cleared.push(`Slab model ${label} is not built ${sel.width ? `${sel.width}" x ${sel.height}` : "in this size"}${material ? ` in ${material.label.toLowerCase()}` : ""}`);
    delete sel.model;
  }

  // Step 5
  const sideKeys = new Set(sideTypes(catalog, sel).map((type) => type.key));
  for (const side of ["exterior", "interior"] as const) {
    if (sel.colours[side]?.type && !sideKeys.has(sel.colours[side]!.type!)) {
      const reason = sel.colours[side]!.type === "stained" && modelOf(catalog, sel)?.smooth ? "Palma's stains are for woodgrain skins, not smooth" : `not offered on ${material.label.toLowerCase()}`;
      cleared.push(`${side === "exterior" ? "Exterior" : "Interior"} finish ${sel.colours[side]!.type}: ${reason}`);
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
    if (sel.glass.door.design && sel.glass.door.family === "decorative" && !designsFor(catalog, sel, series).some((design) => design.name === sel.glass.door.design)) delete sel.glass.door.design;
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
  if (sel.standard.lock !== "pull_bar") delete sel.standard.pull_bar;
  else {
    const options = material.pull_bars;
    const bar = { ...DEFAULT_PULL_BAR, ...sel.standard.pull_bar };
    if (options && !options.styles.some((style) => style.key === bar.style)) {
      cleared.push(`${bar.style} pull bars are not made for ${material.label.toLowerCase()} — back to straight`);
      bar.style = "straight";
    }
    const lengths = pullBarLengths(catalog, sel);
    if (lengths.length && !lengths.includes(bar.length_in)) {
      cleared.push(`${bar.length_in}" pull bars are for 8' doors only`);
      bar.length_in = lengths[lengths.length - 1];
    }
    sel.standard.pull_bar = bar;
  }

  // Step 8
  if (sel.extras.tedee && !tedeeAllowed(catalog, sel)) {
    cleared.push("Tedee smart lock removed — it needs a multipoint lock with a FERCO or Miami handle, or a multipoint pull bar");
    sel.extras = { ...sel.extras, tedee: false, tedee_keypad: false, tedee_bridge: false, tedee_sensor: false, tedee_knob: false };
  }
  if (!sel.extras.tedee) sel.extras.tedee_knob = false;
  if (sel.extras.astragal_lock && layout && layout.doors !== 2) {
    cleared.push("Astragal mortise lock removed — it is for double doors");
    sel.extras.astragal_lock = false;
  }
  if ((sel.extras.screen === "white" || sel.extras.screen === "painted") && !retractableScreenAllowed(catalog, sel)) {
    cleared.push('Retractable screen removed — Palma fits them to 6-5/8" or 7-1/4" jambs only');
    sel.extras.screen = "none";
  }
  if (sel.extras.fire_rated && !material.extras?.fire_rating && !(sel.extras.fire_rated_list && sel.extras.fire_rated_list > 0)) {
    cleared.push("Fire rating removed — Palma's fiberglass book has no fire-rated door");
    sel.extras.fire_rated = false;
  }
  if (sel.extras.accent?.design) {
    const accent = accentsFor(catalog, sel).find((item) => item.key === sel.extras.accent!.design);
    if (!accent) {
      cleared.push("Decorative accent removed — it is not made for this slab");
      delete sel.extras.accent;
    } else if (!accent.finishes.some((finish) => finish.key === (sel.extras.accent!.finish || "ss"))) {
      sel.extras.accent = { ...sel.extras.accent, finish: accent.finishes[0].key };
    }
  }
  if (sel.extras.vertical_accent && !verticalAccentAllowed(catalog, sel)) {
    cleared.push("Vertical accent removed — it needs the Uno (flush) slab with a 7x64 lite");
    delete sel.extras.vertical_accent;
  }
  if (sel.extras.reeded_accent && !reededAccentAllowed(catalog, sel)) {
    cleared.push("Reeded wood accent removed — it attaches to the Uno (flush) steel slab");
    sel.extras.reeded_accent = false;
  }
  if (sel.extras.glass_frame && !framedLites(catalog, sel)) delete sel.extras.glass_frame;
  if (sel.extras.operating_sidelite > sidelites || (sel.extras.operating_sidelite && isCutDown(catalog, sel))) {
    if (sel.extras.operating_sidelite) cleared.push("Operating sidelite removed — standard-size sidelites only");
    sel.extras.operating_sidelite = 0;
  }
  if (sel.extras.triple_glazing && !(material.extras?.triple_glazing && sel.glass.door.glazed)) delete sel.extras.triple_glazing;
  if (!sel.extras.casing) sel.extras.casing_backband = false;
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

/** Lock wording on estimates; mirrors pipeline_summary in services/doors/pipeline.py. */
export function lockSummary(sel: PipelineSelection): string {
  const { lock, handle, pull_bar } = sel.standard;
  if (lock === "multipoint") return `Multipoint lock: ${(handle || "").replace(/^\[NEW\]\s*/, "")}`;
  if (lock === "pull_bar") {
    const style = pull_bar?.style || "straight";
    return `Pull bar: ${style.charAt(0).toUpperCase()}${style.slice(1)} ${pull_bar?.length_in || 36}"`;
  }
  if (lock === "double_bore") return "Double-bore prep";
  return "";
}
