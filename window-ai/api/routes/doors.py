"""Catalog and quote endpoints for Palma Door pricing."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.schemas.doors import DoorProjectQuote, DoorQuoteRequest
from services.doors.catalog import catalog_payload
from services.doors.presentation import customer_door_presentation
from services.doors.pricing import DoorLookupError, DoorValidationError, load_config, quote_project


router = APIRouter(prefix="/api/doors", tags=["doors"])


@router.get("/catalog")
def door_catalog() -> dict:
    return catalog_payload(load_config())


@router.post("/quote", response_model=DoorProjectQuote)
def door_quote(body: DoorQuoteRequest) -> DoorProjectQuote:
    try:
        result = quote_project([opening.model_dump() for opening in body.openings])
    except (DoorLookupError, DoorValidationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result["customer_presentation"] = customer_door_presentation(result)
    return DoorProjectQuote(**result)
