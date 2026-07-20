"""Project path helpers."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_RAW = ROOT / "data" / "raw"
DATA_PROCESSED = ROOT / "data" / "processed"
DATA_STORE = ROOT / "data" / "store" / "estimates"
MODELS_DIR = ROOT / "models"
DEFAULT_MODEL_PATH = MODELS_DIR / "quote_predictor.joblib"
DEFAULT_SCHEMA_PATH = MODELS_DIR / "feature_schema.json"
DEFAULT_METRICS_PATH = MODELS_DIR / "metrics.json"


def ensure_dirs() -> None:
    for p in (DATA_RAW, DATA_PROCESSED, DATA_STORE, MODELS_DIR):
        p.mkdir(parents=True, exist_ok=True)
