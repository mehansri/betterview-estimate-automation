"""Application adapter for the deterministic Window City price book.

The copied price-book engine remains deliberately small and data-driven.  This
module is the boundary used by the API: it adds stable metadata, source-page
references, manual-review warnings, and a disabled-by-default ML shadow
record without allowing the historical predictor to change a catalog price.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from . import catalog, layout
from .quote import BAY_ANGLES, SLIDING_OPERATIONS, CatalogError, load_config, price_quote as _price_quote
from .sales import apply_sales_pricing, list_presets, sales_config_version

BOOK_VERSION = "Window City v18 (2023)"
SUPPORTED_TYPES = {
    "window",
    "combination",
    "unit",
    "patio_sliding",
    "patio_swing",
    "bay_bow",
}

_UNSUPPORTED_KEYS = {
    "grille": "Grilles are extracted from the price book but are not wired into the engine yet.",
    "grilles": "Grilles are extracted from the price book but are not wired into the engine yet.",
    "paint": "Paint options require manual review until their price table is wired in.",
    "paint_color": "Paint options require manual review until their price table is wired in.",
    "sealed_unit": "Sealed-unit overrides require manual review until their price table is wired in.",
    "sealed_units": "Sealed-unit overrides require manual review until their price table is wired in.",
    "projection": "Bay/bow projection pricing is not yet wired into the engine.",
    "projection_angle": "Bay/bow projection pricing is not yet wired into the engine.",
    "projection_table": "Bay/bow projection pricing is not yet wired into the engine.",
}

_LEGACY_UNSUPPORTED_TRUE_KEYS = {
    "grid": "Grid pricing is not yet wired into the deterministic catalog engine.",
    "screen": "Screen pricing is not yet wired into the deterministic catalog engine.",
    "nailing_flange": "Nailing-flange pricing requires manual review in the Window City engine.",
    "hardware": "Free-text hardware options require manual review.",
}


class PriceBookReviewRequired(ValueError):
    """Raised when a request cannot safely receive a deterministic price."""

    def __init__(self, reasons: list[str]):
        self.reasons = reasons
        super().__init__("; ".join(reasons))


def _config_version() -> str:
    path = Path(__file__).resolve().parent / "config.json"
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]


def _page_ref(page: Any) -> str | None:
    if page is None:
        return None
    try:
        pdf_page = int(page)
    except (TypeError, ValueError):
        return None
    return f"{BOOK_VERSION} PDF p.{pdf_page} (book p.{max(pdf_page - 4, 1)})"


def _collect_pages(line: dict[str, Any]) -> list[int]:
    """Collect the source pages that explain a line's catalog components."""
    pages: set[int] = set()

    def add(row: dict[str, Any] | None) -> None:
        if not row:
            return
        page = row.get("source_page_pdf")
        if page is not None:
            try:
                pages.add(int(page))
            except (TypeError, ValueError):
                pass

    kind = line.get("type", "window")
    if kind == "window":
        style_code = line.get("style")
        if style_code:
            try:
                style = catalog.style(str(style_code))
                add(style)
            except CatalogError:
                pass
        for accessory in line.get("accessories") or []:
            if isinstance(accessory, dict):
                try:
                    add(catalog.accessory_row(accessory))
                except (KeyError, TypeError, ValueError, CatalogError):
                    pass
        shape = line.get("shape")
        if isinstance(shape, dict):
            try:
                add(catalog.shape_charge(shape["family"], shape["name"]))
            except (KeyError, CatalogError):
                pass
    elif kind == "combination":
        for lite in line.get("lites") or []:
            if isinstance(lite, dict):
                pages.update(_collect_pages({**lite, "type": "window"}))
        for row in catalog.load("accessories").get("rows", []):
            if row.get("section") == "reinforcement_mullion":
                add(row)
    elif kind == "unit":
        try:
            from .quote import _unit_sections

            _, section_lines = _unit_sections(line)
        except (CatalogError, KeyError, TypeError, ValueError):
            section_lines = []
        for section_line in section_lines:
            pages.update(_collect_pages(section_line))
        pages.update(_collect_pages({"type": "window", "accessories": line.get("accessories") or []}))
        for row in catalog.load("accessories").get("rows", []):
            if row.get("section") == "reinforcement_mullion":
                add(row)
    elif kind == "patio_sliding":
        try:
            add(catalog.sliding_row(int(line["nominal_ft"])))
        except (KeyError, TypeError, ValueError, CatalogError):
            pass
    elif kind == "patio_swing":
        try:
            add(catalog.swing_row(str(line.get("kind", "single")), float(line["width"]), float(line["height"])))
        except (KeyError, TypeError, ValueError, CatalogError):
            pass
    elif kind == "bay_bow":
        for row in catalog.load("baybow").get("head_seat_plywood", []):
            add(row)
        for row in catalog.load("baybow").get("brickmould_no_head_seat", []):
            add(row)
        try:
            from .quote import bay_lites

            lites = bay_lites(line)
        except (CatalogError, KeyError, TypeError, ValueError):
            lites = [lite for lite in line.get("lites") or [] if isinstance(lite, dict)]
        for lite in lites:
            pages.update(_collect_pages({**lite, "type": "window"}))
        pages.update(_collect_pages({"type": "window", "accessories": line.get("accessories") or []}))

    return sorted(pages)


