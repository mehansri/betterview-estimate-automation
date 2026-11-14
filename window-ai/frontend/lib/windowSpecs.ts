/**
 * What every window line on an estimate says, stated once above the list; mirrors
 * shared_window_specs() and window_specs_box() in services/estimate_documents.py.
 *
 * Window descriptions are " - "-joined parts (services/descriptions.py): the collection and
 * product, size, sections, colours, glass, gas, jamb. With two or more lines, the parts every
 * line has and a collection name every first part starts with are shared; each line keeps the rest.
 */
export function sharedWindowSpecs(descriptions: string[]): { shared: string[]; own: string[] } {
  const split = descriptions.map((text) => String(text || "").split(" - ").map((part) => part.trim()).filter(Boolean));
  if (split.length < 2 || split.some((parts) => !parts.length)) return { shared: [], own: descriptions.map((text) => String(text || "")) };
  const common = split[0].slice(1).filter((part) => split.slice(1).every((parts) => parts.slice(1).includes(part)));
  // "Classic 3 1/4" (WC-100 series) casement window" / "... 2-section window unit": the collection.
  let prefix = split[0][0];
  for (const parts of split.slice(1)) {
    while (prefix && !parts[0].startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  prefix = prefix.includes(")") ? prefix.slice(0, prefix.lastIndexOf(")") + 1) : "";
  const usePrefix = prefix.length >= 8;
  const own = split.map((parts) => {
    let head = usePrefix ? parts[0].slice(prefix.length).trim() : parts[0];
    head = head.charAt(0).toUpperCase() + head.slice(1);
    return [head, ...parts.slice(1).filter((part) => !common.includes(part))].join(" - ");
  });
  return { shared: [...(usePrefix ? [prefix] : []), ...common], own };
}

/** The shared parts as label / value rows: "Exterior colour: black" as is, the collection first, glass and the rest together. */
export function sharedSpecRows(shared: string[]): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const loose: string[] = [];
  shared.forEach((part, index) => {
    const at = part.indexOf(": ");
    if (at > 0 && at <= 24) rows.push([part.slice(0, at), part.slice(at + 2)]);
    else if (index === 0 && part.includes("(")) rows.push(["Collection", part]);
    else if (/^WC-\d+/i.test(part)) rows.push(["Style", part]);
    else loose.push(part);
  });
  if (loose.length) rows.push(["Glass & options", loose.join(" · ")]);
  return rows;
}

const GROUP_MIN_LINES = 6;
const GROUP_MAX_GROUPS = 12;
const GROUP_MIN_AVERAGE = 2.5;

/** A location's levels ("Second floor · East · front elevation · N/201"); notes in brackets are dropped. */
function locationParts(location: string | null | undefined): string[] {
  const text = String(location || "").replace(/\s*\([^)]*\)/g, "").trim();
  return text.split(/\s*[·•|]\s*/).map((part) => part.trim()).filter(Boolean);
}

/**
 * Window lines grouped by where they are, for an estimate with many: [{ label, indexes }], or null to
 * keep one list. Mirrors window_groups() in services/estimate_documents.py: the most specific level of
 * the locations that groups well (6+ lines, 2-12 groups, 2.5+ lines a group, no more than one group, or a
 * quarter of them, a single window); groups in the order they first appear, lines without a location last.
 */
export function windowGroups(locations: Array<string | null | undefined>): Array<{ label: string; indexes: number[] }> | null {
  if (locations.length < GROUP_MIN_LINES) return null;
  const parts = locations.map(locationParts);
  const deepest = Math.max(0, ...parts.map((item) => item.length));
  for (let depth = deepest; depth > 0; depth -= 1) {
    const groups = new Map<string, number[]>();
    const labels = new Map<string, string>();
    parts.forEach((item, index) => {
      const label = item.slice(0, depth).join(" · ");
      const key = label.toLowerCase();
      if (!groups.has(key)) { groups.set(key, []); labels.set(key, label || "Other windows"); }
      groups.get(key)!.push(index);
    });
    const named = Array.from(groups.keys()).filter(Boolean);
    if (groups.size < 2 || groups.size > GROUP_MAX_GROUPS || locations.length / groups.size < GROUP_MIN_AVERAGE) continue;
    if (named.filter((key) => groups.get(key)!.length === 1).length > Math.max(1, 0.25 * named.length)) continue;
    const ordered = [...named, ...(groups.has("") ? [""] : [])];
    return ordered.map((key) => ({ label: labels.get(key)!, indexes: groups.get(key)! }));
  }
  return null;
}

/** A line's own text as its window type (shown bold) and the rest, " · "-joined. */
export function windowLineParts(text: string): { type: string; detail: string } {
  const [type, ...rest] = text.split(" - ");
  return { type: type || "", detail: rest.join(" · ") };
}
