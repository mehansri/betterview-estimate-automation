"""Step-by-step entrance door pipeline over the Palma price book.

The raw Palma rows are organised the way the printed book is: one table per
glass type, each row a (glass size, panel) pair. Reps think the other way
round -- material, size, configuration, slab model, colour, glass -- so this
module regroups the same rows into slab *models* with the widths, heights and
glass families each one is actually offered in.

Two rules drive everything here:

* Only offer what the book prices. A model appears for a width/height only
  when a priced row exists for it, and a glass family appears for a slab only
  when that slab has a row for it. Nothing is shown-then-rejected.
* The server re-derives every price from the selection. The catalog payload
  carries availability, never prices, and :func:`quote_pipeline` re-validates
  each step in order before pricing.

Rules printed in the book block a selection. Rules that come only from
Palma's websites (Panel Selector widths, multipoint on fiberglass, no stain on
smooth skins) steer the UI and add a rep note, so a saved quote still prices.
The 2026-09-30 audit (docs/palma-price-book-reconciliation.md) lists both.
"""

from __future__ import annotations

import copy
import re
from collections import defaultdict
from typing import Any

from . import book_warnings, catalog, colours


class PipelineError(Exception):
    """Raised when a pipeline selection is incomplete or not offered."""


# --------------------------------------------------------------------------
# Static choices
# --------------------------------------------------------------------------

STANDARD_WIDTHS = [30, 32, 34, 36]
# Steel "Non-Standard Panels 24", 26", 28", 38", 40", 42" (Flush Only)" +$375 (ST p40).
STEEL_NON_STANDARD_WIDTHS = [24, 26, 28, 38, 40, 42]
MATERIAL_WIDTHS = {
    "steel": [24, 26, 28, 30, 32, 34, 36, 38, 40, 42],
    "fiberglass": [30, 32, 34, 36, 42],
}
WIDTHS = MATERIAL_WIDTHS["steel"]
HEIGHTS = {'6\'8"': 80, '7\'0"': 84, '8\'0"': 96}
SYSTEM_ITEMS = {'7\'0"': "7' System - 84\" Slab", '8\'0"': "8' System - 95\" Slab"}

# Palma Panel Selector (palmadoor.com, 2026-09-30): the widths and heights each
# steel slab is made in. The book says only "standard 30-36"; a width the book
# allows but the selector doesn't list still prices, with a note to confirm.
_W32_36 = [32, 34, 36]
STEEL_SELECTOR_WIDTHS: dict[str, dict[str, list[int]]] = {
    '6\'8"': {
        "vog": [34, 36], "tao": [34, 36], "oso": [34, 36], "linea": _W32_36, "era": _W32_36,
        "victoria": _W32_36, "soho": _W32_36, "orleans": _W32_36, "london": _W32_36, "sydney": _W32_36,
        "4-panel-bt": _W32_36, "6-panel": [28, 30, 32, 34, 36], "2p-camber-top": _W32_36, "2p-planked-cam-top": _W32_36,
    },
    '7\'0"': {
        "tao": [34, 36], "vog": [34, 36], "era": [34, 36], "victoria": _W32_36, "soho": _W32_36, "sydney": _W32_36,
        "orleans": _W32_36, "london": _W32_36, "4-panel-bt": _W32_36, "6-panel": _W32_36, "flush": _W32_36,
    },
    '8\'0"': {
        "tao": [34, 36], "vog": [34, 36], "soho": _W32_36, "london": _W32_36, "orleans": _W32_36, "6-panel": _W32_36,
        "flush": _W32_36,
    },
}

FRAME_TYPES = {
    "smooth": "Smooth vinyl composite frame",
    "textured": "Textured composite frame",
}
DEFAULT_FRAME_TYPE = {"steel": "smooth", "fiberglass": "textured"}

FRAME_DEPTHS = ["4.625", "5.25", "5.625", "6.625", "7.25", "7.625"]
FRAME_DEPTH_LABELS = {
    "4.625": '4-5/8"',
    "5.25": '5-1/4"',
    "5.625": '5-5/8"',
    "6.625": '6-5/8"',
    "7.25": '7-1/4"',
    "7.625": '7-5/8"',
}
# "Compatible ONLY with 6-5/8" and 7-1/4" jambs" (FG p45, ST p40, printed in red).
RETRACTABLE_SCREEN_DEPTHS = ("6.625", "7.25")

CONFIGURATIONS: list[dict[str, Any]] = [
    {"key": "single", "label": "Single", "doors": 1, "sidelites": 0, "transom": False, "opening_type": "single_door"},
    {"key": "single_1sl", "label": "Single + sidelite", "doors": 1, "sidelites": 1, "transom": False, "opening_type": "single_1_sidelite"},
    {"key": "single_1sl_transom", "label": "Single + sidelite + transom", "doors": 1, "sidelites": 1, "transom": True, "opening_type": "single_1_sidelite"},
    {"key": "single_2sl", "label": "Single + 2 sidelites", "doors": 1, "sidelites": 2, "transom": False, "opening_type": "single_2_sidelites"},
    {"key": "single_2sl_transom", "label": "Single + 2 sidelites + transom", "doors": 1, "sidelites": 2, "transom": True, "opening_type": "single_2_sidelites"},
    {"key": "double", "label": "Double", "doors": 2, "sidelites": 0, "transom": False, "opening_type": "double_door"},
    {"key": "double_2sl", "label": "Double + sidelites", "doors": 2, "sidelites": 2, "transom": False, "opening_type": "double_2_sidelites"},
    {"key": "double_transom", "label": "Double + transom", "doors": 2, "sidelites": 0, "transom": True, "opening_type": "double_door"},
    {"key": "double_2sl_transom", "label": "Double + sidelites + transom", "doors": 2, "sidelites": 2, "transom": True, "opening_type": "double_2_sidelites"},
]
CONFIG_BY_KEY = {row["key"]: row for row in CONFIGURATIONS}

# Colour side types per material. Steel ships factory white or painted;
# fiberglass is always finished, painted or stained.
SIDE_TYPES = {
    "steel": [("white", "Factory white"), ("painted", "Painted")],
    "fiberglass": [("painted", "Painted"), ("stained", "Stained")],
}

# Vented units: the book prints one sub-table per unit type (FG pp. 36-38,
# ST pp. 34-36); each row carries its sub-table as ``variant``.
VENTED_SERIES = [
    ("q550_clear", "Q550, Clear/LowE"),
    ("q550_grills", "Q550, grilles/LowE"),
    ("peak470_clear", "Peak 470, Clear/LowE"),
    ("peak470_grills", "Peak 470, grilles"),
    ("peak470_decorative", "Peak 470, decorative"),
    ("peak470_blackout_clear", "Peak 470 Black-Out, Clear/LowE"),
    ("peak470_blackout_decorative", "Peak 470 Black-Out, decorative"),
    ("elite_clear", "Elite, clear"),
    ("elite_rain", "Elite, rain glass"),
    ("elite_grills", "Elite, grilles"),
    ("elite_extension", "Elite 22x36 with extension (22x64 opening)"),
    ("elite_blackout", "Elite Black-Out"),
    ("ezlift_clear", "EZ Lift"),
    ("ezlift_blackout", "EZ Lift Black-Out"),
    ("elevation_clear", "Elevation, Clear/LowE"),
    ("elevation_grills", "Elevation, grilles Standard (CAFA) or Georgian (CAAL)"),
    ("elevation_decorative", "Elevation, Edge / Masterline / Optika / Transit glass"),
    ("elevation_vgroove_clear", "Elevation, V-Groove Murano clear"),
    ("elevation_vgroove_sandblast", "Elevation, V-Groove Murano sandblasted"),
    # A door price book published in the app before 2026-09-30 has no
    # ``variant`` on its vented rows; they stay quotable under the old keys.
    ("venting_q550_peak470", "Q550 / Peak 470 (sub-type not in the price book)"),
    ("venting_elite_ezlift", "Elite / EZ Lift (sub-type not in the price book)"),
    ("venting_elevation", "Elevation (sub-type not in the price book)"),
]
# Series keys saved before the variants were split out; they now price at the
# dearest variant of the old table, as they always did.
LEGACY_SERIES = {
    "venting_q550_peak470": [key for key, _ in VENTED_SERIES if key.startswith(("q550", "peak470", "venting_q550"))],
    "venting_elite_ezlift": [key for key, _ in VENTED_SERIES if key.startswith(("elite", "ezlift", "venting_elite"))],
    "venting_elevation": [key for key, _ in VENTED_SERIES if key.startswith(("elevation", "venting_elevation"))],
}

# Glass families in the order the rep sees them. ``flat_max`` prices the
# family as one line at the dearest series offered on the slab, so the
# customer can change the decorative pattern later without moving the price.
GLASS_FAMILIES: list[dict[str, Any]] = [
    {
        "key": "decorative",
        "label": "Decorative glass",
        "hint": "One flat price at the dearest decorative group — the pattern can change without re-quoting",
        "flat_max": True,
        "series": [("group_a", "Group A"), ("group_b", "Group B"), ("group_c", "Group C"), ("group_d", "Group D")],
    },
    {
        "key": "sandblast",
        "label": "Sandblasted",
        "hint": "Sandblasted or sandblasted with a clear edge",
        "series": [
            ("sandblast", "Sandblasted (dual glazed)"),
            ("sandblast_clear_border", "Sandblasted, clear border edge"),
            ("sandblast_triple", "Sandblasted, triple glazed"),
            ("sandblast_6mm_lami", "Sandblasted, 6mm laminated"),
            ("sandblast_clear_border_6mm_lami", "Clear border edge, 6mm laminated"),
            ("solution_sandblast", "Solution series sandblast"),
        ],
    },
    {
        "key": "clear",
        "label": "Clear",
        "hint": "Clear LowE glass",
        "series": [
            ("clear_lowe", "Clear LowE (double glazed)"),
            ("clear_triple_dual_lowe", "Clear triple glazed, dual LowE"),
            ("clear_lowe_triple", "Clear LowE triple glazed"),
            ("clear_6mm_lami", "Clear 6mm laminated"),
            ("clear_lowe_6mm_lami", "Clear LowE 6mm laminated"),
            ("solution_clear_lowe", "Solution series clear"),
        ],
    },
    {
        "key": "blinds",
        "label": "Internal blinds",
        "hint": "Blinds sealed between the glass",
        "series": [("internal_blinds", "Internal blinds")],
    },
    {
        "key": "vented",
        "label": "Vented unit",
        "hint": "Opening glass insert with screen",
        "series": VENTED_SERIES,
    },
    {
        "key": "obscure",
        "label": "Obscure / privacy",
        "hint": "Textured privacy glass",
        "series": [("obscure", "Obscure")],
    },
    {
        "key": "grills",
        "label": "Internal grilles",
        "hint": "White grilles between the glass",
        "series": [("grills", "Internal grilles (white)")],
    },
    {
        "key": "sdl",
        "label": "Simulated divided lites",
        "hint": "SDL bars on clear or obscure glass, plus a charge per square",
        "per_square": True,
        "series": [("sdl_clear", "SDLs on clear"), ("sdl_obscure", "SDLs on obscure")],
    },
    {
        "key": "specialty",
        "label": "Specialty decorative",
        "hint": "Special-order, wrought iron, laser-cut iron and Chords",
        "series": [
            ("special_order", "Special-order decorative"),
            ("wrought_iron", "Wrought iron"),
            ("laser_cut_iron", "Laser-cut iron"),
            ("solution_chords", "Solution series Chords"),
        ],
    },
    {
        "key": "executive",
        "label": "Executive panel",
        "hint": "Novatech Executive layouts (ST p37), priced as printed",
        "series": [("executive_panels", "Executive panel layout")],
    },
]
FAMILY_BY_KEY = {row["key"]: row for row in GLASS_FAMILIES}
SERIES_FAMILY = {series: row["key"] for row in GLASS_FAMILIES for series, _ in row["series"]}
SERIES_LABEL = {series: label for row in GLASS_FAMILIES for series, label in row["series"]}

# Pattern names for glass the book prices as one table (M7).
GLASS_PATTERNS = {
    # FG p23-24, ST p21-22 (the size chart spells out the two reeded glasses).
    "obscure": [
        "Acid", "Aqualite", "Bronze", "Chinchilla", "Delta Frost", "Fluid", "Glue Chip", "Super Grey", "Listral",
        "Masterline", "Monumental", "Niagara", "Oceana", "Pinhead", "Rain", '1/8" Reeded', '1/2" Reeded', "Screen", "Soft",
    ],
    # FG p34, ST p32.
    "solution_sandblast": ["Sandblast", "Mistlite", "Narrow Reed", "Rain", "Sable"],
}

TRANSOM_GLASS = [
    ("clear_lowe_glass", "Clear LowE"),
    ("sandblast_obscure_glass", "Sandblasted / obscure"),
    ("decorative_glass", "Decorative"),
    ("wrought_iron_glass", "Wrought iron"),
    ("glass_with_grills", "Internal grilles"),
    ("clear_glass_with_sdls", "Clear with SDLs"),
    ("obscure_glass_with_sdls", "Obscure with SDLs"),
]
# "(additional charges per box apply)" -- amount not printed (A17).
TRANSOM_GLASS_EXTRA_CHARGE = {"glass_with_grills", "clear_glass_with_sdls", "obscure_glass_with_sdls"}

