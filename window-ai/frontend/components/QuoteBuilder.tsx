"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  appendCustomerEstimateLines,
  createTemplate,
  deleteTemplate,
  fetchTemplates,
  SavedTemplate,
  CustomerEstimate,
  CustomerEstimateDraft,
  DeterministicQuoteResponse,
  CustomerWindowLine,
  QuoteCatalog,
  QuoteLineInput,
  QuoteLineType,
  PresentationMode,
  priceCustomerEstimate,
  SalesPreset,
  fetchCustomerEstimate,
  fetchQuoteCatalog,
  fetchSalesPresets,
  priceDeterministicQuote,
  isLockedStatus,
  updateCustomerEstimate,
  WindowDetails,
  WindowElevation,
  WindowSectionOperation,
} from "@/lib/api";
import { estimateToDraft, newEstimateLineId } from "@/lib/quoteHandoff";
import { describeWindowSpec } from "@/lib/productDescriptions";
import ProjectAccessGate from "@/components/ProjectAccessGate";
import LocationInput from "@/components/LocationInput";
import { isAtLeast, numericInputValue, NumericInputValue } from "@/lib/numericInput";
import { groupWindowStyles, windowStyleLabel } from "@/lib/styleOptions";
import { getCombinationSuggestion } from "@/lib/windowSuggestions";
import WindowConfigurator, { ConfiguratorValue } from "@/components/WindowConfigurator";
import PatioDoorConfigurator, { PatioDoorValue } from "@/components/PatioDoorConfigurator";
import BayConfigurator, { BayValue } from "@/components/BayConfigurator";
import WindowUnitDrawing from "@/components/WindowUnitDrawing";
import { LayoutNode, layoutFromLegacySpec, STYLE_OPERATIONS, tryResolveLayout, WindowOperation } from "@/lib/windowLayout";
import { useViewMode, VIEW_MODE_SHORTCUT } from "@/lib/viewMode";
import {
  CUSTOM_JAMB,
  DEFAULT_JAMB_DEPTH,
  DEFAULT_PATIO_JAMB_DEPTH,
  defaultJamb,
  EXTERIOR_COLOURS,
  fmtJambLimit,
  INTERIOR_COLOURS,
  jambAccessory,
  jambDepthIn,
  jambDepthOptions,
  jambFromAccessories,
  jambIsPrimed,
  jambLabel,
  primedMaxIn,
  withColourRules,
} from "@/lib/productOptions";
import { bayProblem, DEFAULT_BAY, headSeatFor } from "@/lib/bayLayout";
import { slidingPanels, swingPanels } from "@/lib/patioLayout";
import {
  defaultHardware,
  defaultScreen,
  ELEVATIONS,
  HARDWARE_SUGGESTIONS,
  operationForStyle,
  SCREEN_MESH_COLOURS,
  SPACERS,
  withCurrent,
} from "@/lib/windowDetails";

const COLORS = EXTERIOR_COLOURS;
const GAS = ["argon", "90/5", "50/50", "krypton"];

type Draft = {
  type: QuoteLineType;
  style: string;
  width: NumericInputValue;
  height: NumericInputValue;
  qty: NumericInputValue;
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
  jamb_depth: string;
  jamb_custom: NumericInputValue;
  jamb_primed: boolean;
  sliding_ft: number;
  operation: string;
  swing_kind: string;
  swing_hinge: string;
  kick_lock: boolean;
  head_seat: string;
  insulated: boolean;
  welded_bm: boolean;
  cable_support: boolean;
  bay_style: string;
  lite_count: NumericInputValue;
  unit_series: string;
  layout: LayoutNode;
  preset: string;
};

type QuoteLineDraft = {
  id: string;
  spec: QuoteLineInput;
  details: WindowDetails | null;
  location: string;
  description: string;
};

/** Presentation-only order details for the line being built; never priced. */
type OrderDetails = {
  tag: string;
  elevation: WindowElevation | "";
  /** null follows the default for the line's operations. */
  screen: boolean | null;
  screen_frame: string;
  screen_mesh: string;
  /** null follows the default for the line's operations. */
  hardware: string | null;
  spacer: string;
  notes: string;
};

const DEFAULT_LAYOUT: LayoutNode = { op: "casement", hinge: "left" };
const PATIO_BRICKMOULD = { kind: "brickmould", name: "Brickmould EP326 installed" };

function emptyDraft(style = "WC-100", type: QuoteLineType = "unit"): Draft {
  return {
    type,
    style,
    width: 30,
    height: 60,
    qty: 1,
    colour_ext: "white",
    colour_int: "white",
    loe180: true,
    i89: false,
    gas: "argon",
    triple: false,
    tri_pane_lami: false,
    frost_tint: false,
    brickmould: false,
    // Every new line item starts with a primed wood jamb, 5 1/2" on windows and
    // 4 1/2" on patio doors; reps change the depth for non-standard walls, leave
    // it unfinished, or turn it off.
    wood_jamb: true,
    jamb_depth: isPatio(type) ? DEFAULT_PATIO_JAMB_DEPTH : DEFAULT_JAMB_DEPTH,
    jamb_custom: "",
    jamb_primed: true,
    sliding_ft: 6,
    operation: "XO",
    swing_kind: "single",
    swing_hinge: "left",
    kick_lock: true,
    head_seat: "up to 8ft wide",
    insulated: false,
    welded_bm: false,
    cable_support: false,
    bay_style: "bay",
    lite_count: 3,
    unit_series: "classic",
    layout: DEFAULT_LAYOUT,
    preset: "",
  };
}

function emptyOrderDetails(): OrderDetails {
  return { tag: "", elevation: "", screen: null, screen_frame: "white", screen_mesh: "black", hardware: null, spacer: "Black", notes: "" };
}

function orderDetailsFrom(saved: WindowDetails | null | undefined): OrderDetails {
  const blank = emptyOrderDetails();
  if (!saved) return blank;
  return {
    tag: saved.tag || "",
    elevation: ELEVATIONS.find((item) => item.value === saved.elevation)?.value || "",
    screen: Boolean(saved.screen),
    screen_frame: saved.screen?.frame_colour || blank.screen_frame,
    screen_mesh: saved.screen?.mesh_colour || blank.screen_mesh,
    hardware: saved.hardware || "",
    spacer: saved.spacer || blank.spacer,
    notes: saved.notes || "",
  };
}

/** Each section's operation, left to right, for the screen / hardware defaults. */
function lineOperations(spec: QuoteLineInput, catalog: QuoteCatalog | null): WindowSectionOperation[] {
  const raw = recordValue(spec);
  if (spec.type === "unit" || (spec.type === "bay_bow" && raw.layout)) {
    const sections = tryResolveLayout(raw.layout as LayoutNode, raw.width, raw.height).resolved?.sections || [];
    return sections.map((section): WindowSectionOperation => section.node.op === "slim_fixed" ? "fixed" : section.node.op);
  }
  if (spec.type === "window") return [operationForStyle(String(raw.style || ""), catalog)];
  if (spec.type === "combination" || spec.type === "bay_bow") {
    return (Array.isArray(raw.lites) ? raw.lites : []).map((lite) => operationForStyle(String(recordValue(lite).style || ""), catalog));
  }
  return [];
}

/** The line's jamb finish for the order details: the wood jamb's own finish, or null without a jamb. */
function jambFinish(spec: QuoteLineInput): string | null {
  const raw = recordValue(spec);
  const lites = Array.isArray(raw.lites) ? raw.lites.map(recordValue) : [];
  const jamb = [raw, ...lites]
    .flatMap((item) => (Array.isArray(item.accessories) ? item.accessories : []).map(recordValue))
    .find((accessory) => ["wood_jamb", "pvc_jamb"].includes(String(accessory.kind || "")));
  if (!jamb) return null;
  return jamb.kind === "wood_jamb" ? String(jamb.finish || "primed") : "primed";
}

/**
 * Order details for a line. Saved per-lite handing is kept only while the
 * line still has the same section operations.
 */
function toWindowDetails(order: OrderDetails, spec: QuoteLineInput, catalog: QuoteCatalog | null, saved?: WindowDetails | null): WindowDetails {
  const common: WindowDetails = {
    tag: order.tag.trim() || null,
    elevation: order.elevation || null,
    notes: order.notes.trim() || null,
  };
  if (isPatio(spec.type)) return common;
  const operations = lineOperations(spec, catalog);
  const savedSections = saved?.sections || [];
  const sectionsMatch = savedSections.length > 0 && savedSections.length === operations.length
    && savedSections.every((section, index) => section.operation === operations[index]);
  const screen = order.screen ?? defaultScreen(operations);
  const hardware = order.hardware ?? defaultHardware(operations);
  return {
    ...common,
    sections: sectionsMatch ? savedSections : null,
    screen: screen ? { frame_colour: order.screen_frame || null, mesh_colour: order.screen_mesh || null } : null,
    hardware: hardware.trim() || null,
    spacer: order.spacer || null,
    jamb_finish: jambFinish(spec),
  };
}

/** Fill an unset opening number with the line's 1-based position in the project. */
function withDefaultTag(details: WindowDetails | null | undefined, position: number): WindowDetails {
  return { ...(details || {}), tag: details?.tag?.trim() || String(position) };
}

