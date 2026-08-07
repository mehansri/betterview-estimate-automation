"""Saved combined customer estimate lifecycle endpoints."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy.exc import IntegrityError

from api.schemas.customer_estimates import (
    CustomerEstimateDraft,
    CustomerEstimateResponse,
    CustomerEstimateSummary,
)
from db.models import CustomerEstimate, CustomerEstimateCounter
from db.session import get_session
from services.customer_estimates import (
    CustomerEstimatePricingError,
    canonical_pricing_payload,
    price_customer_estimate,
    pricing_hash,
)


router = APIRouter(prefix="/api/customer-estimates", tags=["customer-estimates"])


def _parse_id(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid customer estimate id") from exc


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _payload_parts(body: CustomerEstimateDraft) -> tuple[list[dict], list[dict], dict]:
    return (
        [line.model_dump(mode="json") for line in body.windows],
        [opening.model_dump(mode="json") for opening in body.doors],
        body.commercial.model_dump(mode="json"),
    )


def _pricing_payload(row: CustomerEstimate) -> dict:
    return canonical_pricing_payload(row.windows or [], row.doors or [], row.commercial or {})


def _row_response(row: CustomerEstimate) -> CustomerEstimateResponse:
    return CustomerEstimateResponse(
        id=str(row.id),
        estimate_number=row.estimate_number,
        status=row.status,
        customer_name=row.customer_name or "",
        company_name=row.company_name or "",
        email=row.email or "",
        phone=row.phone or "",
        project_name=row.project_name or "",
        project_address=row.project_address or "",
        salesperson=row.salesperson or "",
        estimate_date=row.estimate_date,
        valid_until=row.valid_until,
        description=row.description or "",
        notes=row.notes or "",
        terms=row.terms or "",
        windows=row.windows or [],
        doors=row.doors or [],
        commercial=row.commercial or {},
        pricing=row.pricing_snapshot,
        pricing_hash=row.pricing_hash,
        created_at=row.created_at.isoformat() if row.created_at else _now().isoformat(),
        updated_at=row.updated_at.isoformat() if row.updated_at else _now().isoformat(),
        finalized_at=row.finalized_at.isoformat() if row.finalized_at else None,
    )


def _apply_body(row: CustomerEstimate, body: CustomerEstimateDraft) -> None:
    windows, doors, commercial = _payload_parts(body)
    row.customer_name = body.customer_name.strip()
    row.company_name = body.company_name.strip()
    row.email = body.email.strip()
    row.phone = body.phone.strip()
    row.project_name = body.project_name.strip()
    row.project_address = body.project_address.strip()
    row.salesperson = body.salesperson.strip()
    row.estimate_date = body.estimate_date
    row.valid_until = body.valid_until
    row.description = body.description.strip()
    row.notes = body.notes.strip()
    row.terms = body.terms.strip()
    row.windows = windows
    row.doors = doors
    row.commercial = commercial


def _require_manager_override(commercial: dict, token: str | None) -> bool:
    reason = commercial.get("manager_override_reason")
    has_reason = bool(str(reason).strip()) if reason is not None else False
    if not has_reason:
        return False
    expected = os.getenv("PRICING_ADMIN_TOKEN")
    if not expected or token != expected:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "manager_authorization_required",
                "message": "A manager/admin token is required for a floor override.",
            },
        )
    return True


def _next_estimate_number(session, year: int) -> str:
    prefix = f"BV-EST-{year}-"
    counter = (
        session.query(CustomerEstimateCounter)
        .filter(CustomerEstimateCounter.year == year)
        .with_for_update()
        .one_or_none()
    )
    if counter is None:
        # Seed a new year's counter from existing records, while allowing the
        # unique counter row to arbitrate the first concurrent finalization.
        rows = (
            session.query(CustomerEstimate.estimate_number)
            .filter(CustomerEstimate.estimate_number.like(f"{prefix}%"))
            .all()
        )
        used = []
        for (value,) in rows:
            try:
                used.append(int(str(value)[len(prefix) :]))
            except (TypeError, ValueError):
                continue
        next_number = max(used, default=0) + 1
        counter = CustomerEstimateCounter(year=year, next_number=next_number + 1)
        try:
            with session.begin_nested():
                session.add(counter)
                session.flush()
            return f"{prefix}{next_number:04d}"
        except IntegrityError:
            counter = (
                session.query(CustomerEstimateCounter)
                .filter(CustomerEstimateCounter.year == year)
                .with_for_update()
                .one()
            )
    next_number = counter.next_number
    counter.next_number += 1
    session.flush()
    return f"{prefix}{next_number:04d}"


@router.post("", response_model=CustomerEstimateResponse)
def create_customer_estimate(body: CustomerEstimateDraft) -> CustomerEstimateResponse:
    row = CustomerEstimate(status="draft")
    _apply_body(row, body)
    with get_session() as session:
        session.add(row)
        session.flush()
        return _row_response(row)


@router.get("", response_model=list[CustomerEstimateSummary])
def list_customer_estimates(limit: int = 100) -> list[CustomerEstimateSummary]:
    with get_session() as session:
        rows = (
            session.query(CustomerEstimate)
            .order_by(CustomerEstimate.updated_at.desc())
            .limit(max(1, min(limit, 500)))
            .all()
        )
        return [
            CustomerEstimateSummary(
                id=str(row.id),
                estimate_number=row.estimate_number,
                status=row.status,
                customer_name=row.customer_name or "",
                company_name=row.company_name or "",
                project_name=row.project_name or "",
                total=(row.pricing_snapshot or {}).get("totals", {}).get("total"),
                updated_at=row.updated_at.isoformat() if row.updated_at else _now().isoformat(),
                finalized_at=row.finalized_at.isoformat() if row.finalized_at else None,
            )
            for row in rows
        ]


@router.get("/{estimate_id}", response_model=CustomerEstimateResponse)
def get_customer_estimate(estimate_id: str) -> CustomerEstimateResponse:
    eid = _parse_id(estimate_id)
    with get_session() as session:
        row = session.get(CustomerEstimate, eid)
        if row is None:
            raise HTTPException(status_code=404, detail="Customer estimate not found")
        return _row_response(row)


@router.put("/{estimate_id}", response_model=CustomerEstimateResponse)
def update_customer_estimate(estimate_id: str, body: CustomerEstimateDraft) -> CustomerEstimateResponse:
    eid = _parse_id(estimate_id)
    with get_session() as session:
        row = session.get(CustomerEstimate, eid)
        if row is None:
            raise HTTPException(status_code=404, detail="Customer estimate not found")
        if row.status == "finalized":
            raise HTTPException(status_code=409, detail="Finalized estimates are read-only")
        old_payload = _pricing_payload(row)
        _apply_body(row, body)
        new_payload = _pricing_payload(row)
        if pricing_hash(old_payload) != pricing_hash(new_payload):
            row.status = "draft"
            row.pricing_snapshot = None
            row.pricing_hash = None
        row.updated_at = _now()
        session.flush()
        return _row_response(row)


@router.post("/{estimate_id}/price", response_model=CustomerEstimateResponse)
def price_customer_estimate_route(
    estimate_id: str,
    pricing_admin_token: str | None = Header(default=None, alias="X-Pricing-Admin-Token"),
) -> CustomerEstimateResponse:
    eid = _parse_id(estimate_id)
    with get_session() as session:
        row = session.get(CustomerEstimate, eid)
        if row is None:
            raise HTTPException(status_code=404, detail="Customer estimate not found")
        if row.status == "finalized":
            raise HTTPException(status_code=409, detail="Finalized estimates are read-only")
        allow_override = _require_manager_override(row.commercial or {}, pricing_admin_token)
        try:
            snapshot = price_customer_estimate(
                windows=row.windows or [],
                doors=row.doors or [],
                commercial=row.commercial or {},
                allow_manager_override=allow_override,
            )
        except CustomerEstimatePricingError as exc:
            raise HTTPException(
                status_code=422,
                detail={"code": "project_pricing", "message": str(exc), "reasons": exc.reasons},
            ) from exc
        row.pricing_snapshot = snapshot
        row.pricing_hash = snapshot["pricing_hash"]
        row.status = "priced"
        row.updated_at = _now()
        session.flush()
        return _row_response(row)


@router.post("/{estimate_id}/finalize", response_model=CustomerEstimateResponse)
def finalize_customer_estimate(estimate_id: str) -> CustomerEstimateResponse:
    eid = _parse_id(estimate_id)
    with get_session() as session:
        row = session.get(CustomerEstimate, eid)
        if row is None:
            raise HTTPException(status_code=404, detail="Customer estimate not found")
        if row.status == "finalized":
            return _row_response(row)
        if not row.customer_name or not row.customer_name.strip():
            raise HTTPException(status_code=422, detail="Customer name is required before finalization")
        if not (row.windows or row.doors):
            raise HTTPException(status_code=422, detail="Add at least one Window or Door line before finalization")
        if row.status != "priced" or not row.pricing_snapshot:
            raise HTTPException(status_code=422, detail="Price the estimate before finalization")
        current_hash = pricing_hash(_pricing_payload(row))
        if row.pricing_hash != current_hash or row.pricing_snapshot.get("pricing_hash") != current_hash:
            raise HTTPException(status_code=409, detail="Product selections changed; reprice before finalization")
        if row.pricing_snapshot.get("review_required"):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "review_required",
                    "message": "Resolve all catalog review items before finalization",
                    "reasons": row.pricing_snapshot.get("warnings") or [],
                },
            )
        year = row.estimate_date.year if row.estimate_date else _now().year
        row.estimate_number = _next_estimate_number(session, year)
        row.status = "finalized"
        row.finalized_at = _now()
        row.updated_at = row.finalized_at
        session.flush()
        return _row_response(row)


@router.post("/{estimate_id}/duplicate", response_model=CustomerEstimateResponse)
def duplicate_customer_estimate(estimate_id: str) -> CustomerEstimateResponse:
    eid = _parse_id(estimate_id)
    with get_session() as session:
        source = session.get(CustomerEstimate, eid)
        if source is None:
            raise HTTPException(status_code=404, detail="Customer estimate not found")
        if source.status != "finalized":
            raise HTTPException(status_code=409, detail="Only finalized estimates can be duplicated")
        row = CustomerEstimate(
            status="draft",
            customer_name=source.customer_name,
            company_name=source.company_name,
            email=source.email,
            phone=source.phone,
            project_name=source.project_name,
            project_address=source.project_address,
            salesperson=source.salesperson,
            estimate_date=source.estimate_date,
            valid_until=source.valid_until,
            description=source.description,
            notes=source.notes,
            terms=source.terms,
            windows=source.windows or [],
            doors=source.doors or [],
            commercial=source.commercial or {},
        )
        session.add(row)
        session.flush()
        return _row_response(row)
