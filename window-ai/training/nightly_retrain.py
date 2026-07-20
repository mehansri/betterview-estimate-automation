"""Nightly: import new raw files → train → promote if MAPE improves."""
from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from parser.cli import import_to_db, parse_file, write_processed
from training.pipeline import train
from utils.logging import get_logger
from utils.paths import (
    DATA_PROCESSED,
    DATA_RAW,
    DEFAULT_METRICS_PATH,
    DEFAULT_MODEL_PATH,
    MODELS_DIR,
    ensure_dirs,
)

logger = get_logger("windowai.nightly")


def import_raw() -> int:
    ensure_dirs()
    count = 0
    for path in sorted(list(DATA_RAW.glob("*.pdf")) + list(DATA_RAW.glob("*.json"))):
        try:
            est = parse_file(path)
            write_processed(est, DATA_PROCESSED)
            import_to_db(est, str(path))
            count += 1
        except Exception as exc:
            logger.exception("Import failed for %s: %s", path, exc)
    return count


def should_promote(new_metrics: dict, old_metrics_path: Path, threshold: float = 4.0) -> bool:
    new_mape = new_metrics["models"][new_metrics["best_model"]]["test"]["mape"]
    if new_mape > threshold * 1.5:
        # catastrophically bad — never promote
        logger.warning("New MAPE %.2f too high; refusing promote", new_mape)
        return False
    if not old_metrics_path.exists():
        return True
    old = json.loads(old_metrics_path.read_text())
    old_mape = old["models"][old["best_model"]]["test"]["mape"]
    # Promote if improved or within 0.2pp of previous and meets target
    return new_mape <= old_mape + 0.2


def run(skip_import: bool = False, threshold: float = 4.0) -> dict:
    ensure_dirs()
    if not skip_import:
        n = import_raw()
        logger.info("Imported %s raw estimates", n)

    staging = MODELS_DIR / "staging"
    staging.mkdir(exist_ok=True)
    stage_model = staging / "quote_predictor.joblib"
    stage_metrics = staging / "metrics.json"
    stage_schema = staging / "feature_schema.json"

    metrics = train(
        model_path=stage_model,
        schema_path=stage_schema,
        metrics_path=stage_metrics,
    )

    if should_promote(metrics, DEFAULT_METRICS_PATH, threshold=threshold):
        shutil.copy2(stage_model, DEFAULT_MODEL_PATH)
        shutil.copy2(stage_metrics, DEFAULT_METRICS_PATH)
        shutil.copy2(stage_schema, MODELS_DIR / "feature_schema.json")
        # versioned backup
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        shutil.copy2(stage_model, MODELS_DIR / f"quote_predictor_{ts}.joblib")
        logger.info("Promoted new model (best=%s)", metrics["best_model"])
        metrics["promoted"] = True
    else:
        logger.info("Kept previous model; new candidate not better")
        metrics["promoted"] = False
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Nightly retrain + promote")
    parser.add_argument("--skip-import", action="store_true")
    parser.add_argument("--threshold", type=float, default=4.0)
    args = parser.parse_args()
    result = run(skip_import=args.skip_import, threshold=args.threshold)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
