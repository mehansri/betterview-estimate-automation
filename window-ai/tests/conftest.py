"""Test collection rules.

The pricing application runs on ``requirements.txt`` alone. Tests for the
optional ML/historical-import tooling need ``requirements-ml.txt``; skip them
cleanly (instead of failing collection) when those packages are absent, so CI
and a fresh checkout can run the core suite.
"""
from __future__ import annotations

import importlib.util

import pytest

collect_ignore: list[str] = []

if importlib.util.find_spec("numpy") is None or importlib.util.find_spec("pandas") is None:
    collect_ignore += ["test_features.py", "test_parser_normalize.py", "test_predict_api.py"]


@pytest.fixture
def no_profit_floor(monkeypatch):
    """Price without the project profit floor.

    Tests of markup, discount and component mechanics use single small lines
    whose profit is far below the $1,800 floor, which would otherwise lift
    every price to the floor and hide what they check.
    """
    from services.windowcity import sales

    bundled = sales._bundled_config
    monkeypatch.setattr(sales, "_bundled_config", lambda: {**bundled(), "project_profit_floor": 0.0})
    original_read = sales._read_config
    monkeypatch.setattr(sales, "_read_config", lambda: {**original_read(), "project_profit_floor": 0.0})
