"""Raising a quote's price: a negative discount adds to the product price."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from db.init_db import init_db
from db.session import reset_engine
from services.windowcity.engine import price_quote
from services.windowcity.sales import SalesPricingError
from tests.test_customer_estimates import _client, _draft
from tests.test_sales_pricing import _spec


@pytest.mark.usefixtures("no_profit_floor")
def test_negative_discount_raises_the_product_price_but_not_installation() -> None:
    base = price_quote(_spec(), commercial={"preset_id": "standard", "negotiated_discount_percent": 0})
    raised = price_quote(_spec(), commercial={"preset_id": "standard", "negotiated_discount_percent": -10})

    sales, base_sales = raised["sales_pricing"], base["sales_pricing"]
    # Same preset markup and cost; only the product price goes up.
    assert sales["markup_percent"] == base_sales["markup_percent"]
    assert raised["totals"]["dealer_cost"] == base["totals"]["dealer_cost"]
    assert sales["protected_install_sell"] == base_sales["protected_install_sell"]
    assert sales["price_increase_amount"] == pytest.approx(base_sales["base_merchandise_sell"] * 0.10, abs=0.02)
    assert raised["totals"]["sell_before_tax"] == pytest.approx(
        base["totals"]["sell_before_tax"] + sales["price_increase_amount"], abs=0.01
    )
    assert raised["totals"]["merchandise_discount"] == 0
    assert raised["lines"][0]["merchandise_discount_each"] == 0
    assert sales["floor_status"] == "within_floor"
    assert sales["gross_margin_percent"] > base_sales["gross_margin_percent"]
    # The customer sees higher prices, never a negative discount.
    assert raised["customer_presentation"]["negotiated_discount_percent"] == 0
    assert raised["customer_presentation"]["merchandise_discount"] == 0


def test_price_increase_is_bounded() -> None:
    with pytest.raises(SalesPricingError):
        price_quote(_spec(), commercial={"preset_id": "standard", "negotiated_discount_percent": -100.5})


def test_customer_view_of_a_raised_quote_hides_the_increase(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'price-increase.db'}")
    reset_engine()
    init_db()
    from api.main import app

    response = TestClient(app).post(
        "/api/quotes/price",
        json={
            "commercial": {"preset_id": "standard", "negotiated_discount_percent": -5, "presentation_mode": "customer"},
            **_spec(),
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["sales_pricing"]["negotiated_discount_percent"] == 0
    assert body["sales_pricing"]["price_increase_amount"] is None
    assert body["totals"]["price_increase"] is None
    reset_engine()


def test_agreed_total_above_the_estimate_raises_the_window_price(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    draft = _draft()
    estimate_id = client.post("/api/customer-estimates", json=draft).json()["id"]
    listed = client.post(f"/api/customer-estimates/{estimate_id}/price").json()["pricing"]

    target = round(listed["totals"]["total"] + listed["sections"]["windows"]["total"] * 0.1, 2)
    draft["commercial"]["agreed_customer_total"] = target
    assert client.put(f"/api/customer-estimates/{estimate_id}", json=draft).status_code == 200
    priced = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert priced.status_code == 200, priced.text
    pricing = priced.json()["pricing"]

    assert pricing["totals"]["total"] == pytest.approx(target, abs=0.05)
    # No "Original subtotal" / "Offer discount" on the customer's document.
    assert pricing["totals"]["discount"] == 0
    assert pricing["totals"]["base_subtotal"] == pricing["totals"]["subtotal"]
    # Doors keep their price; the windows carry the increase.
    assert pricing["sections"]["doors"]["subtotal"] == listed["sections"]["doors"]["subtotal"]
    assert pricing["profitability"]["effective_discount_percent"] < 0
    assert pricing["profitability"]["price_increase"] == pytest.approx(
        pricing["totals"]["subtotal"] - listed["totals"]["subtotal"], abs=0.05
    )
    assert pricing["profitability"]["profit"] > listed["profitability"]["profit"]


def test_agreed_total_cannot_more_than_double_the_window_product(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    draft = _draft(mixed=False)
    estimate_id = client.post("/api/customer-estimates", json=draft).json()["id"]
    listed = client.post(f"/api/customer-estimates/{estimate_id}/price").json()["pricing"]["totals"]["total"]

    draft["commercial"]["agreed_customer_total"] = round(listed * 5, 2)
    assert client.put(f"/api/customer-estimates/{estimate_id}", json=draft).status_code == 200
    refused = client.post(f"/api/customer-estimates/{estimate_id}/price")
    assert refused.status_code in (400, 422), refused.text
    assert "more than 100%" in refused.text
