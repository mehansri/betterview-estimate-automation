"""Job-scope adders: priced work beyond the products themselves.

The catalog lives in the ``job_adders`` table. Seed rows are created inactive
with zero prices on purpose — a manager enters real cost/sell prices and
activates each item before salespeople can add it to an estimate.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

UNITS = ("per_job", "per_opening", "per_window", "per_door", "each")

SEED_ADDERS: list[dict[str, Any]] = [
    {"id": "removal_disposal", "name": "Remove and dispose of existing unit", "category": "Removal", "unit": "per_opening"},
    {"id": "waste_bin", "name": "Waste bin / disposal fee", "category": "Removal", "unit": "per_job"},
    {"id": "exterior_capping", "name": "Exterior aluminum capping", "category": "Finishing", "unit": "per_window"},
    {"id": "interior_trim", "name": "Interior casing / trim", "category": "Finishing", "unit": "per_window"},
    {"id": "extension_jambs", "name": "Interior extension jambs", "category": "Finishing", "unit": "per_window"},
    {"id": "insulation_caulking", "name": "Insulation and exterior caulking", "category": "Finishing", "unit": "per_opening"},
    {"id": "brick_stucco", "name": "Brick / stucco / siding difficulty", "category": "Site conditions", "unit": "each"},
    {"id": "second_storey", "name": "Second-storey / ladder work", "category": "Site conditions", "unit": "each"},
    {"id": "lift_rental", "name": "Lift or scaffold rental", "category": "Site conditions", "unit": "per_job"},
    {"id": "lead_safe", "name": "Lead-safe work practices", "category": "Site conditions", "unit": "per_job"},
    {"id": "permit", "name": "Building permit", "category": "Admin", "unit": "per_job"},
    {"id": "delivery", "name": "Delivery", "category": "Admin", "unit": "per_job"},
    {"id": "travel_zone", "name": "Travel zone charge", "category": "Admin", "unit": "per_job"},
]


class JobAdderError(ValueError):
    pass


def _row_dict(row) -> dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "category": row.category,
        "unit": row.unit,
        "cost": float(row.cost or 0),
        "price": float(row.price or 0),
        "description": row.description or "",
        "active": bool(row.active),
        "sort_order": int(row.sort_order or 0),
    }


def ensure_seeded(session) -> None:
    from db.models import JobAdder

    if session.query(JobAdder).count():
        return
    for index, seed in enumerate(SEED_ADDERS):
        session.add(JobAdder(cost=0, price=0, active=False, sort_order=index, description="", **seed))
    session.flush()


def list_adders(*, active_only: bool = False) -> list[dict[str, Any]]:
    from db.models import JobAdder
    from db.session import database_available, get_session

    if not database_available():
        return []
    try:
        with get_session() as session:
            ensure_seeded(session)
            query = session.query(JobAdder)
            if active_only:
                query = query.filter(JobAdder.active.is_(True))
            return [_row_dict(row) for row in query.order_by(JobAdder.sort_order, JobAdder.name).all()]
    except Exception:
        # No database (unit tests / scripts): nothing is priced from the catalog.
        return []


def validate_adder(item: dict[str, Any]) -> dict[str, Any]:
    adder_id = str(item.get("id") or "").strip().lower().replace(" ", "_")
    if not adder_id:
        raise JobAdderError("every adder needs an id")
    unit = str(item.get("unit") or "each")
    if unit not in UNITS:
        raise JobAdderError(f"{adder_id}: unit must be one of {', '.join(UNITS)}")
    cost, price = float(item.get("cost") or 0), float(item.get("price") or 0)
    if cost < 0 or price < 0:
        raise JobAdderError(f"{adder_id}: cost and price cannot be negative")
    if item.get("active") and price <= 0:
        raise JobAdderError(f"{adder_id}: set a price before activating it")
    return {
        "id": adder_id,
        "name": str(item.get("name") or adder_id).strip(),
        "category": str(item.get("category") or "General").strip(),
        "unit": unit,
        "cost": round(cost, 2),
        "price": round(price, 2),
        "description": str(item.get("description") or "").strip(),
        "active": bool(item.get("active")),
        "sort_order": int(item.get("sort_order") or 0),
    }


def save_adders(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Replace the catalog with the manager-edited list."""
    from db.models import JobAdder
    from db.session import get_session

    cleaned = [validate_adder(item) for item in items]
    ids = [item["id"] for item in cleaned]
    if len(ids) != len(set(ids)):
        raise JobAdderError("adder ids must be unique")
    with get_session() as session:
        existing = {row.id: row for row in session.query(JobAdder).all()}
        for item in cleaned:
            row = existing.pop(item["id"], None)
            if row is None:
                session.add(JobAdder(**item))
            else:
                for key, value in item.items():
                    setattr(row, key, value)
        for row in existing.values():
            session.delete(row)
    return list_adders()


