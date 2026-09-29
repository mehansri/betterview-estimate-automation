"""FastAPI application entrypoint — pricing platform + optional ML."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.app_setup import cors_options, ensure_database
from api.security import require_api_token
from api.routes import admin, business, customer_estimates, doors, health, home_models, import_estimates, predict, public, quote
from api.services.predictor import get_predictor
from utils.logging import get_logger
from utils.paths import ensure_dirs

logger = get_logger("windowai.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_dirs()
    ensure_database()
    pred = get_predictor()
    logger.info("API started; model_loaded=%s", pred.loaded)
    yield


app = FastAPI(
    title="Window City Deterministic Quoting Platform",
    description=(
        "Price supported Window City products from the v18 catalog with "
        "component traceability; retain historical PDF and ML services for "
        "learning, confidence, and review assistance."
    ),
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(CORSMiddleware, **cors_options())

# Everything except the health check and the customer portal requires the
# shared API token (api/security.py).
protected = [Depends(require_api_token)]
app.include_router(health.router)
app.include_router(predict.router, dependencies=protected)
app.include_router(quote.router, dependencies=protected)
app.include_router(doors.router, dependencies=protected)
app.include_router(customer_estimates.router, dependencies=protected)
app.include_router(home_models.router, dependencies=protected)
app.include_router(import_estimates.router, dependencies=protected)
app.include_router(admin.router, dependencies=protected)
app.include_router(business.router, dependencies=protected)
# The customer portal is addressed by an unguessable token and stays public.
app.include_router(public.router)
