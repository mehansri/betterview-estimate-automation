"""Feature engineering and sklearn preprocessing."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler

CATEGORICAL = [
    "type",
    "frame",
    "glass",
    "color",
    "grid",
    "shape",
    "installation",
    "gas_fill",
]
NUMERIC_BASE = ["width", "height", "area", "quantity"]
BINARY = [
    "tempered",
    "oversized",
    "custom_shape",
    "brickmould",
    "wood_jamb",
    "screen",
    "mulled",
    "nailing_flange",
    "color_upcharge",
]
OVERSIZED_AREA = 3000.0  # sq inches


def _ensure_option_cols(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    defaults_bool = {
        "tempered": False,
        "brickmould": False,
        "wood_jamb": False,
        "screen": False,
        "mulled": False,
        "nailing_flange": False,
    }
    for col, default in defaults_bool.items():
        if col not in out.columns:
            out[col] = default
        out[col] = out[col].fillna(default).astype(bool)

    if "gas_fill" not in out.columns:
        out["gas_fill"] = "None"
    out["gas_fill"] = out["gas_fill"].fillna("None").astype(str)
    out.loc[out["gas_fill"].isin(["", "nan", "None", "none"]), "gas_fill"] = "None"

    if "hardware" not in out.columns:
        out["hardware"] = None
    # Color upcharge often encoded in hardware text from parser
    out["color_upcharge"] = (
        out["hardware"].astype(str).str.contains("color upcharge", case=False, na=False)
        | out.get("color_upcharge", False)
    ).astype(bool)

    return out


def engineer(df: pd.DataFrame) -> pd.DataFrame:
    out = _ensure_option_cols(df)
    out["area"] = out["width"] * out["height"]
    out["aspect_ratio"] = out["width"] / out["height"].replace(0, np.nan)
    out["aspect_ratio"] = out["aspect_ratio"].fillna(1.0)
    out["log_area"] = np.log1p(out["area"])
    out["oversized"] = (out["area"] > OVERSIZED_AREA).astype(int)
    out["custom_shape"] = (
        out["shape"].astype(str).str.lower() != "rectangular"
    ).astype(int)
    for b in (
        "tempered",
        "brickmould",
        "wood_jamb",
        "screen",
        "mulled",
        "nailing_flange",
        "color_upcharge",
    ):
        out[b] = out[b].astype(int)
    out["glass_layers"] = (
        out["glass"]
        .astype(str)
        .str.lower()
        .map({"single": 1, "double": 2, "triple": 3})
        .fillna(2)
        .astype(int)
    )
    # Defaults for categoricals that may be missing
    for col, default in [
        ("type", "Unknown"),
        ("frame", "Vinyl"),
        ("glass", "Double"),
        ("color", "White"),
        ("grid", "None"),
        ("shape", "Rectangular"),
        ("installation", "Replacement"),
        ("gas_fill", "None"),
    ]:
        if col not in out.columns:
            out[col] = default
        out[col] = out[col].fillna(default).astype(str)
    return out


def feature_columns() -> list[str]:
    return (
        CATEGORICAL
        + NUMERIC_BASE
        + ["aspect_ratio", "log_area", "glass_layers"]
        + BINARY
    )


def build_preprocessor(df: pd.DataFrame) -> ColumnTransformer:
    cat = CATEGORICAL
    num = NUMERIC_BASE + ["aspect_ratio", "log_area", "glass_layers"] + BINARY

    return ColumnTransformer(
        transformers=[
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                cat,
            ),
            ("num", StandardScaler(), num),
        ],
        remainder="drop",
    )


def transform_matrix(preprocessor: ColumnTransformer, df: pd.DataFrame) -> np.ndarray:
    return preprocessor.transform(engineer(df))


def schema_from_df(df: pd.DataFrame) -> dict[str, Any]:
    eng = engineer(df)
    cats: dict[str, list[str]] = {}
    for c in CATEGORICAL:
        cats[c] = sorted(eng[c].astype(str).unique().tolist())
    return {
        "categorical": CATEGORICAL,
        "numeric": NUMERIC_BASE + ["aspect_ratio", "log_area", "glass_layers"] + BINARY,
        "categories": cats,
        "oversized_area": OVERSIZED_AREA,
        "target": "unit_price",
    }


def save_schema(schema: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(schema, indent=2))


def load_schema(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def row_to_feature_frame(payload: dict[str, Any]) -> pd.DataFrame:
    """Single prediction dict -> one-row DataFrame for the preprocessor."""
    width = float(payload["width"])
    height = float(payload["height"])
    row = {
        "type": str(payload.get("type") or "Unknown"),
        "width": width,
        "height": height,
        "area": width * height,
        "frame": str(payload.get("frame") or "Vinyl"),
        "glass": str(payload.get("glass") or "Double"),
        "color": str(payload.get("color") or "White"),
        "grid": str(payload.get("grid") or "None"),
        "tempered": bool(payload.get("tempered", False)),
        "shape": str(payload.get("shape") or "Rectangular"),
        "installation": str(payload.get("installation") or "Replacement"),
        "quantity": int(payload.get("quantity") or 1),
        "brickmould": bool(payload.get("brickmould", False)),
        "wood_jamb": bool(payload.get("wood_jamb", False)),
        "screen": bool(payload.get("screen", False)),
        "mulled": bool(payload.get("mulled", False)),
        "nailing_flange": bool(payload.get("nailing_flange", False)),
        "gas_fill": str(payload.get("gas_fill") or "None"),
        "hardware": payload.get("hardware"),
        "color_upcharge": bool(payload.get("color_upcharge", False)),
    }
    # If exterior is not white/beige, treat as color upcharge when not explicit
    if not row["color_upcharge"] and row["color"] not in ("White", "Beige"):
        row["color_upcharge"] = True
    return engineer(pd.DataFrame([row]))
