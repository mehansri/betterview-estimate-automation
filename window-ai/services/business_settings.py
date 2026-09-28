"""In-app business settings with safe defaults.

Each group is stored as one ``app_settings`` row and merged over the defaults
below, so a new field added here is available before anyone saves the group.
"""
from __future__ import annotations

import copy
import hashlib
import json
from typing import Any

from services.settings_store import get_setting, set_setting

# Canadian sales-tax rates by province (retail rates; editable in Settings).
# Installed-product (real property) contracts in PST provinces can be taxed
# differently, so confirm those rates with an accountant before quoting there.
DEFAULT_TAX_RATES: dict[str, dict[str, Any]] = {
    "ON": {"name": "Ontario", "components": [{"label": "HST", "rate": 13.0}]},
    "NB": {"name": "New Brunswick", "components": [{"label": "HST", "rate": 15.0}]},
    "NL": {"name": "Newfoundland and Labrador", "components": [{"label": "HST", "rate": 15.0}]},
    "NS": {"name": "Nova Scotia", "components": [{"label": "HST", "rate": 14.0}]},
    "PE": {"name": "Prince Edward Island", "components": [{"label": "HST", "rate": 15.0}]},
    "QC": {"name": "Quebec", "components": [{"label": "GST", "rate": 5.0}, {"label": "QST", "rate": 9.975}]},
    "BC": {"name": "British Columbia", "components": [{"label": "GST", "rate": 5.0}, {"label": "PST", "rate": 7.0}]},
    "MB": {"name": "Manitoba", "components": [{"label": "GST", "rate": 5.0}, {"label": "RST", "rate": 7.0}]},
    "SK": {"name": "Saskatchewan", "components": [{"label": "GST", "rate": 5.0}, {"label": "PST", "rate": 6.0}]},
    "AB": {"name": "Alberta", "components": [{"label": "GST", "rate": 5.0}]},
    "NT": {"name": "Northwest Territories", "components": [{"label": "GST", "rate": 5.0}]},
    "NU": {"name": "Nunavut", "components": [{"label": "GST", "rate": 5.0}]},
    "YT": {"name": "Yukon", "components": [{"label": "GST", "rate": 5.0}]},
}

DEFAULTS: dict[str, dict[str, Any]] = {
    "company": {
        "name": "Better View Solutions Inc.",
        "phone": "647-326-0613",
        "email": "info@betterview.ca",
        "address": "1 Greensboro Dr, Suite 308 · Etobicoke, ON M9W 1C8",
        "website": "",
    },
    "sales_process": {
        # Deposit requested on acceptance, as a % of the customer total.
        "deposit_percent": 0.0,
        # Days after sending before a follow-up is due.
        "follow_up_days": 3,
        "estimate_valid_days": 30,
    },
    "financing": {
        "enabled": False,
        "apr_percent": 0.0,
        "terms_months": [60, 120],
        "minimum_amount": 0.0,
        "disclaimer": "Financing is subject to credit approval. Payments are estimates only.",
    },
    "measurement": {
        # Deducted from each rough-opening dimension to get the unit size.
        "rough_opening_deduction_in": 0.5,
    },
    "tax": {
        "default_province": "ON",
        "rates": DEFAULT_TAX_RATES,
    },
}

GROUPS = tuple(DEFAULTS)


def _merge(base: Any, override: Any) -> Any:
    if isinstance(base, dict) and isinstance(override, dict):
        merged = dict(base)
        for key, value in override.items():
            merged[key] = _merge(base.get(key), value) if key in base else value
        return merged
    return copy.deepcopy(override) if override is not None else copy.deepcopy(base)


def get_group(group: str) -> dict[str, Any]:
    if group not in DEFAULTS:
        raise KeyError(group)
    stored = get_setting(f"settings:{group}")
    if group == "tax" and isinstance(stored, dict) and isinstance(stored.get("rates"), dict):
        # Stored rates replace the table wholesale so a province can be removed.
        return {**DEFAULTS["tax"], **stored}
    return _merge(DEFAULTS[group], stored if isinstance(stored, dict) else {})


