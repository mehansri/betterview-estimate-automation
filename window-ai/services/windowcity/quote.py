"""Pricing engine: spec dict -> priced quote with per-line breakdowns.

Spec shape (JSON):
{
  "defaults": {            # order-level defaults inherited by every line
    "colour_ext": "black", "glazing": {...}, "accessories": [...]
  },
  "lines": [
    {"type": "window", "style": "WC-100", "width": 30, "height": 60, "qty": 2,
     "colour_ext": "white", "colour_int": "white",
     "glazing": {"loe180": true, "i89": false, "gas": "argon",
                  "triple": false, "tri_pane_lami": false, "frost_tint": false},
     "adders": ["egress"],                       # per-style $ notes
     "accessories": [{"kind": "brickmould", "name": "1\" brickmould (classic)"},
                      {"kind": "pvc_jamb", "name": "3 3/8\""}],
     "shape": {"family": "architectural", "name": "half round"},
     "mull": {"cols": 2, "rows": 1}},            # this line is one lite of a
                                                  # combination? no — see below
    {"type": "combination", "layout": {"cols": 2, "rows": 1},
     "lites": [ {window line}, {window line} ]},
    {"type": "unit", "series": "classic", "width": 72, "height": 60,
     "layout": {"split": "cols", "sizes": ["*", "*", "*"], "children": [
         {"op": "casement", "hinge": "left"}, {"op": "fixed"},
         {"op": "casement", "hinge": "right"}]}},   # see layout.py
    {"type": "patio_sliding", "nominal_ft": 6, "assembled": true, ...},
    {"type": "patio_swing", "kind": "single", "width": 34, "height": 82, ...},
    {"type": "bay_bow", "lites": [...], "head_seat": "up to 8ft wide", ...}
  ]
}

Every priced component carries the config discount chain:
list -> x discount x price_multiplier (x item_discount for keyed options)
-> + install -> x (1+markup) -> x (1+hst).
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from . import catalog, layout
from .catalog import CatalogError

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"

GAS_KEYS = {"argon": "argon", "argon_krypton_5050": "argon_krypton_5050",
            "krypton": "krypton", "90/5": "argon_krypton_5050",
            "50/50": "argon_krypton_5050"}
GAS_LABELS = {"argon": "argon", "argon_krypton_5050": "50/50 argon/krypton",
              "krypton": "krypton"}


def load_config(overrides: dict | None = None) -> dict:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        cfg = json.load(f)
    for k, v in (overrides or {}).items():
        if isinstance(v, dict) and isinstance(cfg.get(k), dict):
            cfg[k].update(v)
        else:
            cfg[k] = v
    return cfg


class Component:
    """One priced piece of a line: (label, list_amount, discount_key)."""

    def __init__(self, label: str, amount: float, discount_key: str | None = None,
                 factor: float | None = None):
        self.label = label
        self.amount = round(amount, 2)
        self.discount_key = discount_key
        # A product billed at its own dealer factor instead of 'discount'
        # (WC-500 patio doors: 0.81 of list, see config engine.patio).
        self.factor = factor

    def dealer(self, cfg: dict) -> float:
        mult = (self.factor if self.factor is not None else cfg["discount"]) * cfg["price_multiplier"]
        if self.discount_key:
            mult *= cfg["item_discounts"].get(self.discount_key, 1.0)
        return round(self.amount * mult, 2)


def _merged(defaults: dict, line: dict) -> dict:
    out = dict(defaults or {})
    for k, v in line.items():
        if k == "glazing" and isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = {**out[k], **v}
        elif k == "accessories" and out.get(k) and v is not None:
            out[k] = v  # line list replaces default list entirely
        else:
            out[k] = v
    return out


def interior_matches(line: dict) -> bool:
    """True for a matching exterior/interior colour (black in / black out).

    Window City only offers an interior capstock as the same colour inside and
    out, so any other non-white interior is a spec error, never a free option.
    """
    exterior = str(line.get("colour_ext") or "white").strip().lower()
    interior = str(line.get("colour_int") or "white").strip().lower()
    if interior in ("", "white"):
        return False
    if interior != exterior:
        raise CatalogError(
            f"{interior} interior needs a {interior} exterior: Window City offers an interior "
            f"colour only as matching {interior} in / {interior} out")
    return True


def _area_sqft(w: float, h: float, cfg: dict) -> float:
    if cfg["engine"]["sqft_rounding"] == "even_inch":
        import math
        w = math.ceil(w / 2) * 2
        h = math.ceil(h / 2) * 2
    return w * h / 144.0


def price_window(line: dict, cfg: dict, warnings: list[str],
                 in_combination: bool = False,
                 assembly_bm_width: float = 0.0) -> list[Component]:
    s = catalog.style(line["style"])
    w, h = float(line["width"]), float(line["height"])

    # A brickmould grows the *billed* size to the BM outer dimensions and the
    # accessory footage to the BM outer loop (2(W+H) + 8x width). Confirmed to
    # the cent on Cantor order 125401159. Combination lites grow by the
    # *assembly* brickmould instead (their nominal division + 2x BM, ignoring
    # the 0.025" coupler deduction) while the BM footage wraps the assembly
    # once — confirmed on C3/C5/F5/AW5 in order 125401186.
    bm_rows = [catalog.accessory_row(a)
               for a in line.get("accessories", []) if a["kind"] == "brickmould"]
    own_bm = 0.0
    if bm_rows:
        import re as _re
        m = _re.match(r"([\d/ .]+)\"", bm_rows[0]["name"])
        own_bm = catalog.inches(m.group(1) + '"') if m else 1.0
    # Older saved combinations kept the brickmould on each lite; those lites
    # still grow, and footage stays per lite as before.
    bm_width = 0.0 if in_combination else own_bm
    growth = max(assembly_bm_width, own_bm) if in_combination else own_bm
    bw, bh = w + 2 * growth, h + 2 * growth
    sqft = _area_sqft(bw, bh, cfg)
    billed = max(sqft, 6.0)
    tier, over12 = catalog.tier_for(s, billed)

    comps: list[Component] = []

    def cell(col):
        # Over 12 sqft every column is the '>12' per-sqft rate x full area —
        # confirmed to the cent against Cantor order 125401135 (2026-08-04).
        # (For option columns this equals the tier table either way, since
        # their min-6 charge is exactly 6x the rate.)
        if over12 is not None:
            return over12[col] * billed
        return tier[col]

    comps.append(Component(f"{s['code']} {s['name'].title()} {w:g}x{h:g} "
                           f"({sqft:.1f} sqft) base white", cell("base_white")))

    gl = line.get("glazing") or {}
    if gl.get("loe180") and gl.get("i89"):
        comps.append(Component("LoE 180 with i89", cell("loe180_i89")))
    elif gl.get("loe180"):
        # triple package carries LoE on both outer panes (3loe/clr/3loe);
        # Cantor bills the column once per coated pane (order 125401159)
        panes = cfg["engine"].get("triple_loe_panes", 2) if gl.get("triple") else 1
        label = "LoE 180" if panes == 1 else f"LoE 180 x{panes} panes"
        comps.append(Component(label, cell("loe180") * panes))
    gas = gl.get("gas")
    if gas:
        key = GAS_KEYS.get(str(gas).lower())
        if key is None:
            raise CatalogError(f"unknown gas {gas!r}; use argon, 50/50 or krypton")
        comps.append(Component({"argon": "Argon", "argon_krypton_5050":
                                "50% Argon / 50% Krypton (90/5 mix billed as)",
                                "krypton": "Krypton"}[key], cell(key), key))
    if gl.get("triple"):
        comps.append(Component("Triple pane upcharge", cell("triple_pane_upcharge"),
                               "triple_pane_upcharge"))
    if gl.get("tri_pane_lami"):
        comps.append(Component("Tri-pane (1 side laminated)", cell("tri_pane_lami")))
    if gl.get("frost_tint"):
        comps.append(Component("Frost or tint", cell("frost_or_tint")))

    # Past ~35 sqft the sealed unit needs 6mm glass; Cantor bills it at
    # $8.00/sqft list (calibrated from order 125401135: 72x72 = 36 sqft ->
    # $288.00). Smaller auto-thickness bumps (4mm at ~20-25 sqft) are free.
    oversize = cfg["engine"].get("oversize_glass", {"threshold_sqft": 35,
                                                    "rate_sqft": 8.0})
    if billed > oversize["threshold_sqft"]:
        if gl.get("triple") or gl.get("tri_pane_lami"):
            warnings.append(
                f"{s['code']} {w:g}x{h:g}: {billed:.1f} sqft exceeds the "
                f"{oversize['threshold_sqft']} sqft triple-pane glass limit — "
                "confirm with Window City")
        else:
            comps.append(Component(
                f"Oversize glass 6mm ({billed:.1f} sqft @ "
                f"{oversize['rate_sqft']:.2f})",
                oversize["rate_sqft"] * billed))

    # Colour: Cantor bills the capstock upcharge on the BASE column only, at
    # 3/4 of the book's printed percentage (Jet Black: book 20% -> billed 15%
    # of base; exact on order 125401159). Only the black/20% case is
    # price-verified; pct_scale applies to all until another colour is tested.
    colour = (line.get("colour_ext") or "white")
    int_too = interior_matches(line)
    try:
        pct = catalog.colour_pct(s, colour, interior_too=int_too)
    except CatalogError:
        if not int_too:
            raise
        offered = [row["code"] for row in catalog.styles()
                   if any(cu.get("interior_and_exterior") for cu in row["colour_upcharges"])]
        raise CatalogError(
            f"{colour} interior is not offered on {s['code']} {s['name'].title()}; "
            f"black in / black out is offered on {', '.join(offered)}") from None
    if pct:
        ccfg = cfg["engine"].get("colour", {"base": "base_only", "pct_scale": 0.75})
        eff = pct * ccfg.get("pct_scale", 1.0)
        base_amt = (comps[0].amount if ccfg.get("base") == "base_only"
                    else sum(c.amount for c in comps))
        name = f"{colour} in/out" if int_too else colour
        comps.append(Component(
            f"Colour {name} ({eff * 100:g}% of base)", base_amt * eff))

    for frag in line.get("adders", []):
        a = catalog.style_adder(s, frag)
        comps.append(Component(a["name"].strip(": "), a["amount"]))

    comps += _accessory_components(line.get("accessories", []), w, h, bm_width, bool(pct), cfg)

    if line.get("shape"):
        sh = catalog.shape_charge(line["shape"]["family"], line["shape"]["name"])
        comps.append(Component(f"Shape charge: {sh['name']} (frame)",
                               sh["charges"]["vinyl_frame"]))
        for acc in line.get("accessories", []):
            key = {"brickmould": "brickmould", "pvc_jamb": "vinyl_jamb",
                   "wood_jamb": "wood_jamb", "pvc_casing": "vinyl_casing"}.get(acc["kind"])
            if key and sh["charges"].get(key):
                comps.append(Component(f"Shape charge: {sh['name']} ({key})",
                                       sh["charges"][key]))

    _check_limits(s, w, h, gl, warnings)
    return comps


def _brickmould_width(accessories: list[dict]) -> float:
    for acc in accessories:
        if acc["kind"] == "brickmould":
            row = catalog.accessory_row(acc)
            import re as _re
            m = _re.match(r"([\d/ .]+)\"", row["name"])
            return catalog.inches(m.group(1) + '"') if m else 1.0
    return 0.0


def _accessory_components(accessories: list[dict], w: float, h: float, bm_width: float,
                          coloured: bool, cfg: dict) -> list[Component]:
    """Lineal-foot accessories around a W x H frame (a window or a whole assembly)."""
    comps: list[Component] = []
    for acc in accessories:
        row = catalog.accessory_row(acc)
        lf = acc.get("lineal_ft") or round(
            (2 * (w + h) + 8 * bm_width
             + cfg["engine"]["accessory_footage_allowance_in"]) / 12.0, 2)
        white_lf, colour_lf = row["price_white_lf"], row.get("price_colour_lf")
        if acc["kind"] == "brickmould":
            # Cantor's installed 1" Classic BM is profile EP326 at 5.00/5.60
            # per lf, not the book's EP-226 4.00/4.60 row (order 125401159)
            ov = cfg["engine"].get("brickmould_override")
            if ov:
                white_lf, colour_lf = ov["rate_white_lf"], ov["rate_colour_lf"]
        elif acc["kind"] == "misc" and "nailing flange" in row["name"].lower():
            # Window City bills the flange $1/lf above the book's 2.00 row
            # (order 125401151)
            ov = cfg["engine"].get("nailing_flange_override")
            if ov:
                white_lf, colour_lf = ov["rate_white_lf"], ov["rate_colour_lf"]
        rate = colour_lf if (coloured and colour_lf) else white_lf
        comps.append(Component(f"{_accessory_label(acc, row)} {lf:.2f} lf @ {rate:.2f}", lf * rate))
    return comps


def _accessory_label(acc: dict, row: dict) -> str:
    """Catalog row name; a custom-depth wood jamb also shows its depth."""
    if acc.get("kind") == "wood_jamb" and acc.get("depth_in") is not None             and row["name"].lower().startswith("custom"):
        return f"{float(acc['depth_in']):g}\" wood jamb ({row['name']})"
    return row["name"]


def _check_limits(s: dict, w: float, h: float, gl: dict, warnings: list[str]):
    triple = gl.get("triple") or gl.get("tri_pane_lami")
    wanted = ("triple" if triple else "double")
    for row in s["sizes"]:
        label = (row["label"] or "").lower()
        if not row["ranges"]:
            continue
        if (wanted == "double") != label.startswith("double"):
            continue
        rngs = row["ranges"]
        w_ok = any(r["min"] <= w <= r["max"] for r in rngs[0::2])
        h_ok = any(r["min"] <= h <= r["max"] for r in rngs[1::2])
        if not (w_ok and h_ok):
            warnings.append(
                f"{s['code']} {w:g}x{h:g} outside printed {wanted} range "
                f"{row['raw']!r} (book p.{s['source_page_book']}) — Cantor "
                "may refuse or void warranty")
        return
    warnings.append(f"{s['code']}: no printed size row for {wanted} glazing")


def _mullion_components(lines: list, total_w: float, total_h: float, side_by_side: int,
                        cfg: dict, warnings: list[str]) -> list[Component]:
    """Steel-reinforced mullions per the book 64-65 chart.

    The chart triggers on the overall unit (height > 66 and width past 72, or
    108 with 3+ units side by side). Order 125401186 (AW5, 72x72) reinforced
    the horizontal joint at exactly 72 wide, so the width test is inclusive,
    and Window City billed it as the 1" EP-155 profile rather than the book's
    2" EP-156 -- the horizontal profile/rate comes from config. Only joints
    that run the full height (vertical) or full width (horizontal) of the
    unit are reinforced; AW5's short joint between the two awnings was not.
    """
    wide_limit = 108.0 if side_by_side >= 3 else 72.0
    if not (total_h > 66.0 and total_w >= wide_limit):
        return []
    mcfg = cfg["engine"].get("mullion", {})
    comps: list[Component] = []
    v_lf = h_lf = 0.0
    for line in lines:
        full = total_h if line.orient == "v" else total_w
        if line.length < full - layout.EPS:
            if line.length > 66.0:
                warnings.append(
                    f"{line.length:g}\" {'vertical' if line.orient == 'v' else 'horizontal'} "
                    "joint does not span the whole unit and was not reinforced; "
                    "confirm the mullion with Window City")
            continue
        if line.orient == "v":
            v_lf += line.length / 12.0
        else:
            h_lf += line.length / 12.0
    if v_lf:
        comps.append(Component(f"1\" vertical reinforcement mullion {v_lf:.2f} lf",
                               v_lf * catalog.mullion_lf_price("vertical")))
    if h_lf:
        rate = mcfg.get("horizontal_rate_lf") or catalog.mullion_lf_price("horizontal")
        label = mcfg.get("horizontal_label", "2\" horizontal reinforcement mullion")
        comps.append(Component(f"{label} {h_lf:.2f} lf", h_lf * rate))
    return comps


def _assembly_accessories(line: dict, fallback_colour: str, w: float, h: float,
                          cfg: dict) -> list[Component]:
    accessories = line.get("accessories") or []
    if not accessories:
        return []
    colour = str(line.get("colour_ext") or fallback_colour or "white").lower()
    sub = _accessory_components(accessories, w, h, _brickmould_width(accessories),
                                colour not in ("", "white"), cfg)
    for c in sub:
        c.label = f"assembly: {c.label}"
    return sub


def price_combination(line: dict, cfg: dict, warnings: list[str]) -> list[Component]:
    cols = int(line["layout"]["cols"])
    rows_n = int(line["layout"]["rows"])
    comps: list[Component] = []
    # Brickmould and jambs wrap the whole assembly once; each lite is billed
    # at its size grown by the assembly brickmould (see price_window).
    assembly_bm = _brickmould_width(line.get("accessories") or [])
    for i, lite in enumerate(line["lites"], 1):
        sub = price_window(_merged(line.get("defaults", {}), lite), cfg, warnings,
                           in_combination=True, assembly_bm_width=assembly_bm)
        for c in sub:
            c.label = f"lite {i}: {c.label}"
        comps += sub
    widths = [float(l["width"]) for l in line["lites"]]
    heights = [float(l["height"]) for l in line["lites"]]
    total_w = sum(widths[:cols])
    total_h = sum(heights[::cols][:rows_n])
    # 0-degree couplers are free (book 29); steel mullions when the chart says so
    grid_lines = ([layout.Line("v", 0, 0, total_h)] * (cols - 1)
                  + [layout.Line("h", 0, 0, total_w)] * (rows_n - 1))
    comps += _mullion_components(grid_lines, total_w, total_h, cols, cfg, warnings)
    first_colour = line["lites"][0].get("colour_ext") if line["lites"] else ""
    comps += _assembly_accessories(line, first_colour, total_w, total_h, cfg)
    comps.insert(0, Component(
        f"Combination {cols}x{rows_n} overall {total_w:g}x{total_h:g} "
        "(0-degree couplers included)", 0.0))
    return comps


DARK_COLOURS = ("black", "dark bronze", "charcoal")


def _unit_sections(line: dict) -> tuple[layout.Resolved, list[dict]]:
    """Resolve a unit's layout and build one window line per section."""
    w, h = float(line["width"]), float(line["height"])
    resolved = layout.resolve(line.get("layout"), w, h)
    series = line.get("series") or layout.DEFAULT_SERIES
    unit_glazing = line.get("glazing") or {}
    colour = str(line.get("colour_ext") or "white").lower()
    section_lines = []
    for section in resolved.sections:
        node = section.node
        style_code = layout.style_for(section, series)
        adders = list(node.get("adders") or [])
        # Book 90/112: casement sashes must be reinforced past 72" tall (66" on
        # dark exterior colours) -- add the style's own adder when required.
        limit = 66.0 if colour in DARK_COLOURS else 72.0
        if node["op"] == "casement" and section.height > limit + layout.EPS and not any(
                "reinforce" in str(a).lower() for a in adders):
            adders.append("sash reinforcement")
        section_lines.append({
            "type": "window", "style": style_code,
            "width": round(section.width, 4), "height": round(section.height, 4),
            **{k: line[k] for k in ("colour_ext", "colour_int") if k in line},
            "glazing": {**unit_glazing, **(node.get("glazing") or {})},
            "adders": adders,
        })
    return resolved, section_lines


