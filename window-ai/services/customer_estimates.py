"""Pricing and presentation helpers for combined customer estimates."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from services.doors.presentation import customer_door_openings
from services.doors.pricing import CONFIG_PATH, DoorLookupError, DoorValidationError, quote_project
from services.descriptions import window_description
from services.windowcity.engine import price_quote as price_windowcity_quote


class CustomerEstimatePricingError(Exception):
    """Raised when a customer estimate cannot be priced safely."""

    def __init__(self, message: str, *, reasons: list[str] | None = None):
        super().__init__(message)
        self.reasons = reasons or [message]


def canonical_pricing_payload(
    windows: list[dict[str, Any]],
    doors: list[dict[str, Any]],
    commercial: dict[str, Any],
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
                "qty": int(quote_line.get("qty") or 1),
                "unit_price": _money(quote_line.get("unit_price")),
                "line_total": _money(quote_line.get("line_total")),
            }
        )
    return lines


def price_customer_estimate(
    *,
    windows: list[dict[str, Any]],
    doors: list[dict[str, Any]],
    commercial: dict[str, Any],
    allow_manager_override: bool = False,
) -> dict[str, Any]:
    if not windows and not doors:
        raise CustomerEstimatePricingError("Add at least one Window or Door line before pricing.")

    window_quote: dict[str, Any] | None = None
    door_quote: dict[str, Any] | None = None
    window_lines: list[dict[str, Any]] = []
    door_openings: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    if windows:
        try:
            window_quote = price_windowcity_quote(
                {"lines": [line.get("spec") or {} for line in windows]},
                commercial={**commercial, "presentation_mode": "internal"},
                allow_manager_override=allow_manager_override,
            )
        except Exception as exc:
            reasons = getattr(exc, "reasons", None) or [str(exc)]
            raise CustomerEstimatePricingError("Window pricing requires review.", reasons=reasons) from exc
        warnings.extend(window_quote.get("warnings") or [])
        window_lines = _customer_window_lines(windows, window_quote.get("customer_presentation", {}).get("lines", []))

    if doors:
        try:
            door_quote = quote_project([opening.get("spec") or {} for opening in doors])
        except (DoorLookupError, DoorValidationError) as exc:
            raise CustomerEstimatePricingError(str(exc)) from exc
        door_openings = customer_door_openings(doors, door_quote.get("openings", []))

    window_totals = (window_quote or {}).get("customer_presentation", {})
    door_totals = (door_quote or {}).get("totals", {})
    windows_subtotal = _money(window_totals.get("subtotal"))
    windows_hst = _money(window_totals.get("hst"))
    windows_total = _money(window_totals.get("total"))
    doors_subtotal = _money(door_totals.get("sell"))
    doors_hst = _money(door_totals.get("hst"))
    doors_total = _money(door_totals.get("customer_total"))
    combined_subtotal = _money(windows_subtotal + doors_subtotal)
    combined_hst = _money(windows_hst + doors_hst)
    combined_total = _money(windows_total + doors_total)

    payload = canonical_pricing_payload(windows, doors, commercial)
    current_hash = pricing_hash(payload)
    return {
        "pricing_hash": current_hash,
        "priced_at": datetime.now(timezone.utc).isoformat(),
        "review_required": bool(window_quote and window_quote.get("review_required")),
        "warnings": warnings,
        "price_versions": {
            "windows": {
                "price_book_version": (window_quote or {}).get("price_book_version"),
                "config_version": (window_quote or {}).get("config_version"),
            },
            "doors": {"config_version": _door_config_version() if door_quote else None},
        },
        "sections": {
            "windows": {"lines": window_lines, "subtotal": windows_subtotal, "hst": windows_hst, "total": windows_total},
            "doors": {"openings": door_openings, "subtotal": doors_subtotal, "hst": doors_hst, "total": doors_total},
        },
        "totals": {
            "subtotal": combined_subtotal,
            "hst": combined_hst,
            "total": combined_total,
            "currency": "CAD",
        },
        # Keep the full engine responses in the saved audit snapshot. The UI's
        # customer document only reads the sanitized sections/totals above.
        "window_quote": window_quote,
        "door_quote": door_quote,
    }
