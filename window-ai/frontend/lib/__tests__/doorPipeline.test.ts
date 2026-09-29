import { describe, expect, it } from "vitest";
import {
  availableModels,
  emptySelection,
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
