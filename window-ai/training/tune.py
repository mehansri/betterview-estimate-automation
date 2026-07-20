"""Optional Optuna hyperparameter tuning for the best boosted model family."""
from __future__ import annotations

import argparse
from typing import Any

import numpy as np
import optuna
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score

from db.session import get_session
from training.clean import clean_dataframe, load_windows_df
from training.features import build_preprocessor, engineer
from training.split import time_based_split
from utils.logging import get_logger

logger = get_logger("windowai.tune")
optuna.logging.set_verbosity(optuna.logging.WARNING)


def _make_model(params: dict[str, Any]):
    """Prefer LightGBM; fall back to sklearn GBM if libomp missing."""
    try:
        from lightgbm import LGBMRegressor

        return LGBMRegressor(**params, verbose=-1)
    except Exception:
        return GradientBoostingRegressor(
            n_estimators=params.get("n_estimators", 200),
            learning_rate=params.get("learning_rate", 0.05),
            max_depth=params.get("max_depth", 5),
            subsample=params.get("subsample", 0.9),
            random_state=params.get("random_state", 42),
        )


def objective_factory(X: np.ndarray, y: np.ndarray):
    def objective(trial: optuna.Trial) -> float:
        params = {
            "n_estimators": trial.suggest_int("n_estimators", 100, 800),
            "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.2, log=True),
            "num_leaves": trial.suggest_int("num_leaves", 16, 128),
            "max_depth": trial.suggest_int("max_depth", 3, 12),
            "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
            "reg_lambda": trial.suggest_float("reg_lambda", 1e-3, 10.0, log=True),
            "random_state": 42,
        }
        model = _make_model(params)
        scores = cross_val_score(
            model, X, y, cv=3, scoring="neg_mean_absolute_error", n_jobs=-1
        )
        mae = -float(np.mean(scores))
        return mae / max(float(np.mean(y)), 1e-6) * 100  # approx MAPE proxy

    return objective


def run_tune(n_trials: int = 30) -> dict[str, Any]:
    with get_session() as session:
        df = clean_dataframe(load_windows_df(session))
    train_df, _, _ = time_based_split(df)
    pre = build_preprocessor(train_df)
    X_raw = engineer(train_df)
    pre.fit(X_raw)
    X = pre.transform(X_raw)
    y = train_df["unit_price"].astype(float).values

    study = optuna.create_study(direction="minimize")
    study.optimize(objective_factory(X, y), n_trials=n_trials, show_progress_bar=False)
    logger.info("Best trial value≈%.3f params=%s", study.best_value, study.best_params)
    return {"best_value": study.best_value, "best_params": study.best_params}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--trials", type=int, default=30)
    args = parser.parse_args()
    print(run_tune(n_trials=args.trials))


if __name__ == "__main__":
    main()
