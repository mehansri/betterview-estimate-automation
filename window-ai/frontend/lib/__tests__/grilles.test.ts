import { describe, expect, it } from "vitest";
import { grilleFields, grillesSpec } from "@/lib/productOptions";
import { describeWindowSpec, grilleText } from "@/lib/productDescriptions";

describe("grilles", () => {
  it("builds the engine field from the finish choice", () => {
    expect(grillesSpec({ grille_style: "" })).toBeNull();
    expect(grillesSpec({ grille_style: "colonial", grille_colour: "black", grille_across: 2, grille_down: 3 }))
      .toEqual({ style: "colonial", colour: "black", across: 2, down: 3, squares: 6 });
  });

  it("reads a saved line back into the finish fields", () => {
    expect(grilleFields({ style: "sdl classic", colour: "two-tone", across: 3, down: 2, squares: 6 }))
      .toEqual({ grille_style: "sdl", grille_colour: "two-tone", grille_across: 3, grille_down: 2 });
    expect(grilleFields(undefined)).toEqual({ grille_style: "", grille_colour: "white", grille_across: 2, grille_down: 2 });
  });

  it("describes grilles the way services/descriptions.py does", () => {
    expect(grilleText({ style: "colonial", colour: "black", across: 2, down: 2, squares: 4 })).toBe("Colonial grilles 2 x 2, black");
    expect(grilleText({ style: "sdl", colour: "white", squares: 6 })).toBe("Simulated divided lite grilles 6 squares, white");
    const spec = { type: "window" as const, style: "WC-175", width: 30, height: 60, grilles: { style: "georgian", colour: "white", across: 2, down: 3, squares: 6 } };
    expect(describeWindowSpec(spec)).toContain("Georgian grilles 2 x 3, white");
  });
});
