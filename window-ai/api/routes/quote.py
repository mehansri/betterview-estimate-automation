"""Phase 1 quote + similarity endpoints."""
from __future__ import annotations

import copy
import os
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Header, HTTPException

from api.schemas.quote import (
    BatchQuoteRequest,
    BatchQuoteResponse,
    DeterministicQuoteRequest,
    DeterministicQuoteResponse,
    QuoteResponse,
    QuoteOutcomeRequest,
    QuoteOutcomeResponse,
    WindowSpec,
)
from db.models import QuoteOutcome, QuoteRecord
from db.session import get_session
from services.pricing import predict_price
from services.similarity import find_similar
from services.windowcity.engine import PriceBookReviewRequired, catalog_payload, price_quote as price_windowcity_quote
from services.windowcity.sales import (
    NegotiationLimitError,
    SalesPricingError,
    list_presets,
    sales_config_version,
)

router = APIRouter(prefix="/api", tags=["quote"])


@router.get("/quotes")
def list_deterministic_quotes(
    review_required: bool | None = None,
    limit: int = 50,
) -> list[dict]:
    """List immutable quote records for the manual-review queue."""
    limit = max(1, min(limit, 500))
    with get_session() as session:
        query = session.query(QuoteRecord).order_by(QuoteRecord.created_at.desc())
        if review_required is not None:
            query = query.filter(QuoteRecord.review_required == review_required)
        rows = query.limit(limit).all()
        return [
            {
                "id": str(row.id),
                "status": row.status,
                "price_book_version": row.price_book_version,
                "config_version": row.config_version,
                "currency": row.currency,
                "review_required": row.review_required,
                "warnings": row.result_json.get("warnings", []),
                "customer_total": row.result_json.get("totals", {}).get("customer_total"),
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "has_outcome": row.outcome is not None,
            }
            for row in rows
        ]


@router.get("/quotes/catalog")
def quote_catalog() -> dict:
    """Catalog metadata used by the guided deterministic quote builder."""
    return catalog_payload()


@router.get("/quotes/sales-presets")
def quote_sales_presets() -> dict:
    """Return active, manager-configured sales strategies for the quote form."""
    return {
        "sales_config_version": sales_config_version(),
        "presets": list_presets(),
    }


def _customer_view(result: dict) -> dict:
    """Remove protected cost and profitability fields before customer delivery."""
    safe = copy.deepcopy(result)
    safe["presentation_mode"] = "customer"
    safe["internal_presentation"] = None
    if isinstance(safe.get("customer_presentation"), dict):
        safe["customer_presentation"]["preset_name"] = None

    totals = safe.get("totals", {})
    for key in (
        "list",
        "dealer_cost",
        "install",
        "markup",
        "base_sell_before_discount",
        "merchandise_sell_before_discount",
        "protected_install_sell",
        "minimum_floor_sell",
    ):
        totals[key] = None

    sales = safe.get("sales_pricing", {})
    for key in (
        "preset_id",
        "preset_name",
        "preset_description",
        "markup_percent",
        "minimum_markup_percent",
        "configured_max_discount_percent",
        "floor_derived_max_discount_percent",
        "maximum_allowed_discount_percent",
        "remaining_discount_percent",
        "dealer_cost",
        "install_cost",
        "base_merchandise_sell",
        "protected_install_sell",
        "minimum_floor_sell",
        "effective_markup_percent",
        "gross_margin_percent",
        "floor_status",
        "manager_override_reason",
        "override_applied",
    ):
        sales[key] = None

    for line in safe.get("lines", []):
        line["components"] = []
        for key in (
            "list_each",
            "dealer_each",
            "install_each",
            "markup_each",
            "list_total",
            "dealer_total",
            "install_total",
            "base_sell_each",
            "merchandise_discount_each",
            "protected_install_sell_each",
        ):
            line[key] = None
    return safe