def price_unit(line: dict, cfg: dict, warnings: list[str]) -> list[Component]:
    """A layout-first window: overall frame, divisions, a product per section."""
    resolved, section_lines = _unit_sections(line)
    if len(section_lines) == 1:
        # A one-section unit is exactly a single-frame window.
        single = {**section_lines[0],
                  "accessories": line.get("accessories") or [],
                  **({"shape": line["shape"]} if line.get("shape") else {})}
        return price_window(single, cfg, warnings)

    comps: list[Component] = []
    assembly_bm = _brickmould_width(line.get("accessories") or [])
    for section, sec_line in zip(resolved.sections, section_lines):
        sec_warnings: list[str] = []
        sub = price_window(sec_line, cfg, sec_warnings, in_combination=True,
                           assembly_bm_width=assembly_bm)
        name = layout.section_label(section)
        for c in sub:
            c.label = f"S{section.index} {name}: {c.label}"
        comps += sub
        warnings.extend(f"Section {section.index} ({name}): {m}" for m in sec_warnings)
    comps += _mullion_components(resolved.lines, resolved.width, resolved.height,
                                 resolved.max_side_by_side, cfg, warnings)
    comps += _assembly_accessories(line, "", resolved.width, resolved.height, cfg)
    comps.insert(0, Component(
        f"Unit {resolved.width:g}x{resolved.height:g}, {len(section_lines)} sections: "
        f"{layout.summary(line.get('layout'), resolved.width, resolved.height)} "
        "(0-degree couplers included)", 0.0))
    return comps