function tagPrefix(details: WindowDetails | null | undefined) {
  return details?.tag ? `#${details.tag} · ` : "";
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

const SERIES_BY_PREFIX: Array<[RegExp, string]> = [[/^HC-4/, "heritage_maximum"], [/^HC-1/, "heritage"], [/^WC-4/, "classic_400"]];

/** Older bays listed their lites; draw and edit them as a layout. */
function bayFromLites(lites: Array<Record<string, unknown>>): { layout: LayoutNode; width: number; height: number; series: string } | null {
  if (!lites.length) return null;
  const leaf = (lite: Record<string, unknown>) => {
    const op: WindowOperation = STYLE_OPERATIONS[String(lite.style || "").toUpperCase()] || "fixed";
    return { op, ...(op === "casement" ? { hinge: "left" as const } : op === "awning" ? { hinge: "top" as const } : {}) };
  };
  const widths = lites.map((lite) => finiteNumber(lite.width, 0));
  const style = String(lites[0].style || "").toUpperCase();
  return {
    layout: { split: "cols", sizes: widths, children: lites.map(leaf) },
    width: widths.reduce((a, b) => a + b, 0),
    height: finiteNumber(lites[0].height, 60),
    series: SERIES_BY_PREFIX.find(([pattern]) => pattern.test(style))?.[1] || "classic",
  };
}

function draftFromSpec(spec: QuoteLineInput, catalog: QuoteCatalog): Draft {
  const raw = recordValue(spec);
  const nestedLites = Array.isArray(raw.lites)
    ? raw.lites.map(recordValue).filter((lite) => Object.keys(lite).length > 0)
    : [];
  const source = nestedLites[0] || raw;
  const glazing = recordValue(source.glazing && Object.keys(recordValue(source.glazing)).length ? source.glazing : raw.glazing);
  // Combination accessories live on the assembly; older saved lines kept them on lites.
  const accessorySource = Array.isArray(raw.accessories) && raw.accessories.length ? raw.accessories : source.accessories;
  const accessories = Array.isArray(accessorySource) ? accessorySource.map(recordValue) : [];
  const type = spec.type;
  const defaultDraft = emptyDraft(String(source.style || raw.style || catalog.styles[0]?.code || "WC-100"), type);
  const legacyBay = type === "bay_bow" && !raw.layout ? bayFromLites(nestedLites) : null;
  const jamb = jambFromAccessories(accessories, catalog, isPatio(type) ? "patio" : "window");

  return {
    ...defaultDraft,
    width: finiteNumber(legacyBay ? legacyBay.width : source.width ?? raw.width, defaultDraft.width as number),
    height: finiteNumber(legacyBay ? legacyBay.height : source.height ?? raw.height, defaultDraft.height as number),
    qty: finiteNumber(raw.qty, defaultDraft.qty as number),
    colour_ext: String(source.colour_ext || raw.colour_ext || defaultDraft.colour_ext),
    colour_int: String(source.colour_int || raw.colour_int || "white"),
    loe180: Boolean(glazing.loe180),
    i89: Boolean(glazing.i89),
    gas: String(glazing.gas || defaultDraft.gas),
    triple: Boolean(glazing.triple),
    tri_pane_lami: Boolean(glazing.tri_pane_lami),
    frost_tint: Boolean(glazing.frost_tint),
    brickmould: accessories.some((item) => String(item.kind || "") === "brickmould"),
    ...jamb,
    sliding_ft: finiteNumber(raw.nominal_ft, defaultDraft.sliding_ft),
    operation: String(raw.operation || (finiteNumber(raw.nominal_ft, 6) >= 10 ? "OXXO" : "XO")),
    swing_kind: String(raw.kind || defaultDraft.swing_kind),
    swing_hinge: String(raw.hinge || defaultDraft.swing_hinge),
    kick_lock: type === "patio_sliding" ? Boolean(raw.kick_lock) : defaultDraft.kick_lock,
    head_seat: String(raw.head_seat || (raw.welded_brickmould_lites ? "" : defaultDraft.head_seat)),
    insulated: Boolean(raw.insulated),
    welded_bm: Boolean(raw.welded_brickmould_lites),
    cable_support: Boolean(raw.cable_support),
    bay_style: String(raw.style === "bow" ? "bow" : "bay"),
    lite_count: nestedLites.length || defaultDraft.lite_count,
    unit_series: String(raw.series || legacyBay?.series || defaultDraft.unit_series),
    layout: raw.layout && typeof raw.layout === "object" ? raw.layout as LayoutNode : legacyBay ? legacyBay.layout : defaultDraft.layout,
    preset: String(raw.preset || ""),
  };
}

function descriptionForUpdatedSpec(
  line: Pick<CustomerWindowLine, "spec" | "details" | "description">,
  nextSpec: QuoteLineInput,
  nextDetails: WindowDetails | null | undefined,
  catalog: QuoteCatalog | null,
  description = line.description,
) {
  const existingDescription = description.trim();
  const generatedDescription = describeWindowSpec(line.spec, catalog, line.details);
  return existingDescription === generatedDescription.trim()
    ? describeWindowSpec(nextSpec, catalog, nextDetails)
    : description;
}

function money(n: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

function glazingOf(draft: Draft) {
  return {
    loe180: draft.loe180,
    i89: draft.i89,
    gas: draft.gas,
    triple: draft.triple,
    tri_pane_lami: draft.tri_pane_lami,
    frost_tint: draft.frost_tint,
  };
}

function colourOf(draft: Draft) {
  return { colour_ext: draft.colour_ext, ...(draft.colour_int && draft.colour_int !== "white" ? { colour_int: draft.colour_int } : {}) };
}

function windowLine(draft: Draft, qty: NumericInputValue = 1): QuoteLineInput {
  const accessories: Array<Record<string, unknown>> = [];
  return {
    type: "window",
    style: draft.style,
    width: draft.width,
    height: draft.height,
    qty,
    ...colourOf(draft),
    glazing: glazingOf(draft),
    accessories,
  };
}

/** The catalog brickmould / wood-jamb rows selected on the draft. */
function draftAccessories(draft: Draft, catalog: QuoteCatalog | null): Array<Record<string, unknown>> {
  const accessories: Array<Record<string, unknown>> = [];
  if (draft.brickmould) {
    const name = catalog?.accessories.brickmould?.[0]?.name;
    if (name) accessories.push({ kind: "brickmould", name });
  }
  const jamb = jambAccessory(draft, catalog);
  if (jamb) accessories.push(jamb);
  return accessories;
}

/** Patio doors: Window City's installed EP326 brickmould and the wood jamb. */
function doorAccessories(draft: Draft, catalog: QuoteCatalog | null): Array<Record<string, unknown>> {
  const accessories: Array<Record<string, unknown>> = [];
  if (draft.brickmould) accessories.push({ ...PATIO_BRICKMOULD });
  const jamb = jambAccessory(draft, catalog, "patio");
  if (jamb) accessories.push(jamb);
  return accessories;
}

function toQuoteLine(draft: Draft, catalog: QuoteCatalog | null): QuoteLineInput {
  if (draft.type === "unit") {
    // Layout-first unit: one frame, divisions, a product per section. Colour,
    // glazing and brickmould / jamb apply to the whole unit.
    return {
      type: "unit",
      series: draft.unit_series,
      width: draft.width,
      height: draft.height,
      qty: draft.qty,
      ...colourOf(draft),
      glazing: glazingOf(draft),
      accessories: draftAccessories(draft, catalog),
      layout: draft.layout,
      ...(draft.preset ? { preset: draft.preset } : {}),
    };
  }

  if (draft.type === "window") {
    const line = windowLine(draft, draft.qty);
    return { ...line, accessories: draftAccessories(draft, catalog) };
  }

  if (draft.type === "combination") {
    // Brickmould and jambs wrap the whole assembly once: the engine prices
    // accessories on the combination line around its outer frame.
    return {
      type: "combination",
      qty: draft.qty,
      layout: { cols: 2, rows: 1 },
      lites: [windowLine(draft), windowLine(draft)],
      accessories: draftAccessories(draft, catalog),
    };
  }

  if (draft.type === "patio_sliding") {
    return {
      type: "patio_sliding",
      qty: draft.qty,
      nominal_ft: draft.sliding_ft,
      operation: draft.operation,
      ...colourOf(draft),
      glazing: {
        loe180: draft.loe180,
        i89: draft.i89,
        gas: draft.gas,
        triple: draft.triple,
        frost_tint: draft.frost_tint,
      },
      assembled: true,
      kick_lock: draft.kick_lock,
      accessories: doorAccessories(draft, catalog),
    };
  }

  if (draft.type === "patio_swing") {
    return {
      type: "patio_swing",
      qty: draft.qty,
      kind: draft.swing_kind,
      ...(draft.swing_kind === "single" ? { hinge: draft.swing_hinge } : {}),
      width: draft.width,
      height: draft.height,
      ...colourOf(draft),
      glazing: {
        loe180: draft.loe180,
        i89: draft.i89,
        gas: draft.gas,
        triple: draft.triple,
      },
      accessories: doorAccessories(draft, catalog),
    };
  }

  // Layout-first bay / bow: the engine prices one window per lite from the
  // series, plus head & seat (or welded brickmould), couplers and trim.
  const lites = tryResolveLayout(draft.layout, draft.width, draft.height).resolved?.sections.length;
  return {
    type: "bay_bow",
    style: draft.bay_style,
    series: draft.unit_series,
    width: draft.width,
    height: draft.height,
    qty: draft.qty,
    ...colourOf(draft),
    glazing: glazingOf(draft),
    layout: draft.layout,
    ...(draft.preset ? { preset: draft.preset } : {}),
    ...(draft.welded_bm
      ? { welded_brickmould_lites: lites || 3 }
      : { head_seat: draft.head_seat || headSeatFor(Number(draft.width) || 0, catalog?.baybow.head_seat_sizes || []), ...(draft.insulated ? { insulated: true } : {}) }),
    ...(draft.cable_support ? { cable_support: true } : {}),
    accessories: (() => { const jamb = jambAccessory(draft, catalog); return jamb ? [jamb] : []; })(),
  };
}

function lineLabel(line: QuoteLineInput) {
  const lites = Array.isArray(line.lites) ? line.lites.length : 0;
  if (line.type === "unit") {
    const resolved = tryResolveLayout(line.layout as LayoutNode, line.width, line.height).resolved;
    const sections = resolved?.sections.length || 1;
    return `${line.width}×${line.height} ${sections === 1 ? "window" : `${sections}-section unit`}${line.preset ? ` (${line.preset})` : ""}`;
  }
  if (line.type === "window") return `${line.style} ${line.width}×${line.height}`;
  if (line.type === "patio_sliding") return `WC-500 ${line.nominal_ft}' sliding patio door${line.operation ? ` ${line.operation}` : ""}`;
  if (line.type === "patio_swing") return `${line.kind} swing patio door ${line.width}×${line.height}`;
  if (line.type === "combination") return `2×1 combination (${lites} lites)`;
  if (line.layout) {
    const resolved = tryResolveLayout(line.layout as LayoutNode, line.width, line.height).resolved;
    return `${line.style === "bow" ? "Bow" : "Bay"} ${line.width}×${line.height} (${resolved?.sections.length || "?"} lites)`;
  }
  return `Bay/bow (${lites} lites)`;
}

const DRAFT_ACCESSORY_KINDS = new Set(["brickmould", "wood_jamb"]);

/**
 * Apply the draft's colour, glazing and brickmould / wood-jamb choices to an
 * added line, keeping its type, style, size, quantity and layout. Each line
 * type keeps the exact shape `toQuoteLine` builds for it.
 */
function applyDraftOptions(spec: QuoteLineInput, draft: Draft, catalog: QuoteCatalog | null): QuoteLineInput {
  const raw = recordValue(spec);
  const glazing = glazingOf(draft);
  const colours = { colour_ext: draft.colour_ext, colour_int: draft.colour_int || "white" };
  const accessories = draftAccessories(draft, catalog);
  const withoutDraftAccessories = (items: unknown) =>
    (Array.isArray(items) ? items : []).filter((item) => !DRAFT_ACCESSORY_KINDS.has(String(recordValue(item).kind || "")));
  const applyToWindow = (value: unknown, withAccessories: boolean) => {
    const lite = recordValue(value);
    const next: Record<string, unknown> = { ...lite, ...colours, glazing: { ...glazing } };
    if (withAccessories) next.accessories = [...withoutDraftAccessories(lite.accessories), ...accessories.map((item) => ({ ...item }))];
    return next;
  };

  switch (spec.type) {
    case "unit":
      return { ...applyToWindow(spec, true), type: "unit" };
    case "window":
      return { ...applyToWindow(spec, true), type: "window" };
    case "combination": {
      // Accessories belong to the assembly; clear any older per-lite copies.
      const lites = Array.isArray(raw.lites)
        ? raw.lites.map((lite) => ({ ...applyToWindow(lite, false), accessories: withoutDraftAccessories(recordValue(lite).accessories) }))
        : raw.lites;
      return { ...spec, lites, accessories: [...withoutDraftAccessories(raw.accessories), ...accessories.map((item) => ({ ...item }))] } as QuoteLineInput;
    }
    case "bay_bow": {
      // Bays take the wood jamb only; bay brickmould is the welded option.
      const jamb = jambAccessory(draft, catalog);
      const bayAccessories = [...withoutDraftAccessories(raw.accessories), ...(jamb ? [jamb] : [])];
      if (raw.layout) return { ...spec, ...colours, glazing: { ...glazing }, accessories: bayAccessories };
      return { ...spec, lites: Array.isArray(raw.lites) ? raw.lites.map((lite) => applyToWindow(lite, false)) : raw.lites };
    }
    case "patio_sliding":
      return {
        ...spec,
        ...colours,
        glazing: { loe180: draft.loe180, i89: draft.i89, gas: draft.gas, triple: draft.triple, frost_tint: draft.frost_tint },
        accessories: [...withoutDraftAccessories(raw.accessories), ...doorAccessories(draft, catalog)],
      };
    case "patio_swing":
      return {
        ...spec,
        ...colours,
        glazing: { loe180: draft.loe180, i89: draft.i89, gas: draft.gas, triple: draft.triple },
        accessories: [...withoutDraftAccessories(raw.accessories), ...doorAccessories(draft, catalog)],
      };
    default:
      return spec;
  }
}

/** A saved favourite: every draft option except the measured size and quantity. */
type FavouriteOptions = Omit<Draft, "width" | "height" | "qty">;

const LINE_TYPES: QuoteLineType[] = ["unit", "window", "combination", "patio_sliding", "patio_swing", "bay_bow"];

function favouriteFromDraft(draft: Draft): FavouriteOptions {
  const { width: _width, height: _height, qty: _qty, ...options } = draft;
  return options;
}

/** Overlay a saved favourite on the draft, ignoring unknown or mistyped keys. */
function applyFavourite(current: Draft, payload: unknown, catalog: QuoteCatalog | null): Draft {
  const saved = recordValue(payload);
  const next: Draft = { ...current };
  const template = emptyDraft();
  (Object.keys(template) as Array<keyof Draft>).forEach((key) => {
    if (key === "width" || key === "height" || key === "qty" || !(key in saved)) return;
    const value = saved[key];
    const expected = typeof template[key];
    if (key === "lite_count" || key === "jamb_custom") {
      if (value === "" || (typeof value === "number" && Number.isFinite(value))) (next as Record<string, unknown>)[key] = value as NumericInputValue;
      return;
    }
    if (key === "layout") {
      // A saved layout keeps its divisions as shares, so it fits the current size.
      if (value && typeof value === "object") next.layout = value as LayoutNode;
      return;
    }
    if (typeof value === expected) (next as Record<string, unknown>)[key] = value;
  });
  if (!LINE_TYPES.includes(next.type)) next.type = current.type;
  if (catalog && !catalog.styles.some((style) => style.code === next.style)) next.style = current.style;
  if (next.jamb_depth !== CUSTOM_JAMB && catalog?.wood_jamb && !jambDepthOptions(catalog, isPatio(next.type) ? "patio" : "window").some((depth) => depth.name === next.jamb_depth)) next.jamb_depth = current.jamb_depth;
  return next;
}

/** Switching product keeps colour, glass and trim; the shape starts from that product's default. */
function switchProduct(current: Draft, type: QuoteLineType, catalog: QuoteCatalog | null): Draft {
  if (type === current.type) return current;
  const next: Draft = { ...current, type, preset: "" };
  const wasBay = current.type === "bay_bow";
  const wasDoor = current.type === "patio_sliding" || current.type === "patio_swing";
  // Patio doors and windows each start from their own standard jamb depth.
  if (isPatio(type) && !wasDoor && current.jamb_depth === defaultJamb(catalog, "window")) next.jamb_depth = defaultJamb(catalog, "patio");
  if (!isPatio(type) && wasDoor && current.jamb_depth === defaultJamb(catalog, "patio")) next.jamb_depth = defaultJamb(catalog, "window");
  if (type === "bay_bow") {
    Object.assign(next, { layout: JSON.parse(JSON.stringify(DEFAULT_BAY.layout)), width: DEFAULT_BAY.width, height: DEFAULT_BAY.height, preset: DEFAULT_BAY.id, bay_style: "bay", head_seat: headSeatFor(DEFAULT_BAY.width, catalog?.baybow.head_seat_sizes || []) });
  } else if (type === "unit" && (wasBay || wasDoor)) {
    Object.assign(next, { layout: DEFAULT_LAYOUT, width: 30, height: 60 });
  } else if (type === "patio_swing") {
    Object.assign(next, { width: current.swing_kind === "double" ? 60 : 34, height: 80, gas: "argon" });
  } else if (type === "patio_sliding") {
    Object.assign(next, { operation: current.sliding_ft >= 10 ? "OXXO" : current.operation === "OX" ? "OX" : "XO", gas: current.triple ? current.gas : "argon" });
  } else if ((type === "window" || type === "combination") && (wasBay || wasDoor)) {
    Object.assign(next, { width: 30, height: 60 });
  }
  return next;
}

function isPatio(type: QuoteLineType) {
  return type === "patio_sliding" || type === "patio_swing";
}

const PRODUCT_TABS: Array<{ type: QuoteLineType; label: string; detail: string; drawing: { layout: LayoutNode; width: number; height: number }; matches: (type: QuoteLineType) => boolean }> = [
  { type: "unit", label: "Window", detail: "Any layout, section by section", drawing: { layout: { split: "cols", children: [{ op: "casement", hinge: "left" }, { op: "fixed" }, { op: "casement", hinge: "right" }] }, width: 72, height: 54 }, matches: (type) => type === "unit" || type === "window" || type === "combination" },
  { type: "patio_sliding", label: "Patio door", detail: "WC-500 sliding or in-swing", drawing: { layout: slidingPanels("XO"), width: 72, height: 80 }, matches: isPatio },
  { type: "bay_bow", label: "Bay / bow", detail: "3–6 lites", drawing: { layout: { split: "cols", sizes: ["1/4", "1/2", "*"], children: [{ op: "casement", hinge: "left" }, { op: "fixed" }, { op: "casement", hinge: "right" }] }, width: 96, height: 60 }, matches: (type) => type === "bay_bow" },
];

function ProductTabs({ value, onChange, colour }: { value: QuoteLineType; onChange: (type: QuoteLineType) => void; colour: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {PRODUCT_TABS.map((tab) => {
          const active = tab.matches(value);
          return (
            <button key={tab.type} type="button" onClick={() => { if (!active) onChange(tab.type); }} aria-pressed={active} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-brand-300 hover:bg-slate-50"}`}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center"><WindowUnitDrawing layout={tab.drawing.layout} width={tab.drawing.width} height={tab.drawing.height} colour={colour} size={46} showDimensions={false} showIndexes={false} /></span>
              <span>
                <span className="block text-sm font-semibold text-slate-900">{tab.label}</span>
                <span className="block text-[11px] text-slate-500">{tab.detail}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-[11px] text-slate-500">
        <span>Quick entry:</span>
        <button type="button" className={`rounded-full px-2 py-0.5 font-semibold ${value === "window" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} onClick={() => onChange("window")}>Single style from the list</button>
        <button type="button" className={`rounded-full px-2 py-0.5 font-semibold ${value === "combination" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} onClick={() => onChange("combination")}>2 equal lites</button>
      </div>
    </div>
  );
}

function LineThumbnail({ spec }: { spec: QuoteLineInput }) {
  const raw = spec as Record<string, unknown>;
  let drawable = layoutFromLegacySpec(raw);
  if (!drawable && spec.type === "bay_bow") {
    drawable = raw.layout
      ? { layout: raw.layout as LayoutNode, width: finiteNumber(raw.width, 96), height: finiteNumber(raw.height, 60) }
      : bayFromLites((Array.isArray(raw.lites) ? raw.lites : []).map(recordValue));
  }
  if (!drawable && spec.type === "patio_sliding") drawable = { layout: slidingPanels(String(raw.operation || (finiteNumber(raw.nominal_ft, 6) >= 10 ? "OXXO" : "XO"))), width: 72, height: 80 };
  if (!drawable && spec.type === "patio_swing") drawable = { layout: swingPanels(String(raw.kind || "single"), String(raw.hinge || "left")), width: finiteNumber(raw.width, 34), height: finiteNumber(raw.height, 80) };
  if (!drawable) return null;
  return <div className="shrink-0"><WindowUnitDrawing layout={drawable.layout} width={drawable.width} height={drawable.height} colour={String(raw.colour_ext || "white")} size={52} showDimensions={false} showIndexes={false} /></div>;
}

function starLabel(star: string | null | undefined) {
  return star === "most_efficient" ? " · ENERGY STAR Most Efficient" : star === "qualified" ? " · ENERGY STAR" : "";
}

function LineEnergy({ line }: { line: DeterministicQuoteResponse["lines"][number] }) {
  const rows = line.unit
    ? line.unit.sections.map((section) => ({ key: String(section.index), label: `S${section.index} ${section.label} ${section.style}`, energy: section.energy }))
    : line.energy !== undefined
      ? [{ key: "window", label: "Energy", energy: line.energy }]
      : [];
  if (!rows.length) return null;
  return (
    <div className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
      {line.unit ? <p className="font-semibold text-slate-700">{line.unit.summary}</p> : null}
      {rows.map((row) => (
        <div key={row.key} className="flex justify-between gap-3">
          <span>{row.label}</span>
          <span>{row.energy ? `ER ${row.energy.er} · U ${row.energy.u_ip} (${row.energy.u_si} W/m²K)${starLabel(row.energy.energy_star)}` : "Rating not on file"}</span>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** "Sliding margin · 45% → 30%" or "Standard · 30% markup". */
function presetLabel(preset: SalesPreset) {
  if (preset.strategy === "sliding_margin" && preset.sliding) {
    return `${preset.name} · ${preset.sliding.start_margin_percent}% → ${preset.sliding.end_margin_percent}% ${preset.sliding.basis}`;
  }
  return `${preset.name} · ${preset.markup_percent}% markup`;
}

const BAND_TEXT: Record<string, string> = {
  floor: "profit floor",
  sliding: "sliding",
  flat: "flat rate",
};

function QuoteTotals({ result, mode = result.presentation_mode }: { result: DeterministicQuoteResponse; mode?: PresentationMode }) {
  const totals = result.totals;
  const internal = mode === "internal";
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Customer total</p>
      <p className="mt-1 text-3xl font-bold text-brand-800">{money(totals.customer_total, result.currency)}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-700">
        {internal ? <>
          <Metric label="List" value={totals.list} />
          <Metric label="Dealer cost" value={totals.dealer_cost} />
          <Metric label="Installation" value={totals.install} />
          <Metric label="Profit" value={totals.markup} />
        </> : null}
        <Metric label="Sell before HST" value={totals.sell} />
        <Metric label="HST" value={totals.hst} />
      </div>
    </div>
  );
}

function Metric({ label, value, format = "money" }: { label: string; value?: number | null; format?: "money" | "percent" }) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold">{typeof value === "number" ? (format === "percent" ? `${value.toFixed(2)}%` : money(value)) : "—"}</p>
    </div>
  );
}

function SalesResult({ result, mode = result.presentation_mode, lines }: { result: DeterministicQuoteResponse; mode?: PresentationMode; lines: Array<{ line: number; qty: number; line_total: number; unit_price: number; description: string; location: string }> }) {
  const sales = result.sales_pricing;
  const customer = result.customer_presentation;
  const internal = mode === "internal";
  const sliding = sales.sliding;
  return (
    <div className="space-y-4">
      {internal ? (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Sales strategy</h2>
            <p className="mt-1 text-sm text-slate-500">
              {sales.preset_name || "Selected preset"} · {sales.strategy === "sliding_margin" && sliding
                ? `${sliding.margin_percent.toFixed(1)}% margin (${BAND_TEXT[sliding.band] || sliding.band})`
                : `${(sales.markup_percent ?? 0).toFixed(2)}% markup on cost`}
            </p>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${sales.floor_status === "manager_override" ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
            {sales.floor_status === "manager_override" ? "Manager override" : "Within floor"}
          </span>
        </div>
        {sales.cost_basis != null ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Priced on the project&apos;s product cost of <b>{money(sales.cost_basis)}</b>
            {sliding ? <> · margin slides from the floor at {money(sliding.breakpoints[0])} to the flat rate at {money(sliding.breakpoints[1])}</> : null}
            {sales.profit_floor ? <> · profit floor {money(sales.profit_floor)}{sales.floor_applied ? " (applied)" : ""}</> : null}
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <Metric label="Negotiated discount" value={sales.negotiated_discount_percent} format="percent" />
          <Metric label="Minimum markup" value={sales.minimum_markup_percent} format="percent" />
          <Metric label="Gross margin" value={sales.gross_margin_percent} format="percent" />
          <Metric label="Maximum discount" value={sales.maximum_allowed_discount_percent} format="percent" />
          <Metric label="Remaining discount" value={sales.remaining_discount_percent} format="percent" />
          <Metric label="Floor price" value={sales.minimum_floor_sell} />
          <Metric label="Floor headroom" value={result.internal_presentation?.floor_headroom as number | undefined} />
          <Metric label="Merchandise discount" value={sales.merchandise_discount_amount} />
        </div>
        {sales.floor_status === "manager_override" ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">This quote used a manager-approved concession. The reason is retained in the audit record.</p> : null}
      </div>
      ) : null}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Customer presentation</p>
        <p className="mt-1 text-2xl font-bold text-emerald-900">{money(customer.total, result.currency)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-emerald-950">
          <Metric label="Negotiated discount" value={customer.negotiated_discount_percent} format="percent" />
          <Metric label="Merchandise discount" value={customer.merchandise_discount} />
          <Metric label="Subtotal" value={customer.subtotal} />
          <Metric label="HST" value={customer.hst} />
        </div>
        <div className="mt-4 space-y-2 text-sm text-emerald-950">
          {lines.map((line) => (
            <div key={line.line} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate">{line.description || `Line ${line.line}`}</span>
                <span className="block text-xs text-emerald-800">{line.location ? `${line.location} · ` : ""}{line.qty} × {money(line.unit_price, result.currency)}</span>
              </span>
              <span className="shrink-0 font-semibold">{money(line.line_total, result.currency)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function QuoteBuilder({ projectId, editWindowId, editWindows = false }: { projectId?: string; editWindowId?: string; editWindows?: boolean }) {
  const [catalog, setCatalog] = useState<QuoteCatalog | null>(null);
  const [project, setProject] = useState<CustomerEstimate | null>(null);
  const [salesPresets, setSalesPresets] = useState<SalesPreset[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [lines, setLines] = useState<QuoteLineDraft[]>([]);
  const [result, setResult] = useState<DeterministicQuoteResponse | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState("standard");
  const [negotiatedDiscount, setNegotiatedDiscount] = useState(0);
  const [negotiationMode, setNegotiationMode] = useState<"percent" | "dollars" | "price">("percent");
  const [overrideReason, setOverrideReason] = useState("");
  const [managerToken, setManagerToken] = useState("");
  const [autoPriceError, setAutoPriceError] = useState<string | null>(null);
  const [favourites, setFavourites] = useState<SavedTemplate<FavouriteOptions>[]>([]);
  const [selectedFavouriteId, setSelectedFavouriteId] = useState("");
  const [favouritesBusy, setFavouritesBusy] = useState(false);
  const [favouritesError, setFavouritesError] = useState<string | null>(null);
  const [favouritesNotice, setFavouritesNotice] = useState<string | null>(null);
  const [discountText, setDiscountText] = useState("0");
  const { mode: presentationMode, setMode: setPresentationMode, role } = useViewMode();
  const internal = presentationMode === "internal";
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState(false);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const [handoffEstimateId, setHandoffEstimateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectLoading, setProjectLoading] = useState(Boolean(projectId));
  const [hydratedEditId, setHydratedEditId] = useState<string | null>(null);
  const [selectedEditLineId, setSelectedEditLineId] = useState<string | null>(editWindowId || null);
  const [draftLocation, setDraftLocation] = useState("");
  const [orderDetails, setOrderDetails] = useState<OrderDetails>(emptyOrderDetails());
  // The saved details of the line being edited (keeps its handing and jamb finish).
  const [savedDetails, setSavedDetails] = useState<WindowDetails | null>(null);
  const autoPriceRequestRef = useRef(0);
  const editMode = Boolean(editWindows || editWindowId);

  useEffect(() => {
    Promise.all([fetchQuoteCatalog(), fetchSalesPresets()])
      .then(([catalogPayload, salesPayload]) => {
        setCatalog(catalogPayload);
        setSalesPresets(salesPayload.presets);
        setDraft((current) => ({ ...current, style: catalogPayload.styles[0]?.code || current.style, jamb_depth: catalogPayload.wood_jamb?.default || current.jamb_depth }));
        if (!editMode) {
          const preferred = salesPayload.presets.find((preset) => preset.id === salesPayload.default_preset_id)
            || salesPayload.presets.find((preset) => preset.id === "standard")
            || salesPayload.presets[0];
          if (preferred) {
            setSelectedPresetId(preferred.id);
            setNegotiatedDiscount(preferred.default_discount_percent);
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the price-book catalog."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTemplates<FavouriteOptions>("window")
      .then(setFavourites)
      .catch((reason) => setFavouritesError(reason instanceof Error ? `Could not load favourites: ${reason.message}` : "Could not load favourites."));
  }, []);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setProjectLoading(false);
      return;
    }
    setProjectLoading(true);
    fetchCustomerEstimate(projectId)
      .then(setProject)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load the selected project."))
      .finally(() => setProjectLoading(false));
  }, [projectId]);

  // Adding to a project that already has products: price with its strategy,
  // so the live price matches what the project will be priced at.
  useEffect(() => {
    if (editMode || !project || !salesPresets.length) return;
    if (!project.windows.length && !project.doors.length) return;
    const saved = salesPresets.find((preset) => preset.id === project.commercial.preset_id);
    if (saved) {
      setSelectedPresetId(saved.id);
      setNegotiatedDiscount(project.commercial.negotiated_discount_percent || 0);
    }
  }, [editMode, project, salesPresets]);

  const editHydrationKey = editMode && project ? `${project.id}:${editWindowId || "all"}` : null;
  const editingLine = useMemo(
    () => editMode && selectedEditLineId ? lines.find((line) => line.id === selectedEditLineId) || null : null,
    [editMode, lines, selectedEditLineId],
  );

  useEffect(() => {
    if (!editMode) {
      setHydratedEditId(null);
      setSelectedEditLineId(null);
      return;
    }
    if (!project || !catalog || !editHydrationKey || hydratedEditId === editHydrationKey) return;
    if (!project.windows.length) {
      setError("This project does not have any saved window lines to edit.");
      setHydratedEditId(editHydrationKey);
      return;
    }
    const requestedLine = editWindowId ? project.windows.find((line) => line.id === editWindowId) : null;
    if (editWindowId && !requestedLine) {
      setError("The selected window line could not be found in this project.");
      setHydratedEditId(editHydrationKey);
      return;
    }
    const loadedLines: QuoteLineDraft[] = project.windows.map((line) => ({
      id: line.id,
      location: line.location,
      description: line.description,
      spec: line.spec,
      details: line.details ?? null,
    }));
    const selectedLine = requestedLine || project.windows[0];
    setLines(loadedLines);
    setSelectedEditLineId(selectedLine.id);
    setDraft(draftFromSpec(selectedLine.spec, catalog));
    setOrderDetails(orderDetailsFrom(selectedLine.details));
    setSavedDetails(selectedLine.details ?? null);
    setSelectedPresetId(project.commercial.preset_id || "standard");
    setNegotiatedDiscount(project.commercial.negotiated_discount_percent || 0);
    setResult(null);
    setHydratedEditId(editHydrationKey);
  }, [catalog, editMode, editHydrationKey, editWindowId, hydratedEditId, project]);

  const currentLine = useMemo(() => toQuoteLine(draft, catalog), [draft, catalog]);
  const currentDetails = useMemo(
    () => toWindowDetails(orderDetails, currentLine, catalog, savedDetails),
    [orderDetails, currentLine, catalog, savedDetails],
  );
  const currentOperations = useMemo(() => lineOperations(currentLine, catalog), [currentLine, catalog]);
  // The priced result line that corresponds to the line being edited.
  const currentResultLine = useMemo(() => {
    if (!result) return null;
    if (editMode) {
      const index = lines.findIndex((line) => line.id === selectedEditLineId);
      return index >= 0 ? result.lines[index] || null : null;
    }
    return result.lines[result.lines.length - 1] || null;
  }, [editMode, lines, result, selectedEditLineId]);
  const currentCustomerLine = useMemo(() => {
    const cpLines = (result?.customer_presentation as { lines?: Array<{ line: number; unit_price: number; line_total: number }> } | undefined)?.lines;
    if (!cpLines || !currentResultLine) return null;
    return cpLines.find((line) => line.line === currentResultLine.line) || null;
  }, [currentResultLine, result]);
  const combinationSuggestion = useMemo(
    () => getCombinationSuggestion(catalog?.styles.find((style) => style.code === draft.style), draft.width, draft.height),
    [catalog, draft.style, draft.width, draft.height],
  );
  const selectedPreset = useMemo(
    () => salesPresets.find((preset) => preset.id === selectedPresetId) || salesPresets[0],
    [salesPresets, selectedPresetId]
  );
  // The floor-derived limit depends on the priced cart, so prefer the last
  // server answer for this preset over the preset's configured cap.
  const autoPricingDiscountLimit =
    (result?.sales_pricing?.preset_id === selectedPreset?.id
      ? result?.sales_pricing?.maximum_allowed_discount_percent
      : null) ?? selectedPreset?.max_discount_percent ?? Number.POSITIVE_INFINITY;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  function patchDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setResult(null);
  }

  function updateOrderDetails(patch: Partial<OrderDetails>) {
    setOrderDetails((current) => ({ ...current, ...patch }));
  }

  function changeProduct(type: QuoteLineType) {
    setDraft((current) => switchProduct(current, type, catalog));
    setResult(null);
  }

  const drawnLayout = useMemo(
    () => (draft.type === "unit" || draft.type === "bay_bow" ? tryResolveLayout(draft.layout, draft.width, draft.height) : null),
    [draft.type, draft.layout, draft.width, draft.height],
  );
  const bayIssue = draft.type === "bay_bow" ? bayProblem(draft.layout) : null;
  const draftIsValid =
    isAtLeast(draft.qty, 1) &&
    (draft.type !== "unit" || Boolean(drawnLayout?.resolved)) &&
    (draft.type !== "bay_bow" || (Boolean(drawnLayout?.resolved) && !bayIssue)) &&
    (!draft.wood_jamb || draft.jamb_depth !== CUSTOM_JAMB || isAtLeast(draft.jamb_custom, 0.5)) &&
    (draft.type === "patio_sliding" || (isAtLeast(draft.width, 1) && isAtLeast(draft.height, 1)));

  // The sliding margin and profit floor are set on the whole project, so the
  // live price includes the project's other products: its saved windows and
  // doors when adding lines, only its doors when every window is being edited.
  const costContext = projectId ? { project_id: projectId, scope: editMode ? "replace_windows" as const : "append" as const } : undefined;

  function addLine() {
    if (!draftIsValid) return;
    setLines((current) => [
      ...current,
      { id: newEstimateLineId("window"), spec: currentLine, details: currentDetails, location: draftLocation.trim(), description: describeWindowSpec(currentLine, catalog, currentDetails) },
    ]);
    setDraftLocation("");
    // The next opening gets its own number and notes; the other details carry over.
    setOrderDetails((current) => ({ ...current, tag: "", notes: "" }));
    setResult(null);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
    setResult(null);
  }

  function updateLine(index: number, patch: Partial<Pick<QuoteLineDraft, "location" | "description">>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function duplicateLine(index: number) {
    setLines((current) => {
      const source = current[index];
      if (!source) return current;
      const copy: QuoteLineDraft = {
        id: newEstimateLineId("window"),
        spec: JSON.parse(JSON.stringify(source.spec)) as QuoteLineInput,
        // A copy is a different opening, so it takes its own number.
        details: source.details ? { ...JSON.parse(JSON.stringify(source.details)), tag: null } : null,
        location: source.location,
        description: source.description,
      };
      return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    });
    setResult(null);
  }

  function applyOptionsToAllLines() {
    if (!lines.length) return;
    const glazingSummary = [
      draft.loe180 ? "LoE 180" : "",
      draft.i89 ? "i89" : "",
      draft.triple ? "triple pane" : "",
      draft.tri_pane_lami ? "tri-pane laminated" : "",
      draft.frost_tint ? "frost / tint" : "",
      `${draft.gas} gas`,
    ].filter(Boolean).join(", ");
    const accessorySummary = [draft.brickmould ? "brickmould" : "", draft.wood_jamb ? jambLabel(draft, catalog, isPatio(draft.type) ? "patio" : "window") : ""].filter(Boolean).join(" + ") || "no brickmould / wood jamb";
    const confirmed = window.confirm(
      `Apply the current options to all ${lines.length} line${lines.length === 1 ? "" : "s"}?\n\n` +
        `Colour: ${draft.colour_ext}${draft.colour_int === "black" ? " in / black out" : ""}\nGlazing: ${glazingSummary}\nTrim: ${accessorySummary}\n\n` +
        "Each line keeps its type, style, size, quantity and location. Patio doors take the colour and the glazing they support; bays take the wood jamb."
    );
    if (!confirmed) return;
    setLines((current) => current.map((line) => {
      const nextSpec = applyDraftOptions(line.spec, draft, catalog);
      return { ...line, spec: nextSpec, description: descriptionForUpdatedSpec(line, nextSpec, line.details, catalog) };
    }));
    setResult(null);
  }

  async function saveFavourite() {
    const name = window.prompt("Name this favourite (e.g. Black casement, triple pane):")?.trim();
    if (!name) return;
    setFavouritesBusy(true);
    setFavouritesError(null);
    setFavouritesNotice(null);
    try {
      const saved = await createTemplate(name, "window", favouriteFromDraft(draft));
      setFavourites((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setSelectedFavouriteId(saved.id);
      setFavouritesNotice(`Saved “${saved.name}”.`);
    } catch (reason) {
      setFavouritesError(reason instanceof Error ? `Could not save the favourite: ${reason.message}` : "Could not save the favourite.");
    } finally {
      setFavouritesBusy(false);
    }
  }

  function applySavedFavourite(id = selectedFavouriteId) {
    const favourite = favourites.find((item) => item.id === id);
    if (!favourite) return;
    setDraft((current) => applyFavourite(current, favourite.payload, catalog));
    setResult(null);
    setFavouritesError(null);
    setFavouritesNotice(`Applied “${favourite.name}” — size and quantity unchanged.`);
  }

  async function removeFavourite() {
    const favourite = favourites.find((item) => item.id === selectedFavouriteId);
    if (!favourite || !window.confirm(`Delete the favourite “${favourite.name}”?`)) return;
    setFavouritesBusy(true);
    setFavouritesError(null);
    setFavouritesNotice(null);
    try {
      await deleteTemplate(favourite.id);
      setFavourites((current) => current.filter((item) => item.id !== favourite.id));
      setSelectedFavouriteId("");
    } catch (reason) {
      setFavouritesError(reason instanceof Error ? `Could not delete the favourite: ${reason.message}` : "Could not delete the favourite.");
    } finally {
      setFavouritesBusy(false);
    }
  }

  function selectEditLine(lineId: string) {
    if (!editMode || !catalog || lineId === selectedEditLineId) return;
    const nextLine = lines.find((line) => line.id === lineId);
    if (!nextLine) return;
    if (selectedEditLineId && draftIsValid) {
      setLines((current) => current.map((line) => line.id === selectedEditLineId ? { ...line, spec: currentLine, details: currentDetails } : line));
    }
    setSelectedEditLineId(lineId);
    setDraft(draftFromSpec(nextLine.spec, catalog));
    setOrderDetails(orderDetailsFrom(nextLine.details));
    setSavedDetails(nextLine.details);
    setResult(null);
  }

  /** Drop a saved line from the edit list; it leaves the estimate when the changes are saved. */
  function removeEditLine(lineId: string) {
    if (!editMode) return;
    const index = lines.findIndex((line) => line.id === lineId);
    if (index < 0) return;
    const target = lines[index];
    if (!window.confirm(`Remove ${target.location || lineLabel(target.spec)} from this estimate? It is taken off when you save the changes.`)) return;
    const remaining = lines.filter((line) => line.id !== lineId);
    setLines(remaining);
    if (lineId === selectedEditLineId) {
      const next = remaining[Math.min(index, remaining.length - 1)];
      if (next && catalog) {
        setSelectedEditLineId(next.id);
        setDraft(draftFromSpec(next.spec, catalog));
        setOrderDetails(orderDetailsFrom(next.details));
        setSavedDetails(next.details);
      } else {
        setSelectedEditLineId(null);
      }
    }
    setResult(null);
  }

  async function generateQuote() {
    if (!editMode && !lines.length && !draftIsValid) {
      setError("Enter a valid quantity and dimensions before generating the quote.");
      return;
    }
    const savedSpecs = lines.map((line) => line.spec);
    const currentAlreadyAdded = savedSpecs.length > 0 && JSON.stringify(savedSpecs[savedSpecs.length - 1]) === JSON.stringify(currentLine);
    const payload = editMode
      ? lines.map((line) => line.id === selectedEditLineId ? currentLine : line.spec)
      : currentAlreadyAdded ? savedSpecs : [...savedSpecs, currentLine];
    if (!payload.length) return;
    const requested = Math.max(0, negotiatedDiscount);
    // Avoid surfacing a hard server error for an over-limit discount with no reason.
    const needsOverride = requested > allowedMax + 1e-9;
    if (needsOverride && (!overrideReason.trim() || !managerToken.trim())) {
      setError(
        `This discount (${requested.toFixed(1)}%) exceeds your authorized limit (${allowedMax.toFixed(1)}%). ` +
          "Enter a manager approval reason and authorization token to proceed, or reduce the discount."
      );
      return;
    }
    setPricing(true);
    setError(null);
    try {
      const priced = await priceDeterministicQuote({
        lines: payload,
        commercial: {
          preset_id: selectedPreset?.id || selectedPresetId,
          negotiated_discount_percent: requested,
          manager_override_reason: needsOverride ? overrideReason.trim() : undefined,
          // Keep the complete calculation available to the salesperson so
          // switching between internal and customer display never loses data.
          // The API still supports presentation_mode="customer" for external
          // callers and redacts protected fields there.
          presentation_mode: "internal",
        },
        cost_context: costContext,
      }, needsOverride ? managerToken.trim() : undefined);
      setAutoPriceError(null);
       if (editMode) {
         setLines((current) => current.map((line, index) => ({
           ...line,
           spec: payload[index],
           details: line.id === selectedEditLineId ? currentDetails : line.details,
         })));
       } else {
         setLines((current) => payload.map((spec, index) => {
           // Past the saved lines, the payload's extra entry is the current draft.
           const details = index < current.length ? current[index].details : currentDetails;
           return {
             id: current[index]?.id || newEstimateLineId("window"),
             location: current[index]?.location || "",
             description: current[index]?.description || describeWindowSpec(spec, catalog, details),
             spec,
             details,
           };
         }));
       }
       setResult(priced);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not price the quote.");
    } finally {
      setPricing(false);
    }
  }

  // Keep the FastAPI price preview in sync with every valid window selection.
  // The short debounce prevents number inputs and rapid option changes from
  // producing a request for every keystroke.
  useEffect(() => {
    const requestId = ++autoPriceRequestRef.current;
    if (!catalog || !draftIsValid) {
      setPricing(false);
      return;
    }
    if (editMode && (!editingLine || hydratedEditId !== editHydrationKey)) {
      setPricing(false);
      return;
    }

    const savedSpecs = lines.map((line) => line.spec);
    const currentAlreadyAdded = savedSpecs.length > 0 && JSON.stringify(savedSpecs[savedSpecs.length - 1]) === JSON.stringify(currentLine);
    const payload = editMode
      ? lines.map((line) => line.id === selectedEditLineId ? currentLine : line.spec)
      : currentAlreadyAdded ? savedSpecs : [...savedSpecs, currentLine];
    if (!payload.length) return;

    const requested = Math.max(0, negotiatedDiscount);
    const needsOverride = requested > autoPricingDiscountLimit + 1e-9;
    if (needsOverride && (!overrideReason.trim() || !managerToken.trim())) {
      setPricing(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setPricing(true);
      priceDeterministicQuote({
        lines: payload,
        commercial: {
          preset_id: selectedPreset?.id || selectedPresetId,
          negotiated_discount_percent: requested,
          manager_override_reason: needsOverride ? overrideReason.trim() : undefined,
          presentation_mode: "internal",
        },
        cost_context: projectId ? { project_id: projectId, scope: editMode ? "replace_windows" : "append" } : undefined,
        // Live previews are not audited; the explicit "Refresh price" records.
      }, needsOverride ? managerToken.trim() : undefined, { record: false })
        .then((priced) => {
          if (autoPriceRequestRef.current !== requestId) return;
          setResult(priced);
          setAutoPriceError(null);
          setError(null);
        })
        .catch((reason) => {
          // Keep the last useful price on screen, but never let it pass for
          // the price of the current selections.
          if (autoPriceRequestRef.current !== requestId) return;
          setAutoPriceError(reason instanceof Error ? reason.message : "The live price could not be updated.");
        })
        .finally(() => {
          if (autoPriceRequestRef.current === requestId) setPricing(false);
        });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [autoPricingDiscountLimit, catalog, currentLine, draftIsValid, editHydrationKey, editMode, editingLine, hydratedEditId, lines, managerToken, negotiatedDiscount, overrideReason, projectId, selectedEditLineId, selectedPreset, selectedPresetId]);

  function overrideToken() {
    return result?.sales_pricing?.manager_override_reason ? managerToken.trim() || undefined : undefined;
  }

  async function saveEditedWindows() {
    if (!projectId || !project || !editMode || isLockedStatus(project.status)) return;
    // Removing every window line needs no price: the lines are simply dropped.
    const removingAll = !lines.length;
    if (!removingAll && (!editingLine || !result)) return;
    if (!removingAll && stale) {
      setError("Regenerate the quote after changing the discount before saving the windows.");
      return;
    }
    setHandoffBusy(true);
    setHandoffEstimateId(null);
    setError(null);
    // The edit list is the source of truth: lines removed from it leave the estimate.
    const updatedWindows = lines.map((bufferedLine, index) => {
      const line = project.windows.find((item) => item.id === bufferedLine.id) || bufferedLine;
      const nextSpec = bufferedLine.id === selectedEditLineId ? currentLine : bufferedLine.spec;
      const nextDetails = bufferedLine.id === selectedEditLineId ? currentDetails : bufferedLine.details;
      const nextDescription = descriptionForUpdatedSpec(line, nextSpec, nextDetails, catalog, bufferedLine.description);
      return { ...line, location: bufferedLine.location, description: nextDescription, spec: nextSpec, details: withDefaultTag(nextDetails, index + 1) };
    });
    const draftPayload: CustomerEstimateDraft = estimateToDraft(project, {
      windows: updatedWindows,
      commercial: result ? {
        ...project.commercial,
        preset_id: result.sales_pricing.preset_id || project.commercial.preset_id,
        negotiated_discount_percent: result.sales_pricing.negotiated_discount_percent,
        manager_override_reason: result.sales_pricing.manager_override_reason || undefined,
        presentation_mode: "internal",
      } : project.commercial,
    });
    try {
      const saved = await updateCustomerEstimate(project.id, draftPayload);
      if (!updatedWindows.length && !saved.doors.length) {
        // Nothing left to price; the project page offers to add products again.
        window.location.href = `/projects/${saved.id}`;
        return;
      }
      try {
        const priced = await priceCustomerEstimate(saved.id, overrideToken());
        window.location.href = `/projects/${priced.id}`;
      } catch (pricingError) {
        setHandoffEstimateId(saved.id);
        setError(pricingError instanceof Error ? `Window changes saved, but project pricing needs attention: ${pricingError.message}` : "Window changes saved, but project pricing needs attention.");
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the edited window lines.");
    } finally {
      setHandoffBusy(false);
    }
  }

  async function sendToProjectEstimate() {
    if (!projectId || !project || isLockedStatus(project.status)) return;
    if (editMode) {
      await saveEditedWindows();
      return;
    }
    if (!result || !lines.length) return;
    setHandoffBusy(true);
    setHandoffEstimateId(null);
    setError(null);
    const windows: CustomerWindowLine[] = lines.map((line, index) => ({
      id: line.id,
      location: line.location,
      description: line.description,
      spec: line.spec,
      details: withDefaultTag(line.details, project.windows.length + index + 1),
    }));
    const projectHasProducts = project.windows.length > 0 || project.doors.length > 0;
    try {
      const assigned = await appendCustomerEstimateLines(projectId, {
        windows,
        doors: [],
        commercial: projectHasProducts ? undefined : {
          preset_id: result.sales_pricing.preset_id || selectedPresetId,
          negotiated_discount_percent: result.sales_pricing.negotiated_discount_percent,
          manager_override_reason: result.sales_pricing.manager_override_reason || undefined,
          presentation_mode: "internal",
        },
      });
      try {
        const priced = await priceCustomerEstimate(assigned.id, overrideToken());
        window.location.href = `/projects/${priced.id}`;
      } catch (pricingError) {
        setHandoffEstimateId(assigned.id);
        setError(pricingError instanceof Error ? `Window quote assigned, but project pricing needs attention: ${pricingError.message}` : "Window quote assigned, but project pricing needs attention.");
      }
    } catch (handoffError) {
      setError(handoffError instanceof Error ? handoffError.message : "Could not assign the window quote to this project.");
    } finally {
      setHandoffBusy(false);
    }
  }

  // --- Sales strategy: live negotiation preview (recomputed from the last price) ---
  const sp = result?.sales_pricing;
  const isPriced = Boolean(sp && sp.base_merchandise_sell != null);
  const baseMerch = sp?.base_merchandise_sell ?? 0;
  const protectedInstall = sp?.protected_install_sell ?? 0;
  const hstRate = result?.totals?.sell_before_tax ? result.totals.hst / result.totals.sell_before_tax : 0.13;
  const configuredCap = sp?.configured_max_discount_percent ?? (selectedPreset?.max_discount_percent ?? 0);
  const floorCap = sp?.floor_derived_max_discount_percent ?? 0;
  const allowedMax = sp?.maximum_allowed_discount_percent ?? configuredCap;
  const requestedPct = Math.max(0, negotiatedDiscount);
  const overLimit = requestedPct > allowedMax + 1e-9;
  const remainingPct = Math.max(0, allowedMax - requestedPct);
  const sliderMax = Math.max(allowedMax, negotiatedDiscount, 5) + 0.5;
  const frac = requestedPct / 100;
  const previewDiscount = baseMerch * frac;
  const previewPreTax = baseMerch * (1 - frac) + protectedInstall;
  const previewTotal = previewPreTax * (1 + hstRate);
  const maximumDiscountDollars = baseMerch * (allowedMax / 100);
  const minimumCustomerTotal = (baseMerch * (1 - allowedMax / 100) + protectedInstall) * (1 + hstRate);
  function capToAllowedDiscount(value: number) {
    return Math.max(0, Math.min(allowedMax, value));
  }
  function pctFromDollars(dollars: number) {
    return baseMerch > 0 ? capToAllowedDiscount((dollars / baseMerch) * 100) : 0;
  }
  function pctFromPrice(targetTotal: number) {
    if (baseMerch <= 0) return 0;
    const targetPreTax = targetTotal / (1 + hstRate);
    return capToAllowedDiscount(((baseMerch + protectedInstall - targetPreTax) / baseMerch) * 100);
  }
  const cp: Record<string, any> = result?.customer_presentation ?? {};
  const visibleLines: QuoteLineDraft[] = lines;
  const customerLines = Array.isArray(cp.lines)
    ? (cp.lines as Array<{ line: number; type: string; qty: number; unit_price: number; line_total: number }>).map((line, index) => ({
        ...line,
        location: visibleLines[index]?.location || "",
        description: visibleLines[index]?.description || (visibleLines[index]
          ? describeWindowSpec(visibleLines[index].spec, catalog, visibleLines[index].details)
          : describeWindowSpec(currentLine, catalog, currentDetails)),
      }))
    : [];
  // A discount that no longer matches the generated quote → quote is stale, needs regenerating.
  const stale = isPriced && Math.abs(requestedPct - (sp?.negotiated_discount_percent ?? -1)) > 1e-9;
  // Keep the visible discount field freely editable without clearing the quote on each keystroke.
  useEffect(() => {
    if (negotiationMode === "percent") setDiscountText(String(negotiatedDiscount));
    else if (negotiationMode === "dollars") setDiscountText(String(Number(previewDiscount.toFixed(2))));
    else setDiscountText(String(Number(previewTotal.toFixed(2))));
  }, [negotiationMode, negotiatedDiscount, previewDiscount, previewTotal]);
  // --------------------------------------------------------------------------------

  if (!projectId) return <ProjectAccessGate product="window" />;
  if (projectLoading) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading project…</p>;
  if (!project) return <p className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error || "The selected project could not be loaded."}</p>;
  if (editMode && editHydrationKey && hydratedEditId === editHydrationKey && !lines.length && project.windows.length) {
    const count = project.windows.length;
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">{count === 1 ? "The window line was removed." : `All ${count} window & patio door lines removed.`}</p>
        <p className="mt-1 text-slate-500">Save to take {count === 1 ? "it" : "them"} off {project.estimate_number || "this estimate"}. {project.doors.length ? "The door openings stay and the project is repriced." : "The estimate will have no products until you add some."}</p>
        {error ? <p className="mt-3 text-rose-700">{error}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" onClick={saveEditedWindows} disabled={handoffBusy || isLockedStatus(project.status)}>{handoffBusy ? "Saving changes…" : "Save changes"}</button>
          <Link href={`/projects/${project.id}`} className="text-sm font-semibold text-slate-600 hover:underline">Cancel — keep the windows</Link>
        </div>
      </div>
    );
  }
  if (editMode && editHydrationKey && hydratedEditId === editHydrationKey && !editingLine) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700"><p>{error || "The project does not have any saved window lines to edit."}</p><Link href={`/projects/${project.id}`} className="mt-3 inline-block font-semibold underline">Open project</Link></div>;
  }

  const configuratorPrice = {
    pending: pricing || (!result && draftIsValid),
    error: autoPriceError || (draft.type === "bay_bow" ? bayIssue : null),
    unitPrice: currentCustomerLine?.unit_price ?? null,
    lineTotal: currentCustomerLine?.line_total ?? null,
    dealerEach: currentResultLine?.dealer_each ?? null,
    sections: currentResultLine?.unit?.sections ?? null,
  };
  const locationValue = editMode ? editingLine?.location || "" : draftLocation;
  function changeLocation(value: string) {
    if (editMode) {
      const index = lines.findIndex((line) => line.id === selectedEditLineId);
      if (index >= 0) updateLine(index, { location: value });
    } else {
      setDraftLocation(value);
    }
  }
  const noun = isPatio(draft.type) ? "door" : draft.type === "bay_bow" ? "bay" : "window";
  const primaryAction = editMode ? undefined : { label: `Add ${Number(draft.qty) > 1 ? `${draft.qty} ${noun}s` : noun} to project list`, onClick: addLine, disabled: !draftIsValid };
  const editingLabel = editMode && editingLine ? `Editing: ${editingLine.location || lineLabel(editingLine.spec)}` : null;
  const configuratorLoading = <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{loading ? "Loading the configurator…" : "The configurator needs the price-book catalog."}</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Workflow</p>
          <p className="text-base font-semibold text-slate-900">{internal ? "Internal pricing workspace" : "Customer presentation — costs hidden"}</p>
          <p className="text-xs text-slate-500">{role === "rep" ? "This device is locked to the rep view." : `Switch views here, in the header, or with ${VIEW_MODE_SHORTCUT}.`}</p>
        </div>
        {role === "rep" ? null : (
          <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold">
            <button type="button" className={`rounded-lg px-3 py-2 ${internal ? "bg-brand-600 text-white" : "text-slate-700"}`} onClick={() => setPresentationMode("internal")}>Internal view</button>
            <button type="button" className={`rounded-lg px-3 py-2 ${!internal ? "bg-emerald-600 text-white" : "text-slate-700"}`} onClick={() => setPresentationMode("customer")}>Customer view</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm">
        <div><span className="text-brand-700">{editMode ? "Editing windows & doors in " : "Assigning this quote to "}</span><strong className="text-brand-900">{project.project_name || project.customer_name || "Selected project"}</strong>{project.estimate_number ? <span className="ml-2 text-xs text-brand-700">{project.estimate_number}</span> : null}</div>
        <Link href={`/projects/${project.id}`} className="font-semibold text-brand-700 hover:underline">Open project</Link>
      </div>

      <ProductTabs value={draft.type} onChange={changeProduct} colour={draft.colour_ext} />

      {draft.type === "unit" ? (
        catalog?.layout ? (
          <WindowConfigurator
            catalog={catalog}
            colours={catalog.colours?.exterior || COLORS}
            value={draft as ConfiguratorValue}
            onChange={(patch) => patchDraft(patch as Partial<Draft>)}
            price={configuratorPrice}
            location={locationValue}
            onLocationChange={changeLocation}
            primaryAction={primaryAction}
            editingLabel={editingLabel}
          />
        ) : configuratorLoading
      ) : null}

      {isPatio(draft.type) ? (
        catalog ? (
          <PatioDoorConfigurator
            catalog={catalog}
            colours={catalog.colours?.exterior || COLORS}
            value={draft as PatioDoorValue}
            onChange={(patch) => patchDraft(patch as Partial<Draft>)}
            price={configuratorPrice}
            location={locationValue}
            onLocationChange={changeLocation}
            primaryAction={primaryAction}
            editingLabel={editingLabel}
          />
        ) : configuratorLoading
      ) : null}

      {draft.type === "bay_bow" ? (
        catalog?.layout ? (
          <BayConfigurator
            catalog={catalog}
            colours={catalog.colours?.exterior || COLORS}
            value={draft as BayValue}
            onChange={(patch) => patchDraft(patch as Partial<Draft>)}
            price={configuratorPrice}
            location={locationValue}
            onLocationChange={changeLocation}
            primaryAction={primaryAction}
            editingLabel={editingLabel}
          />
        ) : configuratorLoading
      ) : null}

      <div className="grid gap-8 lg:grid-cols-5">
        <section className="space-y-6 lg:col-span-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{draft.type === "window" || draft.type === "combination" ? (editMode ? "Edit catalog-backed window quotes" : "Build a catalog-backed window quote") : internal ? "Pricing, favourites & project lines" : "Favourites & project lines"}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {editMode ? "All saved window and patio door lines are loaded below. Select a line to open it in its configurator, change it, then save the complete set back to this project." : "Prices come from Window City v18 with component traceability. Unsupported options are flagged for review."}
            </p>

          {loading ? <p className="mt-6 text-sm text-slate-500">Loading price-book catalog…</p> : null}

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-[12rem] flex-1 text-sm">
                <span className="mb-1 block font-medium text-slate-700">Favourites</span>
                <select
                  className="input w-full"
                  value={selectedFavouriteId}
                  onChange={(e) => {
                    setSelectedFavouriteId(e.target.value);
                    if (e.target.value) applySavedFavourite(e.target.value);
                  }}
                  disabled={favouritesBusy || !favourites.length}
                >
                  <option value="">{favourites.length ? "Choose a saved favourite…" : "No saved favourites yet"}</option>
                  {favourites.map((favourite) => <option key={favourite.id} value={favourite.id}>{favourite.name}</option>)}
                </select>
              </label>
              <button type="button" className="min-h-[2.75rem] rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" onClick={() => applySavedFavourite()} disabled={favouritesBusy || !selectedFavouriteId}>Apply again</button>
              <button type="button" className="min-h-[2.75rem] rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60" onClick={removeFavourite} disabled={favouritesBusy || !selectedFavouriteId} aria-label="Delete the selected favourite">Delete</button>
              <button type="button" className="min-h-[2.75rem] rounded-lg border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60" onClick={saveFavourite} disabled={favouritesBusy}>Save current options as favourite</button>
            </div>
            <p className="mt-2 text-xs text-slate-500">A favourite stores the product, style or layout, colours, glazing and trim — not the size or quantity.</p>
            {favouritesNotice ? <p className="mt-1 text-xs text-emerald-700" role="status">{favouritesNotice}</p> : null}
            {favouritesError ? <p className="mt-1 text-xs text-rose-700" role="alert">{favouritesError}</p> : null}
          </div>

          {draft.type === "window" || draft.type === "combination" ? (
          <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Window style">
              <select className="input" value={draft.style} onChange={(e) => update("style", e.target.value)}>
                {catalog ? groupWindowStyles(catalog.styles).map((group) => (
                  <optgroup key={group.collection} label={group.label}>
                    {group.styles.map((style) => <option key={style.code} value={style.code}>{windowStyleLabel(style)}</option>)}
                  </optgroup>
                )) : null}
              </select>
            </Field>
            <Field label={draft.type === "combination" ? "Lite width (in)" : "Width (in)"}><input className="input" type="number" min={1} step={0.125} value={draft.width} onChange={(e) => update("width", numericInputValue(e.target.value))} /></Field>
            <Field label="Height (in)"><input className="input" type="number" min={1} step={0.125} value={draft.height} onChange={(e) => update("height", numericInputValue(e.target.value))} /></Field>
            <Field label="Quantity"><input className="input" type="number" min={1} step={1} value={draft.qty} onChange={(e) => update("qty", numericInputValue(e.target.value))} /></Field>
            <Field label="Exterior colour">
              <select className="input" value={draft.colour_ext} onChange={(e) => patchDraft(withColourRules(draft, { colour_ext: e.target.value }))}>
                {COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
              </select>
            </Field>
            <Field label="Interior colour">
              <select className="input" value={draft.colour_int} onChange={(e) => patchDraft(withColourRules(draft, { colour_int: e.target.value }))}>
                {INTERIOR_COLOURS.map((color) => <option key={color} value={color}>{color === "black" ? "black (black in / black out)" : color}</option>)}
              </select>
            </Field>
            {draft.type === "window" && combinationSuggestion ? <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p className="font-semibold">This {combinationSuggestion.styleCode} size may be a two-lite combination.</p><p className="mt-1">For {combinationSuggestion.overallWidth} × {combinationSuggestion.height} overall, price two {combinationSuggestion.styleCode} lites at {combinationSuggestion.liteWidth} × {combinationSuggestion.height} each.</p><button type="button" className="mt-2 rounded-md border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100" onClick={() => { update("type", "combination"); update("width", combinationSuggestion.liteWidth); }}>Use two-lite combination</button></div> : null}
          </div>

          {draft.type === "combination" ? <p className="mt-3 text-xs text-slate-500">Combination uses two equal lites with the selected style. For a 64 in overall width, enter 32 in as the lite width.</p> : null}

            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Glazing</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle label="LoE 180" value={draft.loe180} onChange={(value) => update("loe180", value)} />
                <Toggle label="i89" value={draft.i89} onChange={(value) => update("i89", value)} />
                <Toggle label="Triple pane" value={draft.triple} onChange={(value) => update("triple", value)} />
                <Toggle label="Tri-pane laminated" value={draft.tri_pane_lami} onChange={(value) => update("tri_pane_lami", value)} />
                <Toggle label="Frost / tint" value={draft.frost_tint} onChange={(value) => update("frost_tint", value)} />
                <Field label="Gas"><select className="input" value={draft.gas} onChange={(e) => update("gas", e.target.value)}>{GAS.map((gas) => <option key={gas} value={gas}>{gas}</option>)}</select></Field>
              </div>
            </div>

            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Trim</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle label="Brickmould" value={draft.brickmould} onChange={(value) => update("brickmould", value)} />
                <Toggle label="Wood jamb" value={draft.wood_jamb} onChange={(value) => update("wood_jamb", value)} />
                {draft.wood_jamb ? (
                  <Field label="Jamb depth">
                    <select className="input" value={draft.jamb_depth} onChange={(e) => update("jamb_depth", e.target.value)}>
                      {jambDepthOptions(catalog, isPatio(draft.type) ? "patio" : "window").map((depth) => <option key={depth.name} value={depth.name}>{depth.name}</option>)}
                      <option value={CUSTOM_JAMB}>Custom depth…</option>
                    </select>
                  </Field>
                ) : null}
                {draft.wood_jamb && draft.jamb_depth === CUSTOM_JAMB ? (
                  <Field label="Custom depth (in)"><input className="input" type="number" min={0.5} max={catalog?.wood_jamb?.custom_max_in || 7.5} step={0.125} value={draft.jamb_custom} onChange={(e) => update("jamb_custom", numericInputValue(e.target.value))} /></Field>
                ) : null}
                {draft.wood_jamb ? (() => {
                  const product = isPatio(draft.type) ? "patio" : "window";
                  const depth = jambDepthIn(draft, catalog);
                  return depth !== null && depth <= primedMaxIn(catalog, product) + 1e-6
                    ? <Toggle label="Primed white" value={jambIsPrimed(draft, catalog, product)} onChange={(value) => update("jamb_primed", value)} />
                    : <p className="text-xs text-slate-500">Unfinished: priming is only offered up to {fmtJambLimit(catalog, product)} on {product === "patio" ? "patio doors" : "windows"}.</p>;
                })() : null}
              </div>
              <p className="mt-3 text-xs text-slate-500">{accessoriesNote(catalog)}</p>
              {draft.type === "combination" ? <p className="mt-1 text-xs text-slate-500">On a mulled unit, brickmould and jambs wrap the whole assembly once.</p> : null}
            </div>
          </>
          ) : null}

          {renderOrderDetails()}

          {renderSalesStrategy()}

          <div className="mt-6 flex flex-wrap gap-3">
            {!editMode && (draft.type === "window" || draft.type === "combination") ? <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60" onClick={addLine} disabled={!draftIsValid}>Add to project list</button> : null}
            <button type="button" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60" onClick={generateQuote} disabled={pricing || loading || !draftIsValid}>{pricing ? "Updating price…" : "Refresh price"}</button>
          </div>
        </div>

        {lines.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
             <div className="flex items-center justify-between"><h2 className="text-base font-semibold text-slate-900">{editMode ? "Project windows & patio doors" : "Quote lines"}</h2><span className="text-sm text-slate-500">{lines.length} line{lines.length === 1 ? "" : "s"}</span></div>
            {!editMode ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" className="min-h-[2.75rem] rounded-lg border border-brand-200 bg-white px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50" onClick={applyOptionsToAllLines}>Apply current options to all lines</button>
                <span className="text-xs text-slate-500">Colours, glazing and brickmould / wood jamb from the form above; sizes and locations stay.</span>
              </div>
            ) : null}
            <div className="mt-4 space-y-2">
               {lines.map((line, index) => <div key={line.id} className={`rounded-lg px-3 py-3 text-sm ${editMode && line.id === selectedEditLineId ? "border border-brand-300 bg-brand-50" : "bg-slate-50"}`}>
                 <div className="flex items-center justify-between gap-3"><LineThumbnail spec={line.spec} /><div className="min-w-0 flex-1"><button type="button" className={`font-medium ${editMode ? "text-left text-brand-800 hover:underline" : "text-slate-800"}`} onClick={() => editMode ? selectEditLine(line.id) : undefined}>{tagPrefix(line.details)}{line.description || lineLabel(line.spec)}</button>{line.description ? <p className="mt-1 text-xs text-slate-500">{lineLabel(line.spec)}</p> : null}</div>{editMode ? <div className="flex shrink-0 items-center gap-1"><span className="text-xs font-semibold text-brand-700">{line.id === selectedEditLineId ? "Editing" : "Select to edit"}</span><button type="button" className="min-h-[2.75rem] px-2 text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeEditLine(line.id)} aria-label={`Remove line ${index + 1}`}>Remove</button></div> :<div className="flex shrink-0 items-center gap-1"><button type="button" className="min-h-[2.75rem] px-2 text-xs font-semibold text-brand-700 hover:underline" onClick={() => duplicateLine(index)} aria-label={`Duplicate line ${index + 1}`}>Duplicate</button><button type="button" className="min-h-[2.75rem] px-2 text-xs font-semibold text-rose-600 hover:underline" onClick={() => removeLine(index)} aria-label={`Remove line ${index + 1}`}>Remove</button></div>}</div>
                 <div className="mt-2 grid gap-2 sm:grid-cols-2">
                   <LocationInput className="input" value={line.location} onChange={(value) => updateLine(index, { location: value })} placeholder="Location (e.g. Bedroom)" />
                   <input className="input" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} placeholder="Customer description (optional)" />
                 </div>
               </div>)}
            </div>
          </div>
        ) : null}

          {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}
        </section>

      <aside className="space-y-6 lg:col-span-2">
        {autoPriceError ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">{result ? "Price not updated — the figures below are for your previous selections." : "These selections could not be priced."}</p><p className="mt-1">{autoPriceError}</p></div> : null}
        {result ? (
          <>
            <div className={`rounded-2xl border p-4 ${internal ? "border-brand-200 bg-brand-50" : "border-emerald-200 bg-emerald-50"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current presentation</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{internal ? "Internal pricing view" : "Customer-facing view"}</p>
              <p className="mt-1 text-xs text-slate-600">{internal ? "Shows protected dealer cost, profit, margin, floor, and bargaining room." : "Shows sell prices, the negotiated merchandise discount, HST, and total only."}</p>
            </div>
            <QuoteTotals result={result} mode={presentationMode} />
            <SalesResult result={result} mode={presentationMode} lines={customerLines} />
            <div className="rounded-2xl border border-brand-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Project estimate</h2>
              <p className="mt-1 text-sm text-slate-500">{editMode ? `Save all ${lines.length} line${lines.length === 1 ? "" : "s"} back to the same estimate. Select a line from the list to edit its options.` : `Assign all ${lines.length} added line${lines.length === 1 ? "" : "s"} to the selected project. Existing door and window lines stay in the same project.`}</p>
              {isLockedStatus(project.status) ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">This estimate is finalized and read-only. Create a revision from the project to change it.</p> : null}
              <button type="button" className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" onClick={sendToProjectEstimate} disabled={handoffBusy || (!editMode && !lines.length) || isLockedStatus(project.status)}>{handoffBusy ? (editMode ? "Saving changes…" : "Saving…") : editMode ? "Save changes" : `Save ${lines.length || "all"} line${lines.length === 1 ? "" : "s"} to project`}</button>
              {handoffEstimateId ? <p className="mt-3 text-xs text-rose-700">{editMode ? "The changes were saved." : "The quote was assigned."} <Link href={`/projects/${handoffEstimateId}`} className="font-semibold underline">Open project</Link> to resolve the pricing issue.</p> : null}
              {error && handoffEstimateId ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
            </div>
            {internal ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><h2 className="text-base font-semibold text-slate-900">Price-book audit</h2><span className={`rounded-full px-2 py-1 text-xs font-semibold ${result.review_required ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>{result.review_required ? "Review required" : "Catalog priced"}</span></div>
              <p className="mt-2 text-xs text-slate-500">{result.price_book_version} · config {result.config_version}</p>
              {result.warnings.length ? <div className="mt-4 space-y-2">{result.warnings.map((warning, index) => <div key={`${warning.code}-${index}`} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{warning.message}</div>)}</div> : <p className="mt-4 text-sm text-emerald-700">All requested components matched supported catalog rules.</p>}
            </div> : null}
            {internal ? <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Line breakdown</h2>
              <div className="mt-4 space-y-4">
                {result.lines.map((line) => <div key={line.line} className="rounded-xl bg-slate-50 p-4"><div className="flex justify-between gap-3 text-sm font-semibold"><span>Line {line.line} · {line.type} × {line.qty}</span><span>{money(line.customer_total, result.currency)}</span></div><div className="mt-3 space-y-1 text-xs text-slate-600">{line.components.map((component, index) => <div key={`${component.label}-${index}`} className="flex justify-between gap-3"><span>{component.label}</span><span>{money(component.dealer)}</span></div>)}</div><LineEnergy line={line} />{line.source_refs.length ? <p className="mt-3 text-[11px] text-slate-500">Sources: {line.source_refs.join("; ")}</p> : null}</div>)}
              </div>
            </div> : null}
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm">{internal ? "Choose valid options to see the live FastAPI component breakdown, review warnings, and customer total." : "Choose valid options to see the customer price."}</div>
        )}
      </aside>
      </div>
    </div>
  );

  /** Presentation-only details printed on the estimate and the manufacturer order. */
  function renderOrderDetails() {
    const windowLike = !isPatio(draft.type);
    const screen = orderDetails.screen ?? defaultScreen(currentOperations);
    const hardware = orderDetails.hardware ?? defaultHardware(currentOperations);
    // Opening numbers default to the line's position in the project list.
    const selectedEditIndex = editMode ? lines.findIndex((line) => line.id === selectedEditLineId) : -1;
    const defaultTag = String(editMode
      ? (selectedEditIndex >= 0 ? selectedEditIndex + 1 : lines.length + 1)
      : (project?.windows.length ?? 0) + lines.length + 1);
    return (
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">Order details</p>
            <p className="mb-3 mt-1 text-xs text-slate-500">Printed on the estimate and the manufacturer order. These do not change the price.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Opening #"><input className="input" value={orderDetails.tag} onChange={(e) => updateOrderDetails({ tag: e.target.value })} placeholder={defaultTag} /></Field>
              <Field label="Elevation">
                <select className="input" value={orderDetails.elevation} onChange={(e) => updateOrderDetails({ elevation: e.target.value as OrderDetails["elevation"] })}>
                  <option value="">Not set</option>
                  {ELEVATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </Field>
              {windowLike ? (
                <>
                  <div className="flex items-end pb-2 sm:col-span-2"><Toggle label="Screen" value={screen} onChange={(value) => updateOrderDetails({ screen: value })} /></div>
                  {screen ? (
                    <>
                      <Field label="Screen frame colour">
                        <select className="input" value={orderDetails.screen_frame} onChange={(e) => updateOrderDetails({ screen_frame: e.target.value })}>
                          {withCurrent(COLORS, orderDetails.screen_frame).map((color) => <option key={color} value={color}>{color}</option>)}
                        </select>
                      </Field>
                      <Field label="Screen mesh colour">
                        <select className="input" value={orderDetails.screen_mesh} onChange={(e) => updateOrderDetails({ screen_mesh: e.target.value })}>
                          {withCurrent(SCREEN_MESH_COLOURS, orderDetails.screen_mesh).map((color) => <option key={color} value={color}>{color}</option>)}
                        </select>
                      </Field>
                    </>
                  ) : null}
                  <Field label="Hardware">
                    <input className="input" list="hardware-options" value={hardware} onChange={(e) => updateOrderDetails({ hardware: e.target.value })} placeholder="None" />
                    <datalist id="hardware-options">{HARDWARE_SUGGESTIONS.map((item) => <option key={item} value={item} />)}</datalist>
                  </Field>
                  <Field label="Spacer">
                    <select className="input" value={orderDetails.spacer} onChange={(e) => updateOrderDetails({ spacer: e.target.value })}>
                      {withCurrent(SPACERS, orderDetails.spacer).map((spacer) => <option key={spacer} value={spacer}>{spacer}</option>)}
                    </select>
                  </Field>
                </>
              ) : null}
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block font-medium text-slate-700">Notes</span>
                <textarea className="input" rows={2} value={orderDetails.notes} onChange={(e) => updateOrderDetails({ notes: e.target.value })} placeholder="Order notes for this opening" />
              </label>
            </div>
          </div>
    );
  }

  /** Preset, negotiated discount and manager approval. Internal figures only in the internal view.
   * Called as a function (not rendered as a component) so its inputs keep focus between renders. */
  function renderSalesStrategy() {
    return (
          <div className="mt-6 rounded-xl border border-brand-100 bg-brand-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{internal ? "Sales strategy" : "Discount"}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {internal
                    ? "Set the pricing approach and how much room to give the customer. Your discount applies to the product only — installation is never discounted — and no project goes below the profit floor without a manager."
                    : "Enter the discount agreed with the customer. Installation is never discounted."}
                </p>
              </div>
              {internal ? <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-brand-700">Manager-controlled floors</span> : null}
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {internal ? (
                <Field label="Preset">
                  <select
                    className="input"
                    value={selectedPreset?.id || selectedPresetId}
                    onChange={(e) => {
                      const next = salesPresets.find((preset) => preset.id === e.target.value);
                      setSelectedPresetId(e.target.value);
                      setNegotiatedDiscount(next?.default_discount_percent || 0);
                      setResult(null);
                    }}
                  >
                    {salesPresets.map((preset) => <option key={preset.id} value={preset.id}>{presetLabel(preset)}</option>)}
                  </select>
                  {selectedPreset?.description ? <p className="mt-1 text-xs text-slate-500">{selectedPreset.description}</p> : null}
                </Field>
              ) : null}

              <div>
                <p className="mb-1 block text-sm font-medium text-slate-700">Negotiated discount</p>
                <p className="mb-2 text-xs text-slate-500">How do you want to enter the room you give the customer?</p>
                <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-semibold">
                  {([["percent", "% off"], ["dollars", "$ off"], ["price", "Total price"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`flex-1 rounded-md px-2 py-1 ${negotiationMode === key ? "bg-brand-600 text-white" : "text-slate-600"}`}
                      onClick={() => {
                        setNegotiationMode(key);
                        if (key !== "percent") {
                          setNegotiatedDiscount((current) => capToAllowedDiscount(current));
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Negotiation control with live preview */}
            <div className="mt-5 rounded-lg border border-brand-200/70 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {negotiationMode === "percent" ? "Discount off product price" : negotiationMode === "dollars" ? "Dollars off total" : "Customer price (incl. tax)"}
                </p>
                {isPriced ? (
                  <span className="text-sm font-semibold text-brand-700">
                    {negotiationMode === "percent" ? `${requestedPct.toFixed(1)}%` : negotiationMode === "dollars" ? money(previewDiscount) : money(previewTotal)}
                  </span>
                ) : null}
              </div>

              {!isPriced && negotiationMode !== "percent" ? (
                <p className="mt-3 text-xs text-slate-500">The price will appear automatically, then you can enter the discount in dollars or as a total customer price.</p>
              ) : negotiationMode === "percent" ? (
                <>
                  <input type="range" min={0} max={sliderMax} step={0.5} value={negotiatedDiscount} onChange={(e) => { setNegotiatedDiscount(Number(e.target.value)); }} className="mt-3 w-full" />
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="input mt-2 w-32"
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value)}
                    onBlur={() => { const v = Math.max(0, parseFloat(discountText) || 0); setNegotiatedDiscount(v); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                </>
              ) : negotiationMode === "dollars" ? (
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="input mt-3 w-40"
                  value={discountText}
                  onChange={(e) => setDiscountText(e.target.value)}
                  onBlur={() => { setNegotiatedDiscount(pctFromDollars(parseFloat(discountText) || 0)); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="input mt-3 w-40"
                  value={discountText}
                  onChange={(e) => setDiscountText(e.target.value)}
                  onBlur={() => { setNegotiatedDiscount(pctFromPrice(parseFloat(discountText) || 0)); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              )}

              {isPriced && negotiationMode === "dollars" ? <p className="mt-2 text-xs text-slate-500">Capped at {money(maximumDiscountDollars)} off.</p> : null}
              {isPriced && negotiationMode === "price" ? <p className="mt-2 text-xs text-slate-500">The customer total cannot go below {money(minimumCustomerTotal)} without manager approval.</p> : null}

              {isPriced ? (
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Discount</span><b>{money(previewDiscount)} ({requestedPct.toFixed(1)}%)</b></div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Pre-tax total</span><b>{money(previewPreTax)}</b></div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Customer total</span><b>{money(previewTotal)}</b></div>
                  {internal ? <>
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Remaining room</span><b>{remainingPct.toFixed(1)}%</b></div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">{sp?.strategy === "sliding_margin" ? "Margin" : "Markup"}</span><b>{sp?.strategy === "sliding_margin" && sp.sliding ? `${sp.sliding.margin_percent.toFixed(1)}%` : `${(sp?.markup_percent ?? selectedPreset?.markup_percent ?? 0).toFixed(1)}%`}</b></div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Minimum markup</span><b>{(sp?.minimum_markup_percent ?? selectedPreset?.minimum_markup_percent ?? 0).toFixed(1)}%</b></div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2"><span className="block text-slate-500">Floor price</span><b>{money(sp?.minimum_floor_sell ?? 0)}</b></div>
                    <div className={`rounded-lg px-3 py-2 ${overLimit ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}><span className="block text-slate-500">Status</span><b>{overLimit ? (sp?.override_applied && !stale ? "Manager approved" : overrideReason.trim() ? "Awaiting manager" : "Over limit") : "Within floor"}</b></div>
                  </> : null}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">{internal ? "Generate a quote to see the dollar totals, the floor, your remaining room, and the binding limit." : "The price appears once the options are valid."}</p>
              )}

              {stale ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Price is updating for the changed discount…
                </p>
              ) : null}
            </div>
            {/* Which limit is binding */}
            {isPriced && internal ? (
              <p className="mt-3 text-xs text-slate-600">
                {floorCap < configuredCap - 1e-9
                  ? `Allowed discount capped at ${allowedMax.toFixed(1)}% by the floor (${floorCap.toFixed(1)}%)${sp?.profit_floor ? ` — the ${money(sp.profit_floor)} project profit floor or the minimum markup` : ""}, tighter than the preset cap of ${configuredCap.toFixed(1)}%.`
                  : `Allowed discount is the preset cap of ${configuredCap.toFixed(1)}%; the floor would permit up to ${floorCap.toFixed(1)}%.`}
              </p>
            ) : null}

            {/* Guided manager approval */}
            {overLimit ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold text-rose-800">This discount needs manager approval.</p>
                <p className="mt-1 text-xs text-rose-700">A manager approval reason is required. The override, the reason, and the resulting price are recorded in the audit log.</p>
                <input type="text" className="input mt-2 w-full" placeholder="Manager approval reason (required)" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                <input type="password" className="input mt-2 w-full" placeholder="Manager authorization token (required)" value={managerToken} onChange={(e) => setManagerToken(e.target.value)} autoComplete="off" />
              </div>
            ) : null}
          </div>
    );
  }
}

function accessoriesNote(catalog: QuoteCatalog | null) {
  const brickmould = catalog?.accessories.brickmould?.[0]?.name;
  return brickmould ? `Brickmould: ${brickmould}. Wood jamb: primed, 5 1/2″ standard.` : "Catalog accessory rows load with the price book.";
}
