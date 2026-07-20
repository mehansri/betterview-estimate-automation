"""End-to-end training: clean → features → models → export best."""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline

from db.session import get_session, reset_engine
from training.clean import clean_dataframe, load_windows_df
from training.evaluate import format_metrics, regression_metrics
from training.features import build_preprocessor, engineer, save_schema, schema_from_df
from training.split import time_based_split
from utils.logging import get_logger
from utils.paths import DEFAULT_METRICS_PATH, DEFAULT_MODEL_PATH, DEFAULT_SCHEMA_PATH, MODELS_DIR, ensure_dirs

logger = get_logger("windowai.train")


def _try_import_boosters() -> dict[str, Any]:
    """Import optional gradient boosters; skip if native deps missing (e.g. libomp)."""
    available: dict[str, Any] = {}
    try:
        from xgboost import XGBRegressor

        available["xgboost"] = XGBRegressor
    except Exception as exc:  # noqa: BLE001
        logger.warning("XGBoost unavailable: %s", exc)
    try:
        from lightgbm import LGBMRegressor

        available["lightgbm"] = LGBMRegressor
    except Exception as exc:  # noqa: BLE001
        logger.warning("LightGBM unavailable (install libomp on macOS): %s", exc)
    try:
        from catboost import CatBoostRegressor

        available["catboost"] = CatBoostRegressor
    except Exception as exc:  # noqa: BLE001
        logger.warning("CatBoost unavailable: %s", exc)
    return available


def _models(random_state: int = 42) -> dict[str, Any]:
    models: dict[str, Any] = {
        "ridge": Ridge(alpha=1.0),
        "random_forest": RandomForestRegressor(
            n_estimators=200, max_depth=16, n_jobs=-1, random_state=random_state
        ),
    }
    boosters = _try_import_boosters()
    if "xgboost" in boosters:
        models["xgboost"] = boosters["xgboost"](
            n_estimators=400,
            learning_rate=0.05,
            max_depth=6,
            subsample=0.9,
            colsample_bytree=0.9,
            objective="reg:squarederror",
            n_jobs=-1,
            random_state=random_state,
        )
    if "lightgbm" in boosters:
        models["lightgbm"] = boosters["lightgbm"](
            n_estimators=400,
            learning_rate=0.05,
            max_depth=-1,
            num_leaves=63,
            subsample=0.9,
            colsample_bytree=0.9,
            random_state=random_state,
            verbose=-1,
        )
    if "catboost" in boosters:
        models["catboost"] = boosters["catboost"](
            iterations=400,
            learning_rate=0.05,
            depth=6,
            loss_function="RMSE",
            verbose=False,
            random_seed=random_state,
        )
    return models


