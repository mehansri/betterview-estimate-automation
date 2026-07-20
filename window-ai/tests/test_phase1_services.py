"""Phase 1 unit tests: rules, features, validation, similarity, quote API."""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from db.init_db import init_db
from db.models import Estimate, Window
from db.session import get_session, reset_engine
from services.features import attach_derived_features
from services.rules import apply_rules, load_rules
from services.validation import validate_window


@pytest.fixture()
def sqlite_db(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    reset_engine()
    init_db()
    yield db_path
    reset_engine()


def test_features_derived():
    row = attach_derived_features({"width": 80, "height": 80, "glass": "Triple", "color": "Black"})
    assert row["area"] == 6400
    assert row["perimeter"] == 320
    assert row["oversized"] is True
    assert row["wide_window"] is True
    assert row["tall_window"] is True
    assert row["glass_layers"] == 3
    assert row["color_upcharge"] is True


def test_rules_apply():
    cfg = load_rules()
    row = apply_rules({"width": 80, "height": 40, "area": 3200, "glass": "Triple"}, cfg)
    assert row.get("oversized") is True
    assert row.get("glass_layers") == 3
    assert row.get("wide_window") is True


def test_validation_rejects_negative():
    errors, warnings = validate_window(
        {"type": "Casement", "width": -1, "height": 60, "price": 100}
    )
    assert any("positive" in e.lower() or "Width" in e for e in errors)


def test_similarity_and_quote(sqlite_db):
    import uuid

    with get_session() as session:
        est = Estimate(
            id=uuid.uuid4(),
            estimate_number="T-100",
            customer="Test",
            total_price=1000,
        )
        session.add(est)
        session.flush()
        for i, (w, h, price) in enumerate(
            [(48, 60, 400), (50, 60, 420), (47, 61, 410), (72, 80, 1400)]
        ):
            session.add(
                Window(
                    id=uuid.uuid4(),
                    estimate_id=est.id,
                    type="Casement",
                    width=w,
                    height=h,
                    area=w * h,
                    frame="Vinyl",
                    glass="Double",
                    color="White",
                    unit_price=price,
                    quantity=1,
                )
            )

    from services.pricing import predict_price
    from services.similarity import find_similar

    with get_session() as session:
        sim = find_similar(
            session,
            {"type": "Casement", "width": 48, "height": 60, "glass": "Double", "frame": "Vinyl", "color": "White"},
            top_k=5,
        )
        assert sim["neighbor_count"] >= 3
        assert sim["price_stats"]["average"] is not None

        quote = predict_price(
            session,
            {
                "type": "Casement",
                "width": 48,
                "height": 60,
                "glass": "Double",
                "frame": "Vinyl",
                "color": "White",
                "quantity": 1,
            },
        )
        assert quote["method"] in ("similarity", "ml_fallback", "global_average")
        assert quote["estimated_price"] > 0
        assert "reason" in quote


def test_quote_api(sqlite_db):
    import uuid

    with get_session() as session:
        est = Estimate(id=uuid.uuid4(), estimate_number="T-API", customer="A")
        session.add(est)
        session.flush()
        for price in (500, 520, 510, 505):
            session.add(
                Window(
                    id=uuid.uuid4(),
                    estimate_id=est.id,
                    type="Fixed",
                    width=36,
                    height=48,
                    area=36 * 48,
                    frame="Vinyl",
                    glass="Double",
                    color="White",
                    unit_price=price,
                    quantity=1,
                )
            )

    # Import app after DB URL is set
    from api.main import app

    client = TestClient(app)
    r = client.post(
        "/api/quote",
        json={
            "type": "Fixed",
            "width": 36,
            "height": 48,
            "frame": "Vinyl",
            "glass": "Double",
            "color": "White",
            "quantity": 1,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "estimated_price" in body
    assert "method" in body
    assert "similar_windows" in body


def test_import_json_fixture(sqlite_db):
    fixture = Path(__file__).parent / "fixtures" / "sample_estimate.json"
    if not fixture.exists():
        pytest.skip("no fixture")
    from services.import_pipeline import import_estimate_file

    result = import_estimate_file(fixture)
    assert result["status"] in ("success", "warning")
    assert result.get("window_count", 0) >= 1
