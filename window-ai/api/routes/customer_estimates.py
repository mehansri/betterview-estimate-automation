"""Saved combined customer estimate lifecycle endpoints."""
from __future__ import annotations

import os
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError

from api.schemas.customer_estimates import (
    LOCKED_STATUSES,
    CrmLinkRequest,
    CustomerEstimateDraft,
    CustomerEstimateLineAppend,
    CustomerEstimateResponse,
    CustomerEstimateSummary,
    FollowUpRequest,
    LostRequest,
    SendEstimateRequest,
)
from db.models import CustomerEstimate, CustomerEstimateCounter, EstimateEvent, EstimatePhoto
from db.session import get_session
from services import business_settings, mailer
from services.customer_estimates import (
    CustomerEstimatePricingError,
    canonical_pricing_payload,
    price_customer_estimate,
    pricing_hash,
)
from services.estimate_documents import customer_view, render_pdf


router = APIRouter(prefix="/api/customer-estimates", tags=["customer-estimates"])

MAX_PHOTO_BYTES = 8 * 1024 * 1024
PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}


def _parse_id(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid customer estimate id") from exc


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _log(session, row: CustomerEstimate, kind: str, **detail) -> None:
    session.add(EstimateEvent(estimate_id=row.id, kind=kind, detail=detail or None))


def _payload_parts(body: CustomerEstimateDraft) -> tuple[list[dict], list[dict], dict]:
    return (
        [line.model_dump(mode="json") for line in body.windows],
        [opening.model_dump(mode="json") for opening in body.doors],
        body.commercial.model_dump(mode="json"),
    )


def _pricing_payload(row: CustomerEstimate) -> dict:
    return canonical_pricing_payload(
        row.windows or [],
        row.doors or [],
        row.commercial or {},
        adders=row.adders or [],
        province=row.province,
        tiers=row.tiers or [],
        selected_tier=row.selected_tier,
    )


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
        province=row.province or "ON",
        adders=row.adders or [],
        tiers=row.tiers or [],
        selected_tier=row.selected_tier,
        follow_up_on=row.follow_up_on,
        pricing=row.pricing_snapshot,
        pricing_hash=row.pricing_hash,
        created_at=row.created_at.isoformat() if row.created_at else _now().isoformat(),
        updated_at=row.updated_at.isoformat() if row.updated_at else _now().isoformat(),
        finalized_at=_iso(row.finalized_at),
        sent_at=_iso(row.sent_at),
        viewed_at=_iso(row.viewed_at),
        accepted_at=_iso(row.accepted_at),
        acceptance={k: v for k, v in (row.acceptance or {}).items() if k != "signature"} or None,
        lost_at=_iso(row.lost_at),
        lost_reason=row.lost_reason,
        public_token=row.public_token,
        revision_of=str(row.revision_of) if row.revision_of else None,
        revision_number=row.revision_number or 1,
        deleted_at=_iso(row.deleted_at),
        crm_opportunity_id=row.crm_opportunity_id,
        crm_contact_id=row.crm_contact_id,
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
    row.province = (body.province or "ON").strip().upper()
    row.adders = [adder.model_dump(mode="json") for adder in body.adders]
    row.tiers = [tier.model_dump(mode="json") for tier in body.tiers]
    tier_ids = {tier["id"] for tier in row.tiers}
    row.selected_tier = body.selected_tier if body.selected_tier in tier_ids else None
    row.follow_up_on = body.follow_up_on
    for field in ("crm_opportunity_id", "crm_contact_id"):
        if field in body.model_fields_set:
            setattr(row, field, (getattr(body, field) or "").strip() or None)


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
                used.append(int(str(value)[len(prefix) :].split("-")[0]))
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


def _get_row(session, estimate_id: str, *, include_deleted: bool = False) -> CustomerEstimate:
    row = session.get(CustomerEstimate, _parse_id(estimate_id))
    if row is None or (row.deleted_at is not None and not include_deleted):
        raise HTTPException(status_code=404, detail="Customer estimate not found")
    return row


def _require_editable(row: CustomerEstimate) -> None:
    if row.status in LOCKED_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="This estimate has been finalized and is read-only; create a revision to change it",
        )