SILLS: dict[str, list[dict[str, Any]]] = {
    "steel": [
        {"key": "black_anodized", "label": "Black anodized", "item": "Fixed Sill - Black Anodized", "not_with": []},
        {"key": "mill_clear", "label": "Mill clear anodized", "item": "Fixed Sill - Mill Clear Anodized", "not_with": []},
        {"key": "outswing", "label": "Outswing — mill, white or black crown", "item": "Outswing Sill - Mill with White or Black Crown", "not_with": ["7.625"]},
        {"key": "outswing_black", "label": "Outswing — black anodized, black crown", "item": "Outswing Sill - Black Andodized with Black Crown", "not_with": ["7.625"]},
        {"key": "wheelchair", "label": "Wheelchair (low profile)", "item": "Wheelchair (Low-Profile) Sill", "not_with": []},
    ],
    "fiberglass": [
        {"key": "black_anodized", "label": "Black anodized", "item": "Fixed Sill - Black Anodized", "not_with": []},
        {"key": "mill_clear", "label": "Mill clear anodized", "item": "Fixed Sill - Mill Clear Anodized", "not_with": []},
        {"key": "outswing", "label": "Outswing", "item": "Outswing Sill (NOT", "not_with": ["7.625"]},
        {"key": "wheelchair", "label": "Wheelchair (low profile)", "item": "Wheelchair (Low-Profile) Sill", "not_with": ["5.625", "7.625"]},
    ],
}

BRICKMOULDS = {
    "regular": ('Regular 2"', None),
    "flat": ('Flat 1-1/2"', None),
    "none": ("No brickmould", None),
    # FG p44, ST p40.
    "custom_pvc": ('Custom PVC brickmould, 3 pcs. up to 6"', "Custom PVC Brickmould"),
    "custom_textured": ('Custom textured brickmould, 3 pcs. up to 4-1/2"', "Custom Textured Brickmould"),
}

# Heavy-duty stainless hinges (+$60/door) in Palma's two HD finishes (ST p38,
# order form D). Patina and brass are ball-bearing and not priced in the book.
HINGES = {
    "black": "Matte black",
    "satin_nickel": "Satin nickel",
    "standard": "Standard (no charge)",
}

HANDLE_CATEGORIES = ("ferco_multi_point_locks_handles", "other_multi_point_handles")
NOT_HANDLES = ("Ferco Mortise Astragal Lock", "Key Alike (same brand only)")

TEDEE_ADDONS = [
    ("keypad", "Tedee Smart Biometric Keypad"),
    ("bridge", "Tedee Smart WiFi Bridge"),
    ("sensor", "Tedee Door Sensor"),
]

LOCKS = ("double_bore", "multipoint", "pull_bar")
PULL_BAR_LOCK_BLOCKS = (
    "with_multipoint_lock_and_t_bar_handle",
    "with_multipoint_lock",
    "with_roller_latches_and_deadbolt_bore",
)
PULL_BAR_DUMMY_BLOCK = "with_dummy_handle_for_inactive_panel"

SCREENS = {
    "none": None,
    "white": "White RETRACTABLE Screen*",
    "painted": "Painted RETRACTABLE Screen*",
    "sliding_white": "White SLIDING Screen",
    "sliding_painted_1s": "Painted SLIDING Screen - 1 Side",
    "sliding_painted_2s": "Painted SLIDING Screen - 2 Sides",
}

# Glass frame options, per doorlite (FG p45, ST p44).
GLASS_FRAMES = {
    "contemporary": ("Contemporary PVC glass frame", "Contemporary PVC"),
    "aluminum_colonial": ("Aluminum colonial glass frame", "Aluminum Colonial Glass Frame"),
    "urban_smooth": ("Aluminum urban smooth glass frame", "Aluminum Urban Smooth Glass Frame"),
    "urban_textured": ("Aluminum urban textured glass frame", "Aluminum Urban Textured Glass Frame"),
}
# "** sizes include the contemporary glass frame": steel "(**included with
# Victoria and Soho panels)", fiberglass on the Shaker Craftsman sizes.
FRAME_INCLUDED_MODELS = {"steel": {"victoria", "soho"}, "fiberglass": set()}

CASING_ITEMS = {
    "single_door": "Single Door",
    "single_1_sidelite": "Single Door + 1 Sidelite",
    "single_2_sidelites": "Single Door + 2 Sidelites",
    "double_door": "Double Door",
    "double_2_sidelites": "Double Door + 2 Sidelites",
}

# Decorative accents (ST p44). Slab pairing and widths from Novatech's accent
# sheets and Palma's Panel Selector: steel only, each on its own slab, Uno on
# the Uno Flush slab. Prices are per side.
_ACCENT_SS = "Alunox / stainless steel"
ACCENTS: list[dict[str, Any]] = [
    {"key": "uno_1", "label": "Uno 1", "model": "flush", "widths": [34, 36, 38, 40, 42],
     "finishes": {"ss": (_ACCENT_SS, "Uno 1, Uno 2, Uno 3 - Alunox"), "black": ("Black", "Uno 1, Uno 2, - Black"), "matte_gold": ("Matte gold", "Uno 1, Uno 2, - Black, Matte Gold")}},
    {"key": "uno_2", "label": "Uno 2", "model": "flush", "widths": [34, 36, 38, 40, 42],
     "finishes": {"ss": (_ACCENT_SS, "Uno 1, Uno 2, Uno 3 - Alunox"), "black": ("Black", "Uno 1, Uno 2, - Black"), "matte_gold": ("Matte gold", "Uno 1, Uno 2, - Black, Matte Gold")}},
    {"key": "uno_3", "label": "Uno 3", "model": "flush", "widths": [34, 36, 38, 40, 42],
     "finishes": {"ss": (_ACCENT_SS, "Uno 1, Uno 2, Uno 3 - Alunox"), "black": ("Black", "Uno 3 - Black")}},
    {"key": "vog_1", "label": "Vogue 1", "model": "vog", "widths": [34, 36],
     "finishes": {"ss": (_ACCENT_SS, "Vog 1, Vog 2 - Alunox")}},
    {"key": "vog_2", "label": "Vogue 2", "model": "vog", "widths": [34, 36],
     "finishes": {"ss": (_ACCENT_SS, "Vog 1, Vog 2 - Alunox"), "black": ("Black", "Vog 2 - Black")}},
    {"key": "oso_1", "label": "Oso 1", "model": "oso", "widths": [34, 36],
     "finishes": {"ss": (_ACCENT_SS, "Oso 1, Oso 2 - Alunox")}},
    {"key": "oso_2", "label": "Oso 2", "model": "oso", "widths": [34, 36],
     "finishes": {"ss": (_ACCENT_SS, "Oso 1, Oso 2 - Alunox")}},
    {"key": "era_1", "label": "Era 1", "model": "era", "widths": [32, 34, 36],
     "finishes": {"ss": (_ACCENT_SS, "Era 1 - Alunox"), "matte_gold": ("Matte gold", "Era 1 - Matte Gold")}},
]
ACCENT_BY_KEY = {row["key"]: row for row in ACCENTS}
VERTICAL_ACCENTS = {
    "ss": (_ACCENT_SS, "Vertical Accent for 7 x 64 - Alunox"),
    "black": ("Black", "Vertical Accent for 7 x 64 - Black"),
}
VERTICAL_ACCENT_SIZE = "07x64"

# Palma lead times (docs.palmadoor.com, 2026-09-30), for the rep's notes.
LEAD_TIMES = {
    "factory_white": "4–5 weeks",
    "paint_1s": "5–6 weeks",
    "paint_2s_1c": "5–6 weeks",
    "paint_2s_2c": "6–7 weeks",
    "stain_2s_1c": "6–8 weeks",
    "stain_2s_2c": "7–8 weeks",
    "stain_out_paint_in": "7–8 weeks",
}

# Kept for saved selections and older clients; the configurator now offers
# Palma's own lists (services/doors/colours.py).
PAINT_PRESETS = [name for name, _code, _hex in colours.PAINT_COLOURS]
STAIN_PRESETS = [name for name, _hex in colours.STAIN_COLOURS]

# Fiberglass solid panel codes that are the same slab as a glazed model.
FIBERGLASS_CODE_MODEL = {
    "OAK00": "Oak Flush",
    "OAK24": "Oak 3/4 2-Panel",
    "OAK3P": "Oak 3/4 Panel",
    "OAK40": "Oak 4-Panel BT",
    "OAK66": "Oak 6-Panel",
    "FIR03": "Craftsman FIR03",
    "3DP": "Craftsman 3DP",
    "WG66": "Oak 6-Lite (WG66)",
    "WG34": "Oak WG34",
    # The glass pages' "Oak 3/4 4-Panel" (08x48 x2) is Richersons WG49 "3/4 Lite
    # 4 Panel", a different slab from Trimlite OAK3P (A14).
    "WG49": "Oak 3/4 4-Panel",
}
# 7'0" glazed fiberglass exists only as WG25 with a 22x48 lite (Panel
# Selector); it is priced from the Oak 3/4 2-Panel 22x48 row + the 7' system.
FIBERGLASS_7FT_GLAZED = {"model": "WG25", "source": "Oak 3/4 2-Panel", "sizes": ["22x48"]}

# Model keys saved before the 2026-09-30 audit fixed three parse artefacts
# (X3) and split WG49 from OAK3P (X12): old key -> (new keys to try, glass renames).
LEGACY_MODELS: dict[str, dict[str, tuple[list[str], dict[str, str]]]] = {
    "steel": {
        "camber-4-panel-bt": (["4-panel-bt"], {"22x10": "22x10 Camber"}),
        "oval-flush": (["flush"], {"18x42": "18x42 Oval"}),
    },
    "fiberglass": {
        "camber-oak-4-panel-bt": (["oak-4-panel-bt"], {"22x10": "22x10 Camber"}),
        "4-panel-3-4-wg49": (["oak-3-4-4-panel"], {}),
        "oak-3-4-panel": (["oak-3-4-panel", "oak-3-4-4-panel"], {}),
    },
}


def _clean(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "").replace("”", '"').replace("“", '"')).strip()


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _widths_from_band(sizes: str, allowed: list[int]) -> list[int]:
    nums = [int(float(value)) for value in re.findall(r"(\d+(?:\.\d+)?)", sizes)]
    if not nums:
        return []
    low, high = min(nums), max(nums)
    return [width for width in allowed if low <= width <= high]


def _is_tall_glass(glass: str) -> bool:
    return bool(re.search(r"x80\b", glass))


def series_key(row: dict[str, Any]) -> str:
    """The glass series a row is offered under: its vented sub-table, else its series."""
    return row.get("variant") or row["series"]


# --------------------------------------------------------------------------
# Row normalisation
# --------------------------------------------------------------------------


def canonical_door_row(material: str, panel: Any, glass: Any) -> tuple[str, str, str] | None:
    """Return ``(model, width_class, glass_size)`` for a door slab row.

    The book's PDF extraction spilled parts of multi-lite glass descriptions
    into the panel column ("or (x4) Flush", ", 3-Lite Victoria", "/ 22x11
    (B/D) Flush", "Camber 4-Panel BT"); this folds those back into the glass
    size so each slab model has one name. ``width_class`` is "std" or the
    printed non-standard width ("42", "24").
    """
    panel_text = _clean(panel)
    glass_text = _clean(glass).replace("**", "").strip()
    if not panel_text:
        return None

    match = re.match(r"^or \((x\d)\) (.*)$", panel_text)
    if match:
        glass_text = f"{glass_text} ({match.group(1)})"
        panel_text = match.group(2)
    match = re.match(r"^, (\d-Lite) (.*)$", panel_text)
    if match:
        glass_text = f"{glass_text} {match.group(1)}"
        panel_text = match.group(2)
    match = re.match(r'^/ (.*?)\s*((?:Oak )?(?:\d+" )?Flush)$', panel_text)
    if match:
        extra = re.sub(r"\bup to\b", "", match.group(1)).strip()
        glass_text = f"{glass_text} + {extra}" if extra else glass_text
        panel_text = match.group(2)
    panel_text = re.sub(r"^\(\S+ with ", "", panel_text)
    panel_text = re.sub(r"^\(London\) ", "", panel_text)
    panel_text = re.sub(r"^\*\* ", "", panel_text)
    panel_text = re.sub(r"^- (?:Clear/LowE|Decorative|Grills|Rain Glass) ", "", panel_text)
    panel_text = re.sub(r"^up to ", "", panel_text)
    # "22x10 | Camber 4-Panel BT" is a 22x10 camber lite in a 4-Panel BT slab,
    # and "18x42 | Oval Flush" an 18x42 oval lite in a flush slab (X3).
    match = re.match(r"^(Camber|Oval) (.*)$", panel_text)
    if match and glass_text and not glass_text.lower().startswith(("oval", "half")):
        glass_text = f"{glass_text} {match.group(1)}"
        panel_text = match.group(2)

    width_class = "std"
    match = re.search(r'(?:^|\s)(\d+)" ', panel_text)
    if match:
        width_class = match.group(1)
        panel_text = (panel_text[: match.start()] + " " + panel_text[match.end():]).strip()

    if panel_text == "6 Panel":
        panel_text = "6-Panel"
    if material == "fiberglass":
        if panel_text in {"Flush", "6-Panel", "3/4 2-Panel"}:
            panel_text = f"Oak {panel_text}"
        if panel_text == "Oak 3/4-Panel":
            panel_text = "Oak 3/4 Panel"
    glass_text = glass_text.replace("Half Moon", "Half-Moon")
    return panel_text, width_class, glass_text


