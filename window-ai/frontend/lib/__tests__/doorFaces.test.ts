import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { doorFace, panelOutline, panelTop, slabDesigns, withoutGlass, type FacePanel } from "../doorFaces";
import data from "../doorFaces.data.json";
// Every model's face as services/doors/faces.py resolves it (tests/test_door_faces.py keeps this file current).
import expected from "./doorFaces.expected.json";

describe("door faces", () => {
  it("reads the same library as the server", () => {
    const config = JSON.parse(readFileSync(join(__dirname, "../../../config/door_faces.json"), "utf8"));
    expect(data).toEqual(config);
  });

  it("resolves every model and pattern exactly as the server does", () => {
    for (const [key, face] of Object.entries(expected as Record<string, unknown>)) {
      const [material, model, pattern] = key.split("/");
      expect(doorFace(material, model, pattern || null), key).toEqual(face);
    }
  });

  it("offers patterns only on the Grooved and Stainless Steel Oak slabs", () => {
    expect(slabDesigns("fiberglass", "contemporary-grooved-og-gr").map((d) => d.code)).toEqual(["WC01", "WC02", "WC03", "WC04", "WC05", "WC06", "WC07"]);
    expect(slabDesigns("steel", "london")).toEqual([]);
    expect(doorFace("steel", "no-such-door")).toBeNull();
  });

  it("lets glass take a panel's place but not a panel it only clips", () => {
    const london = doorFace("steel", "london")!.elements;
    expect(withoutGlass(london, [{ x: 7, y: 8, w: 22, h: 36 }], 36, 80)).toHaveLength(1);
    const blankTop = doorFace("steel", "4-panel-bt")!.elements;
    expect(withoutGlass(blankTop, [{ x: 7, y: 8, w: 22, h: 11 }], 36, 80)).toHaveLength(4);
  });

  it("curves arch tops down to the corners", () => {
    const arch = doorFace("fiberglass", "2-panel-arch-top-dra2d")!.elements[0] as FacePanel;
    expect(panelTop(arch, arch.x + arch.w / 2)).toBeCloseTo(arch.y);
    expect(panelTop(arch, arch.x)).toBeGreaterThan(arch.y);
    const outline = panelOutline(arch, 36, 80);
    expect(outline).toHaveLength(19);
    expect(outline[0][0]).toBeCloseTo(arch.x * 36);
    expect(outline[0][1]).toBeCloseTo(arch.y * 80 + arch.h * 80);
  });
});