def _summary(row: CustomerEstimate) -> CustomerEstimateSummary:
    pricing = row.pricing_snapshot or {}
    return CustomerEstimateSummary(
        id=str(row.id),
        estimate_number=row.estimate_number,
        status=row.status,
        customer_name=row.customer_name or "",
        company_name=row.company_name or "",
        project_name=row.project_name or "",
        salesperson=row.salesperson or "",
        total=(pricing.get("totals") or {}).get("total"),
        margin_percent=(pricing.get("profitability") or {}).get("margin_percent"),
        updated_at=row.updated_at.isoformat() if row.updated_at else _now().isoformat(),
        finalized_at=_iso(row.finalized_at),
        sent_at=_iso(row.sent_at),
        follow_up_on=row.follow_up_on,
        revision_number=row.revision_number or 1,
        deleted_at=_iso(row.deleted_at),
        crm_opportunity_id=row.crm_opportunity_id,
    )


# ------------------------------------------------------------------ CRUD
@router.post("", response_model=CustomerEstimateResponse)
def create_customer_estimate(body: CustomerEstimateDraft) -> CustomerEstimateResponse:
    row = CustomerEstimate(status="draft")
    _apply_body(row, body)
    with get_session() as session:
        session.add(row)
        session.flush()
        _log(session, row, "created")
        return _row_response(row)


@router.get("", response_model=list[CustomerEstimateSummary])
def list_customer_estimates(
    limit: int = 100,
    status: Optional[str] = None,
    q: Optional[str] = None,
    deleted: bool = False,
    crm_opportunity_id: Optional[str] = None,
) -> list[CustomerEstimateSummary]:
    with get_session() as session:
        query = session.query(CustomerEstimate)
        query = query.filter(
            CustomerEstimate.deleted_at.isnot(None) if deleted else CustomerEstimate.deleted_at.is_(None)
        )
        if status:
            query = query.filter(CustomerEstimate.status.in_(status.split(",")))
        if crm_opportunity_id:
            query = query.filter(CustomerEstimate.crm_opportunity_id == crm_opportunity_id.strip())
        if q:
            like = f"%{q.strip()}%"
            query = query.filter(
                CustomerEstimate.customer_name.ilike(like)
                | CustomerEstimate.project_name.ilike(like)
                | CustomerEstimate.estimate_number.ilike(like)
                | CustomerEstimate.project_address.ilike(like)
                | CustomerEstimate.salesperson.ilike(like)
            )
        rows = query.order_by(CustomerEstimate.updated_at.desc()).limit(max(1, min(limit, 500))).all()
        return [_summary(row) for row in rows]


@router.get("/{estimate_id}", response_model=CustomerEstimateResponse)
def get_customer_estimate(estimate_id: str) -> CustomerEstimateResponse:
    with get_session() as session:
        return _row_response(_get_row(session, estimate_id, include_deleted=True))


@router.delete("/{estimate_id}", status_code=204)
def delete_customer_estimate(estimate_id: str) -> None:
    """Move an estimate to the trash; it can be restored."""
    with get_session() as session:
        row = _get_row(session, estimate_id)
        row.deleted_at = _now()
        _log(session, row, "deleted")


@router.post("/{estimate_id}/restore", response_model=CustomerEstimateResponse)
def restore_customer_estimate(estimate_id: str) -> CustomerEstimateResponse:
    with get_session() as session:
        row = _get_row(session, estimate_id, include_deleted=True)
        row.deleted_at = None
        _log(session, row, "restored")
        return _row_response(row)


