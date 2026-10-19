"""Catalog and quote endpoints for Palma Door pricing."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException

from api.schemas.doors import DoorProjectQuote, DoorQuoteRequest
from api.security import manager_authorized
from services.doors.catalog import catalog_payload
from services.doors.presentation import customer_door_presentation
from services.doors.pricing import DoorLookupError, DoorValidationError, load_config, project_cost, quote_project
from services.windowcity.sales import SalesPricingError


router = APIRouter(prefix="/api/doors", tags=["doors"])


@router.get("/catalog")
def door_catalog() -> dict:
    return catalog_payload(load_config())


@router.post("/quote", response_model=DoorProjectQuote)
def door_quote(
    body: DoorQuoteRequest,
    pricing_admin_token: str | None = Header(default=None, alias="X-Pricing-Admin-Token"),
) -> DoorProjectQuote:
    specs = [opening.model_dump() for opening in body.openings]
    commercial = body.commercial.model_dump()
    # A discount over the limit prices only with a manager approval reason,
    # the same rule as window quotes (the token is needed only while it is on).
    override_reason = commercial.get("manager_override_reason")
    if override_reason is not None and not str(override_reason).strip():
        raise HTTPException(status_code=422, detail="Manager override reason is required when supplied.")
    has_manager_override = bool(str(override_reason).strip()) if override_reason is not None else False
    if has_manager_override and not manager_authorized(pricing_admin_token):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "manager_authorization_required",
                "message": "A manager/admin token is required for a floor override.",
            },
        )
    try:
        cost_basis = None
        if body.cost_context is not None:
            from api.routes.quote import project_context_cost

            cost_basis = project_cost(specs) + project_context_cost(body.cost_context)
        result = quote_project(
            specs, commercial=commercial, allow_manager_override=has_manager_override, cost_basis=cost_basis
        )
    except (DoorLookupError, DoorValidationError, SalesPricingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result["customer_presentation"] = customer_door_presentation(result, specs)
    return DoorProjectQuote(**result)
