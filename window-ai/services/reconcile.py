"""Compare supplier-invoiced dealer cost with what the engine calculates.

Upload the lines of a supplier order confirmation (CSV) with the price the
supplier actually charged per unit. Drift beyond the tolerance means the
price book or a calibration rule in config.json needs attention.

CSV columns (header row required, case-insensitive):
    ref, type, style, width, height, qty, supplier_unit_cost,
    loe180, i89, gas, triple, colour_ext, colour_int, brickmould,
    wood_jamb, nominal_ft, kind
Only ``supplier_unit_cost`` plus the product columns the line needs are
required; ``type`` defaults to ``window``.
"""
from __future__ import annotations

import csv
import io
from typing import Any

from services.windowcity import catalog
from services.windowcity.quote import CatalogError, load_config, price_quote

TRUE = {"1", "y", "yes", "true", "x"}


def _flag(value: Any) -> bool:
    return str(value or "").strip().lower() in TRUE


def _number(value: Any, field: str) -> float:
    try:
        return float(str(value).replace("$", "").replace(",", "").strip())
    except ValueError as exc:
        raise ValueError(f"{field} must be a number (got {value!r})") from exc


def spec_from_row(row: dict[str, str]) -> dict[str, Any]:
    kind = (row.get("type") or "window").strip().lower() or "window"
    spec: dict[str, Any] = {"type": kind, "qty": 1}
    glazing = {
        "loe180": _flag(row.get("loe180")),
        "i89": _flag(row.get("i89")),
        "triple": _flag(row.get("triple")),
    }
    if (row.get("gas") or "").strip():
        glazing["gas"] = row["gas"].strip()
    spec["glazing"] = glazing
    for key in ("colour_ext", "colour_int"):
        if (row.get(key) or "").strip():
            spec[key] = row[key].strip()
    if kind == "patio_sliding":
        spec["nominal_ft"] = int(_number(row.get("nominal_ft"), "nominal_ft"))
        return spec
    if kind == "patio_swing":
        spec["kind"] = (row.get("kind") or "single").strip()
    else:
        spec["style"] = (row.get("style") or "").strip()
    spec["width"] = _number(row.get("width"), "width")
    spec["height"] = _number(row.get("height"), "height")
    accessories = []
    if _flag(row.get("brickmould")):
        accessories.append({"kind": "brickmould", "name": catalog_first("brickmould")})
    if _flag(row.get("wood_jamb")):
        accessories.append({"kind": "wood_jamb", "name": catalog_first("wood_jamb")})
    if accessories:
        spec["accessories"] = accessories
    return spec


def catalog_first(section: str) -> str:
    for row in catalog.load("accessories")["rows"]:
        if row.get("section") == section:
            return row["name"]
    raise CatalogError(f"no {section} accessory in the price book")


def reconcile_csv(content: str, tolerance_percent: float = 1.0) -> dict[str, Any]:
    reader = csv.DictReader(io.StringIO(content.lstrip("﻿")))
    if not reader.fieldnames:
        raise ValueError("the CSV file is empty")
    reader.fieldnames = [name.strip().lower() for name in reader.fieldnames]
    if "supplier_unit_cost" not in reader.fieldnames:
        raise ValueError("the CSV needs a supplier_unit_cost column")
    cfg = load_config()
    lines: list[dict[str, Any]] = []
    for index, raw in enumerate(reader, start=2):
        row = {key: (value or "") for key, value in raw.items() if key}
        ref = row.get("ref") or f"row {index}"
        entry: dict[str, Any] = {"ref": ref, "row": index}
        try:
            supplier = _number(row.get("supplier_unit_cost"), "supplier_unit_cost")
            qty = int(_number(row.get("qty") or 1, "qty"))
            spec = spec_from_row(row)
            engine = price_quote({"lines": [spec]}, cfg)["lines"][0]["dealer_each"]
        except (ValueError, KeyError, CatalogError) as exc:
            entry.update({"status": "error", "error": str(exc)})
            lines.append(entry)
            continue
        difference = round(engine - supplier, 2)
        percent = round(difference / supplier * 100.0, 2) if supplier else None
        entry.update({
            "status": "ok" if percent is not None and abs(percent) <= tolerance_percent else "drift",
            "qty": qty,
            "description": f"{spec.get('style') or spec['type']} {spec.get('width', '')}x{spec.get('height', '')}".strip(),
            "engine_unit_cost": engine,
            "supplier_unit_cost": supplier,
            "difference": difference,
            "difference_percent": percent,
        })
        lines.append(entry)
    priced = [line for line in lines if line["status"] != "error"]
    engine_total = round(sum(line["engine_unit_cost"] * line["qty"] for line in priced), 2)
    supplier_total = round(sum(line["supplier_unit_cost"] * line["qty"] for line in priced), 2)
    return {
        "tolerance_percent": tolerance_percent,
        "lines": lines,
        "summary": {
            "lines": len(lines),
            "matched": sum(1 for line in lines if line["status"] == "ok"),
            "drift": sum(1 for line in lines if line["status"] == "drift"),
            "errors": sum(1 for line in lines if line["status"] == "error"),
            "engine_total": engine_total,
            "supplier_total": supplier_total,
            "difference": round(engine_total - supplier_total, 2),
            "difference_percent": round((engine_total - supplier_total) / supplier_total * 100.0, 2) if supplier_total else None,
        },
    }
