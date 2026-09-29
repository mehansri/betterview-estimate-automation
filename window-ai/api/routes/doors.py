"""Catalog and quote endpoints for Palma Door pricing."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from api.schemas.doors import DoorProjectQuote, DoorQuoteRequest
from services.doors.catalog import catalog_payload
from services.doors.presentation import customer_door_presentation
from services.doors.pricing import DoorLookupError, DoorValidationError, load_config, project_cost, quote_project
from services.windowcity.sales import SalesPricingError


router = APIRouter(prefix="/api/doors", tags=["doors"])


@router.get("/catalog")
def door_catalog() -> dict:
    return catalog_payload(load_config())


@router.post("/quote", response_model=DoorProjectQuote)
def door_quote(body: DoorQuoteRequest) -> DoorProjectQuote:
    specs = [opening.model_dump() for opening in body.openings]
    try:
        cost_basis = None
        if body.cost_context is not None:
            from api.routes.quote import project_context_cost

            cost_basis = project_cost(specs) + project_context_cost(body.cost_context)
        result = quote_project(specs, commercial=body.commercial.model_dump(), cost_basis=cost_basis)
    except (DoorLookupError, DoorValidationError, SalesPricingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result["customer_presentation"] = customer_door_presentation(result, specs)
    return DoorProjectQuote(**result)
