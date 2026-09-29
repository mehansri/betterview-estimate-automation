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
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from . import catalog


class PipelineError(Exception):
    """Raised when a pipeline selection is incomplete or not offered."""


# --------------------------------------------------------------------------
# Static choices
# --------------------------------------------------------------------------

WIDTHS = [30, 32, 34, 36, 42]
STANDARD_WIDTHS = [30, 32, 34, 36]
HEIGHTS = {'6\'8"': 80, '8\'0"': 96}

FRAME_TYPES = {
    "smooth": "Smooth vinyl composite frame",
    "textured": "Textured composite frame",
}
DEFAULT_FRAME_TYPE = {"steel": "smooth", "fiberglass": "textured"}

FRAME_DEPTHS = ["4.625", "5.625", "6.625", "7.625"]
FRAME_DEPTH_LABELS = {
    "4.625": '4-5/8"',
    "5.625": '5-5/8"',
    "6.625": '6-5/8"',
    "7.625": '7-5/8"',
}

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
        "series": [
            ("venting_q550_peak470", "Q550 / Peak 470"),
            ("venting_elite_ezlift", "Elite / EZ Lift"),
            ("venting_elevation", "Elevation"),
        ],
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
        "hint": "SDL bars on clear or obscure glass",
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
]
FAMILY_BY_KEY = {row["key"]: row for row in GLASS_FAMILIES}
SERIES_FAMILY = {series: row["key"] for row in GLASS_FAMILIES for series, _ in row["series"]}
SERIES_LABEL = {series: label for row in GLASS_FAMILIES for series, label in row["series"]}

TRANSOM_GLASS = [
    ("clear_lowe_glass", "Clear LowE"),
    ("sandblast_obscure_glass", "Sandblasted / obscure"),
    ("decorative_glass", "Decorative"),
    ("wrought_iron_glass", "Wrought iron"),
    ("glass_with_grills", "Internal grilles"),
    ("clear_glass_with_sdls", "Clear with SDLs"),
    ("obscure_glass_with_sdls", "Obscure with SDLs"),
]

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

HANDLE_CATEGORIES = ("ferco_multi_point_locks_handles", "other_multi_point_handles")
NOT_HANDLES = ("Ferco Mortise Astragal Lock", "Key Alike (same brand only)")

TEDEE_ADDONS = [
    ("keypad", "Tedee Smart Biometric Keypad"),
    ("bridge", "Tedee Smart WiFi Bridge"),
    ("sensor", "Tedee Door Sensor"),
]

PAINT_PRESETS = ["White", "Black", "Iron Ore", "Charcoal", "Commercial Brown", "Sandtone", "Forest Green", "Barn Red", "Navy"]
STAIN_PRESETS = ["Light Oak", "Honey", "Medium Oak", "Walnut", "Mahogany", "Espresso", "Ebony"]

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
}


def _clean(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "").replace("”", '"').replace("“", '"')).strip()


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _widths_from_band(sizes: str) -> list[int]:
    nums = [int(float(value)) for value in re.findall(r"(\d+(?:\.\d+)?)", sizes)]
    if not nums:
        return []
    low, high = min(nums), max(nums)
    return [width for width in WIDTHS if low <= width <= high]


def _is_tall_glass(glass: str) -> bool:
    return bool(re.search(r"x80\b", glass))


# --------------------------------------------------------------------------
# Row normalisation
# --------------------------------------------------------------------------


