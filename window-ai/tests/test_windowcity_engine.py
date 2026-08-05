"""Golden and fail-closed tests for the Window City deterministic engine."""
from __future__ import annotations

import pytest

from services.windowcity.engine import (
    BOOK_VERSION,
    PriceBookReviewRequired,
    catalog_payload,
    price_quote,
)


def test_catalog_payload_is_populated() -> None:
    payload = catalog_payload()
    assert payload["price_book_version"] == BOOK_VERSION
    assert len(payload["styles"]) == 23
    assert "brickmould" in payload["accessories"]
    assert payload["patio_sliding_sizes"] == [5, 6, 8, 10, 12, 16]


def test_window_golden_quote_has_traceable_components() -> None:
    result = price_quote(
        {
            "lines": [
                {
                    "type": "window",
                    "style": "WC-100",
                    "width": 30,
                    "height": 60,
                    "qty": 1,
                    "colour_ext": "white",
                    "glazing": {"loe180": True, "gas": "argon"},
                }
            ]
        }
    )

    assert result["status"] == "priced"
    assert result["review_required"] is False
    assert result["totals"]["customer_total"] == pytest.approx(846.51)
    assert result["lines"][0]["components"]
    assert result["lines"][0]["source_pages"]
    assert result["lines"][0]["components"][0]["source_refs"]


def test_sample_quote_totals_remain_stable() -> None:
    result = price_quote(
        {
            "defaults": {"colour_ext": "black", "glazing": {"loe180": True, "i89": True, "gas": "argon"}},
            "lines": [
                {
                    "type": "window",
                    "style": "WC-100",
                    "width": 30,
                    "height": 60,
                    "qty": 2,
                    "accessories": [
                        {"kind": "brickmould", "name": "(classic)"},
                        {"kind": "wood_jamb", "name": "6 1/4"},
                    ],
                },
                {
                    "type": "window",
                    "style": "casement fixed heritage maximum",
                    "width": 40,
                    "height": 50,
                    "glazing": {"loe180": True, "i89": True, "triple": True, "gas": "90/5"},
                },
                {"type": "patio_sliding", "nominal_ft": 6},
                {
                    "type": "combination",
                    "layout": {"cols": 2, "rows": 1},
                    "lites": [
                        {"type": "window", "style": "WC-100", "width": 38, "height": 70, "glazing": {"loe180": True}},
                        {"type": "window", "style": "WC-175", "width": 38, "height": 70, "glazing": {"loe180": True}},
                    ],
                },
            ],
        }
    )

    assert result["totals"]["customer_total"] == pytest.approx(9489.71)
    assert result["review_required"] is True
    assert any("outside printed" in warning["message"] for warning in result["warnings"])


def test_unsupported_options_are_review_required_not_silently_priced() -> None:
    result = price_quote(
        {
            "lines": [
                {
                    "type": "window",
                    "style": "WC-100",
                    "width": 30,
                    "height": 60,
                    "grid": "colonial",
                }
            ]
        }
    )

    assert result["status"] == "review_required"
    assert result["review_required"] is True
    assert any("Grid pricing" in warning["message"] for warning in result["warnings"])


def test_invalid_catalog_input_fails_closed() -> None:
    with pytest.raises(PriceBookReviewRequired):
        price_quote(
            {
                "lines": [
                    {
                        "type": "window",
                        "style": "not-a-real-style",
                        "width": 30,
                        "height": 60,
                    }
                ]
            }
        )


def test_cantor_125401135_calibration_values_are_present() -> None:
    from services.windowcity.quote import load_config

    config = load_config()
    assert config["discount"] == pytest.approx(0.77)
    assert config["price_multiplier"] == pytest.approx(1.0)
    assert config["install"]["rate_per_sqft"] == pytest.approx(23.0)
    assert config["engine"]["brickmould_override"]["rate_white_lf"] == pytest.approx(5.0)
    assert config["engine"]["brickmould_override"]["rate_colour_lf"] == pytest.approx(5.6)
    assert config["engine"]["oversize_glass"]["rate_sqft"] == pytest.approx(8.0)


def test_cantor_125401159_triple_calibration_values_are_present() -> None:
    from services.windowcity.quote import load_config

    config = load_config()
    assert config["item_discounts"]["argon_krypton_5050"] == pytest.approx(0.0)
    assert config["item_discounts"]["triple_pane_upcharge"] == pytest.approx(0.61616)
    assert config["engine"]["triple_loe_panes"] == 2