@router.put("/{estimate_id}", response_model=CustomerEstimateResponse)
def update_customer_estimate(estimate_id: str, body: CustomerEstimateDraft) -> CustomerEstimateResponse:
    with get_session() as session:
        row = _get_row(session, estimate_id)
        _require_editable(row)
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


@router.put("/{estimate_id}/crm-link", response_model=CustomerEstimateResponse)
def link_customer_estimate_to_crm(estimate_id: str, body: CrmLinkRequest) -> CustomerEstimateResponse:
    """Record the CRM customer a quote-first project was sent to.

    Allowed on finalized estimates too: it changes no customer-facing content.
    """
    with get_session() as session:
        row = _get_row(session, estimate_id)
        row.crm_opportunity_id = body.crm_opportunity_id.strip()
        row.crm_contact_id = (body.crm_contact_id or "").strip() or None
        _log(session, row, "crm_linked", crm_opportunity_id=row.crm_opportunity_id)
        session.flush()
        return _row_response(row)


@router.post("/{estimate_id}/lines", response_model=CustomerEstimateResponse)
def append_customer_estimate_lines(
    estimate_id: str,
    body: CustomerEstimateLineAppend,
) -> CustomerEstimateResponse:
    """Assign generated window/door quote lines to an existing project."""
    if not body.windows and not body.doors:
        raise HTTPException(status_code=422, detail="At least one Window or Door line is required")

    with get_session() as session:
        row = _get_row(session, estimate_id)
        _require_editable(row)

        existing_windows = row.windows or []
        existing_doors = row.doors or []
        window_ids = {str(line.get("id")) for line in existing_windows if line.get("id")}
        door_ids = {str(opening.get("id")) for opening in existing_doors if opening.get("id")}

        row.windows = existing_windows + [
            line.model_dump(mode="json")
            for line in body.windows
            if line.id not in window_ids
        ]
        row.doors = existing_doors + [
            opening.model_dump(mode="json")
            for opening in body.doors
            if opening.id not in door_ids
        ]
        if body.commercial is not None:
            row.commercial = body.commercial.model_dump(mode="json")
        row.status = "draft"
        row.pricing_snapshot = None
        row.pricing_hash = None
        row.updated_at = _now()
        session.flush()
        return _row_response(row)


