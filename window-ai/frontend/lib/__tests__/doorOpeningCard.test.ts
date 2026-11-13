import { describe, expect, it } from "vitest";
import { doorCardHeading, doorParts } from "@/components/estimate/DoorOpeningCard";

describe("door card on the estimate (as door_card() in estimate_documents.py)", () => {
  it("leads with the door type, keeps 'To supply and install' and names the location, never the order summary", () => {
    const opening = {
      scope: "To supply and install: Single door with 2 sidelites and transom",
      label: "Fiberglass - 36\" x 6'8\" - Single + 2 sidelites + transom - Oak 6-Panel slab",
      location: "Front entry",
      material: "fiberglass",
      finish_label: "Stain 2 Sides, 1 Colour",
    };
    expect(doorCardHeading(opening, 1)).toEqual({
      kicker: "Item 1 · Front entry",
      title: "Single door with 2 sidelites and transom",
      sub: "To supply and install · Fiberglass · Stain 2 Sides, 1 Colour",
    });
    expect(doorCardHeading({ ...opening, location: "" }, 2).kicker).toBe("Item 2");
  });

  it("falls back to the label on doors priced before scope lines", () => {
    const heading = doorCardHeading({ label: "Steel entry door", location: "Side", material: "steel", finish_label: "Paint 1 Side" }, 3);
    expect(heading).toEqual({ kicker: "Item 3 · Side", title: "Steel entry door", sub: "Steel · Paint 1 Side" });
  });

  it("lists every part, with × qty only when more than one", () => {
    const items = [
      { description: "Orleans solid slab 36\" x 6'8\"", qty: 1, unit_price: 0, line_total: 0 },
      { description: "Regular 2\" Brickmould", qty: 3, unit_price: 0, line_total: 0 },
      { description: "", qty: 1, unit_price: 0, line_total: 0 },
    ];
    expect(doorParts({ items })).toEqual(["Orleans solid slab 36\" x 6'8\"", "Regular 2\" Brickmould × 3"]);
  });
});