@router.post("/quotes/price", response_model=DeterministicQuoteResponse)
def price_quote(
    body: DeterministicQuoteRequest,
    pricing_admin_token: str | None = Header(default=None, alias="X-Pricing-Admin-Token"),
) -> DeterministicQuoteResponse:
    """Price a canonical Window City quote from the v18 price book."""
    if body.config_overrides:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "protected_price_book",
                "message": "Catalog, dealer-cost, and configuration overrides are not accepted from quote users.",
            },
        )

    commercial = body.commercial.model_dump()
    override_reason = commercial.get("manager_override_reason")
    if override_reason is not None and not str(override_reason).strip():
        raise HTTPException(status_code=422, detail="Manager override reason is required when supplied.")
    has_manager_override = bool(str(override_reason).strip()) if override_reason is not None else False
    if has_manager_override:
        expected_token = os.getenv("PRICING_ADMIN_TOKEN")
        if not expected_token or pricing_admin_token != expected_token:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "manager_authorization_required",
                    "message": "A manager/admin token is required for a floor override.",
                },
            )

    try:
        result = price_windowcity_quote(
            {"defaults": body.defaults, "lines": [line.model_dump() for line in body.lines]},
            commercial=commercial,
            allow_manager_override=has_manager_override,
        )
    except PriceBookReviewRequired as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "review_required", "review_required": True, "reasons": exc.reasons},
        ) from exc
    except NegotiationLimitError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "negotiation_limit", "message": str(exc), **exc.details},
        ) from exc
    except SalesPricingError as exc:
        raise HTTPException(status_code=422, detail={"code": "sales_pricing", "message": str(exc)}) from exc

    quote_id = uuid4()
    result["quote_id"] = str(quote_id)
    with get_session() as session:
        session.add(
            QuoteRecord(
                id=quote_id,
                status=result["status"],
                price_book_version=result["price_book_version"],
                config_version=result["config_version"],
                currency=result["currency"],
                review_required=result["review_required"],
                input_spec=body.model_dump(),
                result_json=result,
            )
        )
    public_result = _customer_view(result) if body.commercial.presentation_mode == "customer" else result
    return DeterministicQuoteResponse(**public_result)


@router.post("/quotes/{quote_id}/outcome", response_model=QuoteOutcomeResponse)
def record_quote_outcome(quote_id: str, body: QuoteOutcomeRequest) -> QuoteOutcomeResponse:
    """Record the approved/actual amounts without altering the original quote."""
    try:
        qid = UUID(quote_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid quote id") from exc

    source_estimate_id = None
    if body.source_estimate_id:
        try:
            source_estimate_id = UUID(body.source_estimate_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid source estimate id") from exc

    recorded_at = datetime.now(timezone.utc)
    outcome_id = uuid4()
    with get_session() as session:
        quote_record = session.get(QuoteRecord, qid)
        if quote_record is None:
            raise HTTPException(status_code=404, detail="Quote not found")
        if quote_record.outcome is not None:
            raise HTTPException(status_code=409, detail="Quote already has an outcome")
        session.add(
            QuoteOutcome(
                id=outcome_id,
                quote_id=qid,
                actual_total=body.actual_total,
                actual_material=body.actual_material,
                actual_install=body.actual_install,
                actual_sell=body.actual_sell,
                actual_hst=body.actual_hst,
                source_estimate_id=source_estimate_id,
                notes=body.notes,
                recorded_at=recorded_at,
            )
        )
    return QuoteOutcomeResponse(
        quote_id=quote_id,
        outcome_id=str(outcome_id),
        actual_total=body.actual_total,
        recorded_at=recorded_at.isoformat(),
    )


@router.get("/quotes/{quote_id}")
def get_deterministic_quote(quote_id: str) -> dict:
    """Retrieve the original input/result audit record."""
    try:
        qid = UUID(quote_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid quote id") from exc
    with get_session() as session:
        row = session.get(QuoteRecord, qid)
        if row is None:
            raise HTTPException(status_code=404, detail="Quote not found")
        return {
            "id": str(row.id),
            "input_spec": row.input_spec,
            "result": row.result_json,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "outcome": (
                {
                    "id": str(row.outcome.id),
                    "actual_total": float(row.outcome.actual_total),
                    "actual_material": float(row.outcome.actual_material) if row.outcome.actual_material is not None else None,
                    "actual_install": float(row.outcome.actual_install) if row.outcome.actual_install is not None else None,
                    "actual_sell": float(row.outcome.actual_sell) if row.outcome.actual_sell is not None else None,
                    "actual_hst": float(row.outcome.actual_hst) if row.outcome.actual_hst is not None else None,
                    "notes": row.outcome.notes,
                    "recorded_at": row.outcome.recorded_at.isoformat() if row.outcome.recorded_at else None,
                }
                if row.outcome
                else None
            ),
        }


@router.post("/quote", response_model=QuoteResponse, deprecated=True)
def quote(spec: WindowSpec) -> QuoteResponse:
    with get_session() as session:
        result = predict_price(session, spec.model_dump())
    return QuoteResponse(**result)


@router.post("/quote/batch", response_model=BatchQuoteResponse, deprecated=True)
def quote_batch(body: BatchQuoteRequest) -> BatchQuoteResponse:
    if not body.windows:
        raise HTTPException(status_code=400, detail="windows list is empty")
    lines: list[QuoteResponse] = []
    with get_session() as session:
        for spec in body.windows:
            result = predict_price(session, spec.model_dump())
            lines.append(QuoteResponse(**result))
    subtotal = round(sum(l.line_total for l in lines), 2)
    currency = lines[0].currency if lines else "CAD"
    return BatchQuoteResponse(lines=lines, quote_subtotal=subtotal, currency=currency)


@router.post("/similar", deprecated=True)
def similar_windows(spec: WindowSpec, top_k: int = 12) -> dict:
    with get_session() as session:
        return find_similar(session, spec.model_dump(), top_k=top_k)
