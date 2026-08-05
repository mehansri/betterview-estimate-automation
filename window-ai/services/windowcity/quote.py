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
from pathlib import Path

from . import catalog
from .catalog import CatalogError

CONFIG_PATH = Path(__file__).resolve().parent / "config.json"

GAS_KEYS = {"argon": "argon", "argon_krypton_5050": "argon_krypton_5050",
            "krypton": "krypton", "90/5": "argon_krypton_5050",
            "50/50": "argon_krypton_5050"}


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

    def __init__(self, label: str, amount: float, discount_key: str | None = None):
        self.label = label
        self.amount = round(amount, 2)
        self.discount_key = discount_key

    def dealer(self, cfg: dict) -> float:
        mult = cfg["discount"] * cfg["price_multiplier"]
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


def _area_sqft(w: float, h: float, cfg: dict) -> float:
    if cfg["engine"]["sqft_rounding"] == "even_inch":
        import math
        w = math.ceil(w / 2) * 2
        h = math.ceil(h / 2) * 2
    return w * h / 144.0


def price_window(line: dict, cfg: dict, warnings: list[str],
                 in_combination: bool = False) -> list[Component]:
    s = catalog.style(line["style"])
    w, h = float(line["width"]), float(line["height"])

    # A brickmould grows the *billed* size to the BM outer dimensions and the
    # accessory footage to the BM outer loop (2(W+H) + 8x width). Confirmed to
    # the cent on Cantor order 125401159. Combination lites are exempt — the
    # BM wraps the parent assembly.
    bm_rows = [catalog.accessory(a["kind"], a["name"])
               for a in line.get("accessories", []) if a["kind"] == "brickmould"]
    bm_width = 0.0
    if bm_rows and not in_combination:
        import re as _re
        m = _re.match(r"([\d/ .]+)\"", bm_rows[0]["name"])
        bm_width = catalog.inches(m.group(1) + '"') if m else 1.0
    bw, bh = w + 2 * bm_width, h + 2 * bm_width
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
    int_too = bool(line.get("colour_int") and
                   str(line["colour_int"]).lower() not in ("", "white"))
    pct = catalog.colour_pct(s, colour, interior_too=int_too and
                             str(line["colour_int"]).lower() ==
                             str(colour).lower())
    if pct:
        ccfg = cfg["engine"].get("colour", {"base": "base_only", "pct_scale": 0.75})
        eff = pct * ccfg.get("pct_scale", 1.0)
        base_amt = (comps[0].amount if ccfg.get("base") == "base_only"
                    else sum(c.amount for c in comps))
        comps.append(Component(
            f"Colour {colour} ({eff * 100:g}% of base)", base_amt * eff))

    for frag in line.get("adders", []):
        a = catalog.style_adder(s, frag)
        comps.append(Component(a["name"].strip(": "), a["amount"]))

    for acc in line.get("accessories", []):
        row = catalog.accessory(acc["kind"], acc["name"])
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
        rate = colour_lf if (pct and colour_lf) else white_lf
        comps.append(Component(f"{row['name']} {lf:.2f} lf @ {rate:.2f}", lf * rate))

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


def price_combination(line: dict, cfg: dict, warnings: list[str]) -> list[Component]:
    cols = int(line["layout"]["cols"])
    rows_n = int(line["layout"]["rows"])
    comps: list[Component] = []
    total_w = total_h = 0.0
    for i, lite in enumerate(line["lites"], 1):
        sub = price_window(_merged(line.get("defaults", {}), lite), cfg, warnings,
                           in_combination=True)
        for c in sub:
            c.label = f"lite {i}: {c.label}"
        comps += sub
    widths = [float(l["width"]) for l in line["lites"]]
    heights = [float(l["height"]) for l in line["lites"]]
    total_w = sum(widths[:cols])
    total_h = sum(heights[::cols][:rows_n])
    # 0-degree couplers are free (book 29); steel mullions when the chart says so
    wide_limit = 108.0 if cols >= 3 else 72.0
    if total_h > 66.0 and total_w > wide_limit:
        v_joints = cols - 1
        h_joints = rows_n - 1
        if v_joints:
            lf = v_joints * total_h / 12.0
            comps.append(Component(
                f"1\" vertical reinforcement mullion {lf:.2f} lf",
                lf * catalog.mullion_lf_price("vertical")))
        if h_joints:
            lf = h_joints * total_w / 12.0
            comps.append(Component(
                f"2\" horizontal reinforcement mullion {lf:.2f} lf",
                lf * catalog.mullion_lf_price("horizontal")))
        if not (v_joints or h_joints):
            warnings.append("combination layout has no joints?")
    comps.insert(0, Component(
        f"Combination {cols}x{rows_n} overall {total_w:g}x{total_h:g} "
        "(0-degree couplers included)", 0.0))
    return comps


