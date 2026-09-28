"""Business settings, job adders, templates, price books, reconciliation, reports."""
from __future__ import annotations

import json
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from api.security import require_pricing_admin
from db.models import LineTemplate
from db.session import get_session
from services import business_settings, job_adders, price_books, reconcile, reports

router = APIRouter(prefix="/api", tags=["business"])

AdminToken = Header(default=None, alias="X-Pricing-Admin-Token")


# ------------------------------------------------------------------ settings
@router.get("/settings")
def get_all_settings() -> dict[str, Any]:
    """All business settings (nothing here is secret; editing needs the token)."""
    return {group: business_settings.get_group(group) for group in business_settings.GROUPS}


@router.put("/admin/settings/{group}")
def save_settings(group: str, body: dict[str, Any], pricing_admin_token: str | None = AdminToken) -> dict[str, Any]:
    require_pricing_admin(pricing_admin_token)
    if group not in business_settings.GROUPS:
        raise HTTPException(status_code=404, detail="Unknown settings group")
    try:
        return business_settings.save_group(group, body)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ------------------------------------------------------------------ job adders
class AdderList(BaseModel):
    adders: list[dict[str, Any]]


@router.get("/job-adders")
def get_job_adders(active_only: bool = False) -> dict[str, Any]:
    return {"units": list(job_adders.UNITS), "adders": job_adders.list_adders(active_only=active_only)}


@router.put("/admin/job-adders")
def save_job_adders(body: AdderList, pricing_admin_token: str | None = AdminToken) -> dict[str, Any]:
    require_pricing_admin(pricing_admin_token)
    try:
        return {"units": list(job_adders.UNITS), "adders": job_adders.save_adders(body.adders)}
    except job_adders.JobAdderError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ------------------------------------------------------------------ templates
class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    kind: Literal["window", "door", "estimate"]
    payload: dict[str, Any]


def _template_dict(row: LineTemplate) -> dict[str, Any]:
    return {"id": str(row.id), "name": row.name, "kind": row.kind, "payload": row.payload,
            "created_at": row.created_at.isoformat() if row.created_at else None}


@router.get("/templates")
def list_templates(kind: Optional[str] = None) -> list[dict[str, Any]]:
    with get_session() as session:
        query = session.query(LineTemplate)
        if kind:
            query = query.filter(LineTemplate.kind == kind)
        return [_template_dict(row) for row in query.order_by(LineTemplate.name).all()]


@router.post("/templates")
def create_template(body: TemplateIn) -> dict[str, Any]:
    with get_session() as session:
        row = LineTemplate(name=body.name.strip(), kind=body.kind, payload=body.payload)
        session.add(row)
        session.flush()
        return _template_dict(row)


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(template_id: str) -> None:
    try:
        tid = UUID(template_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid template id") from exc
    with get_session() as session:
        row = session.get(LineTemplate, tid)
        if row is None:
            raise HTTPException(status_code=404, detail="Template not found")
        session.delete(row)


# ------------------------------------------------------------------ price books
@router.get("/admin/price-books")
def list_price_books() -> dict[str, Any]:
    return price_books.list_versions()


@router.post("/admin/price-books")
async def import_price_book(
    dataset: str = Form(...),
    label: str = Form(default=""),
    file: UploadFile = File(...),
    pricing_admin_token: str | None = AdminToken,
) -> dict[str, Any]:
    require_pricing_admin(pricing_admin_token)
    raw = await file.read(25 * 1024 * 1024 + 1)
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Price-book files must be 25 MB or smaller")
    try:
        data = json.loads(raw.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=422, detail=f"The file is not valid JSON: {exc}") from exc
    try:
        return price_books.create_version(dataset, label or file.filename or dataset, data)
    except price_books.PriceBookError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/admin/price-books/{version_id}/publish")
def publish_price_book(version_id: str, pricing_admin_token: str | None = AdminToken) -> dict[str, Any]:
    require_pricing_admin(pricing_admin_token)
    try:
        UUID(version_id)
        return price_books.publish(version_id)
    except (ValueError, price_books.PriceBookError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class RevertRequest(BaseModel):
    dataset: str


@router.post("/admin/price-books/revert")
def revert_price_book(body: RevertRequest, pricing_admin_token: str | None = AdminToken) -> dict[str, Any]:
    require_pricing_admin(pricing_admin_token)
    return price_books.revert(body.dataset)


@router.get("/admin/price-books/{dataset_group}/{dataset_name}/current")
def download_current_price_book(dataset_group: str, dataset_name: str) -> Any:
    """The dataset currently in effect, as a starting point for an update."""
    try:
        return price_books.current_data(f"{dataset_group}/{dataset_name}")
    except price_books.PriceBookError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ------------------------------------------------------------------ reconciliation
@router.post("/admin/reconcile")
async def reconcile_supplier_order(
    file: UploadFile = File(...),
    tolerance_percent: float = Form(default=1.0),
) -> dict[str, Any]:
    raw = await file.read(5 * 1024 * 1024)
    try:
        return reconcile.reconcile_csv(raw.decode("utf-8-sig", errors="replace"), tolerance_percent)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ------------------------------------------------------------------ reports
@router.get("/reports/summary")
def report_summary(days: int = Query(90, ge=1, le=730)) -> dict[str, Any]:
    return reports.summary(days)