def save_group(group: str, value: dict[str, Any]) -> dict[str, Any]:
    if group not in DEFAULTS:
        raise KeyError(group)
    validate_group(group, value)
    set_setting(f"settings:{group}", value)
    return get_group(group)


def validate_group(group: str, value: dict[str, Any]) -> None:
    if not isinstance(value, dict):
        raise ValueError("settings must be an object")
    if group == "tax":
        rates = value.get("rates", {})
        if not isinstance(rates, dict) or not rates:
            raise ValueError("at least one province tax rate is required")
        for code, entry in rates.items():
            components = entry.get("components") if isinstance(entry, dict) else None
            if not components:
                raise ValueError(f"{code}: at least one tax component is required")
            for component in components:
                rate = float(component.get("rate"))
                if not 0 <= rate < 100:
                    raise ValueError(f"{code}: tax rates must be between 0 and 100")
        default = value.get("default_province", "ON")
        if default not in rates:
            raise ValueError("default province must have a tax rate")
    if group == "financing":
        if float(value.get("apr_percent", 0)) < 0:
            raise ValueError("APR cannot be negative")
        terms = value.get("terms_months", [])
        if not all(int(term) > 0 for term in terms):
            raise ValueError("financing terms must be positive months")
    if group == "sales_process":
        if not 0 <= float(value.get("deposit_percent", 0)) <= 100:
            raise ValueError("deposit must be between 0 and 100%")
        if int(value.get("follow_up_days", 3)) < 0:
            raise ValueError("follow-up days cannot be negative")
    if group == "measurement":
        if not 0 <= float(value.get("rough_opening_deduction_in", 0)) < 6:
            raise ValueError("rough-opening deduction must be between 0 and 6 inches")


def fingerprint(*groups: str) -> str:
    canonical = json.dumps({group: get_group(group) for group in groups}, sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]


# ------------------------------------------------------------------ tax
def tax_components(province: str | None) -> tuple[str, list[dict[str, Any]]]:
    tax = get_group("tax")
    rates = tax["rates"]
    code = (province or tax.get("default_province") or "ON").upper()
    if code not in rates:
        raise ValueError(f"no tax rate is configured for province {code!r}")
    return code, [
        {"label": str(component["label"]), "rate": float(component["rate"])}
        for component in rates[code]["components"]
    ]


def tax_rate(province: str | None) -> float:
    """Combined rate as a fraction (0.13 for 13%)."""
    _, components = tax_components(province)
    return sum(component["rate"] for component in components) / 100.0


def tax_lines(province: str | None, subtotal: float) -> list[dict[str, Any]]:
    _, components = tax_components(province)
    return [
        {
            "label": f"{component['label']} ({component['rate']:g}%)",
            "rate": component["rate"],
            "amount": round(subtotal * component["rate"] / 100.0, 2),
        }
        for component in components
    ]


# ------------------------------------------------------------------ financing
def monthly_payment(principal: float, apr_percent: float, months: int) -> float:
    if months <= 0:
        return 0.0
    rate = apr_percent / 100.0 / 12.0
    if rate == 0:
        return round(principal / months, 2)
    return round(principal * rate / (1 - (1 + rate) ** -months), 2)


def financing_options(total: float) -> dict[str, Any] | None:
    settings = get_group("financing")
    if not settings.get("enabled") or total < float(settings.get("minimum_amount") or 0):
        return None
    apr = float(settings.get("apr_percent") or 0)
    return {
        "apr_percent": apr,
        "disclaimer": settings.get("disclaimer", ""),
        "options": [
            {"months": int(months), "monthly_payment": monthly_payment(total, apr, int(months))}
            for months in settings.get("terms_months", [])
        ],
    }


def deposit_amount(total: float) -> float:
    percent = float(get_group("sales_process").get("deposit_percent") or 0)
    return round(total * percent / 100.0, 2)