def price_patio_sliding(line: dict, cfg: dict, warnings: list[str]) -> list[Component]:
    r = catalog.sliding_row(int(line["nominal_ft"]))
    comps = [Component(f"WC-500 sliding {r['nominal_size_ft']}' "
                       f"({r['frame_width']} x {r['frame_height']}) white",
                       r["white_standard"])]
    colour = str(line.get("colour_ext") or "white").lower()
    if colour not in ("", "white"):
        if colour == "black" and str(line.get("colour_int", "")).lower() == "black":
            comps.append(Component("Black in/out capstock", r["black_in_out_add"]))
        else:
            comps.append(Component(f"Two-tone capstock ({colour})",
                                   r["two_tone_capstock_add"]))
    gl = line.get("glazing") or {}
    if gl.get("triple"):
        gas = GAS_KEYS.get(str(gl.get("gas", "argon")).lower(), "argon")
        col = {"argon": "triple_2loe180_argon",
               "argon_krypton_5050": "triple_2loe180_50_50",
               "krypton": "triple_2loe180_krypton"}[gas]
        v = r[col]
        if v is None:
            raise CatalogError(f"{r['nominal_size_ft']}' sliding door not "
                               f"available in triple pane")
        comps.append(Component(f"Triple pane 2x LoE180 ({gas})", v,
                               "argon_krypton_5050" if gas == "argon_krypton_5050" else None))
    else:
        if gl.get("loe180") and gl.get("i89"):
            comps.append(Component("LoE 180 + i89 + argon", r["loe180_i89_argon_add"]))
        elif gl.get("loe180"):
            comps.append(Component("LoE 180", r["loe180_add"]))
    if gl.get("frost_tint"):
        comps.append(Component("Grey or bronze tint", r["grey_bronze_tint_add"]))
    if line.get("assembled", True):
        comps.append(Component("Assembly", 80.0 if r["panels"] == 2 else 160.0))
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
        comps.append(Component("Argon", r["argon"]))
    if gl.get("triple"):
        comps.append(Component("Triple pane tempered", r["triple_tempered_upcharge"]))
    colour = str(line.get("colour_ext") or "white").lower()
    if colour not in ("", "white"):
        group = ("Black in/out" if colour == "black" and
                 str(line.get("colour_int", "")).lower() == "black"
                 else "Dark Bronze, Black, Charcoal"
                 if colour in ("black", "dark bronze", "charcoal")
                 else "Sandalwood & Sandstone")
        comps.append(Component(f"Capstock colour ({colour})",
                               catalog.swing_colour_add(kind, group, h)))
    return comps


def price_bay_bow(line: dict, cfg: dict, warnings: list[str]) -> list[Component]:
    bb = catalog.baybow()
    comps: list[Component] = []
    for i, lite in enumerate(line["lites"], 1):
        sub = price_window(_merged(line.get("defaults", {}), lite), cfg, warnings,
                           in_combination=True)
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
    if lf:
        comps.append(Component(f"Bay/bow couplers {lf:g} lf",
                               lf * bb["angled_coupler_lineal"]["price_lf"]))
    return comps


PRICERS = {
    "window": price_window,
    "combination": price_combination,
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
    elif kind in ("combination", "bay_bow"):
        sqft = sum(unit(l["width"], l["height"]) for l in line["lites"])
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
        out_lines.append({
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
