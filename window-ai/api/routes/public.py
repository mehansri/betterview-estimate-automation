"""Customer-facing estimate portal, addressed by an unguessable token.

These endpoints are intentionally unauthenticated and only ever return the
customer-safe view (no cost, margin, or floor data).
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from api.schemas.customer_estimates import AcceptEstimateRequest
from db.models import CustomerEstimate, EstimateEvent
from db.session import get_session
from services import business_settings
from services.estimate_documents import customer_view, render_pdf

router = APIRouter(prefix="/api/public/estimates", tags=["customer-portal"])

VISIBLE_STATUSES = {"finalized", "sent", "viewed", "accepted", "lost"}


def _by_token(session, token: str) -> CustomerEstimate:
    if len(token) < 16:
        raise HTTPException(status_code=404, detail="Estimate not found")
    row = session.query(CustomerEstimate).filter(CustomerEstimate.public_token == token).one_or_none()
    if row is None or row.deleted_at is not None or row.status not in VISIBLE_STATUSES:
        raise HTTPException(status_code=404, detail="Estimate not found")
    return row


def _superseded_by(session, row: CustomerEstimate) -> str | None:
    """A newer finalized revision's link, so an old link never gets accepted."""
    root_id = row.revision_of or row.id
    newer = (
        session.query(CustomerEstimate)
        .filter((CustomerEstimate.revision_of == root_id) | (CustomerEstimate.id == root_id))
        .filter(CustomerEstimate.revision_number > (row.revision_number or 1))
        .filter(CustomerEstimate.status.in_(VISIBLE_STATUSES))
        .filter(CustomerEstimate.deleted_at.is_(None))
        .order_by(CustomerEstimate.revision_number.desc())
        .first()
    )
    return newer.public_token if newer else None


@router.get("/{token}")
def view_estimate(token: str) -> dict:
    with get_session() as session:
        row = _by_token(session, token)
        now = datetime.now(timezone.utc)
        if row.viewed_at is None:
            row.viewed_at = now
            session.add(EstimateEvent(estimate_id=row.id, kind="viewed"))
        if row.status in {"finalized", "sent"}:
            row.status = "viewed"
        view = customer_view(row)
        view["superseded_by"] = _superseded_by(session, row)
        view["can_accept"] = row.status in {"finalized", "sent", "viewed"} and not view["expired"] and not view["superseded_by"]
        return view


@router.get("/{token}/pdf")
def estimate_pdf(token: str) -> Response:
    with get_session() as session:
        row = _by_token(session, token)
        content = render_pdf(customer_view(row), signature_data_url=(row.acceptance or {}).get("signature"))
        filename = f"{row.estimate_number or 'estimate'}.pdf"
    return Response(content, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{filename}"'})


@router.post("/{token}/accept")
def accept_estimate(token: str, body: AcceptEstimateRequest, request: Request) -> dict:
    if not body.accepted_terms:
        raise HTTPException(status_code=422, detail="Please confirm you accept the estimate and its terms")
    if not body.signature.startswith("data:image/png;base64,"):
        raise HTTPException(status_code=422, detail="Please sign in the signature box")
    with get_session() as session:
        row = _by_token(session, token)
        if row.status == "accepted":
            raise HTTPException(status_code=409, detail="This estimate has already been accepted")
        if row.status == "lost":
            raise HTTPException(status_code=409, detail="This estimate is closed. Please contact us for an updated quote.")
        if row.valid_until and row.valid_until < date.today():
            raise HTTPException(status_code=410, detail="This estimate has expired. Please contact us for an updated quote.")
        if _superseded_by(session, row):
            raise HTTPException(status_code=409, detail="A newer version of this estimate is available.")

        # The customer accepts the price they were shown: taken from the
        # finalized snapshot, never re-priced at acceptance time.
        pricing = row.pricing_snapshot or {}
        totals = pricing.get("totals") or {}
        tier_name = None
        total, subtotal, tax = totals.get("total"), totals.get("subtotal"), totals.get("hst")
        tiers = [tier for tier in pricing.get("tiers") or [] if not tier.get("error")]
        if body.tier_id:
            tier = next((item for item in tiers if str(item.get("id")) == body.tier_id), None)
            if tier is None:
                raise HTTPException(status_code=422, detail="That option is no longer available")
            tier_name, total, subtotal, tax = tier["name"], tier["total"], tier["subtotal"], tier["hst"]
            row.selected_tier = tier["id"]
            if tier.get("scope"):
                # The signed document must show the option actually bought, at
                # the price shown when the estimate was sent.
                snapshot = dict(pricing)
                snapshot.update(tier["scope"])
                snapshot["selected_tier"] = tier["id"]
                snapshot["tiers"] = [{**item, "selected": item.get("id") == tier["id"]} for item in pricing.get("tiers") or []]
                snapshot["financing"] = tier.get("financing")
                snapshot["deposit"] = tier.get("deposit")
                row.pricing_snapshot = snapshot
        elif tiers and not pricing.get("selected_tier"):
            raise HTTPException(status_code=422, detail="Please choose one of the options")

        now = datetime.now(timezone.utc)
        row.status = "accepted"
        row.accepted_at = now
        row.follow_up_on = None
        row.updated_at = now
        row.acceptance = {
            "name": body.name.strip(),
            "signature": body.signature,
            "tier_id": body.tier_id,
            "tier_name": tier_name,
            "total": total,
            "subtotal": subtotal,
            "tax": tax,
            "deposit": business_settings.deposit_amount(float(total or 0)),
            "accepted_at": now.isoformat(),
            "ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent", "")[:300],
        }
        session.add(EstimateEvent(estimate_id=row.id, kind="accepted",
                                  detail={"name": body.name.strip(), "tier": tier_name, "total": total}))
        view = customer_view(row)
        view["can_accept"] = False
        view["superseded_by"] = None
        return view
