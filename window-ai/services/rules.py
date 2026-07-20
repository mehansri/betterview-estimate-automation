"""Configurable rule engine loaded from YAML."""
from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from utils.paths import DEFAULT_RULES_PATH


def load_rules(path: Path | None = None) -> dict[str, Any]:
    p = path or DEFAULT_RULES_PATH
    if not p.exists():
        return {"version": 1, "rules": [], "thresholds": {}, "similarity_weights": {}, "quote": {}}
    return yaml.safe_load(p.read_text()) or {}


def _get_field(row: dict[str, Any], field: str) -> Any:
    return row.get(field)


def _match(when: dict[str, Any], row: dict[str, Any]) -> bool:
    field = when.get("field")
    op = when.get("op", "eq")
    value = when.get("value")
    actual = _get_field(row, field)

    if op == "eq":
        return actual == value
    if op == "neq":
        return actual != value
    if op == "gt":
        try:
            return actual is not None and float(actual) > float(value)
        except (TypeError, ValueError):
            return False
    if op == "gte":
        try:
            return actual is not None and float(actual) >= float(value)
        except (TypeError, ValueError):
            return False
    if op == "lt":
        try:
            return actual is not None and float(actual) < float(value)
        except (TypeError, ValueError):
            return False
    if op == "in":
        return actual in (value or [])
    if op == "not_in":
        return actual not in (value or [])
    if op == "truthy":
        return bool(actual)
    return False


def apply_rules(row: dict[str, Any], config: dict[str, Any] | None = None) -> dict[str, Any]:
    """Apply declarative rules; returns new dict."""
    cfg = config if config is not None else load_rules()
    out = dict(row)
    for rule in cfg.get("rules") or []:
        when = rule.get("when") or {}
        if _match(when, out):
            for k, v in (rule.get("set") or {}).items():
                out[k] = v
    return out


def get_similarity_weights(config: dict[str, Any] | None = None) -> dict[str, float]:
    cfg = config if config is not None else load_rules()
    defaults = {
        "type": 0.40,
        "dimensions": 0.30,
        "glass": 0.10,
        "frame": 0.10,
        "color": 0.05,
        "options": 0.05,
    }
    weights = dict(defaults)
    weights.update(cfg.get("similarity_weights") or {})
    return weights


def get_quote_config(config: dict[str, Any] | None = None) -> dict[str, Any]:
    cfg = config if config is not None else load_rules()
    q = dict(cfg.get("quote") or {})
    q.setdefault("min_neighbors", 3)
    q.setdefault("top_k", 12)
    q.setdefault("currency", "CAD")
    return q


def get_thresholds(config: dict[str, Any] | None = None) -> dict[str, float]:
    cfg = config if config is not None else load_rules()
    t = dict(cfg.get("thresholds") or {})
    t.setdefault("oversized_area", 3000)
    t.setdefault("wide_width", 60)
    t.setdefault("tall_height", 72)
    t.setdefault("max_reasonable_width", 240)
    t.setdefault("max_reasonable_height", 240)
    t.setdefault("min_dimension", 6)
    return t
