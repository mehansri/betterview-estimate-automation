"""Lookups over data/. Raises rather than guessing: a failed lookup is a
spec problem the caller must surface, never a silent zero.
"""

from __future__ import annotations

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"

_cache: dict[str, dict] = {}


def load(name: str) -> dict:
    from services.price_books import load_override

    override = load_override(f"windowcity/{name}")
    if override is not None:
        return override
    if name not in _cache:
        with open(DATA / f"{name}.json", encoding="utf-8") as f:
            _cache[name] = json.load(f)
    return _cache[name]


class CatalogError(LookupError):
    pass


# ------------------------------------------------------------------ windows
OPTION_COLUMNS = ["loe180", "loe180_i89", "argon", "argon_krypton_5050",
                  "krypton", "triple_pane_upcharge", "tri_pane_lami",
                  "frost_or_tint"]


def styles() -> list[dict]:
    return load("windows")["styles"]


def style(code_or_name: str) -> dict:
    q = code_or_name.strip().upper().replace(" ", "-")
    cands = [s for s in styles() if s["code"] == q]
    if not cands:  # try name search ('classic casement', 'double slider tilt')
        words = code_or_name.lower().split()
        cands = [s for s in styles()
                 if all(w in (s["collection"] + " " + s["name"]).lower().replace("_", " ")
                        for w in words)]
    if len(cands) == 1:
        return cands[0]
    if not cands:
        raise CatalogError(f"no window style matches {code_or_name!r}; "
                           f"known codes: {[s['code'] for s in styles()]}")
    raise CatalogError(f"{code_or_name!r} is ambiguous: "
                       f"{[(s['code'], s['collection'], s['name']) for s in cands]}")


def tier_for(style_row: dict, sqft: float) -> tuple[dict, dict | None]:
    """Return (tier_row, over12_row_or_None). Billing area below 6 sqft uses
    the 'up to 6' tier (minimum charge, book 15)."""
    tiers = style_row["tiers"]
    over12 = tiers[-1]
    if sqft > 12:
        return tiers[-2], over12  # price = 11-12 tier + rate x (sqft - 12)
    for t in tiers[:-1]:
        if sqft <= t["max_sqft"]:
            return t, None
    raise CatalogError(f"no tier for {sqft} sqft in {style_row['code']}")


def colour_pct(style_row: dict, colour: str, interior_too: bool = False) -> float:
    """Percent adder for an exterior capstock colour (0 for white)."""
    c = colour.strip().lower()
    if c in ("", "white"):
        return 0.0
    for cu in style_row["colour_upcharges"]:
        if interior_too != cu.get("interior_and_exterior", False):
            continue
        # Cantor names may extend the book's ('Jet Black' vs 'Black'), so
        # match on containment in either direction
        if any(c == kl or c in kl or kl in c
               for kl in (k.lower() for k in cu["colours"])):
            return cu["pct"] / 100.0
    raise CatalogError(
        f"colour {colour!r} (interior_too={interior_too}) not offered for "
        f"{style_row['code']}; page {style_row['source_page_pdf']} lists: "
        f"{style_row['colour_upcharges']}")


def style_adder(style_row: dict, name_frag: str) -> dict:
    f = name_frag.lower()
    for a in style_row["adders"]:
        if f in a["name"].lower():
            return a
    raise CatalogError(f"{style_row['code']} has no '{name_frag}' adder; "
                       f"available: {[a['name'] for a in style_row['adders']]}")


# -------------------------------------------------------------- accessories
def accessory(section: str, name_frag: str) -> dict:
    rows = [r for r in load("accessories")["rows"] if r["section"] == section]
    if not rows:
        raise CatalogError(f"unknown accessory section {section!r}")
    f = name_frag.lower()
    hits = [r for r in rows if f in r["name"].lower()]
    if len(hits) == 1:
        return hits[0]
    if not hits:
        raise CatalogError(f"no {section} row matches {name_frag!r}; "
                           f"available: {[r['name'] for r in rows]}")
    raise CatalogError(f"{name_frag!r} ambiguous in {section}: "
                       f"{[r['name'] for r in hits]}")


def wood_jamb_for_depth(depth_in: float) -> dict:
    """The wood-jamb row that prices a jamb of this depth.

    A printed depth uses its own row; any other depth uses the book's custom
    row for its range (up to 4 1/4", or over 4 1/4" to 7 1/2").
    """
    rows = [r for r in load("accessories")["rows"] if r["section"] == "wood_jamb"]
    import re
    for r in rows:
        m = re.match(r"([\d/ ]+)\"", r["name"])
        if m and not r["name"].lower().startswith("custom") and abs(inches(m.group(1) + '"') - depth_in) < 1e-6:
            return r
    if depth_in <= 0:
        raise CatalogError(f"wood jamb depth must be positive, got {depth_in!r}")
    frag = "up to 4 1/4" if depth_in <= 4.25 else ">4 1/4" if depth_in <= 7.5 else None
    if frag is None:
        raise CatalogError(f"no wood jamb row for a {depth_in:g}\" depth; custom depths go up to 7 1/2\"")
    return accessory("wood_jamb", frag)