# ------------------------------------------------------------------ pricing
@router.post("/{estimate_id}/price", response_model=CustomerEstimateResponse)
def price_customer_estimate_route(
    estimate_id: str,
    pricing_admin_token: str | None = Header(default=None, alias="X-Pricing-Admin-Token"),
) -> CustomerEstimateResponse:
    with get_session() as session:
        row = _get_row(session, estimate_id)
        _require_editable(row)
        allow_override = _require_manager_override(row.commercial or {}, pricing_admin_token)
        try:
            snapshot = price_customer_estimate(
                windows=row.windows or [],
                doors=row.doors or [],
                commercial=row.commercial or {},
                adders=row.adders or [],
                province=row.province,
                tiers=row.tiers or [],
                selected_tier=row.selected_tier,
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
        profit = snapshot.get("profitability") or {}
        if profit.get("override_applied"):
            _log(session, row, "override", reason=(row.commercial or {}).get("manager_override_reason"),
                 total=snapshot["totals"]["total"], margin_percent=profit.get("margin_percent"))
        session.flush()
        return _row_response(row)


def _missing_location_messages(row: CustomerEstimate) -> list[str]:
    messages = []
    for index, line in enumerate(row.windows or [], start=1):
        if not str(line.get("location") or "").strip():
            messages.append(f"window item {index}")
    for index, opening in enumerate(row.doors or [], start=1):
        if not str(opening.get("location") or "").strip():
            messages.append(f"door item {index}")
    return messages


@router.post("/{estimate_id}/finalize", response_model=CustomerEstimateResponse)
def finalize_customer_estimate(estimate_id: str) -> CustomerEstimateResponse:
    with get_session() as session:
        row = _get_row(session, estimate_id)
        if row.status in LOCKED_STATUSES:
            return _row_response(row)
        if not row.customer_name or not row.customer_name.strip():
            raise HTTPException(status_code=422, detail="Customer name is required before finalization")
        if not (row.windows or row.doors):
            raise HTTPException(status_code=422, detail="Add at least one Window or Door line before finalization")
        missing_locations = _missing_location_messages(row)
        if missing_locations:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "locations_required",
                    "message": (
                        "Add a location to every line before finalizing. Missing: "
                        + ", ".join(missing_locations)
                    ),
                    "reasons": missing_locations,
                },
            )
        if row.valid_until and row.valid_until < date.today():
            raise HTTPException(
                status_code=422,
                detail="This estimate's valid-until date has passed; update the dates and reprice before finalization",
            )
        if row.status != "priced" or not row.pricing_snapshot:
            raise HTTPException(status_code=422, detail="Price the estimate before finalization")
        current_hash = pricing_hash(_pricing_payload(row))
        if row.pricing_hash != current_hash or row.pricing_snapshot.get("pricing_hash") != current_hash:
            raise HTTPException(
                status_code=409,
                detail="Product selections or price books changed since this estimate was priced; reprice before finalization",
            )
        if row.pricing_snapshot.get("review_required"):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "review_required",
                    "message": "Resolve all catalog review items before finalization",
                    "reasons": row.pricing_snapshot.get("warnings") or [],
                },
            )
        if row.revision_of:
            root = session.get(CustomerEstimate, row.revision_of)
            base_number = (root.estimate_number if root and root.estimate_number else None)
            row.estimate_number = (
                f"{base_number}-R{row.revision_number}" if base_number
                else _next_estimate_number(session, (row.estimate_date or date.today()).year)
            )
        else:
            year = row.estimate_date.year if row.estimate_date else _now().year
            row.estimate_number = _next_estimate_number(session, year)
        row.status = "finalized"
        row.public_token = row.public_token or secrets.token_urlsafe(24)
        row.finalized_at = _now()
        row.updated_at = row.finalized_at
        _log(session, row, "finalized", total=row.pricing_snapshot["totals"]["total"])
        session.flush()
        return _row_response(row)


# ------------------------------------------------------------------ copies
def _copy_fields(source: CustomerEstimate) -> dict:
    valid_days = int(business_settings.get_group("sales_process").get("estimate_valid_days") or 30)
    return dict(
        status="draft",
        customer_name=source.customer_name,
        company_name=source.company_name,
        email=source.email,
        phone=source.phone,
        project_name=source.project_name,
        project_address=source.project_address,
        salesperson=source.salesperson,
        # A copy is a new offer: it starts a fresh validity window.
        estimate_date=date.today(),
        valid_until=date.today() + timedelta(days=valid_days),
        description=source.description,
        notes=source.notes,
        terms=source.terms,
        windows=source.windows or [],
        doors=source.doors or [],
        commercial=source.commercial or {},
        province=source.province or "ON",
        adders=source.adders or [],
        tiers=source.tiers or [],
        selected_tier=source.selected_tier,
    )


@router.post("/{estimate_id}/duplicate", response_model=CustomerEstimateResponse)
def duplicate_customer_estimate(estimate_id: str) -> CustomerEstimateResponse:
    """An independent copy (e.g. a similar job for another customer)."""
    with get_session() as session:
        source = _get_row(session, estimate_id)
        if source.status not in LOCKED_STATUSES:
            raise HTTPException(status_code=409, detail="Only finalized estimates can be duplicated")
        row = CustomerEstimate(**_copy_fields(source))
        session.add(row)
        session.flush()
        _log(session, row, "created", duplicated_from=str(source.id))
        return _row_response(row)


