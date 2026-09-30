import { describe, expect, it } from "vitest";
import {
  availableModels,
  customColours,
  emptySelection,
  lockSummary,
  multipointRequired,
  tedeeAllowed,
  finishKey,
  firstIncomplete,
  frameDepths,
  interiorTypes,
  isCutDown,
  normalizeSelection,
  PipelineCatalog,
  PipelineSelection,
  sills,
  specFromSelection,
  stepComplete,
} from "@/lib/doorPipeline";
import { describeDoorSpec } from "@/lib/productDescriptions";
import { pullBarTop } from "@/components/DoorDrawing";
import type { DoorCatalog, DoorOpeningSpec } from "@/lib/api";

const STD = [30, 32, 34, 36];
const glass = { "22x64": { decorative: ["group_a", "group_b"], clear: ["clear_lowe", "clear_triple_dual_lowe"] }, "22x36": { clear: ["clear_lowe"] } };

const catalog: PipelineCatalog = {
  widths: [30, 32, 34, 36, 42],
  standard_widths: STD,
  heights: [{ key: `6'8"`, inches: 80 }, { key: `8'0"`, inches: 96 }],
  configurations: [
    { key: "single", label: "Single", doors: 1, sidelites: 0, transom: false, opening_type: "single_door" },
    { key: "single_1sl_transom", label: "Single + sidelite + transom", doors: 1, sidelites: 1, transom: true, opening_type: "single_1_sidelite" },
    { key: "double", label: "Double", doors: 2, sidelites: 0, transom: false, opening_type: "double_door" },
  ],
  frame_types: [{ key: "smooth", label: "Smooth" }, { key: "textured", label: "Textured" }],
  glass_families: [
    { key: "decorative", label: "Decorative glass", hint: "", flat_max: true, series: [{ key: "group_a", label: "A" }, { key: "group_b", label: "B" }] },
    { key: "clear", label: "Clear", hint: "", flat_max: false, series: [{ key: "clear_lowe", label: "LowE" }, { key: "clear_triple_dual_lowe", label: "Triple" }] },
  ],
  transom_glass: [{ key: "clear_lowe_glass", label: "Clear" }],
  paint_presets: ["Black"],
  stain_presets: ["Walnut"],
  fire_rated_list: null,
  default_sidelite_width: 14,
  default_transom_height: 14,
  discount: 0.4,
  materials: {
    steel: {
      key: "steel",
      label: "Steel",
      default_frame_type: "smooth",
      side_types: [{ key: "white", label: "Factory white" }, { key: "painted", label: "Painted" }],
      frame_depths: [
        { key: "4.625", label: `4-5/8"`, standard: true, frame_types: ["smooth", "textured"] },
        { key: "7.625", label: `7-5/8"`, standard: false, frame_types: ["smooth", "textured"] },
      ],
      sills: [
        { key: "black_anodized", label: "Black anodized", not_with: [] },
        { key: "outswing", label: "Outswing", not_with: ["7.625"] },
      ],
      handles: [{ item: "Berkeley Gripset", label: "Berkeley Gripset", has_dummy: true }],
      models: [
        { key: "flush", label: "Flush", offers: [{ kind: "solid", height: `6'8"`, widths: STD }, { kind: "solid", height: `8'0"`, widths: STD }, { kind: "solid", height: `6'8"`, widths: [42] }, { kind: "glazed", height: `6'8"`, widths: STD, width_class: "std", glass }] },
        { key: "london", label: "London", offers: [{ kind: "solid", height: `6'8"`, widths: STD }, { kind: "glazed", height: `6'8"`, widths: STD, width_class: "std", glass: { "22x36": { clear: ["clear_lowe"] } } }] },
      ],
      sidelite_models: [
        { key: "flush", label: "Flush", direct_glazed: false, offers: [{ kind: "glazed", height: `6'8"`, glass: { "7x64": { clear: ["clear_lowe"] } } }] },
      ],
      designs: [{ name: "Chinchilla", group: "A" }],
    },
    fiberglass: {
      key: "fiberglass",
      label: "Fiberglass",
      default_frame_type: "textured",
      side_types: [{ key: "painted", label: "Painted" }, { key: "stained", label: "Stained" }],
      frame_depths: [
        { key: "4.625", label: `4-5/8"`, standard: true, frame_types: ["smooth", "textured"] },
        { key: "5.625", label: `5-5/8"`, standard: false, frame_types: ["smooth"] },
      ],
      sills: [{ key: "black_anodized", label: "Black anodized", not_with: [] }],
      handles: [],
      models: [{ key: "oak-flush", label: "Oak Flush", offers: [{ kind: "glazed", height: `6'8"`, widths: STD, width_class: "std", glass }] }],
      sidelite_models: [],
      designs: [],
    },
  },
};

