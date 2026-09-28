"""Small deterministic-only FastAPI app for the Vercel deployment."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.app_setup import cors_options, ensure_database
from api.security import require_api_token
from api.routes import admin, business, customer_estimates, doors, public, quote


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_database()
    yield


app = FastAPI(
    title="Window City Deterministic Quote API",
    description="Catalog-backed quote pricing and quote audit storage without ML.",
    version="0.1.0-vercel",
    lifespan=lifespan,
)

app.add_middleware(CORSMiddleware, **cors_options())


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "model_loaded": False, "mode": "deterministic"}


# Everything except the health check and the customer portal requires the
# shared API token (api/security.py).
protected = [Depends(require_api_token)]
app.include_router(quote.router, dependencies=protected)
app.include_router(doors.router, dependencies=protected)
app.include_router(customer_estimates.router, dependencies=protected)
app.include_router(admin.router, dependencies=protected)
app.include_router(business.router, dependencies=protected)
# The customer portal is addressed by an unguessable token and stays public.
app.include_router(public.router)
