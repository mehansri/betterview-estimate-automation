"""API contract tests for deterministic quote and outcome records."""
from __future__ import annotations

from fastapi.testclient import TestClient

from db.init_db import init_db
from db.models import QuoteOutcome, QuoteRecord
from db.session import get_session, reset_engine


def test_deterministic_quote_is_persisted_and_can_receive_outcome(tmp_path, monkeypatch):
    db_path = tmp_path / "windowcity-api.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    reset_engine()
    init_db()

    from api.main import app

    client = TestClient(app)
    response = client.post(
        "/api/quotes/price",
        json={
            "lines": [
                {
                    "type": "window",
                    "style": "WC-100",
                    "width": 30,
                    "height": 60,
                    "qty": 1,
                    "glazing": {"loe180": True, "gas": "argon"},
                }
            ]
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["method"] == "deterministic_price_book"
    assert body["quote_id"]
    assert body["totals"]["customer_total"] > 0

    queue = client.get("/api/quotes?review_required=false")
    assert queue.status_code == 200, queue.text
    assert queue.json()[0]["id"] == body["quote_id"]

    audit = client.get(f"/api/quotes/{body['quote_id']}")
    assert audit.status_code == 200, audit.text
    assert audit.json()["result"]["method"] == "deterministic_price_book"

    with get_session() as session:
        record = session.query(QuoteRecord).one()
        assert str(record.id) == body["quote_id"]
        assert record.result_json["status"] == body["status"]

    outcome = client.post(
        f"/api/quotes/{body['quote_id']}/outcome",
        json={"actual_total": body["totals"]["customer_total"], "notes": "golden test"},
    )
    assert outcome.status_code == 200, outcome.text
    assert outcome.json()["quote_id"] == body["quote_id"]

    with get_session() as session:
        saved = session.query(QuoteOutcome).one()
        assert float(saved.actual_total) == body["totals"]["customer_total"]

    reset_engine()