def _walk_unsupported(value: Any, path: str = "line") -> list[str]:
    reasons: list[str] = []
    if isinstance(value, dict):
        for raw_key, child in value.items():
            key = str(raw_key).strip().lower().replace("-", "_")
            if key in _UNSUPPORTED_KEYS and child not in (None, False, "", [], {}):
                reasons.append(f"{path}.{raw_key}: {_UNSUPPORTED_KEYS[key]}")
            elif key in _LEGACY_UNSUPPORTED_TRUE_KEYS and child not in (None, False, "", [], {}, "None"):
                reasons.append(f"{path}.{raw_key}: {_LEGACY_UNSUPPORTED_TRUE_KEYS[key]}")
            reasons.extend(_walk_unsupported(child, f"{path}.{raw_key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reasons.extend(_walk_unsupported(child, f"{path}[{index}]"))
    return reasons


def _warning(message: str, code: str = "catalog_warning") -> dict[str, Any]:
    return {"code": code, "severity": "review", "message": message}


def _source_refs(pages: list[int]) -> list[str]:
    return [ref for page in pages if (ref := _page_ref(page))]


def _attach_source_metadata(result: dict[str, Any], spec: dict[str, Any]) -> None:
    for index, line_result in enumerate(result.get("lines", [])):
        source_line = (spec.get("lines") or [])[index]
        pages = _collect_pages(source_line)
        refs = _source_refs(pages)
        line_result["source_pages"] = pages
        line_result["source_refs"] = refs
        for component in line_result.get("components", []):
            component["source_pages"] = pages
            component["source_refs"] = refs


def catalog_payload() -> dict[str, Any]:
    """Return only the catalog data required to build a guided quote form."""
    windows = catalog.load("windows")
    accessories = catalog.load("accessories")
    shapes = catalog.load("shapes")
    patio = catalog.load("patio_doors")
    baybow = catalog.load("baybow")
    return {
        "price_book_version": BOOK_VERSION,
        "config_version": _config_version(),
        "sales_config_version": sales_config_version(),
        "sales_presets": list_presets(),
        "styles": [
            {
                "code": row["code"],
                "name": row["name"],
                "collection": row["collection"],
                "source_page_pdf": row.get("source_page_pdf"),
                "size_ranges": [
                    {
                        "label": size_row.get("label"),
                        "ranges": [
                            {"min": item["min"], "max": item["max"]}
                            for item in size_row.get("ranges", [])
                        ],
                    }
                    for size_row in row.get("sizes", [])
                    if size_row.get("ranges")
                ],
            }
            for row in windows.get("styles", [])
        ],
        "accessories": {
            section: [
                {
                    "name": row["name"],
                    "item_code": row.get("item_code"),
                    "source_page_pdf": row.get("source_page_pdf"),
                }
                for row in accessories.get("rows", [])
                if row.get("section") == section
            ]
            for section in sorted({row.get("section") for row in accessories.get("rows", []) if row.get("section")})
        },
        "shapes": {
            family: [
                {"name": row["name"], "source_page_pdf": row.get("source_page_pdf")}
                for row in rows
            ]
            for family, rows in (("architectural", shapes.get("architectural", [])), ("polygon", shapes.get("polygon", [])))
        },
        "layout": layout.catalog_payload(),
        "colours": _colour_payload(windows),
        "wood_jamb": _wood_jamb_payload(accessories),
        "patio_sliding_sizes": [row["nominal_size_ft"] for row in patio["sliding"]["standard"]["rows"]],
        "patio_sliding": [
            {
                "nominal_ft": row["nominal_size_ft"],
                "panels": row["panels"],
                "frame_width": catalog.inches(row["frame_width"]),
                "frame_height": catalog.inches(row["frame_height"]),
                "operations": list(SLIDING_OPERATIONS.get(int(row["panels"]), ())),
                "triple": row.get("triple_2loe180_argon") is not None,
                "tint": row.get("grey_bronze_tint_add") is not None,
            }
            for row in patio["sliding"]["standard"]["rows"]
        ],
        "patio_swing_kinds": sorted(k for k in patio.get("swing", {}) if k in ("single", "double")),
        "patio_swing_sizes": {
            kind: [
                {
                    "width_from": catalog.inches(row["width_from"]), "width_to": catalog.inches(row["width_to"]),
                    "height_from": catalog.inches(row["height_from"]), "height_to": catalog.inches(row["height_to"]),
                }
                for row in patio["swing"][kind]["rows"]
            ]
            for kind in ("single", "double") if kind in patio.get("swing", {})
        },
        "baybow": {
            "head_seat_sizes": [row["size"] for row in baybow.get("head_seat_plywood", [])],
            "welded_brickmould_lites": [row["lites"] for row in baybow.get("brickmould_no_head_seat", [])],
            "lite_counts": [3, 4, 5, 6],
            "angles": {style: list(angles) for style, angles in BAY_ANGLES.items()},
        },
    }


COLOUR_OPTIONS = ["white", "black", "dark bronze", "charcoal", "sandstone"]


def _colour_payload(windows: dict) -> dict[str, Any]:
    """Exterior colours, and the interior colours that pair with them."""
    return {
        "exterior": COLOUR_OPTIONS,
        # Window City sells an interior colour only as matching in/out black.
        "interior": ["white", "black"],
        "interior_requires_matching_exterior": True,
        "black_interior_styles": [
            row["code"] for row in windows.get("styles", [])
            if any(cu.get("interior_and_exterior") for cu in row.get("colour_upcharges", []))
        ],
    }


def _wood_jamb_payload(accessories: dict) -> dict[str, Any]:
    cfg = load_config()
    depths = []
    for row in accessories.get("rows", []):
        if row.get("section") != "wood_jamb" or row["name"].lower().startswith("custom"):
            continue
        label = row["name"].split(" wood jamb")[0]
        try:
            depth = catalog.inches(label)
        except CatalogError:
            continue
        depths.append({"name": label, "depth_in": depth, "price_lf": row["price_white_lf"]})
    defaults = cfg.get("defaults") or {}
    return {
        "default": defaults.get("wood_jamb", '5 1/2"'),
        "patio_default": defaults.get("patio_wood_jamb", '4 1/2"'),
        "finish": defaults.get("wood_jamb_finish", "primed"),
        # Deepest jamb Window City primes, per product; deeper jambs ship unfinished.
        "primed_max_in": defaults.get("wood_jamb_primed_max_in") or {"window": 6.25, "patio": 4.5},
        "depths": sorted(depths, key=lambda item: item["depth_in"]),
        "custom_max_in": 7.5,
    }


def catalog_cost(spec: dict[str, Any]) -> float:
    """Dealer cost plus installation for a quote, before any sales pricing."""
    lines = spec.get("lines") or []
    if not lines:
        return 0.0
    try:
        result = _price_quote({"defaults": spec.get("defaults") or {}, "lines": lines}, load_config())
    except (CatalogError, KeyError, TypeError, ValueError) as exc:
        raise PriceBookReviewRequired([f"Price-book validation failed: {exc}"]) from exc
    return round(float(result["totals"]["dealer_cost"]) + float(result["totals"]["install"]), 2)


def price_quote(
    spec: dict[str, Any],
    *,
    commercial: dict[str, Any] | None = None,
    trusted_config_overrides: dict[str, Any] | None = None,
    allow_manager_override: bool = False,
    cost_basis: float | None = None,
) -> dict[str, Any]:
    """Price a canonical quote and return an API-ready deterministic result."""
    lines = spec.get("lines") or []
    if not lines:
        raise PriceBookReviewRequired(["At least one quote line is required."])

    reasons: list[str] = []
    for index, line in enumerate(lines, 1):
        if not isinstance(line, dict):
            reasons.append(f"line {index}: quote line must be an object")
            continue
        line_type = line.get("type", "window")
        if line_type not in SUPPORTED_TYPES:
            reasons.append(f"line {index}: unsupported quote type {line_type!r}")
        reasons.extend(_walk_unsupported(line, f"line {index}"))

    # Duplicated nested structures can surface the same unsupported key twice;
    # keep the review queue readable and stable.
    reasons = list(dict.fromkeys(reasons))

    # Catalog pricing is protected from salesperson input.  A trusted caller
    # may supply a server-side calibration override, but public quote payloads
    # never get to change dealer cost or the price-book rules.
    cfg = load_config(trusted_config_overrides)
    try:
        result = _price_quote({"defaults": spec.get("defaults") or {}, "lines": lines}, cfg)
    except (CatalogError, KeyError, TypeError, ValueError) as exc:
        raise PriceBookReviewRequired([f"Price-book validation failed: {exc}"]) from exc

    _attach_source_metadata(result, {"lines": lines})

    warning_items = [_warning(message) for message in result.get("warnings", [])]
    warning_items.extend(_warning(reason, "unsupported_or_incomplete") for reason in reasons)
    result["warnings"] = warning_items
    result["review_required"] = bool(warning_items)
    result["status"] = "review_required" if warning_items else "priced"
    result["price_book_version"] = BOOK_VERSION
    result["config_version"] = _config_version()
    result["currency"] = "CAD"
    result["method"] = "deterministic_price_book"
    result["ml_assist"] = {
        "mode": "shadow",
        "applied": False,
        "reason": "Historical ML may assist calibration and confidence, but cannot override catalog pricing.",
    }

    totals = result["totals"]
    result["price_book_totals"] = dict(totals)
    totals["sell"] = totals["sell_before_tax"]
    totals["markup"] = round(
        totals["sell_before_tax"] - totals["dealer_cost"] - totals["install"], 2
    )
    for line in result.get("lines", []):
        line["sell_each"] = round((line["dealer_each"] + line["install_each"]) * (1 + cfg["markup"]), 2)
        line["markup_each"] = round(line["sell_each"] - line["dealer_each"] - line["install_each"], 2)
        line["hst_each"] = round(line["sell_each"] * cfg["hst"], 2)
        line["customer_total"] = round(line["sell_each"] * line["qty"] * (1 + cfg["hst"]), 2)
    return apply_sales_pricing(
        result,
        commercial,
        allow_manager_override=allow_manager_override,
        cost_basis=cost_basis,
    )