function completeSteel(): PipelineSelection {
  const sel = emptySelection();
  Object.assign(sel, { material: "steel", frame_type: "smooth", width: 36, height: `6'8"`, configuration: "single", frame_depth: "4.625", model: "london" });
  sel.colours.exterior = { type: "painted", colour: "Black" };
  sel.colours.interior = { type: "white" };
  sel.glass.door = { glazed: true, size: "22x36", family: "clear", series: "clear_lowe" };
  sel.standard.lock = "double_bore";
  return sel;
}

describe("door pipeline filtering", () => {
  it("filters slab models by material, width and height", () => {
    const sel = { ...emptySelection(), material: "steel" as const, width: 36, height: `6'8"` };
    expect(availableModels(catalog, sel).map((m) => m.key)).toEqual(["flush", "london"]);
    expect(availableModels(catalog, { ...sel, width: 42 }).map((m) => m.key)).toEqual(["flush"]);
    expect(availableModels(catalog, { ...sel, height: `8'0"` }).map((m) => m.key)).toEqual(["flush"]);
    expect(availableModels(catalog, { ...sel, material: undefined })).toEqual([]);
  });

  it("hides smooth-only frame depths on a textured frame", () => {
    const sel = { ...emptySelection(), material: "fiberglass" as const, frame_type: "textured" as const };
    expect(frameDepths(catalog, sel).map((d) => d.key)).toEqual(["4.625"]);
    expect(frameDepths(catalog, { ...sel, frame_type: "smooth" }).map((d) => d.key)).toEqual(["4.625", "5.625"]);
  });

  it("offers only the finishes Palma builds", () => {
    const sel = { ...emptySelection(), material: "fiberglass" as const };
    expect(interiorTypes(catalog, sel, "painted").map((t) => t.key)).toEqual(["painted"]);
    expect(interiorTypes(catalog, sel, "stained").map((t) => t.key)).toEqual(["painted", "stained"]);
  });

  it("filters sills by frame depth", () => {
    const sel = { ...completeSteel(), frame_depth: "7.625" };
    expect(sills(catalog, sel).map((s) => s.key)).toEqual(["black_anodized"]);
  });
});

describe("step completion", () => {
  it("locks steps in order", () => {
    expect(firstIncomplete(catalog, emptySelection())).toBe(0);
    const sel = { ...emptySelection(), material: "steel" as const, frame_type: "smooth" as const };
    expect(firstIncomplete(catalog, sel)).toBe(1);
    expect(stepComplete(catalog, completeSteel()).every(Boolean)).toBe(true);
  });

  it("requires a lock prep choice", () => {
    const sel = completeSteel();
    delete sel.standard.lock;
    expect(firstIncomplete(catalog, sel)).toBe(6);
    sel.standard.lock = "multipoint";
    expect(firstIncomplete(catalog, sel)).toBe(6);
    sel.standard.handle = "Berkeley Gripset";
    expect(firstIncomplete(catalog, sel)).toBe(8);
  });

  it("builds a quote spec only when complete", () => {
    const sel = completeSteel();
    const spec = specFromSelection(catalog, sel, "Front");
    expect(spec).toMatchObject({ label: "Front", material: "steel", opening_type: "single_door", finish: "paint_1s" });
    expect(specFromSelection(catalog, { ...sel, model: undefined }, "Front")).toBeNull();
  });

  it("flags custom cut-downs", () => {
    const sel = completeSteel();
    sel.custom_size = { enabled: true, width_in: 35.5, height_in: 80 };
    expect(isCutDown(catalog, sel)).toBe(true);
    sel.custom_size = { enabled: true, width_in: 37, height_in: 80 };
    expect(firstIncomplete(catalog, sel)).toBe(1);
  });
});

