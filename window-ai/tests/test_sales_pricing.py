"""Protected salesperson negotiation calculations and API boundaries."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from db.init_db import init_db
from db.session import reset_engine
from services.windowcity.engine import price_quote
from services.windowcity.sales import NegotiationLimitError


def _spec() -> dict:
    return {
        "lines": [
            {
                "type": "window",
                "style": "WC-100",
                "width": 30,
                "height": 60,
                "qty": 1,
                "glazing": {"loe180": True, "gas": "90/5"},
            }
        ]
    }


def test_sales_presets_use_markup_on_cost_and_protect_catalog_cost() -> None:
    standard = price_quote(_spec(), commercial={"preset_id": "standard", "negotiated_discount_percent": 0})
    competitive = price_quote(_spec(), commercial={"preset_id": "competitive", "negotiated_discount_percent": 0})
    floor = price_quote(_spec(), commercial={"preset_id": "floor", "negotiated_discount_percent": 0})

    assert standard["sales_pricing"]["markup_percent"] == pytest.approx(30.0)
    assert competitive["sales_pricing"]["markup_percent"] == pytest.approx(25.0)
    assert floor["sales_pricing"]["markup_percent"] == pytest.approx(20.0)
    assert standard["totals"]["dealer_cost"] == competitive["totals"]["dealer_cost"]
    assert standard["totals"]["dealer_cost"] == floor["totals"]["dealer_cost"]
    assert standard["totals"]["customer_total"] > competitive["totals"]["customer_total"] > floor["totals"]["customer_total"]
    assert standard["sales_pricing"]["floor_status"] == "within_floor"


def test_90_5_gas_is_priced_as_the_configured_50_50_dealer_deal() -> None:
    result = price_quote(_spec())
    gas_component = next(component for component in result["lines"][0]["components"] if "90/5" in component["label"])
    assert gas_component["discount_key"] == "argon_krypton_5050"
    assert gas_component["dealer"] == pytest.approx(0.0)


def test_negotiation_discounts_merchandise_but_not_installation_or_catalog_cost() -> None:
    base = price_quote(_spec(), commercial={"preset_id": "standard", "negotiated_discount_percent": 0})
    allowed = base["sales_pricing"]["maximum_allowed_discount_percent"]
    assert allowed > 0
    requested = min(1.0, allowed / 2)
    negotiated = price_quote(
        _spec(),
        commercial={"preset_id": "standard", "negotiated_discount_percent": requested},
    )

    assert negotiated["totals"]["dealer_cost"] == base["totals"]["dealer_cost"]
    assert negotiated["sales_pricing"]["protected_install_sell"] == base["sales_pricing"]["protected_install_sell"]
    assert negotiated["totals"]["sell_before_tax"] < base["totals"]["sell_before_tax"]
    assert negotiated["totals"]["hst"] == pytest.approx(
        round(negotiated["totals"]["sell_before_tax"] * 0.13, 2)
    )
    assert negotiated["totals"]["customer_total"] == pytest.approx(
        negotiated["totals"]["sell_before_tax"] + negotiated["totals"]["hst"]
    )


def test_floor_rejects_excess_discount_and_reports_maximum() -> None:
    with pytest.raises(NegotiationLimitError) as exc_info:
        price_quote(_spec(), commercial={"preset_id": "floor", "negotiated_discount_percent": 0.1})

    details = exc_info.value.details
    assert details["maximum_allowed_discount_percent"] == pytest.approx(0.0)
    assert details["minimum_markup_percent"] == pytest.approx(20.0)
    assert details["floor_sell"] > 0


def test_catalog_config_override_is_not_used_by_public_engine() -> None:
    normal = price_quote(_spec())
    attempted_override = price_quote({**_spec(), "config_overrides": {"discount": 0.01}})
    assert attempted_override["totals"]["dealer_cost"] == normal["totals"]["dealer_cost"]


def test_customer_presentation_redacts_internal_values_and_audit_keeps_them(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "sales-pricing-api.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    reset_engine()
    init_db()

    from api.main import app

    client = TestClient(app)
    response = client.post(
        "/api/quotes/price",
        json={
            "commercial": {
                "preset_id": "competitive",
                "negotiated_discount_percent": 1.0,
                "presentation_mode": "customer",
            },
            **_spec(),
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["presentation_mode"] == "customer"
    assert body["totals"]["dealer_cost"] is None
    assert body["totals"]["install"] is None
    assert body["sales_pricing"]["gross_margin_percent"] is None
    assert body["customer_presentation"]["total"] == body["totals"]["customer_total"]
    assert body["customer_presentation"]["negotiated_discount_percent"] == pytest.approx(1.0)

    audit = client.get(f"/api/quotes/{body['quote_id']}")
    assert audit.status_code == 200
    saved = audit.json()["result"]
    assert saved["sales_pricing"]["dealer_cost"] > 0
    assert saved["internal_presentation"]["gross_margin_percent"] is not None
    assert saved["sales_pricing"]["negotiated_discount_percent"] == pytest.approx(1.0)

    forbidden = client.post(
        "/api/quotes/price",
        json={**_spec(), "config_overrides": {"discount": 0.01}},
    )
    assert forbidden.status_code == 403
    reset_engine()


def test_manager_override_requires_token_and_reason(tmp_path, monkeypatch) -> None:
    db_path = tmp_path / "manager-override-api.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    monkeypatch.setenv("PRICING_ADMIN_TOKEN", "manager-secret")
    reset_engine()
    init_db()

    from api.main import app

    client = TestClient(app)
    request = {
        **_spec(),
        "commercial": {
            "preset_id": "floor",
            "negotiated_discount_percent": 2.0,
            "manager_override_reason": "Approved for strategic account",
        },
    }
    denied = client.post("/api/quotes/price", json=request)
    assert denied.status_code == 403

    allowed = client.post(
        "/api/quotes/price",
        json=request,
        headers={"X-Pricing-Admin-Token": "manager-secret"},
    )
    assert allowed.status_code == 200, allowed.text
    body = allowed.json()
    assert body["sales_pricing"]["floor_status"] == "manager_override"
    assert body["sales_pricing"]["override_applied"] is True
    assert body["sales_pricing"]["manager_override_reason"] == "Approved for strategic account"
    reset_engine()


def test_sales_preset_editing_is_manager_protected(tmp_path, monkeypatch) -> None:
    from services.windowcity import sales

    isolated_config = tmp_path / "sales_config.json"
    isolated_config.write_text(sales.SALES_CONFIG_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    monkeypatch.setattr(sales, "SALES_CONFIG_PATH", isolated_config)
    monkeypatch.setenv("PRICING_ADMIN_TOKEN", "manager-secret")

    from api.main import app

    client = TestClient(app)
    listed = client.get("/api/quotes/sales-presets")
    assert listed.status_code == 200
    config = {"currency": "CAD", "minimum_markup_percent": 20, "presets": listed.json()["presets"]}
    config["presets"][0]["description"] = "Manager-approved standard strategy"

    denied = client.put("/api/admin/sales-presets", json=config)
    assert denied.status_code == 403
    updated = client.put(
        "/api/admin/sales-presets",
        json=config,
        headers={"X-Pricing-Admin-Token": "manager-secret"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["presets"][0]["description"] == "Manager-approved standard strategy"
