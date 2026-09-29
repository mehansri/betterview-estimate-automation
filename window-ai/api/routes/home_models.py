"""Same-model home lookup, the house-model library, and permit-drawing reading."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from api.schemas.home_models import HomeModelFromEstimate, HomeModelSave
from db.models import CustomerEstimate, HomeModel
from db.session import get_session
from services import drawing_extraction
from services.permits import PermitRecord
from services.home_models import (
    home_model_summary,
    match_address,
    model_label,
    openings_for_new_home,
)

router = APIRouter(prefix="/api", tags=["home-models"])


def _parse_id(value: str, what: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {what} id") from exc


def _get_model(session, model_id: str) -> HomeModel:
    row = session.get(HomeModel, _parse_id(model_id, "house model"))
    if row is None:
        raise HTTPException(status_code=404, detail="House model not found")
    return row


def _detail(row: HomeModel) -> dict:
    return {**home_model_summary(row), "windows": row.windows or [], "doors": row.doors or []}


@router.get("/model-match")
def model_match(address: str, estimate_id: Optional[str] = None) -> dict:
    """Permit record, same-model neighbours, saved models and measured jobs for an address."""
    with get_session() as session:
        return match_address(session, address, exclude_estimate_id=estimate_id)


@router.get("/home-models")
def list_home_models(builder: Optional[str] = None) -> list[dict]:
    with get_session() as session:
        query = session.query(HomeModel)
        if builder:
            query = query.filter(HomeModel.builder == builder.strip().upper())
        return [home_model_summary(row) for row in query.order_by(HomeModel.builder, HomeModel.gfa).all()]


@router.get("/home-models/{model_id}")
def get_home_model(model_id: str) -> dict:
    with get_session() as session:
        return _detail(_get_model(session, model_id))


@router.get("/home-models/{model_id}/openings")
def home_model_openings(model_id: str, mirror: bool = False) -> dict:
    """The model's windows and doors with new line ids, ready to add to an estimate."""
    with get_session() as session:
        row = _get_model(session, model_id)
        return {**openings_for_new_home(row, mirror=mirror), "model": home_model_summary(row)}


@router.post("/home-models")
def create_home_model(body: HomeModelSave) -> dict:
    builder = body.builder.strip().upper()
    if not (builder or body.model_name.strip() or body.plan.strip()) or not (body.gfa or body.model_name.strip()):
        raise HTTPException(status_code=422, detail="A house model needs a builder, model name or plan, and a floor area or model name.")
    record = PermitRecord(
        permit_number="", address=body.source_address, address_key="", dwelling_type=body.dwelling_type.strip(),
        work="New", builder=builder or None, gfa=body.gfa, storeys=body.storeys, bedrooms=None, issue_date=None,
        lat=body.lat, lng=body.lng, model=body.model_name.strip().upper() or None,
        elevation=body.elevation.strip().upper() or None, plan=body.plan.strip().upper() or None,
    )
    row = HomeModel(
        source_city=body.source_city,
        builder=builder,
        dwelling_type=body.dwelling_type.strip(),
        gfa=body.gfa or 0.0,
        storeys=body.storeys,
        model_name=record.model or "",
        elevation=record.elevation or "",
        plan=record.plan or "",
        variant_flags=body.variant_flags,
        lat=body.lat,
        lng=body.lng,
        label=body.label.strip() or model_label(record),
        windows=[line.model_dump(mode="json") for line in body.windows],
        doors=[opening.model_dump(mode="json") for opening in body.doors],
        source=body.source,
        source_address=body.source_address.strip(),
        source_estimate_id=_parse_id(body.source_estimate_id, "estimate") if body.source_estimate_id else None,
        notes=body.notes.strip(),
    )
    with get_session() as session:
        session.add(row)
        session.flush()
        return _detail(row)


@router.post("/home-models/from-estimate/{estimate_id}")
def home_model_from_estimate(estimate_id: str, body: HomeModelFromEstimate) -> dict:
    """Save a measured job's openings as the template for its house model."""
    with get_session() as session:
        estimate = session.get(CustomerEstimate, _parse_id(estimate_id, "estimate"))
        if estimate is None or estimate.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Customer estimate not found")
        if estimate.is_preliminary:
            raise HTTPException(
                status_code=409,
                detail="This estimate's openings were copied from another home. Confirm them with a site measure (untick Preliminary) before saving them as the model.",
            )
        if not (estimate.windows or estimate.doors):
            raise HTTPException(status_code=422, detail="Add the home's windows and doors before saving it as a model.")
        match = match_address(session, estimate.project_address or "", exclude_estimate_id=str(estimate.id))
        subject = match.get("subject")
        identified = subject and (subject.get("builder") or subject.get("model") or subject.get("plan") or subject.get("lat") is not None)
        if not identified or not (subject.get("gfa") or subject.get("model")):
            raise HTTPException(status_code=422, detail=match.get("message") or "No new-house permit was found for this address.")

        if body.replace_model_id:
            row = _get_model(session, body.replace_model_id)
        else:
            row = HomeModel(source_city=match["source"]["key"])
            session.add(row)
        # The measured home defines the model (and its elevation/variant).
        row.builder = subject.get("builder") or ""
        row.dwelling_type = subject.get("dwelling_type") or ""
        row.gfa = subject.get("gfa") or 0.0
        row.storeys = subject.get("storeys")
        row.model_name = subject.get("model") or ""
        row.elevation = subject.get("elevation") or ""
        row.plan = subject.get("plan") or ""
        row.variant_flags = list(subject.get("flags") or [])
        row.lat, row.lng = subject.get("lat"), subject.get("lng")
        row.label = subject["label"]
        row.windows = estimate.windows or []
        row.doors = estimate.doors or []
        row.source = "measured"
        row.source_address = estimate.project_address or ""
        row.source_estimate_id = estimate.id
        row.notes = body.notes.strip() or row.notes
        row.updated_at = datetime.now(timezone.utc)
        estimate.home_model_id = None
        session.flush()
        return _detail(row)


@router.delete("/home-models/{model_id}", status_code=204)
def delete_home_model(model_id: str) -> None:
    with get_session() as session:
        session.delete(_get_model(session, model_id))


@router.get("/drawings/status")
def drawing_reader_status() -> dict:
    return {"available": drawing_extraction.available()}


@router.post("/drawings/extract")
async def extract_drawing(file: UploadFile = File(...), address: str = Form("")) -> dict:
    """Draft measure-sheet rows from a permit drawing PDF (reviewed before use)."""
    content = await file.read()
    try:
        return drawing_extraction.extract_openings(content, address=address.strip())
    except drawing_extraction.DrawingExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
