"""Evaluate deterministic and legacy quote totals without line-level leakage.

Input is a JSON array of records containing ``estimate_id``, ``actual_total``,
``deterministic_total``, and optionally ``baseline_total``.  The evaluator
operates at estimate/order level so a multi-line order cannot leak between
train and holdout sets.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def split_by_estimate(
    rows: list[dict[str, Any]], holdout_fraction: float = 0.2
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return train/holdout rows with every estimate wholly in one split."""
    if not rows:
        return [], []
    ids: list[str] = []
    for row in rows:
        estimate_id = str(row.get("estimate_id") or row.get("estimate_number") or "unknown")
        if estimate_id not in ids:
            ids.append(estimate_id)
    holdout_count = max(1, int(round(len(ids) * holdout_fraction))) if len(ids) > 1 else 0
    holdout_ids = set(ids[-holdout_count:])
    holdout = [row for row in rows if str(row.get("estimate_id") or row.get("estimate_number") or "unknown") in holdout_ids]
    train = [row for row in rows if str(row.get("estimate_id") or row.get("estimate_number") or "unknown") not in holdout_ids]
    return train, holdout


def _metrics(rows: list[dict[str, Any]], predicted_key: str) -> dict[str, Any]:
    errors: list[float] = []
    absolute_pct: list[float] = []
    severe_underquotes = 0
    for row in rows:
        actual = float(row["actual_total"])
        predicted = float(row[predicted_key])
        error = predicted - actual
        errors.append(error)
        absolute_pct.append(abs(error) / actual * 100 if actual else 0.0)
        if actual and predicted < actual * 0.90:
            severe_underquotes += 1
    if not errors:
        return {"n": 0, "mae": None, "mape": None, "severe_underquotes": 0}
    return {
        "n": len(errors),
        "mae": round(sum(abs(error) for error in errors) / len(errors), 2),
        "mape": round(sum(absolute_pct) / len(absolute_pct), 2),
        "severe_underquotes": severe_underquotes,
    }


def compare(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Compare the new engine against the current baseline on held-out orders."""
    _train, holdout = split_by_estimate(rows)
    deterministic = _metrics(holdout, "deterministic_total")
    output: dict[str, Any] = {
        "holdout_estimates": sorted({str(r.get("estimate_id") or r.get("estimate_number")) for r in holdout}),
        "deterministic": deterministic,
        "acceptance_gate": {
            "beats_baseline": None,
            "no_severe_underquotes": deterministic["severe_underquotes"] == 0,
            "passes": deterministic["severe_underquotes"] == 0,
        },
    }
    if holdout and all("baseline_total" in row for row in holdout):
        baseline = _metrics(holdout, "baseline_total")
        output["baseline"] = baseline
        output["acceptance_gate"]["beats_baseline"] = (
            deterministic["mape"] is not None
            and baseline["mape"] is not None
            and deterministic["mape"] < baseline["mape"]
        )
        output["acceptance_gate"]["passes"] = bool(
            output["acceptance_gate"]["beats_baseline"]
            and output["acceptance_gate"]["no_severe_underquotes"]
        )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate Window City quote totals by estimate")
    parser.add_argument("input", type=Path, help="JSON array of quote comparison records")
    args = parser.parse_args()
    rows = json.loads(args.input.read_text(encoding="utf-8"))
    print(json.dumps(compare(rows), indent=2))


if __name__ == "__main__":
    main()
