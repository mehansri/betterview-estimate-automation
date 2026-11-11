import { describe, expect, it } from "vitest";
import { claudeInches, claudeRowLocation, claudeStyleFor, readClaudeHandoff } from "@/lib/claudeHandoff";
import type { LayoutPreset, LayoutSeries } from "@/lib/windowLayout";

function fragment(value: unknown) {
  return `#claude=${Buffer.from(JSON.stringify(value), "utf8").toString("base64url")}`;
}

const layout = {
  default_series: "classic",
  series: [{ id: "classic", label: "Classic", operations: [], styles: { casement: "WC-100", awning: "WC-125", fixed: "WC-175" } }] as LayoutSeries[],
  presets: [{ id: "twin_casement" }, { id: "C3" }] as unknown as LayoutPreset[],
};

describe("readClaudeHandoff", () => {
  it("reads the CRM's windows, colours and glazing", () => {
    const handoff = readClaudeHandoff(fragment({
      id: "draft-1",
      windows: [
        { location: "Cuisine (kitchen)", type: "awning", width: 36, height: 24, qty: 2 },
        { location: "Living room", type: "casement", width: 30.5, height: 60, qty: 1, hinge: "right", roughOpening: true, note: "grilles 2x3" },
      ],
      colourExt: "Black",
      colourInt: "white",
      triple: true,
    }));
    expect(handoff).toEqual({
      id: "draft-1",
      windows: [
        { location: "Cuisine (kitchen)", type: "awning", width: 36, height: 24, qty: 2, hinge: null, roughOpening: false, note: "" },
        { location: "Living room", type: "casement", width: 30.5, height: 60, qty: 1, hinge: "right", roughOpening: true, note: "grilles 2x3" },
      ],
      colourExt: "black",
      colourInt: "white",
      triple: true,
    });
  });

  it("keeps accented room names", () => {
    expect(readClaudeHandoff(fragment({ id: "d", windows: [{ location: "Salle à manger", type: "fixed", width: 48, height: 60, qty: 1 }] }))?.windows[0].location).toBe("Salle à manger");
  });

  it("drops windows without a size or type, and unknown colours", () => {
    const handoff = readClaudeHandoff(fragment({
      id: "d",
      windows: [{ type: "fixed", width: 0, height: 60 }, { type: "", width: 30, height: 30 }, { type: "fixed", width: 30, height: 30, qty: 500 }],
      colourExt: "purple",
    }));
    expect(handoff?.windows).toHaveLength(1);
    expect(handoff?.windows[0].qty).toBe(99);
    expect(handoff?.colourExt).toBeNull();
    expect(handoff?.triple).toBeNull();
  });

  it("returns null for no hand-off or a garbled one", () => {
    expect(readClaudeHandoff("")).toBeNull();
    expect(readClaudeHandoff("#other=1")).toBeNull();
    expect(readClaudeHandoff("#claude=not-json")).toBeNull();
    expect(readClaudeHandoff(fragment({ id: "d", windows: [] }))).toBeNull();
    expect(readClaudeHandoff(fragment({ windows: [{ type: "fixed", width: 30, height: 30 }] }))).toBeNull();
  });
});

describe("claudeStyleFor", () => {
  it("maps single types to the default series and combinations to presets", () => {
    expect(claudeStyleFor("casement", layout)).toBe("WC-100");
    expect(claudeStyleFor("awning", layout)).toBe("WC-125");
    expect(claudeStyleFor("twin_casement", layout)).toBe("preset:twin_casement");
    expect(claudeStyleFor("fixed_plus_casement", layout)).toBe("preset:C3");
  });

  it("returns empty when the catalog has no match", () => {
    expect(claudeStyleFor("double_hung", layout)).toBe("");
    expect(claudeStyleFor("fixed_over_awning", layout)).toBe("");
    expect(claudeStyleFor("casement", null)).toBe("");
  });
});

describe("claudeRowLocation", () => {
  const base = { location: "Kitchen", type: "casement", width: 30, height: 60, qty: 1, hinge: null, roughOpening: false, note: "" } as const;
  it("adds the hinge side and note", () => {
    expect(claudeRowLocation({ ...base, hinge: "right", note: "obscure glass" }, "WC-100")).toBe("Kitchen · hinge right · obscure glass");
  });
  it("leaves the hinge out when the line carries it", () => {
    expect(claudeRowLocation({ ...base, hinge: "right" }, "WC-100", true)).toBe("Kitchen");
  });
  it("flags a type the sheet couldn't match", () => {
    expect(claudeRowLocation({ ...base, type: "double_hung" }, "")).toBe("Kitchen · double hung?");
  });
});

describe("claudeInches", () => {
  it("rounds to the nearest eighth", () => {
    expect(claudeInches(35.5)).toBe("35.5");
    expect(claudeInches(29.99)).toBe("30");
    expect(claudeInches(24.0625)).toBe("24.125");
  });
});
