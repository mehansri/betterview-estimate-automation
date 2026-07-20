"""Phase 1 quote + similarity endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.schemas.quote import (
    BatchQuoteRequest,
    BatchQuoteResponse,
    QuoteResponse,
    WindowSpec,
)
from db.session import get_session
from services.pricing import predict_price
from services.similarity import find_similar

router = APIRouter(prefix="/api", tags=["quote"])


@router.post("/quote", response_model=QuoteResponse)
def quote(spec: WindowSpec) -> QuoteResponse:
    with get_session() as session:
        result = predict_price(session, spec.model_dump())
    return QuoteResponse(**result)


@router.post("/quote/batch", response_model=BatchQuoteResponse)
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


@router.post("/similar")
def similar_windows(spec: WindowSpec, top_k: int = 12) -> dict:
    with get_session() as session:
        return find_similar(session, spec.model_dump(), top_k=top_k)