def canonical_door_row(material: str, panel: Any, glass: Any) -> tuple[str, str, str] | None:
    """Return ``(model, width_class, glass_size)`` for a door slab row.

    The book's PDF extraction spilled parts of multi-lite glass descriptions
    into the panel column ("or (x4) Flush", ", 3-Lite Victoria", "/ 22x11
    (B/D) Flush"); this folds those back into the glass size so each slab
    model has one name.
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
    match = re.match(r'^/ (.*?)\s*((?:Oak )?(?:42" )?Flush)$', panel_text)
    if match:
        extra = re.sub(r"\bup to\b", "", match.group(1)).strip()
        glass_text = f"{glass_text} + {extra}" if extra else glass_text
        panel_text = match.group(2)
    panel_text = re.sub(r"^\(\S+ with ", "", panel_text)
    panel_text = re.sub(r"^\(London\) ", "", panel_text)
    panel_text = re.sub(r"^\*\* ", "", panel_text)
    panel_text = re.sub(r"^- (?:Clear/LowE|Decorative|Grills|Rain Glass) ", "", panel_text)
    panel_text = re.sub(r"^up to ", "", panel_text)

    if re.match(r'^\d+" ', panel_text) and not panel_text.startswith('42"'):
        return None  # 24" and other non-standard slabs are not in the pipeline
    width_class = "std"
    if '42"' in panel_text:
        width_class = "42"
        panel_text = panel_text.replace('42" ', "").strip()

    if panel_text == "6 Panel":
        panel_text = "6-Panel"
    if material == "fiberglass":
        if panel_text in {"Flush", "6-Panel", "3/4 2-Panel"}:
            panel_text = f"Oak {panel_text}"
        if panel_text in {"Oak 3/4-Panel", "Oak 3/4 4-Panel"}:
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
    for record in catalog.options()["panel_upcharges"]:
        if record["material"] != "fiberglass":
            continue
        model = FIBERGLASS_CODE_MODEL.get(record["code"])
        if not model:
            continue
        widths = sorted({width for choice in record["options"] for width in _widths_from_band(choice["sizes"]) if width != 42})
        bands[(model, record["height"])] = widths
    return bands


def build_index(material: str) -> dict[str, Any]:
    """Regroup the book into door models and sidelite models.

    Returns ``{"doors": {model_key: model}, "sidelites": {key: model}}``
    where each model carries ``offers`` -- the priced (kind, height, widths)
    combinations -- and a private ``rows`` lookup used for pricing.
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
            }
        return doors[key]

    for row in catalog.slabs(material):
        if row["kind"] != "slab":
            continue
        if row["component"] == "door":
            if row["series"] == "solid_panel":
                continue
            canon = canonical_door_row(material, row.get("panel"), row.get("glass_size"))
            if not canon:
                continue
            name, width_class, glass = canon
            if row["series"] not in SERIES_FAMILY or not glass:
                continue
            height = _row_height(glass)
            model = door_model(name)
            model["glazed"][(width_class, height)][glass][row["series"]].append(row)
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
            key = slug(name)
            entry = sidelites.setdefault(
                key,
                {"key": key, "label": name, "direct_glazed": row["component"] == "direct_glazed_sidelite", "glazed": defaultdict(lambda: defaultdict(list)), "solid": {}},
            )
            if row["series"] not in SERIES_FAMILY or not glass:
                continue
            height = _row_height(glass) if not entry["direct_glazed"] else '6\'8"'
            entry["glazed"][(height, glass)][row["series"]].append(row)

    # Solid slabs.
    if material == "steel":
        for row in catalog.slabs(material):
            if row["series"] == "solid_panel" and row["component"] == "door" and row["kind"] == "slab":
                name = _clean(row["panel"])
                name = "6-Panel" if name == "6 Panel" else name
                model = door_model(name)
                model["solid"][("std", '6\'8"')] = {"base": row, "widths": STANDARD_WIDTHS}
                if name == "Flush":
                    # Palma's non-standard panel line: 42" steel slabs are flush
                    # only, and the 8' system is quoted on the flush slab.
                    model["solid"][("42", '6\'8"')] = {"base": row, "widths": [42], "adder": "Non-Standard Panles"}
                    model["solid"][("std", '8\'0"')] = {"base": row, "widths": STANDARD_WIDTHS}
                    model["solid"][("42", '8\'0"')] = {"base": row, "widths": [42], "adder": "Non-Standard Panles"}
    else:
        bases = {
            row["height"]: row
            for row in catalog.slabs(material)
            if row["series"] == "solid_panel" and row["component"] == "door" and row["kind"] == "slab"
        }
        for record in catalog.options()["panel_upcharges"]:
            if record["material"] != material or record["height"] not in HEIGHTS or record["height"] not in bases:
                continue
            code = record["code"].replace("(STD)", "")
            name = FIBERGLASS_CODE_MODEL.get(record["code"]) or f"{_clean(record['panel'])} · {code}"
            model = door_model(name)
            for choice in record["options"]:
                widths = _widths_from_band(choice["sizes"])
                for width_class, subset in (("std", [w for w in widths if w != 42]), ("42", [w for w in widths if w == 42])):
                    if not subset:
                        continue
                    existing = model["solid"].get((width_class, record["height"])) or {"bands": [], "widths": []}
                    model["solid"][(width_class, record["height"])] = {
                        "base": bases[record["height"]],
                        "bands": existing["bands"] + [{"widths": subset, "record": record, "choice": choice}],
                        "widths": sorted(set(subset) | set(existing["widths"])),
                    }

    # Offers per model.
    for model in doors.values():
        offers = []
        for (width_class, height), entry in model["solid"].items():
            offers.append({"kind": "solid", "height": height, "widths": entry["widths"]})
        for (width_class, height), sizes in model["glazed"].items():
            if width_class == "42":
                widths = [42]
            elif material == "fiberglass":
                widths = fiberglass_bands.get((model["label"], '6\'8"'), [32, 34, 36])
            else:
                widths = STANDARD_WIDTHS
            glass = {}
            for size, series_rows in sizes.items():
                families: dict[str, list[str]] = defaultdict(list)
                for series in series_rows:
                    families[SERIES_FAMILY[series]].append(series)
                glass[size] = {family: _ordered_series(family, found) for family, found in families.items()}
            offers.append({"kind": "glazed", "height": height, "widths": widths, "width_class": width_class, "glass": glass})
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
            model["offers"].append({"kind": "solid", "height": '6\'8"', "panels": sorted(model["solid"])})
            model["offers"].append({"kind": "solid", "height": '8\'0"', "panels": sorted(model["solid"])})

    return {"doors": doors, "sidelites": sidelites}


