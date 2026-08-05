"""Admin list/search/analytics endpoints."""
from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import FileResponse

from api.schemas.quote import EstimateSummary, SalesPresetConfig, WindowRow
from db.models import Estimate, ImportLog, Window
from db.session import get_session
from services.analytics import compute_analytics
from services.windowcity.sales import (
    SalesPricingError,
    list_all_presets,
    load_sales_config,
    save_sales_config,
    sales_config_version,
)
from utils.paths import EXPORTS_DIR, ensure_dirs

router = APIRouter(prefix="/api", tags=["admin"])


def _require_pricing_admin(token: str | None) -> None:
    expected_token = os.getenv("PRICING_ADMIN_TOKEN")
    if not expected_token or token != expected_token:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "manager_authorization_required",
                "message": "A manager/admin token is required for sales-pricing configuration changes.",
            },
        )


@router.get("/admin/sales-presets")
def get_sales_presets() -> dict:
    """Return all manager-configured sales strategies, including inactive ones."""
    config = load_sales_config()
    return {
        "sales_config_version": sales_config_version(),
        "currency": config.get("currency", "CAD"),
        "minimum_markup_percent": config.get("minimum_markup_percent", 20.0),
        "presets": list_all_presets(),
    }


@router.put("/admin/sales-presets")
def update_sales_presets(
    body: SalesPresetConfig,
    pricing_admin_token: str | None = Header(default=None, alias="X-Pricing-Admin-Token"),
) -> dict:
    """Replace sales presets; the price book itself remains immutable here."""
    _require_pricing_admin(pricing_admin_token)
    try:
        saved = save_sales_config(body.model_dump())
    except (SalesPricingError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail={"code": "invalid_sales_config", "message": str(exc)}) from exc
    return {"sales_config_version": sales_config_version(), **saved}


def _f(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


@router.get("/estimates", response_model=list[EstimateSummary])
def list_estimates(limit: int = Query(50, ge=1, le=500), offset: int = 0) -> list[EstimateSummary]:
    with get_session() as session:
        rows = (
            session.query(Estimate)
            .order_by(Estimate.parsed_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        out = []
        for e in rows:
            out.append(
                EstimateSummary(
                    id=str(e.id),
                    estimate_number=e.estimate_number,
                    customer=e.customer,
                    project_name=e.project_name,
                    salesperson=e.salesperson,
                    estimate_date=e.estimate_date.isoformat() if e.estimate_date else None,
                    total_price=_f(e.total_price),
                    source_filename=e.source_filename,
                    window_count=len(e.windows),
                    parsed_at=e.parsed_at.isoformat() if e.parsed_at else None,
                )
            )
        return out


@router.get("/estimates/{estimate_id}")
def get_estimate(estimate_id: str) -> dict:
    with get_session() as session:
        try:
            eid = UUID(estimate_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid estimate id") from exc
        e = session.query(Estimate).filter(Estimate.id == eid).one_or_none()
        if not e:
            raise HTTPException(status_code=404, detail="Estimate not found")
        return {
            "id": str(e.id),
            "estimate_number": e.estimate_number,
            "customer": e.customer,
            "project_name": e.project_name,
            "salesperson": e.salesperson,
            "estimate_date": e.estimate_date.isoformat() if e.estimate_date else None,
            "total_price": _f(e.total_price),
            "source_filename": e.source_filename,
            "source_path": e.source_path,
            "parsed_at": e.parsed_at.isoformat() if e.parsed_at else None,
            "raw_json": e.raw_json,
            "windows": [
                {
                    "id": str(w.id),
                    "window_number": w.window_number,
                    "type": w.type,
                    "width": _f(w.width),
                    "height": _f(w.height),
                    "area": _f(w.area),
                    "frame": w.frame,
                    "glass": w.glass,
                    "color": w.color,
                    "unit_price": _f(w.unit_price),
                    "quantity": w.quantity,
                    "tempered": w.tempered,
                    "extras": w.extras,
                }
                for w in e.windows
            ],
        }


@router.get("/windows", response_model=list[WindowRow])
def list_windows(
    type: Optional[str] = None,
    glass: Optional[str] = None,
    frame: Optional[str] = None,
    color: Optional[str] = None,
    q: Optional[str] = None,
    sort: str = "unit_price",
    order: str = "desc",
    limit: int = Query(100, ge=1, le=1000),
    offset: int = 0,
) -> list[WindowRow]:
    with get_session() as session:
        query = session.query(Window, Estimate).join(
            Estimate, Window.estimate_id == Estimate.id
        )
        if type:
            query = query.filter(Window.type == type)
        if glass:
            query = query.filter(Window.glass == glass)
        if frame:
            query = query.filter(Window.frame == frame)
        if color:
            query = query.filter(Window.color == color)
        if q:
            like = f"%{q}%"
            query = query.filter(
                (Estimate.customer.ilike(like))
                | (Estimate.estimate_number.ilike(like))
                | (Window.type.ilike(like))
            )
        sort_col = {
            "unit_price": Window.unit_price,
            "width": Window.width,
            "height": Window.height,
            "type": Window.type,
            "area": Window.area,
        }.get(sort, Window.unit_price)
        if order == "asc":
            query = query.order_by(sort_col.asc())
        else:
            query = query.order_by(sort_col.desc())
        rows = query.offset(offset).limit(limit).all()
        return [
            WindowRow(
                id=str(w.id),
                estimate_id=str(w.estimate_id),
                estimate_number=e.estimate_number,
                window_number=w.window_number,
                type=w.type,
                width=_f(w.width),
                height=_f(w.height),
                area=_f(w.area),
                frame=w.frame,
                glass=w.glass,
                color=w.color,
                tempered=w.tempered,
                quantity=w.quantity,
                unit_price=_f(w.unit_price),
                line_total=_f(w.line_total),
                brickmould=w.brickmould,
                wood_jamb=w.wood_jamb,
                screen=w.screen,
                gas_fill=w.gas_fill,
            )
            for w, e in rows
        ]


@router.get("/analytics")
def analytics() -> dict:
    with get_session() as session:
        return compute_analytics(session)


@router.get("/import-logs")
def import_logs(limit: int = Query(50, ge=1, le=500)) -> list[dict]:
    with get_session() as session:
        rows = (
            session.query(ImportLog)
            .order_by(ImportLog.created_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "id": str(r.id),
                "filename": r.filename,
                "status": r.status,
                "estimate_number": r.estimate_number,
                "estimate_id": str(r.estimate_id) if r.estimate_id else None,
                "window_count": r.window_count,
                "warnings": r.warnings,
                "errors": r.errors,
                "message": r.message,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]


@router.post("/exports/windows")
def export_windows() -> dict:
    ensure_dirs()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = EXPORTS_DIR / f"windows_{stamp}.csv"
    with get_session() as session:
        rows = (
            session.query(Window, Estimate)
            .join(Estimate, Window.estimate_id == Estimate.id)
            .all()
        )
        with path.open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "estimate_number",
                    "type",
                    "width",
                    "height",
                    "frame",
                    "glass",
                    "color",
                    "quantity",
                    "unit_price",
                    "tempered",
                ]
            )
            for w, e in rows:
                writer.writerow(
                    [
                        e.estimate_number,
                        w.type,
                        w.width,
                        w.height,
                        w.frame,
                        w.glass,
                        w.color,
                        w.quantity,
                        w.unit_price,
                        w.tempered,
                    ]
                )
    return {"path": str(path), "filename": path.name, "count": len(rows)}