def canonical_sidelite_row(material: str, component: str, panel: Any, glass: Any) -> tuple[str, str] | None:
    """Return ``(sidelite model, glass size)`` for a sidelite row."""
    glass_text = _clean(glass).replace("Direct Set ", "")
    if component == "direct_glazed_sidelite":
        return "Direct-glazed full lite", glass_text
    panel_text = _clean(panel)
    if not panel_text:
        return None
    if material == "fiberglass" and panel_text in {"Oak 3/4-Panel", "Oak 3/4 Lite"}:
        panel_text = "Oak 3/4 Panel"
    if material == "fiberglass" and panel_text == "Flush":
        panel_text = "Oak Flush"
    return panel_text, glass_text


def _row_height(glass: str) -> str:
    return '8\'0"' if _is_tall_glass(glass) else '6\'8"'


# --------------------------------------------------------------------------
# Catalogue build
# --------------------------------------------------------------------------


def _fiberglass_band_widths() -> dict[tuple[str, str], list[int]]:
    """Width bands per (model, height) from the fiberglass panel upcharge table."""
    bands: dict[tuple[str, str], list[int]] = {}
    allowed = MATERIAL_WIDTHS["fiberglass"]
    for record in catalog.options()["panel_upcharges"]:
        if record["material"] != "fiberglass":
            continue
        model = FIBERGLASS_CODE_MODEL.get(record["code"])
        if not model:
            continue
        widths = sorted({width for choice in record["options"] for width in _widths_from_band(choice["sizes"], allowed) if width != 42})
        bands[(model, record["height"])] = widths
    return bands


def _fiberglass_code_names() -> dict[str, str]:
    """One model name per fiberglass panel code, whatever height it's printed at."""
    names: dict[str, str] = {}
    for record in catalog.options()["panel_upcharges"]:
        if record["material"] != "fiberglass":
            continue
        code = record["code"].replace("(STD)", "")
        names.setdefault(code, FIBERGLASS_CODE_MODEL.get(record["code"]) or f"{_clean(record['panel'])} · {code}")
    return names


def _selector_widths(material: str, key: str, height: str, book: list[int]) -> list[int]:
    listed = STEEL_SELECTOR_WIDTHS.get(height, {}).get(key) if material == "steel" else None
    return [width for width in book if width in listed] if listed else list(book)


def build_index(material: str) -> dict[str, Any]:
    """Regroup the book into door models and sidelite models.

    Returns ``{"doors": {model_key: model}, "sidelites": {key: model}}``
    where each model carries ``offers`` -- the priced (kind, height, widths)
    combinations -- and private ``glazed``/``solid`` lookups used for pricing.
    An offer's ``widths`` are what the configurator shows; ``book_widths``
    are what the book allows and still price, with a note.
    """
    doors: dict[str, dict[str, Any]] = {}
    sidelites: dict[str, dict[str, Any]] = {}
    fiberglass_bands = _fiberglass_band_widths() if material == "fiberglass" else {}

    def door_model(name: str) -> dict[str, Any]:
        key = slug(name)
        if key not in doors:
            doors[key] = {
                "key": key,
                "label": name,
                "glazed": defaultdict(lambda: defaultdict(lambda: defaultdict(list))),
                "solid": {},
                "smooth": False,
                "derived": {},
            }
        return doors[key]

    for row in catalog.slabs(material):
        if row["kind"] != "slab":
            continue
        key = series_key(row)
        if row["component"] == "door":
            if row["series"] == "solid_panel":
                continue
            canon = canonical_door_row(material, row.get("panel"), row.get("glass_size"))
            if not canon:
                continue
            name, width_class, glass = canon
            if key not in SERIES_FAMILY or not glass:
                continue
            model = door_model(name)
            model["glazed"][(width_class, _row_height(glass))][glass][key].append(row)
        else:
            if row["series"] == "solid_panel":
                entry = sidelites.setdefault(
                    "solid-panel",
                    {"key": "solid-panel", "label": "Solid panel", "direct_glazed": False, "glazed": defaultdict(lambda: defaultdict(list)), "solid": {}},
                )
                # "Flush base" / "Embossed + $95.00" -> "Flush" / "Embossed"
                entry["solid"][re.sub(r"\s*(base|\+.*)$", "", _clean(row.get("panel"))).strip()] = row
                continue
            canon = canonical_sidelite_row(material, row["component"], row.get("panel"), row.get("glass_size"))
            if not canon:
                continue
            name, glass = canon
            entry = sidelites.setdefault(
                slug(name),
                {"key": slug(name), "label": name, "direct_glazed": row["component"] == "direct_glazed_sidelite", "glazed": defaultdict(lambda: defaultdict(list)), "solid": {}},
            )
            if key not in SERIES_FAMILY or not glass:
                continue
            height = _row_height(glass) if not entry["direct_glazed"] else '6\'8"'
            entry["glazed"][(height, glass)][key].append(row)

    # Solid slabs.
    if material == "steel":
        for row in catalog.slabs(material):
            if row["series"] != "solid_panel" or row["component"] != "door" or row["kind"] != "slab":
                continue
            name = _clean(row["panel"])
            name = "6-Panel" if name == "6 Panel" else name
            model = door_model(name)
            model["solid"][("std", '6\'8"')] = {"base": row, "widths": STANDARD_WIDTHS}
            # 7'0" and 8'0" slabs per the Panel Selector, priced as the 6'8"
            # slab + the system charge (the p38 bases are 6'8").
            for height in ('7\'0"', '8\'0"'):
                if model["key"] in STEEL_SELECTOR_WIDTHS[height]:
                    model["solid"][("std", height)] = {"base": row, "widths": STANDARD_WIDTHS}
            if name == "Flush":
                # Palma's non-standard panel line: these widths are flush only.
                model["solid"][("ns", '6\'8"')] = {"base": row, "widths": STEEL_NON_STANDARD_WIDTHS, "adder": "Non-Standard Panles"}
                model["solid"][("ns", '8\'0"')] = {"base": row, "widths": [42], "adder": "Non-Standard Panles"}
        # Glazed 7'0": the 6'8" lites + the 7' system ("7'0" System +$275/box"
        # on every glass page) in the slabs the Panel Selector lists at 7'0".
        for model in doors.values():
            if model["key"] in STEEL_SELECTOR_WIDTHS['7\'0"'] and ("std", '6\'8"') in model["glazed"]:
                model["glazed"][("std", '7\'0"')] = model["glazed"][("std", '6\'8"')]
                model["derived"]['7\'0"'] = model["label"]
        for entry in sidelites.values():
            for (height, size), series_rows in list(entry["glazed"].items()):
                if height == '6\'8"':
                    entry["glazed"][('7\'0"', size)] = series_rows
    else:
        bases = {
            row["height"]: row
            for row in catalog.slabs(material)
            if row["series"] == "solid_panel" and row["component"] == "door" and row["kind"] == "slab"
        }
        names = _fiberglass_code_names()
        allowed = MATERIAL_WIDTHS["fiberglass"]
        for record in catalog.options()["panel_upcharges"]:
            if record["material"] != material or record["height"] not in HEIGHTS or record["height"] not in bases:
                continue
            model = door_model(names[record["code"].replace("(STD)", "")])
            # "Smooth Trimlite" / "" is how a price book imported before the audit splits it.
            if record.get("texture") == "Smooth" or str(record.get("brand") or "").startswith("Smooth"):
                model["smooth"] = True
            for choice in record["options"]:
                widths = _widths_from_band(choice["sizes"], allowed)
                for width_class, subset in (("std", [w for w in widths if w != 42]), ("42", [w for w in widths if w == 42])):
                    if not subset:
                        continue
                    existing = model["solid"].get((width_class, record["height"])) or {"bands": [], "widths": []}
                    model["solid"][(width_class, record["height"])] = {
                        "base": bases[record["height"]],
                        "bands": existing["bands"] + [{"widths": subset, "record": record, "choice": choice}],
                        "widths": sorted(set(subset) | set(existing["widths"])),
                    }
        source = doors.get(slug(FIBERGLASS_7FT_GLAZED["source"]))
        target = doors.get(slug(names.get(FIBERGLASS_7FT_GLAZED["model"], "")))
        if source and target and ("std", '6\'8"') in source["glazed"]:
            rows = source["glazed"][("std", '6\'8"')]
            target["glazed"][("std", '7\'0"')] = {size: rows[size] for size in FIBERGLASS_7FT_GLAZED["sizes"] if size in rows}
            target["derived"]['7\'0"'] = source["label"]

    # Offers per model.
    for model in doors.values():
        offers = []
        for (width_class, height), entry in model["solid"].items():
            book = entry["widths"]
            offers.append({
                "kind": "solid",
                "height": height,
                "widths": _selector_widths(material, model["key"], height, book),
                "book_widths": book,
                "entry": entry,
            })
        for (width_class, height), sizes in model["glazed"].items():
            if width_class != "std":
                book = [int(width_class)]
            elif material == "fiberglass":
                book = fiberglass_bands.get((model["label"], '6\'8"'), [32, 34, 36])
            else:
                book = STANDARD_WIDTHS
            book = [width for width in book if width in MATERIAL_WIDTHS[material]]
            if not book:
                continue
            glass = {}
            for size, series_rows in sizes.items():
                families: dict[str, list[str]] = defaultdict(list)
                for series in series_rows:
                    families[SERIES_FAMILY[series]].append(series)
                glass[size] = {family: _ordered_series(family, found) for family, found in families.items()}
            offers.append({
                "kind": "glazed",
                "height": height,
                "widths": _selector_widths(material, model["key"], height, book),
                "book_widths": book,
                "width_class": width_class,
                "glass": glass,
            })
        model["offers"] = offers

    for model in sidelites.values():
        offers: dict[str, Any] = {}
        for (height, size), series_rows in model["glazed"].items():
            families = defaultdict(list)
            for series in series_rows:
                families[SERIES_FAMILY[series]].append(series)
            offers.setdefault(height, {})[size] = {family: _ordered_series(family, found) for family, found in families.items()}
        model["offers"] = [{"kind": "glazed", "height": height, "glass": glass} for height, glass in offers.items()]
        if model["solid"]:
            for height in HEIGHTS:
                model["offers"].append({"kind": "solid", "height": height, "panels": sorted(model["solid"])})

    return {"doors": doors, "sidelites": sidelites}


def _ordered_series(family: str, found: list[str]) -> list[str]:
    order = [series for series, _ in FAMILY_BY_KEY[family]["series"]]
    return [series for series in order if series in found]


def _find_offer(model: dict[str, Any], kind: str, height: str, width: int) -> tuple[dict[str, Any] | None, bool]:
    """The offer for (kind, height, width) and whether the width is one the configurator shows."""
    fallback = None
    for offer in model["offers"]:
        if offer["kind"] != kind or offer["height"] != height:
            continue
        if width in offer["widths"]:
            return offer, True
        if width in offer["book_widths"] and fallback is None:
            fallback = offer
    return fallback, False


def _accepts(model: dict[str, Any], height: str, width: int) -> bool:
    return any(offer["height"] == height and width in offer["book_widths"] for offer in model["offers"])


def _sidelite_models_for(index: dict[str, Any], height: str) -> list[dict[str, Any]]:
    return [model for model in index["sidelites"].values() if any(offer["height"] == height for offer in model["offers"])]


def frame_depth_options(material: str, config: dict[str, Any]) -> list[dict[str, Any]]:
    mapping = (config.get("pipeline") or {}).get("frame_depths", {}).get(material, {})
    smooth_only = set((config.get("pipeline") or {}).get("smooth_only_depths", []))
    result = []
    for depth in FRAME_DEPTHS:
        if depth not in mapping:
            continue
        item = mapping[depth]
        result.append(
            {
                "key": depth,
                "label": FRAME_DEPTH_LABELS[depth],
                "standard": item is None,
                "frame_types": ["smooth"] if depth in smooth_only else list(FRAME_TYPES),
                "retractable_screen": depth in RETRACTABLE_SCREEN_DEPTHS,
            }
        )
    return result


