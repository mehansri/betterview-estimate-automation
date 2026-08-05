"""Protected salesperson pricing layered on top of catalog cost."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

SALES_CONFIG_PATH = Path(__file__).resolve().parent / "sales_config.json"


class SalesPricingError(ValueError):
    """Base error for invalid or unsafe sales pricing requests."""


class NegotiationLimitError(SalesPricingError):
    """A requested concession exceeds the configured or calculated floor."""

    def __init__(self, details: dict[str, Any]):
        self.details = details
        message = (
            f"Negotiated discount {details['requested_discount_percent']:.2f}% exceeds "
            f"the permitted {details['maximum_allowed_discount_percent']:.2f}% "
            f"for the protected {details['minimum_markup_percent']:.2f}% markup floor."
        )
        super().__init__(message)


def _read_config() -> dict[str, Any]:
    return json.loads(SALES_CONFIG_PATH.read_text(encoding="utf-8"))


def sales_config_version() -> str:
    return hashlib.sha256(SALES_CONFIG_PATH.read_bytes()).hexdigest()[:12]


def _validate_config(config: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(config.get("presets"), list) or not config["presets"]:
        raise SalesPricingError("sales pricing configuration has no presets")
    minimum_default = float(config.get("minimum_markup_percent", 20.0))
    if minimum_default < -99:
        raise SalesPricingError("default minimum markup must be at least -99%")
    seen: set[str] = set()
    for preset in config["presets"]:
        preset_id = str(preset.get("id") or "").strip().lower()
        if not preset_id or preset_id in seen:
            raise SalesPricingError(f"invalid or duplicate sales preset id: {preset_id!r}")
        seen.add(preset_id)
        markup = float(preset.get("markup_percent"))
        floor = float(preset.get("minimum_markup_percent", minimum_default))
        default_discount = float(preset.get("default_discount_percent", 0.0))
        max_discount = float(preset.get("max_discount_percent", 0.0))
        if markup < 0 or default_discount < 0 or max_discount < 0:
            raise SalesPricingError(f"sales preset {preset_id!r} contains a negative value")
        if floor < -99:
            raise SalesPricingError(
                f"sales preset {preset_id!r} minimum markup must be at least -99%"
            )
        if markup < floor:
            raise SalesPricingError(f"sales preset {preset_id!r} markup is below its floor")
        if default_discount > max_discount:
            raise SalesPricingError(f"sales preset {preset_id!r} default discount exceeds its maximum")
    return config


def load_sales_config() -> dict[str, Any]:
    return _validate_config(_read_config())


def list_presets() -> list[dict[str, Any]]:
    return [
        dict(preset)
        for preset in load_sales_config()["presets"]
        if preset.get("active", True)
    ]


def list_all_presets() -> list[dict[str, Any]]:
    """Return every preset for the manager settings screen."""
    return [dict(preset) for preset in load_sales_config()["presets"]]


def get_preset(preset_id: str) -> dict[str, Any]:
    wanted = str(preset_id or "standard").strip().lower()
    for preset in list_presets():
        if preset["id"].lower() == wanted:
            return preset
    raise SalesPricingError(f"unknown or inactive sales preset: {preset_id!r}")


def save_sales_config(config: dict[str, Any]) -> dict[str, Any]:
    """Validate and persist manager-edited sales presets."""
    validated = _validate_config(config)
    SALES_CONFIG_PATH.write_text(json.dumps(validated, indent=2) + "\n", encoding="utf-8")
    return validated


def _money(value: float) -> float:
    return round(float(value), 2)


def _percent(value: float) -> float:
    return round(float(value), 4)


def apply_sales_pricing(
    result: dict[str, Any],
    commercial: dict[str, Any] | None = None,
    *,
    allow_manager_override: bool = False,
) -> dict[str, Any]:
    """Apply a bounded quote-level concession without changing catalog cost."""
    commercial = commercial or {}
    preset = get_preset(commercial.get("preset_id", "standard"))
    markup_percent = float(preset["markup_percent"])
    minimum_markup_percent = float(
        preset.get("minimum_markup_percent", load_sales_config().get("minimum_markup_percent", 20.0))
    )
    requested_discount_percent = float(
        commercial.get("negotiated_discount_percent", preset.get("default_discount_percent", 0.0))
    )
    if requested_discount_percent < 0:
        raise SalesPricingError("negotiated discount cannot be negative")

    markup = markup_percent / 100.0
    floor_markup = minimum_markup_percent / 100.0
    negotiated_discount = requested_discount_percent / 100.0
    dealer_cost = float(result["totals"]["dealer_cost"])
    install_cost = float(result["totals"]["install"])
    hst_rate = float(result["config"].get("hst", 0.13))

    base_merchandise_sell = dealer_cost * (1.0 + markup)
    protected_install_sell = install_cost * (1.0 + markup)
    floor_sell = (dealer_cost + install_cost) * (1.0 + floor_markup)
    floor_merchandise_sell = floor_sell - protected_install_sell
    floor_discount_percent = 0.0
    if base_merchandise_sell > 0:
        floor_discount_percent = max(
            0.0,
            (1.0 - floor_merchandise_sell / base_merchandise_sell) * 100.0,
        )
    configured_max_discount = float(preset.get("max_discount_percent", 0.0))
    protected_max_discount_percent = min(configured_max_discount, floor_discount_percent)
    manager_override_applied = (
        allow_manager_override
        and requested_discount_percent > protected_max_discount_percent + 1e-9
    )
    maximum_allowed_discount_percent = protected_max_discount_percent

    if requested_discount_percent > maximum_allowed_discount_percent + 1e-9 and not allow_manager_override:
        raise NegotiationLimitError(
            {
                "preset_id": preset["id"],
                "requested_discount_percent": requested_discount_percent,
                "maximum_allowed_discount_percent": maximum_allowed_discount_percent,
                "minimum_markup_percent": minimum_markup_percent,
                "floor_sell": _money(floor_sell),
                "dealer_cost": _money(dealer_cost),
                "install_cost": _money(install_cost),
            }
        )

    merchandise_discount_amount = base_merchandise_sell * negotiated_discount
    discounted_merchandise_sell = base_merchandise_sell - merchandise_discount_amount
    pre_tax_sell = discounted_merchandise_sell + protected_install_sell
    profit = pre_tax_sell - dealer_cost - install_cost
    effective_markup_percent = (profit / (dealer_cost + install_cost) * 100.0) if dealer_cost + install_cost else 0.0
    gross_margin_percent = (profit / pre_tax_sell * 100.0) if pre_tax_sell else 0.0
    floor_status = "manager_override" if manager_override_applied else "within_floor"
    override_reason = commercial.get("manager_override_reason") if allow_manager_override else None

    totals = result["totals"]
    totals["base_sell_before_discount"] = _money(base_merchandise_sell + protected_install_sell)
    totals["merchandise_sell_before_discount"] = _money(base_merchandise_sell)
    totals["merchandise_discount"] = _money(merchandise_discount_amount)
    totals["protected_install_sell"] = _money(protected_install_sell)
    totals["minimum_floor_sell"] = _money(floor_sell)
    totals["sell_before_tax"] = _money(pre_tax_sell)
    totals["sell"] = _money(pre_tax_sell)
    totals["markup"] = _money(profit)
    totals["hst"] = _money(pre_tax_sell * hst_rate)
    totals["customer_total"] = _money(pre_tax_sell + totals["hst"])

    for line in result.get("lines", []):
        line_dealer = float(line["dealer_each"])
        line_install = float(line["install_each"])
        line_base_merch = line_dealer * (1.0 + markup)
        line_install_sell = line_install * (1.0 + markup)
        line_discount = line_base_merch * negotiated_discount
        line_sell = line_base_merch - line_discount + line_install_sell
        line_profit = line_sell - line_dealer - line_install
        line["base_sell_each"] = _money(line_base_merch + line_install_sell)
        line["merchandise_discount_each"] = _money(line_discount)
        line["protected_install_sell_each"] = _money(line_install_sell)
        line["sell_each"] = _money(line_sell)
        line["markup_each"] = _money(line_profit)
        line["hst_each"] = _money(line_sell * hst_rate)
        line["customer_total"] = _money(line_sell * line["qty"] + line_sell * line["qty"] * hst_rate)

    result["sales_pricing"] = {
        "preset_id": preset["id"],
        "preset_name": preset["name"],
        "preset_description": preset.get("description", ""),
        "markup_percent": _percent(markup_percent),
        "minimum_markup_percent": _percent(minimum_markup_percent),
        "negotiated_discount_percent": _percent(requested_discount_percent),
        "configured_max_discount_percent": _percent(configured_max_discount),
        "floor_derived_max_discount_percent": _percent(floor_discount_percent),
        "maximum_allowed_discount_percent": _percent(maximum_allowed_discount_percent),
        "remaining_discount_percent": _percent(max(0.0, maximum_allowed_discount_percent - requested_discount_percent)),
        "merchandise_discount_amount": _money(merchandise_discount_amount),
        "dealer_cost": _money(dealer_cost),
        "install_cost": _money(install_cost),
        "base_merchandise_sell": _money(base_merchandise_sell),
        "protected_install_sell": _money(protected_install_sell),
        "minimum_floor_sell": _money(floor_sell),
        "effective_markup_percent": _percent(effective_markup_percent),
        "gross_margin_percent": _percent(gross_margin_percent),
        "floor_status": floor_status,
        "manager_override_reason": override_reason,
        "sales_config_version": sales_config_version(),
    }
    result["sales_pricing"]["override_applied"] = manager_override_applied

    result["customer_presentation"] = {
        "preset_name": preset["name"],
        "negotiated_discount_percent": _percent(requested_discount_percent),
        "merchandise_discount": _money(merchandise_discount_amount),
        "lines": [
            {
                "line": line["line"],
                "type": line["type"],
                "qty": line["qty"],
                "unit_price": line["sell_each"],
                "line_total": _money(line["sell_each"] * line["qty"]),
            }
            for line in result.get("lines", [])
        ],
        "subtotal": _money(pre_tax_sell),
        "hst": totals["hst"],
        "total": totals["customer_total"],
    }
    result["internal_presentation"] = {
        **result["sales_pricing"],
        "profit": _money(profit),
        "floor_headroom": _money(pre_tax_sell - floor_sell),
        "base_sell_before_discount": totals["base_sell_before_discount"],
        "post_discount_sell": totals["sell_before_tax"],
    }
    result["sales_config_version"] = sales_config_version()
    return result
