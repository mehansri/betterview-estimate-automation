"""Small deterministic-only FastAPI app for the Vercel deployment."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import admin, customer_estimates, doors, quote


app = FastAPI(
    title="Window City Deterministic Quote API",
    description="Catalog-backed quote pricing and quote audit storage without ML.",
    version="0.1.0-vercel",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "model_loaded": False, "mode": "deterministic"}


app.include_router(quote.router)
app.include_router(doors.router)
app.include_router(customer_estimates.router)
app.include_router(admin.router)