describe("cascade re-validation", () => {
  it("clears a slab model the new size does not offer, and its glass", () => {
    const { selection, cleared } = normalizeSelection(catalog, { ...completeSteel(), width: 42 });
    expect(selection.model).toBeUndefined();
    expect(selection.glass.door).toEqual({});
    expect(cleared.some((text) => text.includes("London"))).toBe(true);
  });

  it("drops a glass size the new slab does not have", () => {
    const sel = completeSteel();
    sel.model = "flush";
    sel.glass.door = { glazed: true, size: "22x36", family: "clear", series: "clear_triple_dual_lowe" };
    const { selection, cleared } = normalizeSelection(catalog, sel);
    expect(selection.glass.door.series).toBe("clear_lowe");
    expect(cleared).toHaveLength(1);
  });

  it("resets the frame type default and clears finishes when the material changes", () => {
    const sel = completeSteel();
    const { selection } = normalizeSelection(catalog, { ...sel, material: "fiberglass", frame_type: "textured" });
    expect(selection.colours.interior).toBeUndefined(); // factory white is steel-only
    expect(selection.model).toBeUndefined();
  });

  it("adds and removes sidelite and transom slots with the configuration", () => {
    const { selection } = normalizeSelection(catalog, { ...completeSteel(), configuration: "single_1sl_transom" });
    expect(selection.glass.sidelites).toHaveLength(1);
    expect(selection.glass.transom).toMatchObject({ shape: "rectangle" });
    const back = normalizeSelection(catalog, { ...selection, configuration: "single" }).selection;
    expect(back.glass.sidelites).toHaveLength(0);
    expect(back.glass.transom).toBeUndefined();
  });

  it("removes extras whose condition no longer holds", () => {
    const sel = completeSteel();
    sel.configuration = "double";
    sel.standard.lock = "multipoint";
    sel.standard.handle = "Berkeley Gripset";
    sel.extras.tedee = true;
    sel.extras.astragal_lock = true;
    const single = normalizeSelection(catalog, { ...sel, configuration: "single", standard: { ...sel.standard, lock: "double_bore" } });
    expect(single.selection.extras.tedee).toBe(false);
    expect(single.selection.extras.astragal_lock).toBe(false);
    expect(single.selection.standard.handle).toBeUndefined();
    expect(single.cleared).toHaveLength(2);
  });

  it("resets a sill the new frame depth cannot take", () => {
    const sel = { ...completeSteel(), standard: { ...completeSteel().standard, sill: "outswing" }, frame_depth: "7.625" };
    const { selection, cleared } = normalizeSelection(catalog, sel);
    expect(selection.standard.sill).toBe("black_anodized");
    expect(cleared[0]).toMatch(/sill/i);
  });
});

describe("finish mapping and description", () => {
  it("maps colours to the price column", () => {
    const sel = completeSteel();
    expect(finishKey(sel)).toBe("paint_1s");
    sel.colours.interior = { type: "painted", colour: "black" };
    expect(finishKey(sel)).toBe("paint_2s_1c");
    const fg = { ...emptySelection(), material: "fiberglass" as const };
    fg.colours = { exterior: { type: "stained", colour: "Walnut" }, interior: { type: "painted", colour: "White" }, frame: { mode: "match" } };
    expect(finishKey(fg)).toBe("stain_out_paint_in");
  });

  it("describes a pipeline opening for the project list", () => {
    const spec = specFromSelection(catalog, completeSteel(), "Front") as unknown as DoorOpeningSpec;
    const text = describeDoorSpec(spec, { pipeline: catalog } as unknown as DoorCatalog);
    expect(text).toContain("London slab");
    expect(text).toContain("Double-bore prep");
  });
});

// The 2026-09-30 Palma audit additions, on a catalog extended with them.
const audit: PipelineCatalog = JSON.parse(JSON.stringify(catalog));
audit.heights.push({ key: `7'0"`, inches: 84 });
audit.glass_families.push(
  { key: "vented", label: "Vented unit", hint: "", flat_max: false, series: [{ key: "q550_clear", label: "Q550" }, { key: "elevation_clear", label: "Elevation" }, { key: "elevation_grills", label: "Elevation grilles" }] },
  { key: "sdl", label: "SDL", hint: "", flat_max: false, per_square: true, series: [{ key: "sdl_clear", label: "SDL clear" }] },
);
audit.multipoint_required = { materials: ["fiberglass"], heights: [`8'0"`] };
const steel = audit.materials.steel;
steel.frame_depths.push({ key: "6.625", label: `6-5/8"`, standard: true, frame_types: ["smooth", "textured"] });
steel.handles.push({ item: "Prep for EMTEK", label: "Prep for EMTEK", has_dummy: false, tedee: "no" });
steel.pull_bars = { styles: [{ key: "straight", label: "Straight" }], blocks: [{ key: "with_multipoint_lock", label: "with Multipoint Lock" }], lengths: [36, 72, 84], finishes: [{ key: "satin", label: "Satin" }], shapes: [{ key: "round", label: "Round" }] };
steel.extras = { fire_rating: true, accents: [], vertical_accent: null, reeded_accent: null, triple_glazing: true, glass_frames: [], screens: [], retractable_screen_depths: ["6.625", "7.25"] };
steel.models.push({ key: "4-panel-bt", label: "4-Panel BT", offers: [{ kind: "glazed", height: `6'8"`, widths: STD, width_class: "std", glass: { "22x10 Camber": { clear: ["clear_lowe"] } } }] });
const flushGlass = steel.models.find((model) => model.key === "flush")!.offers.find((offer) => offer.kind === "glazed") as { glass: Record<string, Record<string, string[]>> };
Object.assign(flushGlass.glass["22x64"], { vented: ["q550_clear", "elevation_clear", "elevation_grills"], sdl: ["sdl_clear"] });
audit.materials.fiberglass.models.push({ key: "smooth-slab", label: "Smooth", smooth: true, offers: [{ kind: "solid", height: `6'8"`, widths: STD }] });

