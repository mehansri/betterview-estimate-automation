import { describe, expect, it } from "vitest";
import { doorOptionTiers, isDoorOption } from "@/components/estimate/OptionTiersCard";
import { doorOptionCards, doorOptionKicker } from "@/components/estimate/DoorOptions";
import type { CustomerDoorOpening, DoorOptionOpening, DoorOptions } from "@/lib/api";

const door = (id: string, description: string): CustomerDoorOpening => ({ id, location: "Front entry", description, spec: {} as CustomerDoorOpening["spec"] });

describe("doors offered as options", () => {
  it("makes one option per picked door; unpicked doors are in every option", () => {
    const doors = [door("a", "Steel — Plain Black"), door("b", "Fiberglass — Grooves"), door("side", "Side door")];
    let n = 0;
    const tiers = doorOptionTiers(doors, ["a", "b"], () => `t${++n}`);
    expect(tiers.map((tier) => [tier.name, tier.description, tier.door_ids])).toEqual([
      ["Option A", "Steel — Plain Black", ["a", "side"]],
      ["Option B", "Fiberglass — Grooves", ["b", "side"]],
    ]);
    expect(tiers.every(isDoorOption)).toBe(true);
    expect(isDoorOption({ door_ids: null })).toBe(false);
  });

  it("shows each option's own door, and tags a shared door as in every option", () => {
    const opening = (id: string, options: string[], every = false) => ({
      id, location: "Front entry", label: "", material: "steel", finish_label: "", items: [], subtotal: 0, hst: 0, total: 0,
      options: options.map((name) => ({ id: name, name: `Option ${name.toUpperCase()}` })), in_every_option: every,
    }) as unknown as DoorOptionOpening;
    const options: DoorOptions = { option_ids: ["a", "b"], openings: [opening("d1", ["a"]), opening("d2", ["b"]), opening("side", ["a", "b"], true)] };
    const cards = doorOptionCards(options, [{ id: "a", name: "Option A", description: "", subtotal: 1 }, { id: "b", name: "Option B", description: "", subtotal: 2 }]);
    expect(cards.map(({ tier, doors }) => [tier.id, doors.map((d) => d.id)])).toEqual([["a", ["d1"]], ["b", ["d2"]]]);
    expect(doorOptionKicker(options.openings[0], 1)).toBe("Option A · Front entry");
    expect(doorOptionKicker(options.openings[2], 3)).toBe("Item 3 · Front entry · in every option");
  });
});
