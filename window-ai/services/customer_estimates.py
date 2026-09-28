"""Pricing and presentation helpers for combined customer estimates."""
from __future__ import annotations

import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services import business_settings
from services.doors.presentation import customer_door_openings
from services.doors.pricing import (
    CONFIG_PATH,
    DoorLookupError,
    DoorValidationError,
    load_config as load_door_config,
    project_cost as door_project_cost,
    quote_project,
)
from services.descriptions import line_energy, window_description
from services.windowcity.layout import drawing as window_drawing
from services.job_adders import JobAdderError, price_adders
from services.windowcity.engine import BOOK_VERSION, catalog_cost, price_quote as price_windowcity_quote
from services.windowcity.quote import CONFIG_PATH as WINDOW_CONFIG_PATH
from services.windowcity.sales import SALES_CONFIG_PATH, SalesPricingError, sales_config_version

_ROOT = Path(__file__).resolve().parents[1]
_PRICE_SOURCES = (
    WINDOW_CONFIG_PATH,
    SALES_CONFIG_PATH,
    Path(CONFIG_PATH),
    *sorted((_ROOT / "services" / "windowcity" / "data").glob("*.json")),
    *sorted((_ROOT / "data" / "doors").glob("*.json")),
)
_price_version_cache: tuple[tuple[float, ...], str] | None = None


def pricing_settings_fingerprint() -> list[str]:
    """Versions of in-app settings that change what an estimate costs."""
    from services import business_settings, job_adders, price_books

    return [
        business_settings.fingerprint("tax", "financing", "sales_process"),
        job_adders.catalog_fingerprint(),
        price_books.active_fingerprint(),
    ]


class CustomerEstimatePricingError(Exception):
    """Raised when a customer estimate cannot be priced safely."""

    def __init__(self, message: str, *, reasons: list[str] | None = None):
        super().__init__(message)
        self.reasons = reasons or [message]


def price_sources_version() -> str:
    """Fingerprint every price book, cost config, and sales preset file.

    A saved price is only current while these are unchanged, so an estimate
    priced before a price-book or preset edit must be repriced to finalize.
    """
    global _price_version_cache
    stamps = tuple(path.stat().st_mtime for path in _PRICE_SOURCES if path.exists())
    if _price_version_cache is None or _price_version_cache[0] != stamps:
        digest = hashlib.sha256(BOOK_VERSION.encode("utf-8"))
        for path in _PRICE_SOURCES:
            if path.exists():
                digest.update(path.read_bytes())
        _price_version_cache = (stamps, digest.hexdigest()[:16])
    # Settings edited in the app (presets, adders, tax, price-book versions).
    dynamic = "|".join([_price_version_cache[1], sales_config_version(), *pricing_settings_fingerprint()])
    return hashlib.sha256(dynamic.encode("utf-8")).hexdigest()[:16]




def canonical_pricing_payload(
    windows: list[dict[str, Any]],
    doors: list[dict[str, Any]],
    commercial: dict[str, Any],
    *,
    adders: list[dict[str, Any]] | None = None,
    province: str | None = None,
    tiers: list[dict[str, Any]] | None = None,
    selected_tier: str | None = None,
) -> dict[str, Any]:
    def pricing_line(line: dict[str, Any]) -> dict[str, Any]:
        # Location and description are customer-facing presentation overrides.
        # Product specs, stable line identity, and commercial settings determine
        # whether the calculated pricing snapshot is still current.
        return {"id": line.get("id"), "spec": line.get("spec") or {}}

    return {
        "windows": [pricing_line(line) for line in windows],
        "doors": [pricing_line(line) for line in doors],
        "commercial": commercial,
        "adders": adders or [],
        "province": (province or "").upper(),
        "tiers": tiers or [],
        "selected_tier": selected_tier or None,
        "price_sources": price_sources_version(),
    }


def pricing_hash(payload: dict[str, Any]) -> str:
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _money(value: Any) -> float:
    return round(float(value or 0), 2)


def _door_config_version() -> str:
    return hashlib.sha256(Path(CONFIG_PATH).read_bytes()).hexdigest()[:12]