describe("audit rules", () => {
  it("fills in fields older saved selections lack", () => {
    const old = completeSteel() as unknown as { extras: Record<string, unknown> };
    delete old.extras.casing;
    delete old.extras.operating_sidelite;
    const { selection } = normalizeSelection(audit, old as unknown as PipelineSelection);
    expect(selection.extras.casing).toBe(false);
    expect(selection.extras.operating_sidelite).toBe(0);
  });

  it("moves parse-artefact models to the real slab", () => {
    const sel = { ...completeSteel(), model: "camber-4-panel-bt" };
    sel.glass.door = { glazed: true, size: "22x10", family: "clear", series: "clear_lowe" };
    const { selection } = normalizeSelection(audit, sel);
    expect(selection.model).toBe("4-panel-bt");
    expect(selection.glass.door.size).toBe("22x10 Camber");
  });

  it("keeps a legacy vented unit in its own product line", () => {
    const sel = { ...completeSteel(), model: "flush" };
    sel.glass.door = { glazed: true, size: "22x64", family: "vented", series: "venting_elevation" };
    const { selection, cleared } = normalizeSelection(audit, sel);
    expect(selection.glass.door.series).toBe("elevation_clear");
    expect(cleared[0]).toMatch(/sub-type/);
  });

  it("needs the SDL square count before pricing", () => {
    const sel = { ...completeSteel(), model: "flush" };
    sel.glass.door = { glazed: true, size: "22x64", family: "sdl", series: "sdl_clear" };
    expect(firstIncomplete(audit, sel)).toBe(5);
    sel.glass.door.squares = 6;
    expect(firstIncomplete(audit, sel)).toBe(8);
  });

  it("handles pull bars, Tedee compatibility and retractable screens", () => {
    const sel = completeSteel();
    sel.standard.lock = "pull_bar";
    sel.standard.pull_bar = { style: "straight", length_in: 84, finish: "satin", shape: "round" };
    expect(firstIncomplete(audit, sel)).toBe(6); // lock hardware not chosen
    sel.standard.pull_bar.block = "with_multipoint_lock";
    const { selection, cleared } = normalizeSelection(audit, sel);
    expect(selection.standard.pull_bar?.length_in).toBe(72); // 84" bars are for 8' doors
    expect(cleared[0]).toMatch(/8'/);
    expect(tedeeAllowed(audit, selection)).toBe(true);
    expect(lockSummary(selection)).toBe('Pull bar: Straight 72"');

    const emtek = { ...completeSteel(), standard: { ...completeSteel().standard, lock: "multipoint" as const, handle: "Prep for EMTEK" } };
    emtek.extras.tedee = true;
    emtek.extras.screen = "white";
    const result = normalizeSelection(audit, emtek);
    expect(result.selection.extras.tedee).toBe(false);
    expect(result.selection.extras.screen).toBe("none"); // 4-5/8" jamb
    expect(normalizeSelection(audit, { ...emtek, frame_depth: "6.625", extras: { ...emtek.extras, tedee: false } }).selection.extras.screen).toBe("white");
  });

  it("applies the website rules: multipoint, no stain on smooth skins, custom colours", () => {
    expect(multipointRequired(audit, { ...emptySelection(), material: "fiberglass" })).toBe(true);
    expect(multipointRequired(audit, { ...completeSteel(), height: `8'0"` })).toBe(true);
    expect(multipointRequired(audit, completeSteel())).toBe(false);
    const fg = { ...emptySelection(), material: "fiberglass" as const, frame_type: "textured" as const, width: 36, height: `6'8"`, model: "smooth-slab" };
    fg.colours.exterior = { type: "stained", colour: "Teak" };
    const { selection, cleared } = normalizeSelection(audit, fg);
    expect(selection.colours.exterior).toBeUndefined();
    expect(cleared[0]).toMatch(/woodgrain/);
    const colours = completeSteel();
    colours.colours.interior = { type: "painted", colour: "Barn Red" };
    colours.colours.exterior = { type: "painted", colour: "G-525" };
    expect(customColours(colours)).toEqual(["Barn Red"]);
  });
});

describe("pull bar drawing", () => {
  it("keeps the bar to scale and inside the slab", () => {
    expect(pullBarTop(36, 80)).toBe(80 - (42 + 18)); // centred 42" off the floor
    expect(pullBarTop(84, 96)).toBe(6); // an 84" bar on an 8' slab
    expect(pullBarTop(72, 80)).toBeGreaterThanOrEqual(4);
  });
});
