from training.evaluate_windowcity import compare, split_by_estimate


def test_holdout_split_keeps_orders_together() -> None:
    rows = [
        {"estimate_id": "A", "actual_total": 100, "deterministic_total": 100, "baseline_total": 110},
        {"estimate_id": "A", "actual_total": 50, "deterministic_total": 50, "baseline_total": 55},
        {"estimate_id": "B", "actual_total": 100, "deterministic_total": 105, "baseline_total": 130},
        {"estimate_id": "C", "actual_total": 100, "deterministic_total": 95, "baseline_total": 90},
        {"estimate_id": "D", "actual_total": 100, "deterministic_total": 100, "baseline_total": 125},
    ]
    train, holdout = split_by_estimate(rows, holdout_fraction=0.5)
    assert {row["estimate_id"] for row in train}.isdisjoint({row["estimate_id"] for row in holdout})
    assert {row["estimate_id"] for row in train} == {"A", "B"}
    assert {row["estimate_id"] for row in holdout} == {"C", "D"}


def test_acceptance_gate_requires_better_baseline_and_no_severe_underquotes() -> None:
    rows = [
        {"estimate_id": "A", "actual_total": 100, "deterministic_total": 100, "baseline_total": 120},
        {"estimate_id": "B", "actual_total": 100, "deterministic_total": 102, "baseline_total": 125},
    ]
    report = compare(rows)
    assert report["acceptance_gate"]["beats_baseline"] is True
    assert report["acceptance_gate"]["no_severe_underquotes"] is True
    assert report["acceptance_gate"]["passes"] is True