def unit_details(line: dict) -> dict:
    """Section geometry, products and energy ratings for display."""
    resolved, section_lines = _unit_sections(line)
    sections = []
    for section, sec_line in zip(resolved.sections, section_lines):
        sections.append({
            "index": section.index, "path": section.path,
            "op": section.node["op"], "hinge": section.node.get("hinge"),
            "label": layout.section_label(section), "style": sec_line["style"],
            "x": round(section.x, 4), "y": round(section.y, 4),
            "width": sec_line["width"], "height": sec_line["height"],
            "energy": catalog.energy_rating(sec_line["style"], sec_line["glazing"]),
        })
    return {
        "summary": layout.summary(line.get("layout"), resolved.width, resolved.height),
        "sections": sections,
        "mullions": [{"orient": l.orient, "pos": round(l.pos, 4), "start": round(l.start, 4),
                      "end": round(l.end, 4)} for l in resolved.lines],
    }


SLIDING_OPERATIONS = {2: ("XO", "OX"), 4: ("OXXO",)}


def _patio_footage(width: float, height: float, panels: int, cfg: dict) -> float:
    """Brickmould / jamb footage on a patio door: head and both jambs.

    Window City bills W + 2H plus 6" (2 panel) or 8" (4 panel), rounded up to
    an even inch -- exact on all six standard WC-500 sizes in order 125401186.
    """
    allowance = cfg["engine"]["patio"]["footage_allowance_in"].get(str(panels), 6)
    total = width + 2 * height + allowance
    return math.ceil(total / 2 - 1e-9) * 2 / 12.0


