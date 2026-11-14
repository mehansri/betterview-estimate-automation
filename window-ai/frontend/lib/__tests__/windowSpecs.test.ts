import { describe, expect, it } from "vitest";
import { sharedSpecRows, sharedWindowSpecs, windowLineParts } from "@/lib/windowSpecs";

// Same cases as test_window_specs_every_line_shares_are_stated_once (shared_window_specs() in the PDF).
describe("window specs every line shares", () => {
  const common = 'Exterior colour: black - Interior colour: black - LoE 180 - Argon gas - 5 1/2" primed wood jamb';

  it("states the collection, colours, glass and jamb once; each line keeps its type, size and sections", () => {
    const { shared, own } = sharedWindowSpecs([
      `Classic 3 1/4" (WC-100 series) 2-section window unit - 42.125 x 144 in - Fixed / Fixed - ${common}`,
      `Classic 3 1/4" (WC-100 series) casement (left) window - 24 x 72 in - ${common}`,
    ]);
    expect(shared).toEqual(['Classic 3 1/4" (WC-100 series)', "Exterior colour: black", "Interior colour: black", "LoE 180", "Argon gas", '5 1/2" primed wood jamb']);
    expect(own).toEqual(["2-section window unit - 42.125 x 144 in - Fixed / Fixed", "Casement (left) window - 24 x 72 in"]);
    expect(sharedSpecRows(shared)).toEqual([
      ["Collection", 'Classic 3 1/4" (WC-100 series)'], ["Exterior colour", "black"], ["Interior colour", "black"],
      ["Glass & options", 'LoE 180 · Argon gas · 5 1/2" primed wood jamb'],
    ]);
    expect(windowLineParts(own[0])).toEqual({ type: "2-section window unit", detail: "42.125 x 144 in · Fixed / Fixed" });
  });

  it("keeps parts only some windows have on their lines, and a lone window as it is", () => {
    const { shared, own } = sharedWindowSpecs(["Casement - 24 x 72 in - LoE 180", "Awning - 30 x 20 in - Triple pane"]);
    expect(shared).toEqual([]);
    expect(own[1]).toBe("Awning - 30 x 20 in - Triple pane");
    expect(sharedWindowSpecs(["Casement - 24 x 72 in - LoE 180"])).toEqual({ shared: [], own: ["Casement - 24 x 72 in - LoE 180"] });
    // A style code shared by every line gets its own row, not "Glass & options".
    expect(sharedSpecRows(["WC-100", "LoE 180"])).toEqual([["Style", "WC-100"], ["Glass & options", "LoE 180"]]);
  });
});