def _ordered_series(family: str, found: list[str]) -> list[str]:
    order = [series for series, _ in FAMILY_BY_KEY[family]["series"]]
    return [series for series in order if series in found]


def _widths_for(model: dict[str, Any], height: str) -> set[int]:
    return {width for offer in model["offers"] if offer["height"] == height for width in offer["widths"]}


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
            }
        )
    return result


def handle_options(material: str) -> list[dict[str, Any]]:
    rows = [
        row
        for row in catalog.options()["options"]
        if row["material"] == material and row["category"] in HANDLE_CATEGORIES and row["item"] not in NOT_HANDLES
    ]
    return [
        {"item": row["item"], "label": re.sub(r"^\[NEW\]\s*", "", row["item"]), "has_dummy": "dummy" in row.get("prices", {})}
        for row in rows
    ]


def pipeline_catalog(config: dict[str, Any]) -> dict[str, Any]:
    """Availability-only payload for the step-by-step door configurator."""
    groups = catalog.data("glass_groups.json")
    materials = {}
    for material in ("steel", "fiberglass"):
        index = build_index(material)
        models = []
        for model in sorted(index["doors"].values(), key=lambda item: item["label"]):
            models.append({"key": model["key"], "label": model["label"], "offers": model["offers"]})
        sidelite_models = [
            {"key": model["key"], "label": model["label"], "direct_glazed": model["direct_glazed"], "offers": model["offers"]}
            for model in sorted(index["sidelites"].values(), key=lambda item: (item["direct_glazed"], item["label"]))
        ]
        materials[material] = {
            "key": material,
            "label": material.title(),
            "default_frame_type": DEFAULT_FRAME_TYPE[material],
            "side_types": [{"key": key, "label": label} for key, label in SIDE_TYPES[material]],
            "frame_depths": frame_depth_options(material, config),
            "sills": [{"key": row["key"], "label": row["label"], "not_with": row["not_with"]} for row in SILLS[material]],
            "handles": handle_options(material),
            "models": models,
            "sidelite_models": sidelite_models,
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
            {"key": row["key"], "label": row["label"], "hint": row["hint"], "flat_max": bool(row.get("flat_max")), "series": [{"key": key, "label": label} for key, label in row["series"]]}
            for row in GLASS_FAMILIES
        ],
        "transom_glass": [{"key": key, "label": label} for key, label in TRANSOM_GLASS],
        "paint_presets": PAINT_PRESETS,
        "stain_presets": STAIN_PRESETS,
        "fire_rated_list": pipeline_cfg.get("fire_rated_panel_list"),
        "default_sidelite_width": pipeline_cfg.get("sidelite_width_in", 14),
        "default_transom_height": pipeline_cfg.get("transom_height_in", 14),
        "discount": float(config["discount"]),
        "materials": materials,
    }


