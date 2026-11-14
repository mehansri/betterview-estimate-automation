import { describe, expect, it } from "vitest";
import { windowGroups } from "@/lib/windowSpecs";

// Same cases as test_window_groups_by_where_the_windows_are (window_groups() in the PDF).
const summary = (groups: ReturnType<typeof windowGroups>) => groups?.map((group) => [group.label, group.indexes.length]) ?? null;

describe("window groups by location", () => {
  it("groups a side with a note by the side, in the order they first appear", () => {
    const sides = [...Array(4).fill("North side (left)"), ...Array(8).fill("South side (right)")];
    expect(summary(windowGroups(sides))).toEqual([["North side", 4], ["South side", 8]]);
  });

  it("drops a level that leaves many lone windows: floor · elevation · tag groups by floor", () => {
    const levels = [
      ...[0, 1, 2, 3, 4].map((i) => `Second floor · East · front elevation · N/20${i}`),
      ...[0, 1, 2, 3, 4].map((i) => `Second floor · West · back elevation · T/23${i}`),
      ...[0, 1, 2].map((i) => `Ground floor · East · front elevation · A/10${i}`),
      "Ground floor · South · left elevation · B/110",
      "Basement · North · right elevation · CC/001",
    ];
    expect(summary(windowGroups(levels))).toEqual([["Second floor", 10], ["Ground floor", 4], ["Basement", 1]]);
  });

  it("leaves one window a room, and short lists, as one list; lines without a location go last", () => {
    expect(windowGroups(["Kitchen", "Den", "Living room", "Basement", "Attic", "Primary bedroom", "Primary bedroom"])).toBeNull();
    expect(windowGroups(["North", "North", "North", "South", "South"])).toBeNull();
    const groups = windowGroups(["Front", "Front", "Front", "Front", "", "Back", "Back", "Back", "Back"])!;
    expect(groups[groups.length - 1]).toEqual({ label: "Other windows", indexes: [4] });
  });
});