PATIO_TYPES = ("patio_sliding", "patio_swing")


def wood_jamb_finish(acc: dict, product: str, cfg: dict | None = None) -> str:
    """'primed' or 'unfinished' for a wood jamb on a window or patio door.

    Primed white is the default and is offered up to a depth limit per
    product (6 1/4" windows, 4 1/2" patio doors); anything deeper, or a jamb
    the rep left unfinished, is unfinished.
    """
    cfg = cfg or load_config()
    limits = (cfg.get("defaults") or {}).get("wood_jamb_primed_max_in") or {}
    limit = float(limits.get("patio" if product in ("patio", *PATIO_TYPES) else "window", 6.25))
    depth = catalog.wood_jamb_depth(acc)
    wanted = str(acc.get("finish") or "primed").lower()
    return "primed" if wanted == "primed" and depth is not None and depth <= limit + 1e-6 else "unfinished"


def _patio_accessories(line: dict, width: float, height: float, panels: int,
                       coloured: bool, cfg: dict) -> list[Component]:
    """Brickmould and wood jamb around a patio door, at the normal discount."""
    pcfg = cfg["engine"]["patio"]
    comps: list[Component] = []
    for acc in line.get("accessories") or []:
        lf = float(acc.get("lineal_ft") or _patio_footage(width, height, panels, cfg))
        if acc["kind"] == "brickmould":
            bm = pcfg["brickmould"]
            rate = bm["rate_colour_lf"] if coloured else bm["rate_white_lf"]
            comps.append(Component(f"Brickmould {bm['code']} installed {lf:.2f} lf @ {rate:.2f}", lf * rate))
        elif acc["kind"] == "wood_jamb":
            row = catalog.accessory_row(acc)
            depth = acc.get("depth_in")
            if depth is None:
                m = re.match(r"([\d/ ]+)\"", row["name"])
                depth = catalog.inches(m.group(1) + '"') if m else None
            # Door jambs up to 4 1/2" bill at the door table's 4.00/lf (order
            # 125401186); deeper jambs use the window wood-jamb rows.
            rate = (pcfg["wood_jamb_rate_lf_to_4_5"] if depth is not None and float(depth) <= 4.5
                    else row["price_white_lf"])
            finish = wood_jamb_finish(acc, "patio", cfg)
            label = f"{float(depth):g}\" {finish} wood jamb" if depth is not None else row["name"]
            comps.append(Component(f"{label} {lf:.2f} lf @ {rate:.2f}", lf * rate))
        else:
            raise CatalogError(f"patio doors take brickmould and wood jamb only, not {acc['kind']!r}")
    return comps