def accessory_row(acc: dict) -> dict:
    """Resolve a line accessory: by name, or a wood jamb by its depth alone."""
    if acc.get("kind") == "wood_jamb" and not acc.get("name") and acc.get("depth_in") is not None:
        return wood_jamb_for_depth(float(acc["depth_in"]))
    return accessory(acc["kind"], acc["name"])


def mullion_lf_price(direction: str) -> float:
    """1\" vertical = 22/lf, 2\" horizontal = 30/lf (book 28). Both frame
    depths (3 1/4\" and 4 1/2\") carry the same lineal price."""
    rows = [r for r in load("accessories")["rows"]
            if r["section"] == "reinforcement_mullion"
            and direction.lower() in r["name"].lower()]
    if not rows:
        raise CatalogError(f"no {direction} reinforcement mullion rows")
    prices = {r["price_white_lf"] for r in rows}
    if len(prices) != 1:
        raise CatalogError(f"{direction} mullion prices differ by depth: {rows}")
    return prices.pop()


def mullion_rules() -> dict:
    return load("accessories")["mullion_reinforcement"]


# ------------------------------------------------------------------- shapes
def shape_charge(family: str, name_frag: str) -> dict:
    rows = load("shapes")[family]
    f = name_frag.lower()
    hits = [r for r in rows if f in r["name"].lower()]
    if len(hits) == 1:
        return hits[0]
    exact = [r for r in hits if r["name"].lower() == f]
    if len(exact) == 1:
        return exact[0]
    raise CatalogError(f"shape {name_frag!r} in {family}: "
                       f"{'ambiguous ' + str([r['name'] for r in hits]) if hits else 'not found'}")


# -------------------------------------------------------------- patio doors
def sliding_row(nominal_ft: int) -> dict:
    for r in load("patio_doors")["sliding"]["standard"]["rows"]:
        if r["nominal_size_ft"] == nominal_ft:
            return r
    raise CatalogError(f"WC-500 has no {nominal_ft}' standard size; "
                       "standard sizes are 5/6/8/10/12/16")


def swing_row(kind: str, width: float, height: float) -> dict:
    doors = load("patio_doors")["swing"][kind]
    for r in doors["rows"]:
        if inches(r["width_from"]) <= width <= inches(r["width_to"]) and \
           inches(r["height_from"]) <= height <= inches(r["height_to"]):
            return r
    raise CatalogError(f"{kind} swing door: no band for {width}x{height}; "
                       f"rows: {[r['raw'] for r in doors['rows']]}")


def swing_colour_add(kind: str, colour_group: str, height: float) -> float:
    adds = load("patio_doors")["swing"][kind]["colour_adders"]
    key = "height_to_84" if height <= 84 else "height_to_98"
    g = colour_group.lower()
    for a in adds:
        if g in a["group"].lower() or g in a["raw"].lower():
            return a[key]
    raise CatalogError(f"no swing colour group matching {colour_group!r}: "
                       f"{[a['raw'] for a in adds]}")


def door_lite_table(name_frag: str) -> dict:
    tabs = (load("patio_doors")["sliding"]["sidelites_transoms"]
            + load("patio_doors")["swing"]["sidelites_transoms"])
    f = name_frag.lower()
    for t in tabs:
        if f in (t.get("name", "") + " " + t.get("page_group", "")).lower():
            return t
    raise CatalogError(f"no door sidelite/transom table matches {name_frag!r}: "
                       f"{[(t.get('name'), t.get('page_group')) for t in tabs]}")


# ------------------------------------------------------------------ bay/bow
def baybow() -> dict:
    return load("baybow")


def inches(s: str) -> float:
    """Parse band strings like '38 1/4\"', '38 1⁄4\"', '21½\"'."""
    import re
    s = s.strip().rstrip('"”').replace("⁄", "/")
    for glyph, frac in (("½", " 1/2"), ("¼", " 1/4"), ("¾", " 3/4"),
                        ("⅛", " 1/8"), ("⅜", " 3/8"), ("⅝", " 5/8"), ("⅞", " 7/8")):
        s = s.replace(glyph, frac)
    m = re.fullmatch(r"(\d+)(?:\s+(\d+)/(\d+))?", s.strip())
    if not m:
        raise CatalogError(f"cannot parse inches: {s!r}")
    v = float(m.group(1))
    if m.group(2):
        v += int(m.group(2)) / int(m.group(3))
    return v


# ------------------------------------------------------------------- energy
def energy_package(glazing: dict | None) -> str | None:
    """The rated glass package a glazing selection matches, if any."""
    gl = glazing or {}
    if not gl.get("loe180") or gl.get("i89") or gl.get("tri_pane_lami") or gl.get("frost_tint"):
        return None
    gas = str(gl.get("gas") or "").lower()
    if gl.get("triple"):
        if gas == "argon":
            return "triple_2loe180_argon"
        if gas in ("90/5", "50/50", "argon_krypton_5050"):
            return "triple_2loe180_90_5"
        return None
    return "double_loe180_argon" if gas == "argon" else None


def energy_rating(style_code: str, glazing: dict | None) -> dict | None:
    """Certified ER / U-factor for a style + glass package, or None if not on file."""
    package = energy_package(glazing)
    if package is None:
        return None
    for row in load("energy")["ratings"]:
        if row["style"] == style_code and row["package"] == package:
            return {**row, "package_label": load("energy")["packages"][package]}
    return None