def catalog_fingerprint() -> str:
    canonical = json.dumps(list_adders(), sort_keys=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:12]


# ------------------------------------------------------------------ pricing
def _window_units(windows: list[dict[str, Any]]) -> int:
    return sum(int((line.get("spec") or {}).get("qty") or 1) for line in windows)


def auto_quantity(unit: str, windows: list[dict[str, Any]], doors: list[dict[str, Any]]) -> float:
    if unit == "per_job":
        return 1
    if unit == "per_window":
        return _window_units(windows)
    if unit == "per_door":
        return len(doors)
    if unit == "per_opening":
        return _window_units(windows) + len(doors)
    return 1


def price_adders(
    selections: list[dict[str, Any]],
    windows: list[dict[str, Any]],
    doors: list[dict[str, Any]],
) -> dict[str, Any]:
    """Price an estimate's adders. Adders are fixed-price and never discounted."""
    catalog = {item["id"]: item for item in list_adders()}
    lines: list[dict[str, Any]] = []
    for index, selection in enumerate(selections, start=1):
        if selection.get("custom"):
            name = str(selection.get("name") or "").strip()
            if not name:
                raise JobAdderError(f"custom item {index} needs a description")
            item = {
                "id": selection.get("id") or f"custom-{index}",
                "name": name,
                "unit": "each",
                "cost": float(selection.get("cost") or 0),
                "price": float(selection.get("price") or 0),
            }
            if item["price"] < 0 or item["cost"] < 0:
                raise JobAdderError(f"{name}: cost and price cannot be negative")
        else:
            adder_id = str(selection.get("adder_id") or "")
            item = catalog.get(adder_id)
            if item is None:
                raise JobAdderError(f"job item {adder_id!r} is not in the catalog")
            if not item["active"]:
                raise JobAdderError(f"{item['name']} is not active; set its price in Settings first")
        qty_override = selection.get("qty")
        qty = float(qty_override) if qty_override not in (None, "") else auto_quantity(item["unit"], windows, doors)
        if qty < 0:
            raise JobAdderError(f"{item['name']}: quantity cannot be negative")
        unit_price, unit_cost = round(float(item["price"]), 2), round(float(item["cost"]), 2)
        lines.append({
            "id": str(selection.get("id") or item["id"]),
            "adder_id": None if selection.get("custom") else item["id"],
            "name": item["name"],
            "note": str(selection.get("note") or ""),
            "unit": item["unit"],
            "qty": qty,
            "unit_price": unit_price,
            "line_total": round(unit_price * qty, 2),
            "unit_cost": unit_cost,
            "cost_total": round(unit_cost * qty, 2),
        })
    subtotal = round(sum(line["line_total"] for line in lines), 2)
    cost = round(sum(line["cost_total"] for line in lines), 2)
    return {"lines": lines, "subtotal": subtotal, "cost": cost, "profit": round(subtotal - cost, 2)}