def price_patio_sliding(line: dict, cfg: dict, warnings: list[str]) -> list[Component]:
    r = catalog.sliding_row(int(line["nominal_ft"]))
    pcfg = cfg["engine"]["patio"]
    door = pcfg["dealer_factor"]
    panels = int(r["panels"])
    operation = str(line.get("operation") or SLIDING_OPERATIONS[panels][0]).upper()
    if operation not in SLIDING_OPERATIONS.get(panels, ()):
        raise CatalogError(f"{r['nominal_size_ft']}' sliding door is {panels}-panel: operation must be "
                           f"one of {', '.join(SLIDING_OPERATIONS[panels])}")
    comps = [Component(f"WC-500 sliding {r['nominal_size_ft']}' {operation} "
                       f"({r['frame_width']} x {r['frame_height']}) white",
                       r["white_standard"], factor=door)]
    colour = str(line.get("colour_ext") or "white").lower()
    black_in_out = interior_matches(line)
    if black_in_out:
        if colour != "black":
            raise CatalogError(f"WC-500 sliding door: {colour} in/out is not offered; "
                               "only black in / black out")
        comps.append(Component("Black in/out capstock", r["black_in_out_add"], factor=door))
        sets = panels // 2
        suffix = "" if sets == 1 else f" x{sets}"
        comps.append(Component(f"Black/black hardware & kick lock{suffix}",
                               pcfg["black_interior_hardware_list"] * sets, factor=door))
        if panels > 2:
            warnings.append(f"{r['nominal_size_ft']}' black in/out door: the black hardware package is "
                            "calibrated on a 2-panel door only; confirm with Window City")
    elif colour not in ("", "white"):
        comps.append(Component(f"Two-tone capstock ({colour} exterior, white interior)",
                               r["two_tone_capstock_add"], factor=door))
    gl = line.get("glazing") or {}
    gas = GAS_KEYS.get(str(gl.get("gas") or "argon").lower())
    if gas is None:
        raise CatalogError(f"unknown gas {gl.get('gas')!r}; use argon, 50/50 or krypton")
    if gl.get("triple"):
        col = {"argon": "triple_2loe180_argon",
               "argon_krypton_5050": "triple_2loe180_50_50",
               "krypton": "triple_2loe180_krypton"}[gas]
        argon_pkg, v = r["triple_2loe180_argon"], r[col]
        if v is None or argon_pkg is None:
            raise CatalogError(f"{r['nominal_size_ft']}' sliding door not "
                               f"available in triple pane")
        # Window City bills the LoE 180 add on top of the triple package
        # (orders 125401186 and 125401102). Bill the argon package at the door
        # factor and only the gas upgrade under the gas item discount, so a
        # free 90/5 fill never zeroes the glass itself.
        comps.append(Component("LoE 180", r["loe180_add"], factor=door))
        comps.append(Component("Triple pane 2x LoE180 (argon)", argon_pkg, factor=door))
        if gas != "argon":
            comps.append(Component(f"Triple pane gas upgrade ({GAS_LABELS[gas]})",
                                   v - argon_pkg, gas, factor=door))
    else:
        if gas != "argon":
            raise CatalogError(f"{r['nominal_size_ft']}' sliding door: {GAS_LABELS[gas]} gas "
                               "is only priced in the triple-pane package")
        if gl.get("loe180") and gl.get("i89"):
            comps.append(Component("LoE 180 + i89 + argon", r["loe180_i89_argon_add"], factor=door))
        elif gl.get("loe180"):
            comps.append(Component("LoE 180", r["loe180_add"], factor=door))
    if gl.get("frost_tint"):
        if r["grey_bronze_tint_add"] is None:
            raise CatalogError(f"{r['nominal_size_ft']}' sliding door: tint is not offered")
        comps.append(Component("Grey or bronze tint", r["grey_bronze_tint_add"], factor=door))
    accessories = line.get("accessories") or []
    assembled = line.get("assembled", True)
    if accessories and not assembled:
        warnings.append("Sliding doors ordered with brickmould or a jamb extension must be "
                        "assembled; assembly was added")
        assembled = True
    if assembled:
        comps.append(Component("Assembly", 80.0 if panels == 2 else 160.0, factor=door))
    if line.get("kick_lock"):
        locks = panels // 2
        suffix = "" if locks == 1 else f" x{locks}"
        comps.append(Component(f"Kick lock{suffix}", pcfg["kick_lock_list"] * locks, factor=door))
    width = catalog.inches(r["frame_width"])
    height = catalog.inches(r["frame_height"])
    comps += _patio_accessories(line, width, height, panels, colour not in ("", "white"), cfg)
    return comps


