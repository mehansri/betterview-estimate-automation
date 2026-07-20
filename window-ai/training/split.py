"""Time-aware and group-aware dataset splits."""
from __future__ import annotations

from typing import Tuple

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit


def time_based_split(
    df: pd.DataFrame,
    train_frac: float = 0.70,
    val_frac: float = 0.15,
    date_col: str = "estimate_date",
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Split by estimate_date so we never train on future estimates.
    Remaining fraction after train+val becomes test (~15%).
    """
    if df.empty:
        return df.copy(), df.copy(), df.copy()

    work = df.copy()
    if date_col not in work.columns or work[date_col].isna().all():
        return group_split(work, train_frac=train_frac, val_frac=val_frac)

    work[date_col] = pd.to_datetime(work[date_col])
    work = work.sort_values(date_col)
    n = len(work)
    train_end = int(n * train_frac)
    val_end = int(n * (train_frac + val_frac))
    train = work.iloc[:train_end]
    val = work.iloc[train_end:val_end]
    test = work.iloc[val_end:]
    return train.reset_index(drop=True), val.reset_index(drop=True), test.reset_index(drop=True)


def group_split(
    df: pd.DataFrame,
    train_frac: float = 0.70,
    val_frac: float = 0.15,
    group_col: str = "estimate_id",
    random_state: int = 42,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Keep all windows from the same estimate in one split."""
    if df.empty:
        return df.copy(), df.copy(), df.copy()

    groups = df[group_col].astype(str)
    gss1 = GroupShuffleSplit(n_splits=1, test_size=1 - train_frac, random_state=random_state)
    train_idx, rest_idx = next(gss1.split(df, groups=groups))
    train = df.iloc[train_idx]
    rest = df.iloc[rest_idx]

    # Of remaining, val_frac of original ~ val / (val+test)
    if len(rest) == 0:
        return train.reset_index(drop=True), rest.copy(), rest.copy()

    rel_val = val_frac / max(1e-9, (1 - train_frac))
    gss2 = GroupShuffleSplit(n_splits=1, test_size=1 - rel_val, random_state=random_state + 1)
    rest_groups = rest[group_col].astype(str)
    val_idx, test_idx = next(gss2.split(rest, groups=rest_groups))
    val = rest.iloc[val_idx]
    test = rest.iloc[test_idx]
    return (
        train.reset_index(drop=True),
        val.reset_index(drop=True),
        test.reset_index(drop=True),
    )
