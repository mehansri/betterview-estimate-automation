"""Regression coverage for profit leaks and quote-accuracy fixes."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from services.doors import catalog as door_catalog
from services.doors.catalog import DoorLookupError
from services.windowcity import sales
from services.windowcity.engine import PriceBookReviewRequired, price_quote
from services.windowcity.sales import SalesPricingError
from tests.test_customer_estimates import _client, _draft


def _slider(gas: str, triple: bool = True) -> dict:
    return {"lines": [{"type": "patio_sliding", "nominal_ft": 6,
                       "glazing": {"loe180": True, "triple": triple, "gas": gas}}]}


def test_sliding_triple_pane_with_50_50_gas_keeps_its_glass_cost() -> None:
    argon = price_quote(_slider("argon"))
    fifty = price_quote(_slider("50/50"))
    krypton = price_quote(_slider("krypton"))

    package = next(c for c in fifty["lines"][0]["components"] if c["label"].startswith("Triple pane 2x"))
    assert package["dealer"] > 0
    assert fifty["totals"]["dealer_cost"] >= argon["totals"]["dealer_cost"]
    assert krypton["totals"]["dealer_cost"] > argon["totals"]["dealer_cost"]
    assert fifty["lines"][0]["list_each"] == krypton["lines"][0]["list_each"] - 240.0


@pytest.mark.parametrize(
    ("spec", "reason"),
    [
        (_slider("krypton", triple=False), "only priced in the triple-pane package"),
        ({"lines": [{"type": "patio_swing", "kind": "single", "width": 34, "height": 82,
                     "glazing": {"gas": "krypton"}}]}, "only argon gas is priced"),
        ({"lines": [{"type": "patio_swing", "kind": "single", "width": 34, "height": 82,
                     "colour_ext": "forest green"}]}, "no capstock price group"),
    ],
    ids=["double-slider-krypton", "swing-krypton", "swing-unknown-colour"],
)
def test_unpriced_patio_door_options_require_review(spec: dict, reason: str) -> None:
    with pytest.raises(PriceBookReviewRequired, match=reason):
        price_quote(spec)


def test_door_panel_upcharge_outside_priced_widths_is_not_guessed() -> None:
    record, choice = door_catalog.panel_upcharge("fiberglass", code="RG21", width=36)
    assert choice["upcharge"] > 0
    with pytest.raises(DoorLookupError):
        door_catalog.panel_upcharge("fiberglass", code="RG21", width=30)


def test_manager_override_cannot_discount_merchandise_to_zero() -> None:
    spec = {"lines": [{"type": "window", "style": "WC-100", "width": 30, "height": 60}]}
    with pytest.raises(SalesPricingError):
        price_quote(spec, commercial={"negotiated_discount_percent": 100, "manager_override_reason": "x"},
                    allow_manager_override=True)


def test_preset_maximum_discount_must_be_below_100_percent() -> None:
    config = sales.load_sales_config()
    config["presets"][0]["max_discount_percent"] = 100
    with pytest.raises(SalesPricingError):
        sales._validate_config(config)


def test_customer_lines_add_up_to_the_subtotal_exactly() -> None:
    spec = {"lines": [
        {"type": "window", "style": "WC-100", "width": 31.5, "height": 59.25, "qty": 3,
         "glazing": {"loe180": True, "gas": "argon"}},
        {"type": "window", "style": "WC-175", "width": 47, "height": 35.5, "qty": 7,
         "colour_ext": "black", "glazing": {"loe180": True, "i89": True, "gas": "argon"}},
        {"type": "patio_sliding", "nominal_ft": 6, "qty": 2},
    ]}
    for discount in (0, 3.3333):
        result = price_quote(spec, commercial={"negotiated_discount_percent": discount})
        presentation = result["customer_presentation"]
        assert round(sum(line["line_total"] for line in presentation["lines"]), 2) == presentation["subtotal"]
        assert presentation["total"] == round(presentation["subtotal"] + presentation["hst"], 2)


def _priced(client, draft: dict) -> dict:
    created = client.post("/api/customer-estimates", json=draft)
    assert created.status_code == 200, created.text
    priced = client.post(f"/api/customer-estimates/{created.json()['id']}/price")
    assert priced.status_code == 200, priced.text
    return priced.json()


def test_agreed_total_on_windows_and_doors_lands_on_the_agreed_amount(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    draft = _draft()
    draft["windows"][0]["spec"]["qty"] = 6
    list_price = _priced(client, draft)["pricing"]
    base_total = list_price["totals"]["total"]
    door_total = list_price["sections"]["doors"]["total"]

    agreed = round(base_total - 150.0, 2)
    draft["commercial"]["agreed_customer_total"] = agreed
    # Whatever % the browser estimated is replaced by the server's solution.
    draft["commercial"]["negotiated_discount_percent"] = 0.5
    pricing = _priced(client, draft)["pricing"]

    assert pricing["totals"]["total"] == pytest.approx(agreed, abs=0.05)
    assert pricing["sections"]["doors"]["total"] == door_total
    assert pricing["totals"]["base_total"] == pytest.approx(base_total, abs=0.01)
    assert pricing["totals"]["discount"] == pytest.approx(
        pricing["totals"]["base_subtotal"] - pricing["totals"]["subtotal"]
    )


def test_agreed_total_below_the_floor_is_rejected_without_approval(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    draft = _draft()
    base_total = _priced(client, draft)["pricing"]["totals"]["total"]
    draft["commercial"]["agreed_customer_total"] = round(base_total * 0.5, 2)
    created = client.post("/api/customer-estimates", json=draft)
    rejected = client.post(f"/api/customer-estimates/{created.json()['id']}/price")
    assert rejected.status_code == 422


def test_price_book_change_makes_a_priced_estimate_stale(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    estimate = _priced(client, _draft())

    import services.customer_estimates as estimates
    monkeypatch.setattr(estimates, "price_sources_version", lambda: "new-price-book")
    blocked = client.post(f"/api/customer-estimates/{estimate['id']}/finalize")
    assert blocked.status_code == 409

    client.post(f"/api/customer-estimates/{estimate['id']}/price")
    assert client.post(f"/api/customer-estimates/{estimate['id']}/finalize").status_code == 200


def test_expired_estimate_cannot_finalize_and_duplicates_get_fresh_dates(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    draft = _draft()
    draft["estimate_date"] = str(date.today() - timedelta(days=60))
    draft["valid_until"] = str(date.today() - timedelta(days=30))
    estimate = _priced(client, draft)
    assert client.post(f"/api/customer-estimates/{estimate['id']}/finalize").status_code == 422

    draft["valid_until"] = str(date.today() + timedelta(days=5))
    client.put(f"/api/customer-estimates/{estimate['id']}", json=draft)
    assert client.post(f"/api/customer-estimates/{estimate['id']}/finalize").status_code == 200

    duplicate = client.post(f"/api/customer-estimates/{estimate['id']}/duplicate").json()
    assert duplicate["estimate_date"] == str(date.today())
    assert duplicate["valid_until"] == str(date.today() + timedelta(days=30))


def test_combination_brickmould_wraps_the_assembly_once() -> None:
    lite = {"type": "window", "style": "WC-100", "width": 36, "height": 60, "glazing": {"loe180": True}}
    brickmould = [{"kind": "brickmould", "name": "(classic)"}]
    bare = {"type": "combination", "layout": {"cols": 2, "rows": 1}, "lites": [lite, lite]}
    assembly = {**bare, "accessories": brickmould}
    per_lite = {**bare, "lites": [{**lite, "accessories": brickmould}, {**lite, "accessories": brickmould}]}

    bare_cost = price_quote({"lines": [bare]})["lines"][0]["list_each"]
    assembly_line = price_quote({"lines": [assembly]})["lines"][0]
    per_lite_cost = price_quote({"lines": [per_lite]})["lines"][0]["list_each"]
    assert any(c["label"].startswith("assembly:") for c in assembly_line["components"])
    # Outer loop of the 72 x 60 assembly, not two 36 x 60 perimeters.
    assert bare_cost < assembly_line["list_each"] < per_lite_cost
