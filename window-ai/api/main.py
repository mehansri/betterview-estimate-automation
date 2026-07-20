"""FastAPI application entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import health, predict
from api.services.predictor import get_predictor
from utils.logging import get_logger

logger = get_logger("windowai.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    pred = get_predictor()
    logger.info("API started; model_loaded=%s", pred.loaded)
    yield


app = FastAPI(
    title="Window AI Quote Predictor",
    description="Predict window quote line prices from historical estimates",
    version="0.1.0",
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