def _customer_window_lines(
    project_lines: list[dict[str, Any]],
    quote_lines: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    for project_line, quote_line in zip(project_lines, quote_lines):
        description = window_description(project_line)
        lines.append(
            {
                "id": project_line.get("id"),
                "location": project_line.get("location") or "",
                "description": description,
                "energy": line_energy(project_line.get("spec") or {}),
                "drawing": window_drawing(project_line.get("spec") or {}),
                "qty": int(quote_line.get("qty") or 1),
                "unit_price": _money(quote_line.get("unit_price")),
                "line_total": _money(quote_line.get("line_total")),
            }
        )
    return lines


def _discount_given(sales_pricing: dict[str, Any]) -> float:
    if not float(sales_pricing.get("negotiated_discount_percent") or 0):
        return 0.0
    return float(sales_pricing.get("merchandise_discount_amount") or 0)


def _agreed_total_discount(
    agreed_total: float, base_window_quote: dict[str, Any], fixed_subtotal: float, tax_rate: float
) -> float:
    """Window merchandise discount % that makes the estimate total the agreed amount.

    ``fixed_subtotal`` is the pre-tax amount that is never discounted (doors and
    job adders); installation is protected inside the window quote itself.
    """
    sales = base_window_quote.get("sales_pricing") or {}
    base_merchandise = float(sales.get("base_merchandise_sell") or 0)
    protected_install = float(sales.get("protected_install_sell") or 0)
    if base_merchandise <= 0:
        raise CustomerEstimatePricingError("An agreed total needs priced window merchandise to discount.")
    target_merchandise = agreed_total / (1 + tax_rate) - fixed_subtotal - protected_install
    discount = (base_merchandise - target_merchandise) / base_merchandise * 100.0
    if discount < -0.01:
        raise CustomerEstimatePricingError("The agreed total is above the undiscounted estimate total.")
    if discount >= 100:
        raise CustomerEstimatePricingError(
            "The agreed total is below the protected installation, door, and job-item amount."
        )
    return round(max(0.0, discount), 6)


# ------------------------------------------------------------------ tiers
TIER_WINDOW_KEYS = ("colour_ext", "colour_int")


def _apply_overrides(spec: dict[str, Any], overrides: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(spec)
    glazing = overrides.get("glazing")
    if isinstance(glazing, dict) and glazing:
        out["glazing"] = {**(out.get("glazing") or {}), **glazing}
    for key in TIER_WINDOW_KEYS:
        if overrides.get(key):
            out[key] = overrides[key]
    if isinstance(out.get("lites"), list):
        out["lites"] = [_apply_overrides(lite, overrides) for lite in out["lites"]]
    if isinstance(glazing, dict) and glazing and isinstance(out.get("layout"), dict):
        _override_section_glazing(out["layout"], glazing)
    return out


def _override_section_glazing(node: dict[str, Any], glazing: dict[str, Any]) -> None:
    """A tier's glazing upgrade also replaces per-section glazing overrides."""
    if isinstance(node.get("glazing"), dict):
        node["glazing"] = {**node["glazing"], **glazing}
    for child in node.get("children") or []:
        if isinstance(child, dict):
            _override_section_glazing(child, glazing)


def apply_tier(windows: list[dict[str, Any]], tier: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Window lines with a Good/Better/Best tier's product upgrades applied."""
    if not tier:
        return windows
    overrides = tier.get("window_overrides") or {}
    return [{**line, "spec": _apply_overrides(line.get("spec") or {}, overrides)} for line in windows]


def _find_tier(tiers: list[dict[str, Any]], tier_id: str | None) -> dict[str, Any] | None:
    if not tier_id:
        return None
    for tier in tiers:
        if str(tier.get("id")) == str(tier_id):
            return tier
    raise CustomerEstimatePricingError(f"Option tier {tier_id!r} no longer exists.")


# ------------------------------------------------------------------ pricing
def _product_cost(windows: list[dict[str, Any]], doors: list[dict[str, Any]]) -> float:
    """Dealer + installation cost of the windows and doors, before sales pricing.

    The sliding margin and the profit floor are set on this project cost, so
    windows and doors carry one markup. Job items (adders) are fixed-price
    extras with their own cost and are not part of it.
    """
    cost = 0.0
    if windows:
        try:
            cost += catalog_cost({"lines": [line.get("spec") or {} for line in windows]})
        except Exception as exc:
            reasons = getattr(exc, "reasons", None) or [str(exc)]
            raise CustomerEstimatePricingError("Window pricing requires review.", reasons=reasons) from exc
    if doors:
        try:
            cost += door_project_cost([opening.get("spec") or {} for opening in doors])
        except (DoorLookupError, DoorValidationError) as exc:
            raise CustomerEstimatePricingError(str(exc)) from exc
    return _money(cost)


def product_cost(
    *,
    windows: list[dict[str, Any]],
    doors: list[dict[str, Any]],
    tiers: list[dict[str, Any]] | None = None,
    selected_tier: str | None = None,
) -> float:
    """Project product cost with the selected option tier applied."""
    selected = _find_tier(tiers or [], selected_tier)
    return _product_cost(apply_tier(windows, selected), doors)


def _price_scope(
    *,
    windows: list[dict[str, Any]],
    doors: list[dict[str, Any]],
    commercial: dict[str, Any],
    adders: list[dict[str, Any]],
    province: str | None,
    allow_manager_override: bool,
) -> dict[str, Any]:
    """Price one product configuration: windows + doors + job adders + tax."""
    if not windows and not doors:
        raise CustomerEstimatePricingError("Add at least one Window or Door line before pricing.")
    try:
        province_code, _ = business_settings.tax_components(province)
    except ValueError as exc:
        raise CustomerEstimatePricingError(str(exc)) from exc
    tax_rate = business_settings.tax_rate(province_code)

    window_quote: dict[str, Any] | None = None
    door_quote: dict[str, Any] | None = None
    window_lines: list[dict[str, Any]] = []
    door_openings: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    # An agreed customer total is converted into a window merchandise discount
    # here, on the server, so the saved price always lands on the agreed
    # amount. Doors and job adders keep their undiscounted price in that mode.
    agreed_total = commercial.get("agreed_customer_total")
    use_agreed_total = agreed_total is not None and bool(windows)
    door_commercial = (
        {**commercial, "negotiated_discount_percent": 0.0, "manager_override_reason": None}
        if use_agreed_total
        else commercial
    )

    try:
        adder_section = price_adders(adders, windows, doors)
    except JobAdderError as exc:
        raise CustomerEstimatePricingError(str(exc)) from exc
    cost_basis = _product_cost(windows, doors)

    if doors:
        try:
            door_quote = quote_project(
                [opening.get("spec") or {} for opening in doors],
                commercial=door_commercial,
                allow_manager_override=allow_manager_override,
                cost_basis=cost_basis,
            )
        except (DoorLookupError, DoorValidationError, SalesPricingError) as exc:
            raise CustomerEstimatePricingError(str(exc)) from exc
        door_openings = customer_door_openings(doors, door_quote.get("openings", []))
        for opening in door_openings:
            # Door quotes carry the door config's tax; restate in the estimate's province.
            opening["hst"] = _money(opening["subtotal"] * tax_rate)
            opening["total"] = _money(opening["subtotal"] + opening["hst"])

    door_totals = (door_quote or {}).get("totals", {})
    doors_subtotal = _money(door_totals.get("sell"))
    adders_subtotal = adder_section["subtotal"]

    effective_commercial = commercial
    if windows:
        window_specs = {"lines": [line.get("spec") or {} for line in windows]}

        def price_windows(window_commercial: dict[str, Any]) -> dict[str, Any]:
            try:
                return price_windowcity_quote(
                    window_specs,
                    commercial={**window_commercial, "presentation_mode": "internal"},
                    allow_manager_override=allow_manager_override,
                    cost_basis=cost_basis,
                )
            except Exception as exc:
                reasons = getattr(exc, "reasons", None) or [str(exc)]
                raise CustomerEstimatePricingError("Window pricing requires review.", reasons=reasons) from exc

        if use_agreed_total:
            effective_commercial = {
                **commercial,
                "negotiated_discount_percent": _agreed_total_discount(
                    float(agreed_total),
                    price_windows({**commercial, "negotiated_discount_percent": 0.0}),
                    doors_subtotal + adders_subtotal,
                    tax_rate,
                ),
            }
        window_quote = price_windows(effective_commercial)
        warnings.extend(window_quote.get("warnings") or [])
        window_lines = _customer_window_lines(windows, window_quote.get("customer_presentation", {}).get("lines", []))

    window_totals = (window_quote or {}).get("customer_presentation", {})
    windows_subtotal = _money(window_totals.get("subtotal"))

    def section(subtotal: float) -> dict[str, float]:
        tax = _money(subtotal * tax_rate)
        return {"subtotal": subtotal, "hst": tax, "total": _money(subtotal + tax)}

    combined_subtotal = _money(windows_subtotal + doors_subtotal + adders_subtotal)
    tax_lines = business_settings.tax_lines(province_code, combined_subtotal)
    combined_tax = _money(sum(line["amount"] for line in tax_lines))
    combined_total = _money(combined_subtotal + combined_tax)

    window_sales_pricing = (window_quote or {}).get("sales_pricing", {})
    door_sales_pricing = (door_quote or {}).get("sales_pricing", {})
    # Undiscounted amounts: what was sold plus whatever discount was given.
    window_discount = _discount_given(window_sales_pricing)
    door_discount = _discount_given(door_sales_pricing)
    base_subtotal = _money(combined_subtotal + window_discount + door_discount)
    base_tax = _money(sum(line["amount"] for line in business_settings.tax_lines(province_code, base_subtotal)))
    base_total = _money(base_subtotal + base_tax)
    window_floor_subtotal = _money(
        window_sales_pricing.get("minimum_floor_sell", windows_subtotal + window_discount)
    )
    minimum_floor_subtotal = _money(window_floor_subtotal + doors_subtotal + adders_subtotal)
    minimum_floor_total = _money(minimum_floor_subtotal * (1 + tax_rate))
    offer_discount = _money(max(0.0, base_subtotal - combined_subtotal))

    # Internal profitability across the whole job.
    window_cost = float(window_sales_pricing.get("dealer_cost") or 0) + float(
        window_sales_pricing.get("install_cost") or 0
    )
    door_cost = float(door_totals.get("material_cost") or 0) + float(door_totals.get("install") or 0)
    total_cost = _money(window_cost + door_cost + adder_section["cost"])
    profit = _money(combined_subtotal - total_cost)
    profitability = {
        "cost": total_cost,
        "sell": combined_subtotal,
        "profit": profit,
        "margin_percent": round(profit / combined_subtotal * 100.0, 2) if combined_subtotal else 0.0,
        "markup_percent": round(profit / total_cost * 100.0, 2) if total_cost else 0.0,
        "discount": offer_discount,
        "breakdown": {
            "windows": {"cost": _money(window_cost), "sell": windows_subtotal},
            "doors": {"cost": _money(door_cost), "sell": doors_subtotal},
            "adders": {"cost": adder_section["cost"], "sell": adders_subtotal},
        },
        "override_applied": bool(
            window_sales_pricing.get("override_applied") or door_sales_pricing.get("override_applied")
        ),
        # How the markup was set: preset strategy, project cost basis, the
        # sliding-margin band and whether the profit floor priced the job.
        "strategy": (window_sales_pricing or door_sales_pricing).get("strategy"),
        "preset_name": (window_sales_pricing or door_sales_pricing).get("preset_name"),
        "cost_basis": cost_basis,
        "profit_floor": (window_sales_pricing or door_sales_pricing).get("profit_floor"),
        "floor_applied": bool((window_sales_pricing or door_sales_pricing).get("floor_applied")),
        "sliding": (window_sales_pricing or door_sales_pricing).get("sliding"),
        "target_markup_percent": (window_sales_pricing or door_sales_pricing).get("markup_percent"),
        "effective_discount_percent": round(float(effective_commercial.get("negotiated_discount_percent") or 0), 4),
    }

    tax_label = " + ".join(line["label"].split(" (")[0] for line in tax_lines)
    adder_lines = [
        {key: line[key] for key in ("id", "name", "note", "qty", "unit_price", "line_total")}
        for line in adder_section["lines"]
    ]
    return {
        "review_required": bool(window_quote and window_quote.get("review_required")),
        "warnings": warnings,
        "province": province_code,
        "tax_rate": tax_rate,
        "sections": {
            "windows": {"lines": window_lines, **section(windows_subtotal)},
            "doors": {"openings": door_openings, **section(doors_subtotal)},
            "adders": {"lines": adder_lines, **section(adders_subtotal)},
        },
        "totals": {
            "subtotal": combined_subtotal,
            "hst": combined_tax,
            "tax_label": tax_label,
            "tax_lines": tax_lines,
            "total": combined_total,
            "currency": "CAD",
            "base_subtotal": base_subtotal,
            "base_hst": base_tax,
            "base_total": base_total,
            "discount": offer_discount,
            "minimum_floor_subtotal": minimum_floor_subtotal,
            "minimum_floor_total": minimum_floor_total,
        },
        "profitability": profitability,
        "effective_commercial": effective_commercial,
        # Keep the full engine responses in the saved audit snapshot. The UI's
        # customer document only reads the sanitized sections/totals above.
        "window_quote": window_quote,
        "door_quote": door_quote,
        "adder_quote": adder_section,
    }


def price_customer_estimate(
    *,
    windows: list[dict[str, Any]],
    doors: list[dict[str, Any]],
    commercial: dict[str, Any],
    adders: list[dict[str, Any]] | None = None,
    province: str | None = None,
    tiers: list[dict[str, Any]] | None = None,
    selected_tier: str | None = None,
    allow_manager_override: bool = False,
) -> dict[str, Any]:
    adders = adders or []
    tiers = tiers or []
    selected = _find_tier(tiers, selected_tier)
    scope = _price_scope(
        windows=apply_tier(windows, selected),
        doors=doors,
        commercial=commercial,
        adders=adders,
        province=province,
        allow_manager_override=allow_manager_override,
    )

    # Good / Better / Best: each tier re-prices the windows with its upgrades at
    # the same effective discount, so the customer compares like with like.
    tier_commercial = {**scope["effective_commercial"], "agreed_customer_total": None}
    tier_summaries: list[dict[str, Any]] = []
    for tier in tiers:
        summary: dict[str, Any] = {
            "id": tier.get("id"),
            "name": tier.get("name") or "Option",
            "description": tier.get("description") or "",
            "selected": bool(selected and selected.get("id") == tier.get("id")),
        }
        try:
            priced = _price_scope(
                windows=apply_tier(windows, tier),
                doors=doors,
                commercial=tier_commercial,
                adders=adders,
                province=province,
                allow_manager_override=allow_manager_override,
            )
        except (CustomerEstimatePricingError, SalesPricingError) as exc:
            summary["error"] = "; ".join(getattr(exc, "reasons", None) or [str(exc)])
        else:
            tier_total = priced["totals"]["total"]
            summary.update({
                "subtotal": priced["totals"]["subtotal"],
                "hst": priced["totals"]["hst"],
                "total": tier_total,
                "profit": priced["profitability"]["profit"],
                "margin_percent": priced["profitability"]["margin_percent"],
                "review_required": priced["review_required"],
                "financing": business_settings.financing_options(tier_total),
                "deposit": business_settings.deposit_amount(tier_total),
                # What the customer buys if they accept this option, priced now.
                "scope": {
                    "sections": priced["sections"],
                    "totals": priced["totals"],
                    "profitability": priced["profitability"],
                },
            })
        tier_summaries.append(summary)

    total = scope["totals"]["total"]
    payload = canonical_pricing_payload(
        windows, doors, commercial, adders=adders, province=province, tiers=tiers, selected_tier=selected_tier
    )
    scope.pop("effective_commercial", None)
    return {
        "pricing_hash": pricing_hash(payload),
        "priced_at": datetime.now(timezone.utc).isoformat(),
        **scope,
        "tiers": tier_summaries,
        "selected_tier": selected.get("id") if selected else None,
        "financing": business_settings.financing_options(total),
        "deposit": business_settings.deposit_amount(total),
        "price_versions": {
            "windows": {
                "price_book_version": (scope.get("window_quote") or {}).get("price_book_version"),
                "config_version": (scope.get("window_quote") or {}).get("config_version"),
            },
            "doors": {"config_version": _door_config_version() if scope.get("door_quote") else None},
            "price_sources": payload["price_sources"],
        },
    }
