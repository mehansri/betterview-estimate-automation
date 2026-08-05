"""FastAPI application entrypoint — pricing platform + optional ML."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import admin, doors, health, import_estimates, predict, quote
from api.services.predictor import get_predictor
from utils.logging import get_logger
from utils.paths import ensure_dirs

logger = get_logger("windowai.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_dirs()
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(predict.router)
app.include_router(quote.router)
app.include_router(doors.router)
app.include_router(import_estimates.router)
app.include_router(admin.router)