@router.post("/{estimate_id}/revise", response_model=CustomerEstimateResponse)
def revise_customer_estimate(estimate_id: str) -> CustomerEstimateResponse:
    """A new editable revision of the same offer, linked to the original."""
    with get_session() as session:
        source = _get_row(session, estimate_id)
        if source.status not in LOCKED_STATUSES:
            raise HTTPException(status_code=409, detail="Only finalized estimates need a revision; edit the draft directly")
        if source.status == "accepted":
            raise HTTPException(status_code=409, detail="Accepted estimates cannot be revised; duplicate it for new work")
        root_id = source.revision_of or source.id
        latest = (
            session.query(CustomerEstimate.revision_number)
            .filter((CustomerEstimate.revision_of == root_id) | (CustomerEstimate.id == root_id))
            .all()
        )
        row = CustomerEstimate(
            **_copy_fields(source),
            # A revision is the same offer to the same customer; a duplicate is not.
            crm_opportunity_id=source.crm_opportunity_id,
            crm_contact_id=source.crm_contact_id,
            revision_of=root_id,
            revision_number=max((number or 1 for (number,) in latest), default=1) + 1,
        )
        session.add(row)
        session.flush()
        _log(session, row, "created", revision_of=str(root_id), revision_number=row.revision_number)
        _log(session, source, "revised", revision_id=str(row.id), revision_number=row.revision_number)
        return _row_response(row)


@router.get("/{estimate_id}/revisions", response_model=list[CustomerEstimateSummary])
def list_revisions(estimate_id: str) -> list[CustomerEstimateSummary]:
    with get_session() as session:
        row = _get_row(session, estimate_id, include_deleted=True)
        root_id = row.revision_of or row.id
        rows = (
            session.query(CustomerEstimate)
            .filter((CustomerEstimate.id == root_id) | (CustomerEstimate.revision_of == root_id))
            .order_by(CustomerEstimate.revision_number)
            .all()
        )
        return [_summary(item) for item in rows]


# ------------------------------------------------------------------ sales lifecycle
def _portal_link(row: CustomerEstimate, base_url: str) -> str:
    base = (base_url or os.getenv("PUBLIC_APP_URL") or "").rstrip("/")
    return f"{base}/estimate/{row.public_token}"