def _tedee(row: dict[str, Any]) -> str:
    """Tedee "is only compatible with all FERCO handles, Miami handles and all Pull Bars" (FG p46, ST p41)."""
    if row["category"] == "ferco_multi_point_locks_handles":
        return "yes"
    if "Miami" in row["item"]:
        return "miami_only"  # the row also lists Verona, Miliano, Country, Ribbon, Tuscana (A26)
    return "no"


def handle_options(material: str) -> list[dict[str, Any]]:
    rows = [
        row
        for row in catalog.options()["options"]
        if row["material"] == material and row["category"] in HANDLE_CATEGORIES and row["item"] not in NOT_HANDLES
    ]
    return [
        {
            "item": row["item"],
            "label": re.sub(r"^\[NEW\]\s*", "", row["item"]),
            "has_dummy": "dummy" in row.get("prices", {}),
            "tedee": _tedee(row),
        }
        for row in rows
    ]


def pull_bar_options(material: str) -> dict[str, Any]:
    rows = [row for row in catalog.options()["pull_bars"] if row["material"] == material]

    def ordered(field: str, label: str | None = None) -> list[dict[str, Any]]:
        seen: dict[Any, Any] = {}
        for row in rows:
            seen.setdefault(row[field], row[label] if label else row[field])
        return [{"key": key, "label": value} for key, value in seen.items()]

    return {
        "styles": [{"key": row["key"], "label": str(row["label"]).title()} for row in ordered("style")],
        "blocks": [row for row in ordered("block", "block_label") if row["key"] in PULL_BAR_LOCK_BLOCKS],
        "lengths": sorted({row["length_in"] for row in rows}),
        "finishes": ordered("finish", "finish_label"),
        "shapes": [{"key": row["key"], "label": str(row["label"]).title()} for row in ordered("shape")],
    }


def _extras_payload(material: str, models: list[dict[str, Any]]) -> dict[str, Any]:
    keys = {model["key"] for model in models}
    return {
        "fire_rating": material == "steel",
        "accents": [
            {
                "key": accent["key"],
                "label": accent["label"],
                "model": accent["model"],
                "widths": accent["widths"],
                "finishes": [{"key": key, "label": label} for key, (label, _item) in accent["finishes"].items()],
            }
            for accent in ACCENTS
            if material == "steel" and accent["model"] in keys
        ],
        "vertical_accent": (
            {"model": "flush", "size": VERTICAL_ACCENT_SIZE, "finishes": [{"key": key, "label": label} for key, (label, _item) in VERTICAL_ACCENTS.items()]}
            if material == "steel"
            else None
        ),
        "reeded_accent": {"model": "flush"} if material == "steel" else None,
        "triple_glazing": material == "steel",
        "glass_frames": [{"key": key, "label": label} for key, (label, _item) in GLASS_FRAMES.items()],
        "screens": [{"key": key, "label": label} for key, label in (
            ("none", "None"),
            ("white", "Retractable, white"),
            ("painted", "Retractable, painted"),
            ("sliding_white", "Sliding, white"),
            ("sliding_painted_1s", "Sliding, painted 1 side"),
            ("sliding_painted_2s", "Sliding, painted 2 sides"),
        )],
        "retractable_screen_depths": [depth for depth in RETRACTABLE_SCREEN_DEPTHS],
    }


def _public_offer(offer: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in offer.items() if key not in {"entry", "book_widths"}}


def pipeline_catalog(config: dict[str, Any]) -> dict[str, Any]:
    """Availability-only payload for the step-by-step door configurator."""
    groups = catalog.data("glass_groups.json")
    materials = {}
    for material in ("steel", "fiberglass"):
        index = build_index(material)
        models = []
        for model in sorted(index["doors"].values(), key=lambda item: item["label"]):
            offers = [_public_offer(offer) for offer in model["offers"] if offer.get("widths")]
            if offers:
                models.append({"key": model["key"], "label": model["label"], "smooth": model["smooth"], "offers": offers})
        sidelite_models = [
            {"key": model["key"], "label": model["label"], "direct_glazed": model["direct_glazed"], "offers": model["offers"]}
            for model in sorted(index["sidelites"].values(), key=lambda item: (item["direct_glazed"], item["label"]))
        ]
        materials[material] = {
            "key": material,
            "label": material.title(),
            "widths": MATERIAL_WIDTHS[material],
            "default_frame_type": DEFAULT_FRAME_TYPE[material],
            "side_types": [{"key": key, "label": label} for key, label in SIDE_TYPES[material]],
            "frame_depths": frame_depth_options(material, config),
            "sills": [{"key": row["key"], "label": row["label"], "not_with": row["not_with"]} for row in SILLS[material]],
            "handles": handle_options(material),
            "pull_bars": pull_bar_options(material),
            "models": models,
            "sidelite_models": sidelite_models,
            "extras": _extras_payload(material, models),
            "designs": [
                {"name": row["name"], "group": row["group"]}
                for row in groups
                if material in row.get("materials", []) and row["group"] in "ABCD"
            ],
        }
    pipeline_cfg = config.get("pipeline") or {}
    return {
        "widths": WIDTHS,
        "standard_widths": STANDARD_WIDTHS,
        "heights": [{"key": key, "inches": inches} for key, inches in HEIGHTS.items()],
        "configurations": CONFIGURATIONS,
        "frame_types": [{"key": key, "label": label} for key, label in FRAME_TYPES.items()],
        "glass_families": [
            {
                "key": row["key"],
                "label": row["label"],
                "hint": row["hint"],
                "flat_max": bool(row.get("flat_max")),
                "per_square": bool(row.get("per_square")),
                "series": [{"key": key, "label": label} for key, label in row["series"]],
            }
            for row in GLASS_FAMILIES
        ],
        "glass_patterns": GLASS_PATTERNS,
        "transom_glass": [{"key": key, "label": label} for key, label in TRANSOM_GLASS],
        "brickmoulds": [{"key": key, "label": label} for key, (label, _item) in BRICKMOULDS.items()],
        "hinges": [{"key": key, "label": label} for key, label in HINGES.items()],
        "paint_presets": PAINT_PRESETS,
        "stain_presets": STAIN_PRESETS,
        **colours.payload(),
        "multipoint_required": {"materials": ["fiberglass"], "heights": ['8\'0"']},
        "fire_rated_list": pipeline_cfg.get("fire_rated_panel_list"),
        "default_sidelite_width": pipeline_cfg.get("sidelite_width_in", 14),
        "default_transom_height": pipeline_cfg.get("transom_height_in", 14),
        "discount": float(config["discount"]),
        "materials": materials,
    }


# --------------------------------------------------------------------------
# Selection -> finish column
# --------------------------------------------------------------------------


def _side(colours_: dict[str, Any], side: str) -> tuple[str, str]:
    value = (colours_ or {}).get(side) or {}
    return str(value.get("type") or ""), _clean(value.get("colour")).lower()


def finish_for(material: str, colours_: dict[str, Any]) -> str:
    """Map exterior/interior colour choices to the book's price column."""
    ext_type, ext_colour = _side(colours_, "exterior")
    int_type, int_colour = _side(colours_, "interior")
    allowed = {key for key, _ in SIDE_TYPES[material]}
    if ext_type not in allowed or int_type not in allowed:
        raise PipelineError("Choose an exterior and an interior finish offered on this material.")
    same = ext_colour == int_colour
    if material == "steel":
        painted = [ext_type == "painted", int_type == "painted"]
        if not any(painted):
            return "factory_white"
        if not all(painted):
            return "paint_1s"
        return "paint_2s_1c" if same else "paint_2s_2c"
    if ext_type == "painted" and int_type == "stained":
        raise PipelineError("Palma offers stained outside / painted inside, not painted outside / stained inside.")
    if ext_type == "stained" and int_type == "painted":
        return "stain_out_paint_in"
    if ext_type == "painted":
        return "paint_2s_1c" if same else "paint_2s_2c"
    return "stain_2s_1c" if same else "stain_2s_2c"


def side_types_valid(material: str, colours_: dict[str, Any]) -> bool:
    try:
        finish_for(material, colours_)
        return True
    except PipelineError:
        return False


def custom_colours(colours_: dict[str, Any]) -> list[tuple[str, str]]:
    """Distinct (type, colour) pairs that are not Palma standard colours.

    Covers the slab sides and a split frame. Blank colours are "to be
    chosen", not custom.
    """
    sides = [(colours_ or {}).get("exterior") or {}, (colours_ or {}).get("interior") or {}]
    frame = (colours_ or {}).get("frame") or {}
    if frame.get("mode") == "split":
        sides += [frame.get("exterior") or {}, frame.get("interior") or {}]
    found: dict[tuple[str, str], tuple[str, str]] = {}
    for side in sides:
        kind = str(side.get("type") or "")
        colour = _clean(side.get("colour"))
        if kind not in {"painted", "stained"} or not colour:
            continue
        if colours.standard_name(kind, colour) is None:
            found.setdefault((kind, colour.lower()), (kind, colour))
    return list(found.values())


# --------------------------------------------------------------------------
# Validation + pricing
# --------------------------------------------------------------------------


def _require(condition: Any, message: str) -> None:
    if not condition:
        raise PipelineError(message)


def _max_row(rows: list[dict[str, Any]], finish: str) -> dict[str, Any]:
    return max(rows, key=lambda row: row["prices"][finish])


def _check_glass(choice: dict[str, Any] | None, offer_glass: dict[str, Any], label: str) -> tuple[str, str, list[str], bool]:
    """Validate a glazed choice against an offer's glass map.

    Returns (size, family, series to price from, legacy) where ``legacy``
    means an old vented series key that now spans several sub-tables.
    """
    _require(choice, f"Choose the {label} glass.")
    size = choice.get("size")
    _require(size in offer_glass, f"{label}: glass size {size!r} is not offered on this slab.")
    family = choice.get("family")
    _require(family in offer_glass[size], f"{label}: {FAMILY_BY_KEY.get(family, {}).get('label', family)} is not offered in {size}.")
    options = offer_glass[size][family]
    if FAMILY_BY_KEY[family].get("flat_max"):
        return size, family, options, False
    series = choice.get("series") or options[0]
    if series in LEGACY_SERIES:
        found = [key for key in options if key in LEGACY_SERIES[series]]
        _require(found, f"{label}: {series} is not offered in {size}.")
        return size, family, found, True
    _require(series in options, f"{label}: {SERIES_LABEL.get(series, series)} is not offered in {size}.")
    return size, family, [series], False


def _sdl_adder(material: str, series: str, component: str) -> dict[str, Any] | None:
    for row in catalog.slabs(material):
        if row["kind"] == "per_square_adder" and row["series"] == series and row["component"] == component:
            return row
    return None


def upgrade_selection(spec: dict[str, Any]) -> dict[str, Any]:
    """Map model keys and glass sizes saved before the 2026-09-30 fixes to today's."""
    legacy = LEGACY_MODELS.get(spec.get("material") or "", {}).get(spec.get("model") or "")
    if not legacy:
        return spec
    candidates, sizes = legacy
    spec = copy.deepcopy(spec)
    door = (spec.get("glass") or {}).get("door") or {}
    if door.get("size") in sizes:
        door["size"] = sizes[door["size"]]
    index = build_index(spec["material"])
    for key in candidates:
        model = index["doors"].get(key)
        if not model:
            continue
        if not door.get("glazed") or any(
            offer["kind"] == "glazed" and door.get("size") in offer["glass"] for offer in model["offers"]
        ):
            spec["model"] = key
            return spec
    spec["model"] = candidates[0]
    return spec