def price_patio_swing(line: dict, cfg: dict, warnings: list[str]) -> list[Component]:
    kind = line.get("kind", "single")
    w, h = float(line["width"]), float(line["height"])
    r = catalog.swing_row(kind, w, h)
    comps = [Component(f"{r.get('height_band') or ''} {kind} swing door "
                       f"{w:g}x{h:g} white tempered".strip(), r["white_base"])]
    gl = line.get("glazing") or {}
    if gl.get("loe180") and gl.get("i89"):
        comps.append(Component("LoE 180 with i89", r["loe180_i89"]))
    elif gl.get("loe180"):
        comps.append(Component("LoE 180", r["loe180"]))
    if gl.get("gas"):
        if GAS_KEYS.get(str(gl["gas"]).lower()) != "argon":
            raise CatalogError(f"{kind} swing door: only argon gas is priced "
                               f"(requested {gl['gas']!r})")
        comps.append(Component("Argon", r["argon"]))
    if gl.get("triple"):
        comps.append(Component("Triple pane tempered", r["triple_tempered_upcharge"]))
    colour = str(line.get("colour_ext") or "white").lower()
    black_in_out = interior_matches(line)
    if colour not in ("", "white"):
        if black_in_out:
            if colour != "black":
                raise CatalogError(f"{kind} swing door: {colour} in/out is not offered; "
                                   "only black in / black out")
            group = "Black in/out"
        elif colour in ("black", "dark bronze", "charcoal"):
            group = "Dark Bronze, Black, Charcoal"
        elif colour in ("sandalwood", "sandstone"):
            group = "Sandalwood & Sandstone"
        else:
            raise CatalogError(f"{kind} swing door: no capstock price group "
                               f"for colour {colour!r}")
        comps.append(Component(f"Capstock colour ({'black in/out' if black_in_out else colour})",
                               catalog.swing_colour_add(kind, group, h)))
    panels = 4 if kind == "double" else 2
    comps += _patio_accessories(line, w, h, panels, colour not in ("", "white"), cfg)
    return comps


