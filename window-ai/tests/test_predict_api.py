import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Use sqlite + train a tiny model if needed is heavy; unit-test confidence + schema instead
from api.services.confidence import confidence_and_band


def test_confidence_band_defaults():
    conf, low, high = confidence_and_band(
        1000.0,
        {"type": "Casement", "glass": "Triple", "width": 48, "height": 60},
        None,
    )
    assert 50 <= conf <= 99
    assert low < 1000 < high


def test_confidence_with_neighbors():
    residual_index = {
        "residual_pct": [0.02, -0.01, 0.015, -0.02, 0.01] * 10,
        "buckets": ["Casement|Triple|2"] * 50,
        "global_p90": 0.05,
        "global_p50": 0.02,
    }
    conf, low, high = confidence_and_band(
        1485.0,
        {"type": "Casement", "glass": "Triple", "width": 48, "height": 60},
        residual_index,
    )
    assert conf >= 90
    assert low < 1485 < high


def test_health_endpoint():
    from api.main import app

    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert "model_loaded" in body
    assert body["status"] in ("ok", "degraded")