def resolve(spec: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """Validate a pipeline selection step by step and return the priced plan.

    Errors name the first step that is incomplete, mirroring the UI rule that
    steps are completed in order.
    """
    spec = upgrade_selection(spec)
    notes: list[str] = []
    material = spec.get("material")
    _require(material in DEFAULT_FRAME_TYPE, "Step 1: choose steel or fiberglass.")
    frame_type = spec.get("frame_type") or DEFAULT_FRAME_TYPE[material]
    _require(frame_type in FRAME_TYPES, "Step 1: choose a valid frame type.")

    width = spec.get("width")
    height = spec.get("height")
    _require(width in MATERIAL_WIDTHS[material], "Step 2: choose a slab width.")
    _require(height in HEIGHTS, "Step 2: choose a slab height.")
    custom = spec.get("custom_size") or {}
    cut_width = cut_height = False
    if custom.get("enabled"):
        actual_width = float(custom.get("width_in") or width)
        actual_height = float(custom.get("height_in") or HEIGHTS[height])
        _require(0 < actual_width <= width, f"Step 2: the custom width must be at most the {width}\" slab it is cut from.")
        _require(0 < actual_height <= HEIGHTS[height], f"Step 2: the custom height must be at most the {height} slab it is cut from.")
        cut_width = actual_width < width
        cut_height = actual_height < HEIGHTS[height]

    layout = CONFIG_BY_KEY.get(spec.get("configuration"))
    _require(layout, "Step 3: choose a door configuration.")
    depth = spec.get("frame_depth")
    depths = {row["key"]: row for row in frame_depth_options(material, config)}
    _require(depth in depths, "Step 3: choose a frame depth offered on this material.")
    _require(frame_type in depths[depth]["frame_types"], f"Step 3: the {FRAME_DEPTH_LABELS[depth]} frame is smooth only.")

    index = build_index(material)
    model = index["doors"].get(spec.get("model") or "")
    _require(model and _accepts(model, height, width), "Step 4: choose a slab model offered in this size.")

    colours_ = spec.get("colours") or {}
    finish = finish_for(material, colours_)

    glass = spec.get("glass") or {}
    door_glass = glass.get("door") or {}
    plan: dict[str, Any] = {
        "spec": spec,
        "material": material,
        "frame_type": frame_type,
        "width": width,
        "height": height,
        "cut_width": cut_width,
        "cut_height": cut_height,
        "layout": layout,
        "depth": depth,
        "depth_item": (config.get("pipeline") or {}).get("frame_depths", {}).get(material, {}).get(depth),
        "model": model,
        "finish": finish,
        "colours": colours_,
        "notes": notes,
    }
    if door_glass.get("glazed"):
        offer, shown = _find_offer(model, "glazed", height, width)
        _require(offer, "Step 6: this slab is solid only in this size.")
        size, family, series, legacy = _check_glass(door_glass, offer["glass"], "Door")
        rows = [row for s in series for row in model["glazed"][(offer["width_class"], height)][size][s]]
        plan["door"] = {
            "kind": "glazed",
            "size": size,
            "family": family,
            "series": series,
            "row": _max_row(rows, finish),
            "variants": len(rows),
            "legacy": legacy,
            "design": door_glass.get("design"),
            "squares": door_glass.get("squares"),
        }
    else:
        _require("glazed" in door_glass, "Step 6: choose solid or glazed for the door.")
        offer, shown = _find_offer(model, "solid", height, width)
        _require(offer, "Step 6: this slab is only offered glazed in this size.")
        plan["door"] = {"kind": "solid", "entry": offer["entry"]}
    if not shown:
        listed = ", ".join(f'{value}"' for value in offer["widths"]) or "other sizes"
        notes.append(
            f"Palma's Panel Selector lists the {model['label']} slab at {height} in {listed} only; "
            f"the book allows {width}\". Confirm {width}\" with Palma before ordering."
        )

    sidelite_specs = glass.get("sidelites") or []
    _require(len(sidelite_specs) >= layout["sidelites"], "Step 6: choose the glass for each sidelite.")
    plan["sidelites"] = []
    for number, part in enumerate(sidelite_specs[: layout["sidelites"]], start=1):
        label = f"Sidelite {number}"
        sidelite = index["sidelites"].get(part.get("model") or "")
        _require(sidelite, f"Step 6: choose a model for {label.lower()}.")
        if part.get("glazed"):
            offer = next((item for item in sidelite["offers"] if item["kind"] == "glazed" and item["height"] == height), None)
            _require(offer, f"Step 6: {sidelite['label']} sidelites are not offered glazed at {height}.")
            size, family, series, legacy = _check_glass(part, offer["glass"], label)
            rows = [row for s in series for row in sidelite["glazed"][(height, size)][s]]
            plan["sidelites"].append({
                "kind": "glazed", "model": sidelite, "size": size, "family": family, "series": series,
                "row": _max_row(rows, finish), "legacy": legacy, "squares": part.get("squares"), "design": part.get("design"),
            })
        else:
            _require(sidelite["solid"], f"Step 6: {sidelite['label']} sidelites come glazed only.")
            _require(any(item["kind"] == "solid" and item["height"] == height for item in sidelite["offers"]), f"Step 6: solid sidelites are not offered at {height}.")
            panel = part.get("panel") or sorted(sidelite["solid"])[0]
            _require(panel in sidelite["solid"], f"Step 6: choose a solid panel for {label.lower()}.")
            plan["sidelites"].append({"kind": "solid", "model": sidelite, "panel": panel, "row": sidelite["solid"][panel]})

    # "Special Order sidelites and doorlites will be ordered together, therefore
    # both will be priced as Special Order" (FG and ST pp. 5-10).
    parts = [plan["door"], *plan["sidelites"]]
    special = [part for part in parts if part["kind"] == "glazed" and part["series"] == ["special_order"]]
    decorative = [part for part in parts if part["kind"] == "glazed" and part["family"] == "decorative"]
    _require(
        not (special and decorative),
        "Step 6: Palma orders special-order doorlites and sidelites together and prices both as special order — "
        "choose Specialty decorative → Special-order for the decorative parts too.",
    )

    if layout["transom"]:
        transom = glass.get("transom") or {}
        _require(transom.get("glass") in dict(TRANSOM_GLASS), "Step 6: choose the transom glass.")
        plan["transom"] = transom

    standard = spec.get("standard") or {}
    lock = standard.get("lock")
    _require(lock in LOCKS, "Step 7: choose double-bore prep, a multipoint lock or a pull bar.")
    handle = None
    if lock == "multipoint":
        handles = {row["item"]: row for row in handle_options(material)}
        _require(standard.get("handle") in handles, "Step 7: choose the multipoint handle set.")
        handle = handles[standard["handle"]]
    pull = None
    if lock == "pull_bar":
        pull = dict(standard.get("pull_bar") or {})
        _require(pull.get("block") in PULL_BAR_LOCK_BLOCKS, "Step 7: choose the pull bar's lock hardware.")
        try:
            pull["record"] = catalog.pull_bar(
                material,
                style=pull.get("style") or "straight",
                block=pull["block"],
                length_in=int(pull.get("length_in") or 36),
                finish=pull.get("finish") or "satin",
                shape=pull.get("shape") or "round",
            )
        except catalog.DoorLookupError as exc:
            raise PipelineError(f"Step 7: {exc}") from exc
        # "84" pull bars are for 8' doors only" (Offset Pull Bars, June 2025) -- an 84" bar can't fit an 80" slab.
        _require(pull["record"]["length_in"] < 84 or height == '8\'0"', 'Step 7: 84" pull bars fit 8\'0" doors only.')
    sill = next((row for row in SILLS[material] if row["key"] == (standard.get("sill") or "black_anodized")), None)
    _require(sill, "Step 7: choose a sill offered on this material.")
    _require(depth not in sill["not_with"], f"Step 7: the {sill['label'].lower()} sill is not compatible with the {FRAME_DEPTH_LABELS[depth]} frame.")
    brickmould = standard.get("brickmould") or "regular"
    _require(brickmould in BRICKMOULDS, "Step 7: choose a brickmould.")
    hinges = standard.get("hinges") or "black"
    _require(hinges in HINGES, "Step 7: choose the hinges.")
    plan["standard"] = {**standard, "sill_row": sill, "brickmould": brickmould, "hinges": hinges, "handle_row": handle, "pull": pull}

    extras = spec.get("extras") or {}
    if extras.get("tedee"):
        _require(lock in {"multipoint", "pull_bar"}, "Step 8: Tedee smart locks need the multipoint lock or a pull bar.")
        _require(not (handle and handle["tedee"] == "no"), f"Step 8: Tedee works only with FERCO handles, Miami handles and pull bars, not {handle['label'] if handle else ''}.")
        if pull and pull["block"] == "with_roller_latches_and_deadbolt_bore":
            raise PipelineError("Step 8: Tedee needs the pull bar with the multipoint lock.")
    if extras.get("tedee_knob"):
        _require(extras.get("tedee"), "Step 8: the Tedee temporary knob goes with the Tedee lock.")
    if extras.get("astragal_lock"):
        _require(layout["doors"] == 2, "Step 8: the astragal mortise lock is for double doors.")
    if extras.get("fire_rated"):
        if material == "steel":
            # "20 min. Fire Rating: +$230 (includes self-closing hinges)" on the steel solid-panel page (ST p38).
            plan["fire_rating"] = True
            if plan["door"]["kind"] == "glazed":
                notes.append("Palma prints the 20-minute fire rating on the solid-slab page (ST p38); confirm it is available with glass.")
        else:
            price = extras.get("fire_rated_list")
            _require(
                price not in (None, "") and float(price) > 0,
                "Step 8: Palma's fiberglass book has no fire-rated door; ask Palma, or choose steel (20-minute rating, ST p38).",
            )
            plan["fire_rated_list"] = float(price)
    screen = extras.get("screen") or "none"
    _require(screen in SCREENS, "Step 8: choose a screen option.")
    if screen in {"white", "painted"}:
        _require(
            depth in RETRACTABLE_SCREEN_DEPTHS,
            'Step 8: Palma\'s retractable screens fit only 6-5/8" or 7-1/4" jambs (FG p45, ST p40).',
        )
    accent = extras.get("accent") or {}
    if accent.get("design"):
        definition = ACCENT_BY_KEY.get(accent["design"])
        _require(material == "steel" and definition, "Step 8: decorative accents are for Novatech steel slabs only.")
        _require(definition["model"] == model["key"], f"Step 8: the {definition['label']} accent goes on the {definition['model'].title()} slab.")
        _require((accent.get("finish") or "ss") in definition["finishes"], f"Step 8: {definition['label']} is not made in that finish.")
        _require((accent.get("sides") or "exterior") in {"exterior", "both"}, "Step 8: choose exterior or both sides for the accent.")
    if extras.get("vertical_accent"):
        _require(material == "steel" and model["key"] == "flush", "Step 8: the vertical accent goes on the Uno (flush) steel slab.")
        _require(extras["vertical_accent"] in VERTICAL_ACCENTS, "Step 8: choose the vertical accent finish.")
        _require(
            plan["door"]["kind"] == "glazed" and plan["door"]["size"] == VERTICAL_ACCENT_SIZE,
            "Step 8: the vertical accent is for doors with a 7x64 lite.",
        )
    if extras.get("reeded_accent"):
        _require(material == "steel" and model["key"] == "flush", "Step 8: the reeded wood accent attaches to the Uno (flush) steel slab.")
    if extras.get("glass_frame"):
        _require(extras["glass_frame"] in GLASS_FRAMES, "Step 8: choose a glass frame.")
        _require(_framed_lites(plan), "Step 8: glass frames need a glazed door or sidelite.")
    operating = int(extras.get("operating_sidelite") or 0)
    if operating:
        _require(0 < operating <= layout["sidelites"], "Step 8: there aren't that many sidelites to hinge.")
        _require(not (cut_width or cut_height), "Step 8: operating sidelites are for standard panel sizes only (FG p44, ST p40).")
    if extras.get("triple_glazing"):
        _require(material == "steel", "Step 8: the triple-glazing upcharge is in the steel book only.")
        _require(extras["triple_glazing"] in {"lowe_1x", "lowe_2x"}, "Step 8: choose 1 or 2 LowE coatings for triple glazing.")
        _require(plan["door"]["kind"] == "glazed", "Step 8: triple glazing is for doorlites.")
        plan["triple_glazing"] = _triple_glazing(plan["door"]["size"])
    plan["extras"] = extras
    return plan


def _framed_lites(plan: dict[str, Any]) -> tuple[int, int]:
    """(lites needing a frame, lites whose ** size already includes the contemporary frame)."""
    doors = plan["layout"]["doors"]
    total = included = 0
    door = plan["door"]
    if door["kind"] == "glazed":
        total += doors
        if "**" in str(door["row"].get("glass_size")) or plan["model"]["key"] in FRAME_INCLUDED_MODELS[plan["material"]]:
            included += doors
    for part in plan["sidelites"]:
        if part["kind"] == "glazed" and not part["model"]["direct_glazed"]:
            total += 1
    return total, included


def _triple_glazing(size: str) -> dict[str, Any]:
    match = re.match(r"\s*(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)", size)
    _require(match, f"Step 8: no triple-glazing price for {size}.")
    lite = (int(float(match.group(1))), int(float(match.group(2))))
    for row in catalog.options()["options"]:
        if row["material"] != "steel" or row["category"] != "triple_glazing_upcharge":
            continue
        nums = [int(value) for value in re.findall(r"\d+", row["item"])]
        if tuple(nums[:2]) == lite:
            count = re.search(r"\(x(\d)\)", size)
            return {"record": row, "lites": int(count.group(1)) if count else 1}
    raise PipelineError(f"Step 8: the steel book has no triple-glazing price for a {size} lite (ST p45).")


def _paint_side_label(colours_: dict[str, Any]) -> str:
    ext_type, ext_colour = _side(colours_, "exterior")
    int_type, int_colour = _side(colours_, "interior")
    parts = []
    for name, kind, colour in (("ext.", ext_type, ext_colour), ("int.", int_type, int_colour)):
        if kind == "white":
            parts.append(f"factory white {name}")
        else:
            parts.append(f"{kind} {colour.title() or 'colour TBD'} {name}")
    return ", ".join(parts)


def _suffix_last(quote: Any, suffix: str) -> None:
    item = quote.items[-1]
    item["description"] = f"{item['description']} — {suffix}"
    item["customer_description"] = f"{item['customer_description']} — {suffix}"


def _glass_text(part: dict[str, Any]) -> str:
    family = FAMILY_BY_KEY[part["family"]]
    row = part["row"]
    if family.get("flat_max") or part.get("legacy"):
        text = f"{family['label']} {part['size']}"
    else:
        text = f"{SERIES_LABEL[series_key(row)]} {part['size']}"
    if part.get("design"):
        text += f", {'design' if family.get('flat_max') else 'pattern'}: {part['design']}"
    return text


def _add_sdl_squares(quote: Any, plan: dict[str, Any], part: dict[str, Any], component: str, qty: int, label: str) -> None:
    if part["kind"] != "glazed" or part["family"] != "sdl":
        return
    series = part["series"][0]
    adder = _sdl_adder(plan["material"], series, component)
    if not adder:
        return
    squares = int(part.get("squares") or 0)
    unit = adder["prices"][plan["finish"]]
    if squares <= 0:
        quote.notes.append(
            f"{label}: SDL square count not entered — Palma adds ${unit:,.0f} list per square "
            f"({plan['material']} p{adder['source_page']}). Enter the count to price it."
        )
        return
    quote.add(
        "Upcharge Option",
        f"{label} SDL squares ({squares} @ ${unit:,.0f}), {SERIES_LABEL[series]}",
        unit * squares,
        qty,
        f"{plan['material']} p{adder['source_page']}",
    )


def quote_pipeline(spec: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """Price a pipeline selection through the standard Palma door engine."""
    from .pricing import DoorQuote  # local import: pricing imports this module

    plan = resolve(spec["pipeline"], config)
    pipe = plan["spec"]
    layout = plan["layout"]
    material = plan["material"]
    height = plan["height"]
    finish = plan["finish"]
    doors = layout["doors"]
    sidelite_count = layout["sidelites"]
    panels = doors + sidelite_count
    extras = plan["extras"]
    model = plan["model"]
    door = plan["door"]

    standard = plan["standard"]
    skip = []
    if standard["brickmould"] == "none":
        skip.append("brickmould")
    if standard["hinges"] == "standard" or plan.get("fire_rating"):
        skip.append("hinges")
    engine_spec = {
        "label": spec.get("label") or "Entrance door",
        "material": material,
        "finish": finish,
        "opening_type": layout["opening_type"],
        "door": {"height": height},
        "door2": {"height": height} if doors == 2 else None,
        "transom": plan.get("transom"),
        "skip_defaults": skip,
    }
    quote = DoorQuote(engine_spec, config)
    quote.notes.extend(plan["notes"])
    finish_label = catalog.FINISH_LABELS[finish]
    colour_note = _paint_side_label(plan["colours"])

    # -- Step 4/6: door slab(s) --------------------------------------------
    size_label = f'{plan["width"]}" x {height}'
    if door["kind"] == "glazed":
        row = door["row"]
        quote.check_book(book_warnings.slab_warning(material, row))
        family = FAMILY_BY_KEY[door["family"]]
        glass_text = _glass_text(door)
        if family.get("flat_max"):
            if not door.get("design"):
                quote.notes.append(
                    f"Decorative glass priced at the dearest group offered on {model['label']} {door['size']} "
                    f"({SERIES_LABEL[row['series']]}); the customer can choose any decorative pattern without re-quoting."
                )
        elif door.get("legacy"):
            quote.notes.append(
                f"Vented unit priced at the dearest {family['label'].lower()} in {door['size']} "
                f"({row.get('variant_label') or SERIES_LABEL.get(series_key(row))}): the selection or the published price book "
                "doesn't name the sub-type. Re-pick the exact unit to re-price."
            )
        elif door["variants"] > 1:
            quote.notes.append(
                f"The book lists {door['variants']} {SERIES_LABEL[series_key(row)]} rows for {model['label']} "
                f"{door['size']}; priced at the highest. Confirm the exact unit with Palma."
            )
        if door["family"] == "executive":
            quote.notes.append(
                "Executive panel priced as printed (ST p37). The layout letters refer to Palma's Executive legend; "
                "confirm the layout and glass with Palma."
            )
        quote.add(
            "Door Slab",
            f"{model['label']} slab {size_label}, {glass_text}, {finish_label}",
            row["prices"][finish],
            doors,
            f"{material} p{row['source_page']}",
        )
        if height in model["derived"]:
            source = model["derived"][height]
            quote.notes.append(
                f"{height} glazed door priced as the 6'8\" {source} {door['size']} row + the {height} system "
                f"(the book prints the system charge on every glass page); confirm with Palma."
            )
        _add_sdl_squares(quote, plan, door, "door", doors, "Door")
    else:
        entry = door["entry"]
        base = entry["base"]
        quote.add(
            "Door Slab",
            f"{model['label']} solid slab {size_label}, {finish_label}",
            base["prices"][finish],
            doors,
            f"{material} p{base['source_page']}",
        )
        band = next((item for item in entry.get("bands", []) if plan["width"] in item["widths"]), None)
        if band:
            quote.check_book(book_warnings.panel_upcharge_warning(material, band["record"], band["choice"], plan["width"]))
        if band and band["choice"]["upcharge"]:
            quote.add(
                "Upcharge Option",
                f"Panel style {band['record']['panel']} {band['record']['code']} ({band['choice']['sizes']})",
                band["choice"]["upcharge"],
                doors,
                f"{material} p{band['record']['source_page']}",
            )
        if entry.get("adder") and plan["width"] in STEEL_NON_STANDARD_WIDTHS:
            # The book row lists every non-standard width; name only the one quoted.
            quote.add_option(
                {
                    "category": "custom_sizing",
                    "item": entry["adder"],
                    "description": f'Non-Standard Panel {plan["width"]}" Steel Slab (Flush Only)',
                    "qty": doors,
                    "row": "Upcharge Option",
                }
            )
        if model["smooth"] and finish.startswith("stain"):
            quote.notes.append(
                f"{model['label']} is a smooth skin; Palma's stains are for woodgrain fiberglass only. "
                "Choose paint, or confirm the stain with Palma."
            )

    # -- Step 6: sidelites -------------------------------------------------
    if material == "steel" and any(part["kind"] == "glazed" and part["model"]["direct_glazed"] for part in plan["sidelites"]):
        quote.notes.append(
            "Direct-set sidelite: Palma prices the size bracket by the sidelite's overall width (frame width minus "
            "slab width), not the glass width — e.g. a 69\" frame with a 42\" slab is \"up to 27.5\"\"."
        )
    for number, part in enumerate(plan["sidelites"], start=1):
        row_name = "Sidelite" if number == 1 else "Sidelite 2"
        row = part["row"]
        quote.check_book(book_warnings.slab_warning(material, row))
        if part["kind"] == "glazed":
            text = f"{part['model']['label']} sidelite, {_glass_text(part)}, {finish_label}"
        else:
            text = f"Solid {part['panel'].lower()} sidelite, {finish_label}"
        quote.add(row_name, text, row["prices"][finish], 1, f"{material} p{row['source_page']}")
        if part["kind"] == "glazed":
            component = "direct_glazed_sidelite" if part["model"]["direct_glazed"] else "sidelite"
            _add_sdl_squares(quote, plan, part, component, 1, f"Sidelite {number}")

    # -- Step 6: transom ---------------------------------------------------
    if plan.get("transom"):
        transom = plan["transom"]
        sidelite_width = float(pipe.get("sidelite_width_in") or (config.get("pipeline") or {}).get("sidelite_width_in", 14))
        glass_height = float(transom.get("height_in") or (config.get("pipeline") or {}).get("transom_height_in", 14))
        glass_width = plan["width"] * doors + sidelite_width * sidelite_count
        shape = transom.get("shape") or "rectangle"
        quote.add_transom(
            {
                "shape": shape,
                "glass": transom["glass"],
                "sq_ft": round(glass_width * glass_height / 144, 2),
                "tempered": bool(transom.get("tempered")),
                "qty": 1,
            }
        )
        if transom["glass"] in TRANSOM_GLASS_EXTRA_CHARGE:
            quote.notes.append(
                "Transom glass with grilles/SDLs: the book adds \"additional charges per box\" but prints no amount; get it from Palma."
            )
        if shape == "rectangle":
            quote.notes.append("Rectangular transom: casing trim is not included (the book's shape transoms include 3-1/2\" colonial casing).")

    # -- Step 2: 7'/8' system and custom cut-down --------------------------
    if height in SYSTEM_ITEMS:
        # Fiberglass solid 7'0" and 8'0" bases (FG p41-42) already include the
        # system: they are exactly the 6'8" base + $275 / + $375 (P1).
        system_panels = panels - (doors if material == "fiberglass" and door["kind"] == "solid" else 0)
        if system_panels:
            quote.add_option({"category": "custom_sizing", "item": SYSTEM_ITEMS[height], "qty": system_panels, "row": "Upcharge Option"})
        if sidelite_count:
            quote.notes.append(
                f"{height} system charged per door and per sidelite, as the extras page says; the glass pages say "
                "\"per box\". Confirm with Palma."
            )
    if plan["cut_width"] or plan["cut_height"]:
        cut_panels = panels if plan["cut_height"] else doors
        quote.add_option({"category": "custom_sizing", "item": "Cut-Down (per Door Panel or Sidelite Panel)", "qty": cut_panels, "row": "Upcharge Option"})
        custom = pipe.get("custom_size") or {}
        quote.notes.append(
            f"Custom size {custom.get('width_in') or plan['width']}\" x {custom.get('height_in') or HEIGHTS[height]}\" "
            f"cut down from the {plan['width']}\" x {height} slab."
        )

    # -- Step 3: frame -----------------------------------------------------
    if plan["depth_item"]:
        # Not the "Brickmould" row: that would silence the standing brickmould default.
        quote.add_option({"category": "jambs_brickmould", "item": plan["depth_item"], "qty": 1, "row": "Extras 1"})
    quote.notes.append(f"{FRAME_TYPES[plan['frame_type']]}, {FRAME_DEPTH_LABELS[plan['depth']]} frame depth.")

    # -- Step 5: frame colour and custom colours ---------------------------
    frame = (plan["colours"] or {}).get("frame") or {}
    if material == "steel":
        # A painted steel frame is its own line: "Door Frame and Brickmould
        # (per door or sidelite) $230" (ST p44). Palma quote 53326 (2026-09-29)
        # charged it once for a door + direct-set sidelite: the direct-set
        # sidelite's paint price already covers its frame.
        split = frame.get("mode") == "split"
        sides = [frame.get("exterior") or {}, frame.get("interior") or {}] if split else [
            (plan["colours"] or {}).get("exterior") or {},
            (plan["colours"] or {}).get("interior") or {},
        ]
        _require(all(side.get("type") != "stained" for side in sides), "Step 5: only fiberglass frames can be stained.")
        if any(side.get("type") == "painted" for side in sides):
            panel_sidelites = sum(1 for part in plan["sidelites"] if not part["model"]["direct_glazed"])
            quote.add_option(
                {
                    "category": "paint",
                    "item": "Door Frame and Brickmould (per door or sidelite)",
                    "qty": doors + panel_sidelites,
                    "description": "Door frame and brickmould painted (per door or panel sidelite)",
                    "row": "Extras 1",
                }
            )
            if panel_sidelites:
                quote.notes.append(
                    "Frame paint charged per door and per panel sidelite; Palma has only confirmed it per door "
                    "(direct-set sidelites include their frame). Check panel sidelites with Palma."
                )
        if split:
            quote.notes.append("Frame finished separately from the slab (split colour).")
    elif frame.get("mode") == "split":
        frame_type_ext = (frame.get("exterior") or {}).get("type")
        frame_type_int = (frame.get("interior") or {}).get("type")
        frame_ext_colour = _clean((frame.get("exterior") or {}).get("colour")).lower()
        frame_int_colour = _clean((frame.get("interior") or {}).get("colour")).lower()
        if "stained" in (frame_type_ext, frame_type_int):
            _require(material == "fiberglass", "Step 5: only fiberglass frames can be stained.")
            if frame_type_ext == "stained" and frame_type_int == "stained":
                item = "Door Frame and Brickmould - 2 Sides (same colour)" if frame_ext_colour == frame_int_colour else "Door Frame and Brickmould - 2 Sides (2 different colours)"
            else:
                item = "Door Frame and Brickmould - One Side"
            quote.add_option({"category": "stain", "item": item, "qty": panels, "row": "Extras 1"})
        elif "painted" in (frame_type_ext, frame_type_int):
            quote.add_option({"category": "paint", "item": "Door Frame and Brickmould (per door or sidelite)", "qty": panels, "row": "Extras 1"})
        quote.notes.append("Frame finished separately from the slab (split colour).")
    for kind, colour in custom_colours(plan["colours"]):
        category = "stain" if kind == "stained" and material == "fiberglass" else "paint"
        quote.add_option(
            {
                "category": category,
                "item": "Custom Colour Match",
                "description": f"Custom colour match — {colour} ({'stain' if kind == 'stained' else 'paint'}; colour chip required)",
                "row": "Extras 1",
            }
        )
        quote.notes.append(
            f"\"{colour}\" is not a Palma standard {'stain' if kind == 'stained' else 'paint'} colour, so it is quoted as a custom "
            "colour match: Palma needs a physical colour chip and adds about 2 weeks."
        )

    # -- Step 7: standard options ------------------------------------------
    sill = standard["sill_row"]
    quote.add_option({"category": "sills", "item": sill["item"]})
    if standard.get("sill_extension"):
        quote.add_option({"category": "sills", "item": '3"- 4" Sill extension'})
    if plan.get("fire_rating"):
        quote.notes.append("Self-closing hinges come with the 20-minute fire rating (no separate hinge charge).")
    elif standard["hinges"] == "standard":
        quote.notes.append("Standard hinges (no charge) instead of heavy-duty.")
    elif standard["hinges"] == "satin_nickel":
        quote.add_option(
            {"category": "hinges", "item": "Heavy-Duty", "qty": doors, "description": "Heavy-Duty Stainless Steel hinges, Satin Nickel (per door)"}
        )
    lock = standard.get("lock")
    if lock == "multipoint":
        quote.add_option({"category": None, "item": standard["handle"], "column": "active", "qty": 1, "row": "Multipoint"})
        _suffix_last(quote, "multipoint lock, active leaf")
        if doors == 2 and standard["handle_row"]["has_dummy"]:
            quote.add_option({"category": None, "item": standard["handle"], "column": "dummy", "qty": 1, "row": "Multipoint"})
            _suffix_last(quote, "inactive leaf (dummy)")
    elif lock == "pull_bar":
        pull = standard["pull"]
        record = pull["record"]
        choice = {key: record[key] for key in ("style", "length_in", "finish", "shape")}
        quote.add_pull_bar({**choice, "block": record["block"]})
        _suffix_last(quote, "active leaf")
        if doors == 2:
            quote.add_pull_bar({**choice, "block": PULL_BAR_DUMMY_BLOCK})
            _suffix_last(quote, "inactive leaf")
    else:
        quote.add("Multipoint", "Double-bore lock prep (hardware by others)", 0, 1, None)
    if lock == "double_bore" or (lock == "pull_bar" and standard["pull"]["block"] == "with_roller_latches_and_deadbolt_bore"):
        if material == "fiberglass" or height == '8\'0"':
            quote.notes.append(
                "Palma: \"Multipoint locks are necessary for all fiberglass doors and all 8' doors\" (Panel Selector). "
                "Confirm with Palma before ordering without one."
            )
    brickmould = standard["brickmould"]
    if brickmould == "flat":
        quote.notes.append('Flat 1-1/2" brickmould instead of regular 2" (same price).')
    elif BRICKMOULDS[brickmould][1]:
        quote.add_option({"category": "jambs_brickmould", "item": BRICKMOULDS[brickmould][1], "qty": 1, "row": "Brickmould"})

    # -- Step 8: extras ----------------------------------------------------
    if extras.get("tedee"):
        quote.add_option({"category": "ferco_smart_lock", "item": "Tedee-PRO Smart Lock", "column": "active"})
        for key, item in TEDEE_ADDONS:
            if extras.get(f"tedee_{key}"):
                quote.add_option({"category": "ferco_smart_lock", "item": item, "column": "active"})
        if extras.get("tedee_knob"):
            quote.add_option({"category": "ferco_smart_lock", "item": "Tedee Temporary Knob", "column": "active"})
        if standard["handle_row"] and standard["handle_row"]["tedee"] == "miami_only":
            quote.notes.append("Tedee works only with the Miami handle from this handle row (not Verona, Miliano, Country, Ribbon or Tuscana).")
    if extras.get("key_alike"):
        quote.add_option({"category": "ferco_multi_point_locks_handles", "item": "Key Alike (same brand only)", "column": "active", "row": "Multipoint"})
    screen = extras.get("screen") or "none"
    if SCREENS[screen]:
        item = SCREENS[screen]
        qty = max(1, int(extras.get("screen_qty") or 1))
        if screen in {"white", "painted"}:
            item = f"8' {item}" if height == '8\'0"' else item
            # "For Double Door: RETRACTABLE Screen cost x 2" (FG p45, ST p40).
            qty = max(qty, doors)
            if standard["brickmould"] != "regular":
                quote.notes.append(
                    "Retractable screen: the book allows only Regular 2\" brickmould with ≤1\" reveal; Palma's D-RT form also "
                    "lists Flat 1-1/2\" and Flush. Confirm the brickmould with Palma."
                )
            if standard["sill_row"]["key"].startswith("outswing"):
                quote.notes.append("Retractable screens are for in-swing doors (Palma D-RT form); check the outswing sill.")
        quote.add_option({"category": "screens", "item": item, "qty": qty, "row": "Extras 1"})
    if extras.get("astragal_lock"):
        quote.add_option({"category": "ferco_multi_point_locks_handles", "item": "Ferco Mortise Astragal Lock", "column": "active", "row": "Multipoint"})
    if plan.get("fire_rating"):
        try:
            quote.add_option({"category": "fire_rating", "item": "20 min. Fire Rating", "qty": doors, "row": "Upcharge Option"})
        except catalog.DoorLookupError as exc:
            raise PipelineError(
                "Step 8: the published steel options price book has no 20-minute fire-rating row (ST p38, +$230). "
                "A manager should re-import it from the current file under Admin → Price books."
            ) from exc
    elif plan.get("fire_rated_list"):
        quote.add("Upcharge Option", "Fire-rated panel upcharge", plan["fire_rated_list"], doors, "entered by rep")
        quote.notes.append("Fire-rated fiberglass price entered by the rep — Palma's fiberglass book has no fire rating; confirm with Palma.")
    for key, item in (("mail_slot", "Mail Slot installed"), ("peep_viewer", "Peep Door Viewer installed")):
        if extras.get(key):
            quote.add_option({"category": "decorative_accesories", "item": item, "row": "Extras 1"})
    if extras.get("dentil_shelf"):
        if material == "steel":
            item = "Dentil Shelf for Steel door - White" if finish == "factory_white" else "Dentil Shelf for Steel door - Painted"
        else:
            item = "Dentil Shelf for Fiberglass door - Stained" if finish.startswith("stain") else "Dentil Shelf for Fiberglass door - Painted"
        quote.add_option({"category": "decorative_accesories", "item": item, "qty": doors, "row": "Extras 1"})
    if extras.get("kick_panel"):
        quote.add_option({"category": "decorative_accesories", "item": f"Kick Panel for {'Steel' if material == 'steel' else 'Fiberglass'}", "qty": doors, "row": "Extras 1"})
    accent = extras.get("accent") or {}
    if accent.get("design"):
        definition = ACCENT_BY_KEY[accent["design"]]
        finish_name, item = definition["finishes"][accent.get("finish") or "ss"]
        sides = 2 if accent.get("sides") == "both" else 1
        quote.add_option(
            {
                "category": "decorative_accents",
                "item": item,
                "qty": sides * doors,
                "description": f"{definition['label']} decorative accent, {finish_name} ({'both sides' if sides == 2 else 'exterior'}, per side)",
                "row": "Extras 1",
            }
        )
        if plan["width"] not in definition["widths"]:
            quote.notes.append(
                f"Palma's Panel Selector lists the {definition['label']} accent for {', '.join(str(w) for w in definition['widths'])}\" slabs; confirm {plan['width']}\"."
            )
        if height != '6\'8"':
            quote.notes.append(
                f"Palma lists accents on 6'8\" slabs only (the 8' Vogue door takes a 5-piece Vogue 2 set, not priced in the book); "
                f"confirm the {definition['label']} accent and price for {height} with Palma."
            )
    if extras.get("vertical_accent"):
        finish_name, item = VERTICAL_ACCENTS[extras["vertical_accent"]]
        quote.add_option(
            {
                "category": "decorative_accents",
                "item": item,
                "qty": doors,
                "description": f"Vertical accent for the 7x64 lite, {finish_name} (exterior only)",
                "row": "Extras 1",
            }
        )
        quote.notes.append("Vertical accent priced on top of the 7x64 glazed door; Novatech sells it with its frame and lite — confirm with Palma.")
    if extras.get("reeded_accent"):
        quote.add_option({"category": "decorative_accents", "item": "Vertical Accent Reeded Wood", "qty": doors, "description": "Vertical accent, reeded wood (10\" x 76\")", "row": "Extras 1"})
    if extras.get("casing"):
        category = "casing_trim_stained" if material == "fiberglass" and finish.startswith("stain") else "casing_trim_painted"
        casing_item = CASING_ITEMS[layout["opening_type"]]
        record = catalog.find_option(material, category, casing_item)
        quote.add_option(
            {"category": category, "item": casing_item, "description": f"Casing trim, {'stained' if 'stained' in category else 'painted'} — {casing_item.lower()}", "row": "Extras 1"}
        )
        if extras.get("casing_backband"):
            # "For Backband add 50%" (FG p45, ST p40).
            quote.add("Extras 1", "Casing backband (+50% of casing)", catalog.option_price(record) * 0.5, 1, f"{material} p{record['source_page']}")
        if plan.get("transom"):
            quote.notes.append("Casing is priced for the door and sidelites only; the book has no casing line for a transom.")
    if extras.get("glass_frame"):
        label, item = GLASS_FRAMES[extras["glass_frame"]]
        total, included = _framed_lites(plan)
        qty = total - included if extras["glass_frame"] == "contemporary" else total
        if qty:
            quote.add_option({"category": "glass_frame_options", "item": item, "qty": qty, "description": f"{label} (per lite)"})
        if included and extras["glass_frame"] == "contemporary":
            quote.notes.append("The contemporary glass frame is included on ** sizes (Victoria and Soho panels, Shaker Craftsman lites).")
    operating = int(extras.get("operating_sidelite") or 0)
    if operating:
        quote.add_option({"category": "operating_sidelite_s", "item": "Hinged Sidelite Panel with Astragal", "qty": operating, "row": "Extras 1"})
    if plan.get("triple_glazing"):
        glazing = plan["triple_glazing"]
        column = extras["triple_glazing"]
        record = glazing["record"]
        quote.add(
            "Upcharge Option",
            f"Triple glazing, LowE {'2x' if column == 'lowe_2x' else '1x'} — {door['size']} doorlite",
            record["prices"][column] * glazing["lites"],
            doors,
            f"steel p{record['source_page']}",
        )
        quote.notes.append("Palma's triple-glazing upcharge applies only to Novatech Silkscreen and V-Groove doorlites (ST p45).")

    quote.notes.append(f"Colours: {colour_note}")
    weeks = LEAD_TIMES.get(finish)
    if weeks:
        extra = []
        if custom_colours(plan["colours"]):
            extra.append("custom colour +2 weeks")
        if plan.get("transom") and (plan["transom"].get("shape") or "rectangle") != "rectangle":
            extra.append("shape transom +2–3 weeks")
        if door["kind"] == "solid" and door["entry"].get("adder"):
            extra.append("non-standard steel panel: extended lead time")
        quote.notes.append(f"Palma lead time for {finish_label.lower()}: {weeks}{'; ' + ', '.join(extra) if extra else ''} (docs.palmadoor.com).")
    quote.apply_defaults()
    return quote.totals()




# Customer-facing finish wording; mirrors FINISH_LABELS in frontend/lib/doorPipeline.ts.
SUMMARY_FINISH_LABELS = {
    "factory_white": "Factory white",
    "paint_1s": "Painted 1 side",
    "paint_2s_1c": "Painted 2 sides, 1 colour",
    "paint_2s_2c": "Painted 2 sides, 2 colours",
    "stain_2s_1c": "Stained 2 sides, 1 colour",
    "stain_2s_2c": "Stained 2 sides, 2 colours",
    "stain_out_paint_in": "Stained outside / painted inside",
}


def pipeline_summary(pipe: dict[str, Any]) -> list[str]:
    """Plain-language description of a pipeline selection (no pricing).

    Mirrors ``selectionSummary`` + design + lock in frontend/lib/doorPipeline.ts
    and productDescriptions.ts word for word, so a description the builder saved
    is recognised here and not repeated on the estimate.
    """
    if not isinstance(pipe, dict):
        return []
    if pipe.get("material") in LEGACY_MODELS:
        pipe = upgrade_selection(pipe)
    material = pipe.get("material")
    layout = CONFIG_BY_KEY.get(pipe.get("configuration") or "", {})
    custom = pipe.get("custom_size") or {}
    details = [
        str(material or "").title(),
        f'{pipe.get("width")}" x {pipe.get("height")}{" (cut down)" if custom.get("enabled") else ""}' if pipe.get("width") and pipe.get("height") else "",
        layout.get("label", ""),
    ]
    model = pipe.get("model")
    if model:
        try:
            label = build_index(material)["doors"][model]["label"]
        except (KeyError, catalog.DoorLookupError):
            label = str(model).replace("-", " ").title()
        details.append(f"{label} slab")
    door_glass = (pipe.get("glass") or {}).get("door") or {}
    if door_glass.get("glazed") is False:
        details.append("Solid slab")
    elif door_glass.get("glazed") and door_glass.get("family"):
        family = FAMILY_BY_KEY.get(door_glass["family"], {}).get("label", door_glass["family"])
        details.append(f"{family} {door_glass['size']}" if door_glass.get("size") else family)
    try:
        details.append(SUMMARY_FINISH_LABELS[finish_for(material, pipe.get("colours") or {})])
    except (PipelineError, KeyError):
        pass
    if door_glass.get("design"):
        details.append(f"design: {door_glass['design']}")
    standard = pipe.get("standard") or {}
    if standard.get("lock") == "multipoint":
        handle = re.sub(r"^\[NEW\]\s*", "", str(standard.get("handle") or ""))
        details.append(f"Multipoint lock: {handle}")
    elif standard.get("lock") == "pull_bar":
        pull = standard.get("pull_bar") or {}
        details.append(f'Pull bar: {str(pull.get("style") or "straight").title()} {pull.get("length_in") or 36}"')
    elif standard.get("lock") == "double_bore":
        details.append("Double-bore prep")
    return [item for item in details if item]


# --------------------------------------------------------------------------
# Elevation drawing (estimate screen, customer portal, PDF)
# --------------------------------------------------------------------------

# Swatch colours for names saved before the Palma colour lists (Palma's own
# colours come from services/doors/colours.py); mirrors
# frontend/components/DoorDrawing.tsx.
PAINT_HEX = {
    "white": "#f8fafc",
    "factory white": "#f8fafc",
    "black": "#1f2328",
    "iron ore": "#3d3f42",
    "charcoal": "#36454f",
    "commercial brown": "#4b3621",
    "sandtone": "#c9b48a",
    "forest green": "#244a33",
    "barn red": "#7c231c",
    "navy": "#1f2a44",
}
STAIN_HEX = {
    "light oak": "#c8a165",
    "honey": "#b8792f",
    "medium oak": "#9a6a36",
    "walnut": "#5d3a1a",
    "mahogany": "#6b2e1f",
    "espresso": "#3b2a20",
    "ebony": "#2a211c",
}
UNNAMED_PAINT = "#64748b"
HEIGHT_INCHES = {'6\'8"': 80, '7\'0"': 84, '8\'0"': 96}
OPENING_LAYOUT = {
    "single_door": (1, 0),
    "single_1_sidelite": (1, 1),
    "single_2_sidelites": (1, 2),
    "double_door": (2, 0),
    "double_2_sidelites": (2, 2),
}


def _pull_bar_length(pull: Any) -> float | None:
    try:
        return float((pull or {}).get("length_in") or 36)
    except (TypeError, ValueError, AttributeError):
        return None


def finish_hex(side_type: str | None, colour: str | None) -> str:
    key = _clean(colour).lower()
    if not side_type or side_type == "white":
        return PAINT_HEX["white"]
    palma = colours.colour_hex(side_type, colour)
    if palma:
        return palma
    if side_type == "stained":
        return STAIN_HEX.get(key, STAIN_HEX["medium oak"])
    return PAINT_HEX.get(key, UNNAMED_PAINT)


def _glass_ref(part: dict[str, Any] | None) -> dict[str, str] | None:
    if not isinstance(part, dict) or not part.get("glazed") or not part.get("size"):
        return None
    return {"size": str(part["size"]), "family": str(part.get("family") or "clear")}


def _classic_glass(part: dict[str, Any] | None) -> dict[str, str] | None:
    """Glass on a classic price-book part: its size, and a family from its series or named glass."""
    if not isinstance(part, dict) or part.get("series") == "solid_panel" or not part.get("glass_size"):
        return None
    family = SERIES_FAMILY.get(part.get("series") or "")
    if not family and part.get("glass"):
        family = "decorative"
    return {"size": str(part["glass_size"]).replace("**", ""), "family": family or "clear"}


SIDELITE_WIDTH_IN = 14.0
TRANSOM_HEIGHT_IN = 14.0


def door_lites(size: str | None, slab_w: float, slab_h: float) -> list[tuple[float, float, float, float, str]]:
    """Glass lites on a slab as (x, y, w, h, shape), top-down inches.

    Mirrors glassLites() in frontend/components/DoorDrawing.tsx.
    """
    if not size:
        return []
    text = size.lower()
    if "half" in text:
        w = min(22.0, slab_w - 8)
        return [((slab_w - w) / 2, 8.0, w, w / 2, "half")]
    if "oval" in text:
        w = min(20.0, slab_w - 10)
        return [((slab_w - w) / 2, 8.0, w, slab_h * 0.55, "oval")]
    if "up to" in text or re.search(r'\d+(\.\d+)?"-', text):
        return [(3.0, 3.0, slab_w - 6, slab_h - 6, "rect")]
    match = re.search(r"(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)", text)
    if not match:
        return []
    w = min(float(match.group(1)), slab_w - 5)
    h = min(float(match.group(2)), slab_h - 10)
    count_match = re.search(r"\(x(\d)\)", text)
    count = int(count_match.group(1)) if count_match else 1
    top = (slab_h - h) / 2 if h >= slab_h - 20 else max(6.0, slab_h * 0.1)
    if count <= 1:
        return [((slab_w - w) / 2, top, w, h, "rect")]
    if w < 12:
        gap = 3.0
        total = count * w + (count - 1) * gap
        return [((slab_w - total) / 2 + i * (w + gap), top, w, h, "rect") for i in range(count)]
    gap = 2.5
    h = min(h, (slab_h - 16 - gap * (count - 1)) / count)
    return [((slab_w - w) / 2, top + i * (h + gap), w, h, "rect") for i in range(count)]


def _rounded(value: float) -> float:
    return round(float(value), 3)


def _with_sections(geometry: dict[str, Any], exterior_colour: str) -> dict[str, Any]:
    """Add the positioned-section form the Better View CRM draws.

    The CRM (Betterview-Crm src/domain/drawn-item.ts) reads ``width``,
    ``height`` and ``sections`` -- inches from the opening's top-left, viewed
    from outside, each with an ``op`` and ``hinge`` like window drawings. Door
    leaves are swing (``casement``) sections hinged on their hinge side,
    sidelites and the transom are ``fixed``; ``panel`` and ``lites`` let a
    renderer draw a solid slab with its glass. The slab itself is kept as
    ``slab_width`` / ``slab_height`` for the estimating tool's own drawing.
    """
    slab_w = float(geometry.pop("width"))
    slab_h = float(geometry.pop("height"))
    doors, sidelites = geometry["doors"], geometry["sidelites"]
    transom_h = TRANSOM_HEIGHT_IN if geometry["transom"] else 0.0
    total_w = doors * slab_w + sidelites * SIDELITE_WIDTH_IN

    def lites(glass: dict[str, Any] | None, w: float, h: float) -> list[dict[str, float]]:
        if not glass:
            return []
        return [
            {"x": _rounded(x), "y": _rounded(y), "width": _rounded(lw), "height": _rounded(lh)}
            for x, y, lw, lh, _shape in door_lites(glass.get("size"), w, h)
        ]

    sections: list[dict[str, Any]] = []
    if transom_h:
        sections.append({"x": 0.0, "y": 0.0, "width": _rounded(total_w), "height": transom_h, "op": "fixed", "hinge": None, "panel": "glass"})
    sidelite_glass = list(geometry.get("sidelite_glass") or [])
    order = (["sidelite:0"] if sidelites else []) + [f"door:{index}" for index in range(doors)] + (["sidelite:1"] if sidelites == 2 else [])
    x = 0.0
    for part in order:
        kind, index = part.split(":")
        width = SIDELITE_WIDTH_IN if kind == "sidelite" else slab_w
        glass = (sidelite_glass[int(index)] if int(index) < len(sidelite_glass) else None) if kind == "sidelite" else geometry.get("door_glass")
        hinge = None
        if kind == "door":
            hinge = "right" if doors == 2 and index == "1" else "left"
        sections.append({
            "x": _rounded(x),
            "y": transom_h,
            "width": _rounded(width),
            "height": _rounded(slab_h),
            "op": "casement" if kind == "door" else "fixed",
            "hinge": hinge,
            "panel": "solid",
            "lites": lites(glass, width, slab_h),
        })
        x += width
    geometry.update(
        slab_width=_rounded(slab_w),
        slab_height=_rounded(slab_h),
        width=_rounded(total_w),
        height=_rounded(slab_h + transom_h),
        sections=sections,
        exterior_colour=exterior_colour,
    )
    return geometry


def door_drawing(spec: dict[str, Any] | None) -> dict[str, Any] | None:
    """Geometry for the door elevation drawn on estimates, or None when it cannot be drawn.

    Read by frontend/components/DoorDrawing.tsx (DoorGeometryDrawing) and by
    services/estimate_documents.py for the PDF.
    """
    if not isinstance(spec, dict):
        return None
    pipe = spec.get("pipeline")
    if isinstance(pipe, dict) and pipe.get("material"):
        if pipe["material"] in LEGACY_MODELS:
            pipe = upgrade_selection(pipe)
        layout = CONFIG_BY_KEY.get(pipe.get("configuration") or "")
        if not layout or not pipe.get("width") or pipe.get("height") not in HEIGHTS:
            return None
        custom = pipe.get("custom_size") or {}
        width = float(pipe["width"])
        height = float(HEIGHTS[pipe["height"]])
        if custom.get("enabled"):
            width = float(custom.get("width_in") or width)
            height = float(custom.get("height_in") or height)
        colours = pipe.get("colours") or {}
        exterior = colours.get("exterior") or {}
        frame = colours.get("frame") or {}
        frame_side = (frame.get("exterior") if frame.get("mode") == "split" else exterior) or {}
        if pipe["material"] == "steel" and frame.get("mode") != "split" and exterior.get("type") != "painted":
            frame_colour = PAINT_HEX["white"]
        else:
            frame_colour = finish_hex(frame_side.get("type"), frame_side.get("colour"))
        model_label = ""
        if pipe.get("model"):
            try:
                model_label = build_index(pipe["material"])["doors"][pipe["model"]]["label"]
            except (KeyError, catalog.DoorLookupError):
                model_label = str(pipe["model"]).replace("-", " ").title()
        glass = pipe.get("glass") or {}
        if exterior.get("type") in (None, "white"):
            exterior_name = "White"
        else:
            exterior_name = f"{_clean(exterior.get('colour')).title() or exterior['type'].title()}{' stain' if exterior['type'] == 'stained' else ''}"
        return _with_sections({
            "doors": layout["doors"],
            "sidelites": layout["sidelites"],
            "transom": layout["transom"],
            "width": width,
            "height": height,
            "height_label": pipe["height"],
            "model": model_label,
            "door_glass": _glass_ref(glass.get("door")),
            "sidelite_glass": [_glass_ref(part) for part in (glass.get("sidelites") or [])[: layout["sidelites"]]],
            "transom_glass": (glass.get("transom") or {}).get("glass") if layout["transom"] else None,
            "slab_colour": finish_hex(exterior.get("type"), exterior.get("colour")),
            "frame_colour": frame_colour,
            "lock": (pipe.get("standard") or {}).get("lock"),
            # Drawn to length on the latch side; the inactive leaf of a double carries the dummy bar.
            "pull_bar_in": _pull_bar_length((pipe.get("standard") or {}).get("pull_bar")) if (pipe.get("standard") or {}).get("lock") == "pull_bar" else None,
        }, exterior_name)

    doors_sidelites = OPENING_LAYOUT.get(spec.get("opening_type") or "")
    door = spec.get("door")
    if not doors_sidelites or not isinstance(door, dict):
        return None
    doors, sidelite_count = doors_sidelites
    finish = str(spec.get("finish") or "")
    if finish.startswith("stain"):
        slab = STAIN_HEX["medium oak"]
    elif finish.startswith("paint"):
        slab = UNNAMED_PAINT
    else:
        slab = PAINT_HEX["white"]
    height_label = door.get("height") or '6\'8"'
    transom = spec.get("transom") or None
    pull_bars = [pull for pull in spec.get("pull_bars") or [] if isinstance(pull, dict)]
    multipoint = any(
        isinstance(option, dict) and option.get("category") in HANDLE_CATEGORIES for option in spec.get("options") or []
    )
    exterior_name = "Stained" if finish.startswith("stain") else "Painted" if finish.startswith("paint") else "White"
    return _with_sections({
        "doors": doors,
        "sidelites": sidelite_count,
        "transom": bool(transom),
        # Classic openings do not record a slab width; draw the common 36".
        "width": 36.0,
        "height": float(HEIGHT_INCHES.get(height_label, 80)),
        "height_label": height_label,
        "model": _clean(door.get("panel")),
        "door_glass": _classic_glass(door),
        "sidelite_glass": [_classic_glass(part) for part in (spec.get("sidelites") or [])[:sidelite_count]],
        "transom_glass": transom.get("glass") if transom else None,
        "slab_colour": slab,
        "frame_colour": PAINT_HEX["white"] if finish == "factory_white" else slab,
        "lock": "pull_bar" if pull_bars else "multipoint" if multipoint else "double_bore",
        "pull_bar_in": _pull_bar_length(pull_bars[0]) if pull_bars else None,
    }, exterior_name)