BAY_ANGLES = {"bay": (30, 45), "bow": (10, 15)}


def bay_lites(line: dict) -> list[dict]:
    """The window lines that make up a bay or bow.

    A layout-first bay (``layout`` + ``width`` + ``height`` + ``series``) is
    resolved exactly like a unit: one lite per section, its product from the
    series. Older saved bays list their ``lites`` directly.
    """
    if line.get("layout"):
        resolved, section_lines = _unit_sections(line)
        if len(section_lines) < 3 or len(section_lines) > 6:
            raise CatalogError("a bay or bow has 3 to 6 lites")
        if any(abs(sec.height - resolved.height) > layout.EPS for sec in resolved.sections):
            raise CatalogError("bay and bow lites sit side by side; split the bay across, not top to bottom")
        return section_lines
    return [_merged(line.get("defaults", {}), lite) for lite in line["lites"]]


def price_bay_bow(line: dict, cfg: dict, warnings: list[str]) -> list[Component]:
    bb = catalog.baybow()
    comps: list[Component] = []
    lites = bay_lites(line)
    for i, lite in enumerate(lites, 1):
        sub = price_window(lite, cfg, warnings, in_combination=True)
        for c in sub:
            c.label = f"lite {i}: {c.label}"
        comps += sub
    hs = line.get("head_seat")
    if hs:
        row = next((r for r in bb["head_seat_plywood"] if r["size"] == hs), None)
        if row is None:
            raise CatalogError(f"head_seat must be one of "
                               f"{[r['size'] for r in bb['head_seat_plywood']]}")
        comps.append(Component(f"Plywood head & seat ({hs})", row["standard_plywood"]))
        if line.get("insulated"):
            comps.append(Component("Insulated head & seat add", row["insulated_add"]))
    elif line.get("welded_brickmould_lites"):
        n = int(line["welded_brickmould_lites"])
        row = next((r for r in bb["brickmould_no_head_seat"] if r["lites"] == n), None)
        if row is None:
            raise CatalogError("welded brickmould option covers 3-6 lites")
        comps.append(Component(f"Welded brickmould, {n} lite, no head/seat",
                               row["price"]))
    if line.get("cable_support"):
        comps.append(Component("Grip-Tite cable support", bb["cable_support"]["price"]))
    lf = line.get("coupler_lineal_ft")
    if lf is None and line.get("layout"):
        # Book 57: bay 30/45 and bow 10/15 couplers are priced per lineal foot
        # (0-degree couplers are free); one full-height joint between lites.
        lf = round((len(lites) - 1) * float(line["height"]) / 12.0, 2)
    if lf:
        style = str(line.get("style") or "bay").lower()
        angle = line.get("angle") or BAY_ANGLES.get(style, BAY_ANGLES["bay"])[0]
        comps.append(Component(f"{style.title()} {angle}° couplers {lf:g} lf",
                               lf * bb["angled_coupler_lineal"]["price_lf"]))
    accessories = line.get("accessories") or []
    if any(a.get("kind") == "brickmould" for a in accessories):
        raise CatalogError("bay/bow brickmould is the welded option (no head & seat); "
                           "use welded_brickmould_lites instead of a brickmould accessory")
    if accessories and line.get("layout"):
        comps += _assembly_accessories(line, "", float(line["width"]), float(line["height"]), cfg)
    return comps


