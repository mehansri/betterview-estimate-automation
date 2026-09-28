"""Sliding project margin with a $1,800 profit floor (user rule 2026-09-28).

Margin basis: profit is a share of the sell price (sell = cost / (1 - margin)).
C1 = cost where 45% earns $1,800 = 1800 x 0.55 / 0.45 = $2,200.
C2 = cost where 30% earns $4,000 = 4000 x 0.70 / 0.30 = $9,333.33.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from db.init_db import init_db
from db.session import reset_engine
from services.windowcity import margin, sales
from services.windowcity.engine import catalog_cost, price_quote
from services.windowcity.sales import NegotiationLimitError, SalesPricingError
from tests.test_customer_estimates import _door_opening, _window_line

SLIDING = {"start_margin_percent": 45, "end_margin_percent": 30, "cap_profit": 4000, "basis": "margin"}
FLOOR = 1800.0


def test_breakpoints_on_margin_and_markup_basis() -> None:
    c1, c2 = margin.breakpoints(margin.settings(SLIDING), FLOOR)
    assert c1 == pytest.approx(2200.0)
    assert c2 == pytest.approx(9333.3333, abs=0.001)
    m1, m2 = margin.breakpoints(margin.settings({**SLIDING, "basis": "markup"}), FLOOR)
    assert m1 == pytest.approx(4000.0) and m2 == pytest.approx(13333.3333, abs=0.001)


@pytest.mark.parametrize(
    "cost,profit,margin_pct,band",
    [
        (500.0, 1800.0, 1800 / 2300 * 100, "floor"),        # small job: fixed minimum profit
        (2200.0, 1800.0, 45.0, "floor"),                    # C1: 45% earns exactly the floor
        (5766.6667, 5766.6667 * 0.375 / 0.625, 37.5, "sliding"),  # halfway: 37.5%
        (9333.34, 4000.0, 30.0, "flat"),                    # C2: 30% earns the cap
        (20000.0, 20000 * 0.3 / 0.7, 30.0, "flat"),         # large job: flat 30%
    ],
)
def test_plan_at_the_breakpoints(cost, profit, margin_pct, band) -> None:
    plan = margin.plan(cost, SLIDING, FLOOR)
    assert plan.profit == pytest.approx(profit, abs=0.01)
    assert plan.margin_percent == pytest.approx(margin_pct, abs=0.001)
    assert plan.band == band
    assert plan.sell == pytest.approx(cost + profit, abs=0.01)


def test_no_cliff_a_bigger_job_never_quotes_cheaper() -> None:
    previous_sell = previous_profit = 0.0
    for step in range(0, 30001, 25):
        plan = margin.plan(float(step), SLIDING, FLOOR)
        assert plan.sell >= previous_sell - 1e-9
        assert plan.profit >= previous_profit - 1e-9  # profit never dips either
        assert plan.profit >= FLOOR - 1e-9
        previous_sell, previous_profit = plan.sell, plan.profit
    # Continuous at both breakpoints.
    for point in margin.breakpoints(margin.settings(SLIDING), FLOOR):
        below, above = margin.plan(point - 0.01, SLIDING, FLOOR), margin.plan(point + 0.01, SLIDING, FLOOR)
        assert above.sell - below.sell == pytest.approx(0.02, abs=0.02)


def test_settings_that_would_cliff_or_invert_are_rejected() -> None:
    with pytest.raises(margin.MarginConfigError, match="start at or above"):
        margin.validate({**SLIDING, "start_margin_percent": 20}, FLOOR)
    with pytest.raises(margin.MarginConfigError, match="raise the cap"):
        margin.validate({**SLIDING, "cap_profit": 500}, FLOOR)
    with pytest.raises(margin.MarginConfigError, match="cheaper than a smaller one"):
        margin.validate({"start_margin_percent": 90, "end_margin_percent": 10, "cap_profit": 13}, 1000)
    assert margin.validate(SLIDING, FLOOR)["basis"] == "margin"


# ------------------------------------------------------------ quote pricing
def _windows(count: int) -> dict:
    return {"lines": [{"type": "window", "style": "WC-100", "width": 30, "height": 60, "qty": count,
                       "glazing": {"loe180": True, "gas": "argon"}}]}


def _sliding(spec: dict, **commercial) -> dict:
    return price_quote(spec, commercial={"preset_id": "sliding", **commercial})


def test_small_project_is_priced_to_the_profit_floor() -> None:
    result = _sliding(_windows(1))
    sales_pricing = result["sales_pricing"]
    assert sales_pricing["strategy"] == "sliding_margin"
    assert sales_pricing["sliding"]["band"] == "floor"
    assert sales_pricing["floor_applied"] is True
    assert result["totals"]["markup"] == pytest.approx(FLOOR, abs=0.05)
    assert sales_pricing["maximum_allowed_discount_percent"] == pytest.approx(0.0, abs=1e-6)
    with pytest.raises(NegotiationLimitError):
        _sliding(_windows(1), negotiated_discount_percent=1)


@pytest.mark.parametrize("count", [8, 14, 40])
def test_margin_follows_the_sliding_curve(count: int) -> None:
    spec = _windows(count)
    cost = catalog_cost(spec)
    expected = margin.plan(cost, SLIDING, FLOOR)
    result = _sliding(spec)
    assert result["sales_pricing"]["cost_basis"] == pytest.approx(cost)
    assert result["sales_pricing"]["gross_margin_percent"] == pytest.approx(expected.margin_percent, abs=0.02)
    assert result["totals"]["markup"] == pytest.approx(expected.profit, abs=0.5)


def test_every_preset_respects_the_profit_floor() -> None:
    standard = price_quote(_windows(1), commercial={"preset_id": "standard"})
    assert standard["sales_pricing"]["floor_applied"] is True
    assert standard["totals"]["markup"] == pytest.approx(FLOOR, abs=0.05)
    big = price_quote(_windows(40), commercial={"preset_id": "standard"})
    assert big["sales_pricing"]["floor_applied"] is False
    assert big["sales_pricing"]["markup_percent"] == pytest.approx(30.0)


def test_discount_room_stops_at_the_floor_on_a_mid_size_project() -> None:
    result = _sliding(_windows(14))
    allowed = result["sales_pricing"]["maximum_allowed_discount_percent"]
    assert 0 < allowed <= 5.0
    discounted = _sliding(_windows(14), negotiated_discount_percent=allowed)
    assert discounted["totals"]["markup"] >= FLOOR - 0.05


def test_a_part_of_a_project_uses_the_project_cost() -> None:
    spec = _windows(1)
    alone = _sliding(spec)
    in_project = price_quote(spec, commercial={"preset_id": "sliding"}, cost_basis=20000.0)
    # A window in a large project carries the flat 30% margin, not the floor.
    assert in_project["sales_pricing"]["sliding"]["band"] == "flat"
    assert in_project["totals"]["sell_before_tax"] < alone["totals"]["sell_before_tax"]
    cost = catalog_cost(spec)
    assert in_project["totals"]["markup"] == pytest.approx(cost * 0.3 / 0.7, abs=0.05)


# ------------------------------------------------------------ project level
def _client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'sliding.db'}")
    monkeypatch.setenv("PRICING_ADMIN_TOKEN", "manager-secret")
    reset_engine()
    init_db()
    from api.main import app

    return TestClient(app)


def _project(windows: int = 6) -> dict:
    window = _window_line()
    window["spec"]["qty"] = windows
    return {
        "customer_name": "Grace Hopper", "project_name": "Whole house",
        "windows": [window], "doors": [_door_opening()],
        "commercial": {"preset_id": "sliding", "negotiated_discount_percent": 0, "presentation_mode": "internal"},
    }


def test_windows_and_doors_share_one_project_margin(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/customer-estimates", json=_project()).json()
    priced = client.post(f"/api/customer-estimates/{created['id']}/price")
    assert priced.status_code == 200, priced.text
    snapshot = priced.json()["pricing"]
    profit = snapshot["profitability"]
    expected = margin.plan(profit["cost_basis"], SLIDING, FLOOR)
    assert profit["strategy"] == "sliding_margin"
    assert profit["profit"] == pytest.approx(expected.profit, abs=1.0)
    window_markup = snapshot["window_quote"]["sales_pricing"]["markup_percent"]
    door_markup = snapshot["door_quote"]["sales_pricing"]["markup_percent"]
    assert window_markup == pytest.approx(door_markup)


def test_live_preview_with_project_context_matches_the_saved_price(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    created = client.post("/api/customer-estimates", json=_project()).json()
    snapshot = client.post(f"/api/customer-estimates/{created['id']}/price").json()["pricing"]
    preview = client.post("/api/quotes/price?record=false", json={
        "lines": [line["spec"] for line in created["windows"]],
        "commercial": {"preset_id": "sliding"},
        "cost_context": {"project_id": created["id"], "scope": "replace_windows"},
    })
    assert preview.status_code == 200, preview.text
    assert preview.json()["customer_presentation"]["subtotal"] == pytest.approx(
        snapshot["sections"]["windows"]["subtotal"])
    alone = client.post("/api/quotes/price?record=false", json={
        "lines": [line["spec"] for line in created["windows"]], "commercial": {"preset_id": "sliding"}})
    assert alone.json()["sales_pricing"]["cost_basis"] < preview.json()["sales_pricing"]["cost_basis"]


def test_presets_endpoint_offers_the_sliding_default(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    listed = client.get("/api/quotes/sales-presets").json()
    assert listed["default_preset_id"] == "sliding"
    assert listed["project_profit_floor"] == FLOOR
    sliding = next(p for p in listed["presets"] if p["id"] == "sliding")
    assert sliding["strategy"] == "sliding_margin" and sliding["sliding"]["cap_profit"] == 4000


def test_manager_can_tune_the_curve_but_not_save_a_cliff(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    listed = client.get("/api/admin/sales-presets").json()
    config = {"currency": "CAD", "minimum_markup_percent": 20, "project_profit_floor": 2000,
              "default_preset_id": "sliding", "presets": listed["presets"]}
    headers = {"X-Pricing-Admin-Token": "manager-secret"}
    saved = client.put("/api/admin/sales-presets", json=config, headers=headers)
    assert saved.status_code == 200, saved.text
    assert price_quote(_windows(1), commercial={"preset_id": "sliding"})["totals"]["markup"] == pytest.approx(2000, abs=0.05)
    bad = {**config, "presets": [{**p, "sliding": {**p["sliding"], "cap_profit": 100}} if p["id"] == "sliding" else p
                                 for p in listed["presets"]]}
    rejected = client.put("/api/admin/sales-presets", json=bad, headers=headers)
    assert rejected.status_code == 422
    assert "cap" in rejected.json()["detail"]["message"]


def test_presets_saved_before_the_sliding_margin_are_upgraded() -> None:
    old = {"currency": "CAD", "minimum_markup_percent": 20, "presets": [
        {"id": "standard", "name": "Standard", "markup_percent": 35, "minimum_markup_percent": 20,
         "max_discount_percent": 10, "default_discount_percent": 0, "active": True}]}
    upgraded = sales._upgrade(old, sales._bundled_config())
    assert [p["id"] for p in upgraded["presets"]] == ["sliding", "standard"]
    assert upgraded["presets"][1]["markup_percent"] == 35  # the manager's own edit is kept
    assert upgraded["project_profit_floor"] == FLOOR and upgraded["default_preset_id"] == "sliding"
    with pytest.raises(SalesPricingError):
        sales._validate_config({**upgraded, "project_profit_floor": -1})
