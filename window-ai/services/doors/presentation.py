"""Customer-safe presentation helpers for Palma door quotes."""

from __future__ import annotations

from typing import Any


def _money(value: Any) -> float:
    return round(float(value or 0), 2)


def customer_door_openings(
    project_openings: list[dict[str, Any]],
    quote_openings: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Allocate customer sell amounts across safe door component lines."""

    customer_openings: list[dict[str, Any]] = []
    for index, opening in enumerate(quote_openings):
        project_opening = project_openings[index] if index < len(project_openings) else {}
        cost_subtotal = _money(opening.get("cost_subtotal"))
        sell = _money(opening.get("sell"))
        discount = float(opening.get("discount") or 0)
        bases = [_money(item.get("list")) * discount for item in (opening.get("line_items") or [])]
        bases.append(_money(opening.get("install")))
        descriptions = [
            str(item.get("customer_description") or item.get("description") or "Door component")
            for item in (opening.get("line_items") or [])
        ]
        descriptions.append("Professional installation")
        quantities = [int(item.get("qty") or 1) for item in (opening.get("line_items") or [])] + [1]

        customer_items: list[dict[str, Any]] = []
        remaining = sell
        for item_index, (base, description, qty) in enumerate(zip(bases, descriptions, quantities)):
            if item_index == len(bases) - 1:
                line_total = _money(remaining)
            elif cost_subtotal > 0:
                line_total = _money(sell * base / cost_subtotal)
            else:
                line_total = 0.0
            remaining = _money(remaining - line_total)
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
                "label": str(project_opening.get("description") or "").strip()
                or str(opening.get("label") or "Door opening"),
                "material": opening.get("material"),
                "finish_label": opening.get("finish_label"),
                "items": customer_items,
                "subtotal": sell,
                "hst": _money(opening.get("hst")),
                "total": _money(opening.get("customer_total")),
            }
        )
    return customer_openings


def customer_door_presentation(quote: dict[str, Any]) -> dict[str, Any]:
    """Return only customer-safe fields from a raw Palma project quote."""

    openings = customer_door_openings(
        [{"id": str(index + 1)} for index, _ in enumerate(quote.get("openings") or [])],
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
