"""Load and clean training rows from the database or DataFrame."""
from __future__ import annotations

from typing import Optional

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from db.models import Estimate, Window
from utils.logging import get_logger

logger = get_logger("windowai.clean")

FEATURE_COLS = [
    "type",
    "width",
    "height",
    "area",
    "frame",
    "glass",
    "color",
    "grid",
    "tempered",
    "shape",
    "installation",
    "quantity",
    "unit_price",
    "estimate_id",
    "estimate_date",
    "estimate_number",
]


def load_windows_df(session: Session, training_only: bool = True) -> pd.DataFrame:
    q = (
        select(
            Window.id,
            Window.estimate_id,
            Window.type,
            Window.width,
            Window.height,
            Window.area,
            Window.frame,
            Window.glass,
            Window.color,
            Window.grid,
            Window.tempered,
            Window.shape,
            Window.installation,
            Window.hardware,
            Window.quantity,
            Window.brickmould,
            Window.wood_jamb,
            Window.screen,
            Window.mulled,
            Window.nailing_flange,
            Window.gas_fill,
            Window.unit_price,
            Window.is_valid_for_training,
            Estimate.estimate_date,
            Estimate.estimate_number,
        )
        .join(Estimate, Window.estimate_id == Estimate.id)
    )
    if training_only:
        q = q.where(Window.is_valid_for_training.is_(True))

    rows = session.execute(q).mappings().all()
    df = pd.DataFrame(rows)
    if df.empty:
        return df

    # Coerce numerics (SQLAlchemy Numeric often returns Decimal)
    for col in ("width", "height", "area", "unit_price", "quantity"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype(float)

    df["tempered"] = df["tempered"].astype(bool)
    return df


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        logger.warning("Empty dataframe — nothing to clean")
        return df

    n0 = len(df)
    out = df.copy()

    # Coerce numerics even if caller didn't go through load_windows_df
    for col in ("width", "height", "area", "unit_price", "quantity"):
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce").astype(float)

    # Required fields
    out = out.dropna(subset=["width", "height", "unit_price"])
    out = out[(out["width"] > 0) & (out["height"] > 0) & (out["unit_price"] > 0)]

    # Fill area
    out["area"] = out["width"] * out["height"]

    # Defaults for categoricals
    for col, default in [
        ("type", "Unknown"),
        ("frame", "Unknown"),
        ("glass", "Double"),
        ("color", "White"),
        ("grid", "None"),
        ("shape", "Rectangular"),
        ("installation", "Replacement"),
    ]:
        if col in out.columns:
            out[col] = out[col].fillna(default).astype(str).str.strip()
            out.loc[out[col] == "", col] = default

    out["quantity"] = out["quantity"].fillna(1).clip(lower=1).astype(int)
    out["tempered"] = out["tempered"].fillna(False).astype(bool)

    # Drop exact estimate_number + size + type duplicates keeping first
    if "estimate_number" in out.columns:
        out = out.drop_duplicates(
            subset=["estimate_number", "type", "width", "height", "unit_price"],
            keep="first",
        )

    # Soft outlier filter: drop prices above 3x p99
    p99 = out["unit_price"].quantile(0.99)
    out = out[out["unit_price"] <= p99 * 3]

    logger.info("Cleaned %s -> %s rows", n0, len(out))
    return out.reset_index(drop=True)