PRICERS = {
    "window": price_window,
    "combination": price_combination,
    "unit": price_unit,
    "patio_sliding": price_patio_sliding,
    "patio_swing": price_patio_swing,
    "bay_bow": price_bay_bow,
}


def _install_each(line: dict, kind: str, cfg: dict) -> float:
    """$rate x sqft, minimum sqft per window (per lite on multi-lite lines).
    Frame dimensions in inches; brickmould does not change install area."""
    rate = cfg["install"].get("rate_per_sqft", 0)
    min_sqft = cfg["install"].get("min_sqft_per_window", 0)
    if not rate:
        return 0.0

    def unit(w, h):
        return max(float(w) * float(h) / 144.0, min_sqft)

    if kind in ("window", "patio_swing"):
        sqft = unit(line["width"], line["height"])
    elif kind == "combination":
        sqft = sum(unit(l["width"], l["height"]) for l in line["lites"])
    elif kind == "bay_bow":
        sqft = sum(unit(l["width"], l["height"]) for l in bay_lites(line))
    elif kind == "unit":
        resolved = layout.resolve(line.get("layout"), float(line["width"]), float(line["height"]))
        sqft = sum(unit(sec.width, sec.height) for sec in resolved.sections)
    elif kind == "patio_sliding":
        r = catalog.sliding_row(int(line["nominal_ft"]))
        sqft = unit(catalog.inches(r["frame_width"]), catalog.inches(r["frame_height"]))
    else:
        sqft = min_sqft
    return round(rate * sqft, 2)


def price_quote(spec: dict, cfg: dict | None = None) -> dict:
    cfg = cfg or load_config(spec.get("config_overrides"))
    warnings: list[str] = []
    out_lines = []
    for i, raw_line in enumerate(spec.get("lines", []), 1):
        line = _merged(spec.get("defaults", {}), raw_line)
        kind = line.get("type", "window")
        if kind not in PRICERS:
            raise CatalogError(f"line {i}: unknown type {kind!r}")
        comps = PRICERS[kind](line, cfg, warnings)
        qty = int(line.get("qty", 1))
        list_each = round(sum(c.amount for c in comps), 2)
        dealer_each = round(sum(c.dealer(cfg) for c in comps), 2)
        install_each = _install_each(line, kind, cfg)
        details: dict = {}
        if kind in ("unit", "bay_bow") and (kind == "unit" or line.get("layout")):
            details = {"unit": unit_details(line)}
        elif kind == "window":
            details = {"energy": catalog.energy_rating(
                catalog.style(line["style"])["code"], line.get("glazing"))}
        out_lines.append({
            **details,
            "line": i, "type": kind, "qty": qty,
            "components": [{"label": c.label, "list": c.amount,
                            "dealer": c.dealer(cfg),
                            "discount_key": c.discount_key} for c in comps],
            "list_each": list_each, "dealer_each": dealer_each,
            "install_each": install_each,
            "list_total": round(list_each * qty, 2),
            "dealer_total": round(dealer_each * qty, 2),
            "install_total": round(install_each * qty, 2),
        })
    list_total = round(sum(l["list_total"] for l in out_lines), 2)
    dealer_total = round(sum(l["dealer_total"] for l in out_lines), 2)
    install_total = round(sum(l["install_total"] for l in out_lines), 2)
    sell = round((dealer_total + install_total) * (1 + cfg["markup"]), 2)
    total = round(sell * (1 + cfg["hst"]), 2)
    return {
        "config": {k: cfg[k] for k in
                   ("discount", "price_multiplier", "markup", "hst",
                    "item_discounts", "install", "engine")},
        "lines": out_lines,
        "warnings": warnings,
        "totals": {
            "list": list_total,
            "dealer_cost": dealer_total,
            "install": install_total,
            "sell_before_tax": sell,
            "hst": round(sell * cfg["hst"], 2),
            "customer_total": total,
        },
    }


def render_text(q: dict) -> str:
    L = []
    for l in q["lines"]:
        L.append(f"— line {l['line']} ({l['type']}, qty {l['qty']}) "
                 f"list ${l['list_each']:,.2f} / dealer ${l['dealer_each']:,.2f} each")
        for c in l["components"]:
            tag = f"  [{c['discount_key']}]" if c["discount_key"] else ""
            L.append(f"    {c['label']:<62} {c['list']:>10,.2f}{tag}")
    t = q["totals"]
    L += [
        "",
        f"{'List total':<30} ${t['list']:>12,.2f}",
        f"{'Dealer cost':<30} ${t['dealer_cost']:>12,.2f}",
        f"{'Installation':<30} ${t['install']:>12,.2f}",
        f"{'Sell (before tax)':<30} ${t['sell_before_tax']:>12,.2f}",
        f"{'HST':<30} ${t['hst']:>12,.2f}",
        f"{'CUSTOMER TOTAL':<30} ${t['customer_total']:>12,.2f}",
    ]
    if q["warnings"]:
        L += ["", "WARNINGS:"] + [f"  ! {w}" for w in q["warnings"]]
    return "\n".join(L)