# --------------------------------------------------------------------------
# Selection -> finish column
# --------------------------------------------------------------------------


def _side(colours: dict[str, Any], side: str) -> tuple[str, str]:
    value = (colours or {}).get(side) or {}
    return str(value.get("type") or ""), _clean(value.get("colour")).lower()


def finish_for(material: str, colours: dict[str, Any]) -> str:
    """Map exterior/interior colour choices to the book's price column."""
    ext_type, ext_colour = _side(colours, "exterior")
    int_type, int_colour = _side(colours, "interior")
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


def side_types_valid(material: str, colours: dict[str, Any]) -> bool:
    try:
        finish_for(material, colours)
        return True
    except PipelineError:
        return False


# --------------------------------------------------------------------------
# Validation + pricing
# --------------------------------------------------------------------------


def _require(condition: Any, message: str) -> None:
    if not condition:
        raise PipelineError(message)


def _max_row(rows: list[dict[str, Any]], finish: str) -> dict[str, Any]:
    return max(rows, key=lambda row: row["prices"][finish])


def _check_glass(choice: dict[str, Any] | None, offer_glass: dict[str, Any], label: str) -> tuple[str, str, list[str]]:
    """Validate a glazed choice against an offer's glass map; return (size, family, series)."""
    _require(choice, f"Choose the {label} glass.")
    size = choice.get("size")
    _require(size in offer_glass, f"{label}: glass size {size!r} is not offered on this slab.")
    family = choice.get("family")
    _require(family in offer_glass[size], f"{label}: {FAMILY_BY_KEY.get(family, {}).get('label', family)} is not offered in {size}.")
    options = offer_glass[size][family]
    if FAMILY_BY_KEY[family].get("flat_max"):
        return size, family, options
    series = choice.get("series") or options[0]
    _require(series in options, f"{label}: {SERIES_LABEL.get(series, series)} is not offered in {size}.")
    return size, family, [series]