def train_from_df(
    df: pd.DataFrame,
    model_path: Path = DEFAULT_MODEL_PATH,
    schema_path: Path = DEFAULT_SCHEMA_PATH,
    metrics_path: Path = DEFAULT_METRICS_PATH,
    random_state: int = 42,
) -> dict[str, Any]:
    ensure_dirs()
    cleaned = clean_dataframe(df)
    if len(cleaned) < 50:
        raise RuntimeError(f"Need at least 50 training rows, got {len(cleaned)}")

    train_df, val_df, test_df = time_based_split(cleaned)
    logger.info(
        "Split sizes train/val/test = %s/%s/%s",
        len(train_df),
        len(val_df),
        len(test_df),
    )

    preprocessor = build_preprocessor(train_df)
    X_train_raw = engineer(train_df)
    y_train = train_df["unit_price"].astype(float).values
    preprocessor.fit(X_train_raw)

    X_train = preprocessor.transform(X_train_raw)
    X_val = preprocessor.transform(engineer(val_df)) if len(val_df) else None
    X_test = preprocessor.transform(engineer(test_df)) if len(test_df) else X_train
    y_val = val_df["unit_price"].astype(float).values if len(val_df) else None
    y_test = test_df["unit_price"].astype(float).values if len(test_df) else y_train

    results: dict[str, Any] = {}
    best_name = None
    best_mape = float("inf")
    best_estimator = None

    for name, model in _models(random_state).items():
        model.fit(X_train, y_train)
        # Prefer validation MAPE for selection when available
        if X_val is not None and y_val is not None and len(y_val):
            pred_sel = model.predict(X_val)
            sel_metrics = regression_metrics(y_val, pred_sel)
        else:
            pred_sel = model.predict(X_test)
            sel_metrics = regression_metrics(y_test, pred_sel)

        pred_test = model.predict(X_test)
        test_metrics = regression_metrics(y_test, pred_test)
        results[name] = {"val": sel_metrics, "test": test_metrics}
        logger.info(format_metrics(f"{name} [test]", test_metrics))

        if sel_metrics["mape"] < best_mape:
            best_mape = sel_metrics["mape"]
            best_name = name
            best_estimator = model

    assert best_estimator is not None and best_name is not None

    # Residuals on train for confidence
    train_pred = best_estimator.predict(X_train)
    residual_pct = (y_train - train_pred) / np.clip(y_train, 1e-6, None)
    residual_abs_pct = np.abs(residual_pct)

    # Bucket keys for neighbor confidence: type|glass|area_bin
    eng_train = engineer(train_df)
    area_bins = pd.cut(eng_train["area"], bins=10, labels=False, duplicates="drop")
    buckets = (
        eng_train["type"].astype(str)
        + "|"
        + eng_train["glass"].astype(str)
        + "|"
        + area_bins.astype(str)
    ).tolist()

    residual_index = {
        "residual_pct": residual_pct.tolist(),
        "buckets": buckets,
        "global_p90": float(np.quantile(residual_abs_pct, 0.90)),
        "global_p50": float(np.quantile(residual_abs_pct, 0.50)),
    }

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", best_estimator),
        ]
    )
    # Fit pipeline end-to-end so .predict works on engineered frames
    # (preprocessor already fitted; re-fit model on same X is fine)
    # For joblib we store components separately for clarity:
    bundle = {
        "preprocessor": preprocessor,
        "model": best_estimator,
        "model_name": best_name,
        "residual_index": residual_index,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_train": int(len(train_df)),
        "n_val": int(len(val_df)),
        "n_test": int(len(test_df)),
        "feature_input_cols": list(X_train_raw.columns),
    }

    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, model_path)

    schema = schema_from_df(train_df)
    schema["model_name"] = best_name
    schema["trained_at"] = bundle["trained_at"]
    save_schema(schema, schema_path)

    metrics_payload = {
        "best_model": best_name,
        "best_val_mape": best_mape,
        "models": results,
        "trained_at": bundle["trained_at"],
        "n_train": bundle["n_train"],
        "n_val": bundle["n_val"],
        "n_test": bundle["n_test"],
        "target_mape": 4.0,
        "meets_target": bool(results[best_name]["test"]["mape"] <= 4.0),
    }
    metrics_path.write_text(json.dumps(metrics_payload, indent=2))
    logger.info(
        "Saved best model '%s' (val MAPE=%.2f%%, test MAPE=%.2f%%) -> %s",
        best_name,
        best_mape,
        results[best_name]["test"]["mape"],
        model_path,
    )
    return metrics_payload


def train(
    database_url: str | None = None,
    model_path: Path = DEFAULT_MODEL_PATH,
    schema_path: Path = DEFAULT_SCHEMA_PATH,
    metrics_path: Path = DEFAULT_METRICS_PATH,
) -> dict[str, Any]:
    if database_url:
        os.environ["DATABASE_URL"] = database_url
        reset_engine()

    with get_session() as session:
        df = load_windows_df(session, training_only=True)

    if df.empty:
        raise RuntimeError(
            "No training data in database. Run: python -m db.seed_synthetic"
        )
    return train_from_df(df, model_path=model_path, schema_path=schema_path, metrics_path=metrics_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Train window quote predictor")
    parser.add_argument("--sqlite", type=str, default=None, help="SQLite DB path")
    parser.add_argument("--model-path", type=Path, default=DEFAULT_MODEL_PATH)
    args = parser.parse_args()
    url = f"sqlite:///{args.sqlite}" if args.sqlite else None
    metrics = train(database_url=url, model_path=args.model_path)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
