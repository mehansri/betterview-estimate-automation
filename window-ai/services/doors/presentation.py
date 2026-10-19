"""Customer-safe presentation helpers for Palma door quotes."""

from __future__ import annotations

from typing import Any

from services.descriptions import door_description
from services.doors.pipeline import door_drawing


def _money(value: Any) -> float:
    return round(float(value or 0), 2)


def _allocate(total: float, weights: list[float]) -> list[float]:
    """Split ``total`` by ``weights`` to the cent; the last share takes the rounding."""
    whole = sum(weights)
    shares: list[float] = []
    remaining = _money(total)
    for index, weight in enumerate(weights):
        share = remaining if index == len(weights) - 1 else _money(total * weight / whole) if whole > 0 else 0.0
        shares.append(share)
        remaining = _money(remaining - share)
    return shares


def customer_door_openings(
    project_openings: list[dict[str, Any]],
    quote_openings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Customer lines for each door: components at their price before the offer
    discount, so they add up to the original subtotal, and installation at its
    own price (it is never discounted)."""

    customer_openings: list[dict[str, Any]] = []
    for index, opening in enumerate(quote_openings):
        project_opening = project_openings[index] if index < len(project_openings) else {}
        sell = _money(opening.get("sell"))
        base_sell = _money(opening.get("base_sell") or sell)
        discount = float(opening.get("discount") or 0)
        bases = [_money(item.get("list")) * discount for item in (opening.get("line_items") or [])]
        descriptions = [
            str(item.get("customer_description") or item.get("description") or "Door component")
            for item in (opening.get("line_items") or [])
        ]
        descriptions.append("Professional installation")
        quantities = [int(item.get("qty") or 1) for item in (opening.get("line_items") or [])] + [1]
        if opening.get("install_sell") is not None:
            install = _money(opening["install_sell"])
            totals = _allocate(base_sell - install, bases) + [install] if bases else [base_sell]
        else:
            # Quotes priced before the installation price was kept: spread the sell by cost.
            totals = _allocate(base_sell, bases + [_money(opening.get("install"))])

        customer_items: list[dict[str, Any]] = []
        for line_total, description, qty in zip(totals, descriptions, quantities):
            customer_items.append(
                {
                    "description": description,
                    "qty": qty,
                    "unit_price": _money(line_total / qty),
                    "line_total": line_total,
                }
            )

        customer_openings.append(
            {
                "id": str(project_opening.get("id") or index + 1),
                "location": project_opening.get("location") or "",
                "label": door_description(project_opening, opening) or "Door opening",
                "drawing": door_drawing(project_opening.get("spec")),
                "material": opening.get("material"),
                "finish_label": opening.get("finish_label"),
                "items": customer_items,
                "subtotal": sell,
                # What the items add up to, before the offer discount.
                "base_subtotal": base_sell,
                "hst": _money(opening.get("hst")),
                "total": _money(opening.get("customer_total")),
            }
        )
    return customer_openings


def customer_door_presentation(quote: dict[str, Any], specs: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Return only customer-safe fields from a raw Palma project quote."""

    specs = specs or []
    openings = customer_door_openings(
        [
            {"id": str(index + 1), "spec": specs[index] if index < len(specs) else None}
            for index, _ in enumerate(quote.get("openings") or [])
        ],
        quote.get("openings") or [],
    )
    totals = quote.get("totals") or {}
    return {
        "openings": openings,
        "subtotal": _money(totals.get("sell")),
        "hst": _money(totals.get("hst")),
        "total": _money(totals.get("customer_total")),
        "currency": "CAD",
    }