def resolve(spec: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """Validate a pipeline selection step by step and return the priced plan.

    Errors name the first step that is incomplete, mirroring the UI rule that
    steps are completed in order.
    """
    material = spec.get("material")
    _require(material in DEFAULT_FRAME_TYPE, "Step 1: choose steel or fiberglass.")
    frame_type = spec.get("frame_type") or DEFAULT_FRAME_TYPE[material]
    _require(frame_type in FRAME_TYPES, "Step 1: choose a valid frame type.")

    width = spec.get("width")
    height = spec.get("height")
    _require(width in WIDTHS, "Step 2: choose a slab width.")
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
    _require(model and width in _widths_for(model, height), "Step 4: choose a slab model offered in this size.")

    colours = spec.get("colours") or {}
    finish = finish_for(material, colours)

    glass = spec.get("glass") or {}
    door_glass = glass.get("door") or {}
    plan: dict[str, Any] = {
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
        "colours": colours,
    }
    if door_glass.get("glazed"):
        offer = next(
            (item for item in model["offers"] if item["kind"] == "glazed" and item["height"] == height and width in item["widths"]),
            None,
        )
        _require(offer, "Step 6: this slab is solid only in this size.")
        size, family, series = _check_glass(door_glass, offer["glass"], "Door")
        rows = [row for s in series for row in model["glazed"][(offer["width_class"], height)][size][s]]
        plan["door"] = {"kind": "glazed", "size": size, "family": family, "series": series, "row": _max_row(rows, finish), "variants": len(rows), "design": door_glass.get("design")}
    else:
        _require("glazed" in door_glass, "Step 6: choose solid or glazed for the door.")
        entry = next(
            (value for (width_class, h), value in model["solid"].items() if h == height and width in value["widths"]),
            None,
        )
        _require(entry, "Step 6: this slab is only offered glazed in this size.")
        plan["door"] = {"kind": "solid", "entry": entry}

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
            size, family, series = _check_glass(part, offer["glass"], label)
            rows = [row for s in series for row in sidelite["glazed"][(height, size)][s]]
            plan["sidelites"].append({"kind": "glazed", "model": sidelite, "size": size, "family": family, "series": series, "row": _max_row(rows, finish)})
        else:
            _require(sidelite["solid"], f"Step 6: {sidelite['label']} sidelites come glazed only.")
            panel = part.get("panel") or sorted(sidelite["solid"])[0]
            _require(panel in sidelite["solid"], f"Step 6: choose a solid panel for {label.lower()}.")
            plan["sidelites"].append({"kind": "solid", "model": sidelite, "panel": panel, "row": sidelite["solid"][panel]})

    if layout["transom"]:
        transom = glass.get("transom") or {}
        _require(transom.get("glass") in dict(TRANSOM_GLASS), "Step 6: choose the transom glass.")
        plan["transom"] = transom

    standard = spec.get("standard") or {}
    lock = standard.get("lock")
    _require(lock in {"double_bore", "multipoint"}, "Step 7: choose double-bore prep or a multipoint lock.")
    if lock == "multipoint":
        handles = {row["item"]: row for row in handle_options(material)}
        _require(standard.get("handle") in handles, "Step 7: choose the multipoint handle set.")
    sill = next((row for row in SILLS[material] if row["key"] == (standard.get("sill") or "black_anodized")), None)
    _require(sill, "Step 7: choose a sill offered on this material.")
    _require(depth not in sill["not_with"], f"Step 7: the {sill['label'].lower()} sill is not compatible with the {FRAME_DEPTH_LABELS[depth]} frame.")
    plan["standard"] = {**standard, "sill_row": sill}

    extras = spec.get("extras") or {}
    if extras.get("tedee"):
        _require(lock == "multipoint", "Step 8: Tedee smart locks need the multipoint lock.")
    if extras.get("astragal_lock"):
        _require(layout["doors"] == 2, "Step 8: the astragal mortise lock is for double doors.")
    if extras.get("fire_rated"):
        price = extras.get("fire_rated_list")
        if price in (None, ""):
            price = (config.get("pipeline") or {}).get("fire_rated_panel_list")
        _require(price not in (None, "") and float(price) > 0, "Step 8: enter the fire-rated panel list price (it is not in the Palma book).")
        plan["fire_rated_list"] = float(price)
    plan["extras"] = extras
    return plan


def _paint_side_label(colours: dict[str, Any]) -> str:
    ext_type, ext_colour = _side(colours, "exterior")
    int_type, int_colour = _side(colours, "interior")
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


def quote_pipeline(spec: dict[str, Any], config: dict[str, Any]) -> dict[str, Any]:
    """Price a pipeline selection through the standard Palma door engine."""
    from .pricing import DoorQuote  # local import: pricing imports this module

    pipe = spec["pipeline"]
    plan = resolve(pipe, config)
    layout = plan["layout"]
    material = plan["material"]
    height = plan["height"]
    finish = plan["finish"]
    doors = layout["doors"]
    sidelite_count = layout["sidelites"]
    panels = doors + sidelite_count

    standard = plan["standard"]
    skip = []
    if standard.get("brickmould") == "none":
        skip.append("brickmould")
    if standard.get("hinges") == "standard":
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
    finish_label = catalog.FINISH_LABELS[finish]
    colour_note = _paint_side_label(plan["colours"])

    # -- Step 4/6: door slab(s) --------------------------------------------
    model = plan["model"]
    door = plan["door"]
    size_label = f'{plan["width"]}" x {height}'
    if door["kind"] == "glazed":
        row = door["row"]
        family = FAMILY_BY_KEY[door["family"]]
        if family.get("flat_max"):
            glass_text = f"{family['label']} {door['size']}"
            if door.get("design"):
                glass_text += f", design: {door['design']}"
            else:
                quote.notes.append(
                    f"Decorative glass priced at the dearest group offered on {model['label']} {door['size']} "
                    f"({SERIES_LABEL[row['series']]}); the customer can choose any decorative pattern without re-quoting."
                )
        else:
            glass_text = f"{SERIES_LABEL[row['series']]} {door['size']}"
            if door["variants"] > 1:
                quote.notes.append(
                    f"The book lists {door['variants']} {SERIES_LABEL[row['series']]} variants for {model['label']} "
                    f"{door['size']}; priced at the highest. Confirm the exact unit with Palma."
                )
        quote.add(
            "Door Slab",
            f"{model['label']} slab {size_label}, {glass_text}, {finish_label}",
            row["prices"][finish],
            doors,
            f"{material} p{row['source_page']}",
        )
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
        if band and band["choice"]["upcharge"]:
            quote.add(
                "Upcharge Option",
                f"Panel style {band['record']['panel']} {band['record']['code']} ({band['choice']['sizes']})",
                band["choice"]["upcharge"],
                doors,
                f"{material} p{band['record']['source_page']}",
            )
        if entry.get("adder"):
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

    # -- Step 6: sidelites -------------------------------------------------
    for number, part in enumerate(plan["sidelites"], start=1):
        row_name = "Sidelite" if number == 1 else "Sidelite 2"
        row = part["row"]
        if part["kind"] == "glazed":
            family = FAMILY_BY_KEY[part["family"]]
            glass_text = f"{family['label']} {part['size']}" if family.get("flat_max") else f"{SERIES_LABEL[row['series']]} {part['size']}"
            text = f"{part['model']['label']} sidelite, {glass_text}, {finish_label}"
        else:
            text = f"Solid {part['panel'].lower()} sidelite, {finish_label}"
        quote.add(row_name, text, row["prices"][finish], 1, f"{material} p{row['source_page']}")

    # -- Step 6: transom ---------------------------------------------------
    if plan.get("transom"):
        transom = plan["transom"]
        sidelite_width = float(pipe.get("sidelite_width_in") or (config.get("pipeline") or {}).get("sidelite_width_in", 14))
        glass_height = float(transom.get("height_in") or (config.get("pipeline") or {}).get("transom_height_in", 14))
        glass_width = plan["width"] * doors + sidelite_width * sidelite_count
        quote.add_transom(
            {
                "shape": transom.get("shape") or "rectangle",
                "glass": transom["glass"],
                "sq_ft": round(glass_width * glass_height / 144, 2),
                "tempered": bool(transom.get("tempered")),
                "qty": 1,
            }
        )

    # -- Step 2: 8' system and custom cut-down -----------------------------
    if height == '8\'0"':
        quote.add_option({"category": "custom_sizing", "item": "8' System - 95\" Slab", "qty": panels, "row": "Upcharge Option"})
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

    # -- Step 5: split frame colour ----------------------------------------
    frame = (plan["colours"] or {}).get("frame") or {}
    if frame.get("mode") == "split":
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

    # -- Step 7: standard options ------------------------------------------
    sill = standard["sill_row"]
    quote.add_option({"category": "sills", "item": sill["item"]})
    if standard.get("sill_extension"):
        quote.add_option({"category": "sills", "item": '3"- 4" Sill extension'})
    if standard.get("hinges") == "standard":
        quote.notes.append("Standard hinges (no charge) instead of black heavy-duty.")
    if standard.get("lock") == "multipoint":
        quote.add_option({"category": None, "item": standard["handle"], "column": "active", "qty": 1, "row": "Multipoint"})
        _suffix_last(quote, "multipoint lock, active leaf")
        if doors == 2:
            handle = next(row for row in handle_options(material) if row["item"] == standard["handle"])
            if handle["has_dummy"]:
                quote.add_option({"category": None, "item": standard["handle"], "column": "dummy", "qty": 1, "row": "Multipoint"})
                _suffix_last(quote, "inactive leaf (dummy)")
    else:
        quote.add("Multipoint", "Double-bore lock prep (hardware by others)", 0, 1, None)
    if standard.get("brickmould") == "flat":
        quote.notes.append('Flat 1-1/2" brickmould instead of regular 2" (same price).')

    # -- Step 8: extras ----------------------------------------------------
    extras = plan["extras"]
    if extras.get("tedee"):
        quote.add_option({"category": "ferco_smart_lock", "item": "Tedee-PRO Smart Lock", "column": "active"})
        for key, item in TEDEE_ADDONS:
            if extras.get(f"tedee_{key}"):
                quote.add_option({"category": "ferco_smart_lock", "item": item, "column": "active"})
    screen = extras.get("screen")
    if screen in {"white", "painted"}:
        prefix = "8' " if height == '8\'0"' else ""
        item = f"{prefix}{'White' if screen == 'white' else 'Painted'} RETRACTABLE Screen*"
        quote.add_option({"category": "screens", "item": item, "qty": max(1, int(extras.get("screen_qty") or 1)), "row": "Extras 1"})
    if extras.get("astragal_lock"):
        quote.add_option({"category": "ferco_multi_point_locks_handles", "item": "Ferco Mortise Astragal Lock", "column": "active", "row": "Multipoint"})
    if extras.get("fire_rated"):
        quote.add("Upcharge Option", "Fire-rated panel upcharge", plan["fire_rated_list"], doors, "entered by rep")
        quote.notes.append("Fire-rated panel price entered by the rep — not in the Palma book; confirm with Palma.")
    for key, item in (("mail_slot", "Mail Slot installed"), ("peep_viewer", "Peep Door Viewer installed")):
        if extras.get(key):
            quote.add_option({"category": "decorative_accesories", "item": item, "row": "Extras 1"})

    quote.notes.append(f"Colours: {colour_note}")
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
    elif standard.get("lock") == "double_bore":
        details.append("Double-bore prep")
    return [item for item in details if item]


# --------------------------------------------------------------------------
# Elevation drawing (estimate screen, customer portal, PDF)
# --------------------------------------------------------------------------

# Swatch colours; mirrors frontend/components/DoorDrawing.tsx.
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


def finish_hex(side_type: str | None, colour: str | None) -> str:
    key = _clean(colour).lower()
    if not side_type or side_type == "white":
        return PAINT_HEX["white"]
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
    multipoint = bool(spec.get("pull_bars")) or any(
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
        "lock": "multipoint" if multipoint else "double_bore",
    }, exterior_name)