@router.get("/{estimate_id}/pdf")
def estimate_pdf(estimate_id: str) -> Response:
    with get_session() as session:
        row = _get_row(session, estimate_id, include_deleted=True)
        if not row.pricing_snapshot:
            raise HTTPException(status_code=422, detail="Price the estimate before downloading a PDF")
        content = render_pdf(customer_view(row), signature_data_url=(row.acceptance or {}).get("signature"))
        filename = f"{row.estimate_number or 'draft-estimate'}.pdf"
    return Response(content, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.post("/{estimate_id}/send")
def send_estimate(estimate_id: str, body: SendEstimateRequest) -> dict:
    with get_session() as session:
        row = _get_row(session, estimate_id)
        if row.status not in {"finalized", "sent", "viewed"}:
            raise HTTPException(status_code=409, detail="Finalize the estimate before sending it to the customer")
        # Estimates finalized before customer links existed get one on first send.
        row.public_token = row.public_token or secrets.token_urlsafe(24)
        link = _portal_link(row, body.portal_base_url)
        to = body.to.strip() or (row.email or "")
        company = business_settings.get_group("company")
        view = customer_view(row)
        total = f"${float(view['totals'].get('total') or 0):,.2f}"
        subject = f"Your estimate {row.estimate_number} from {company.get('name')}"
        greeting = f"Hi {(row.customer_name or '').split(' ')[0] or 'there'},"
        intro = body.message.strip() or (
            f"Thank you for the opportunity to quote your project. Your estimate totals {total}."
        )
        text = (
            f"{greeting}\n\n{intro}\n\nView, choose options and accept your estimate online:\n{link}\n\n"
            f"The PDF is attached for your records. This estimate is valid until {row.valid_until}.\n\n"
            f"{company.get('name')}\n{company.get('phone')} · {company.get('email')}"
        )
        html = (
            f"<p>{greeting}</p><p>{intro}</p>"
            f'<p><a href="{link}" style="background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:8px;'
            f'text-decoration:none;display:inline-block">View and accept your estimate</a></p>'
            f"<p>The PDF is attached for your records. This estimate is valid until {row.valid_until}.</p>"
            f"<p>{company.get('name')}<br>{company.get('phone')} · {company.get('email')}</p>"
        )
        delivered = False
        if to:
            try:
                delivered = mailer.send_email(
                    to=to, cc=body.cc, subject=subject, text=text, html=html,
                    reply_to=company.get("email") or "",
                    attachments=[(f"{row.estimate_number}.pdf", render_pdf(view), "application/pdf")],
                )
            except mailer.MailError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        elif mailer.is_configured():
            raise HTTPException(status_code=422, detail="Add the customer's email address to send the estimate")
        now = _now()
        if row.status == "finalized":
            row.status = "sent"
        row.sent_at = row.sent_at or now
        follow_days = int(business_settings.get_group("sales_process").get("follow_up_days") or 0)
        if follow_days and not row.follow_up_on:
            row.follow_up_on = date.today() + timedelta(days=follow_days)
        row.updated_at = now
        _log(session, row, "sent", to=to, delivered=delivered)
        return {
            "delivered": delivered,
            "link": link,
            "subject": subject,
            "body": text,
            "estimate": _row_response(row).model_dump(mode="json"),
        }


@router.post("/{estimate_id}/lost", response_model=CustomerEstimateResponse)
def mark_lost(estimate_id: str, body: LostRequest) -> CustomerEstimateResponse:
    with get_session() as session:
        row = _get_row(session, estimate_id)
        if row.status not in {"finalized", "sent", "viewed"}:
            raise HTTPException(status_code=409, detail="Only a finalized, open estimate can be marked lost")
        row.status = "lost"
        row.lost_at = _now()
        row.lost_reason = body.reason.strip()
        row.follow_up_on = None
        row.updated_at = row.lost_at
        _log(session, row, "lost", reason=row.lost_reason)
        return _row_response(row)


@router.post("/{estimate_id}/reopen", response_model=CustomerEstimateResponse)
def reopen_lost(estimate_id: str) -> CustomerEstimateResponse:
    with get_session() as session:
        row = _get_row(session, estimate_id)
        if row.status != "lost":
            raise HTTPException(status_code=409, detail="Only a lost estimate can be reopened")
        row.status = "viewed" if row.viewed_at else ("sent" if row.sent_at else "finalized")
        row.lost_at = None
        row.lost_reason = None
        row.updated_at = _now()
        _log(session, row, "reopened")
        return _row_response(row)


@router.put("/{estimate_id}/follow-up", response_model=CustomerEstimateResponse)
def set_follow_up(estimate_id: str, body: FollowUpRequest) -> CustomerEstimateResponse:
    with get_session() as session:
        row = _get_row(session, estimate_id)
        row.follow_up_on = body.follow_up_on
        row.updated_at = _now()
        _log(session, row, "follow_up", follow_up_on=str(body.follow_up_on) if body.follow_up_on else None,
             note=body.note.strip() or None)
        return _row_response(row)


@router.get("/{estimate_id}/events")
def list_events(estimate_id: str) -> list[dict]:
    with get_session() as session:
        row = _get_row(session, estimate_id, include_deleted=True)
        events = (
            session.query(EstimateEvent)
            .filter(EstimateEvent.estimate_id == row.id)
            .order_by(EstimateEvent.created_at.desc())
            .all()
        )
        return [
            {"id": str(event.id), "kind": event.kind, "detail": event.detail or {},
             "created_at": _iso(event.created_at)}
            for event in events
        ]


# ------------------------------------------------------------------ photos
@router.get("/{estimate_id}/photos")
def list_photos(estimate_id: str) -> list[dict]:
    with get_session() as session:
        row = _get_row(session, estimate_id, include_deleted=True)
        photos = (
            session.query(EstimatePhoto.id, EstimatePhoto.line_id, EstimatePhoto.caption,
                          EstimatePhoto.content_type, EstimatePhoto.created_at)
            .filter(EstimatePhoto.estimate_id == row.id)
            .order_by(EstimatePhoto.created_at)
            .all()
        )
        return [
            {"id": str(photo.id), "line_id": photo.line_id, "caption": photo.caption,
             "content_type": photo.content_type, "created_at": _iso(photo.created_at),
             "url": f"/api/customer-estimates/{row.id}/photos/{photo.id}"}
            for photo in photos
        ]


@router.post("/{estimate_id}/photos")
async def upload_photo(
    estimate_id: str,
    file: UploadFile = File(...),
    line_id: str = Form(default=""),
    caption: str = Form(default=""),
) -> dict:
    content_type = (file.content_type or "").lower()
    if content_type not in PHOTO_TYPES:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, WebP, or HEIC photo")
    data = await file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Photos must be 8 MB or smaller")
    with get_session() as session:
        row = _get_row(session, estimate_id)
        photo = EstimatePhoto(
            estimate_id=row.id, line_id=line_id or None, caption=caption.strip()[:255],
            content_type=content_type, data=data,
        )
        session.add(photo)
        session.flush()
        return {"id": str(photo.id), "line_id": photo.line_id, "caption": photo.caption,
                "content_type": content_type, "url": f"/api/customer-estimates/{row.id}/photos/{photo.id}"}


@router.get("/{estimate_id}/photos/{photo_id}")
def get_photo(estimate_id: str, photo_id: str) -> Response:
    with get_session() as session:
        photo = session.get(EstimatePhoto, _parse_id(photo_id))
        if photo is None or str(photo.estimate_id) != str(_parse_id(estimate_id)):
            raise HTTPException(status_code=404, detail="Photo not found")
        return Response(photo.data, media_type=photo.content_type,
                        headers={"Cache-Control": "private, max-age=86400"})


@router.delete("/{estimate_id}/photos/{photo_id}", status_code=204)
def delete_photo(estimate_id: str, photo_id: str) -> None:
    with get_session() as session:
        photo = session.get(EstimatePhoto, _parse_id(photo_id))
        if photo is None or str(photo.estimate_id) != str(_parse_id(estimate_id)):
            raise HTTPException(status_code=404, detail="Photo not found")
        session.delete(photo)


# ------------------------------------------------------------------ follow-up queue
@router.get("/queues/follow-ups", response_model=list[CustomerEstimateSummary])
def follow_ups_due(days_ahead: int = Query(0, ge=0, le=60)) -> list[CustomerEstimateSummary]:
    cutoff = date.today() + timedelta(days=days_ahead)
    with get_session() as session:
        rows = (
            session.query(CustomerEstimate)
            .filter(CustomerEstimate.deleted_at.is_(None))
            .filter(CustomerEstimate.status.in_(["sent", "viewed", "finalized"]))
            .filter(CustomerEstimate.follow_up_on.isnot(None))
            .filter(CustomerEstimate.follow_up_on <= cutoff)
            .order_by(CustomerEstimate.follow_up_on)
            .all()
        )
        return [_summary(row) for row in rows]


@router.post("/{estimate_id}/follow-up-draft")
def draft_follow_up_email(estimate_id: str) -> dict:
    """A follow-up email draft for the salesperson to edit and send."""
    from services.follow_up_writer import draft_follow_up

    with get_session() as session:
        row = _get_row(session, estimate_id)
        if row.status not in {"finalized", "sent", "viewed"}:
            raise HTTPException(status_code=409, detail="Follow-ups are for finalized estimates awaiting a decision")
        draft = draft_follow_up(row)
        return {**draft, "to": row.email or ""}
