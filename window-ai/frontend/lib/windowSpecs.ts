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

/** A line's own text as its window type (shown bold) and the rest, " · "-joined. */
export function windowLineParts(text: string): { type: string; detail: string } {
  const [type, ...rest] = text.split(" - ");
  return { type: type || "", detail: rest.join(" · ") };
}
