"""Window City order checklist PDF -> estimate lines, with no LLM.

Golden fixture: Lee Bovsqwet's order 125401043 (2025-10-09), triple pane
2x LoE 180 with 90/5 gas, 6 1/4" primed wood jamb and 1" Classic brickmould
on every window, two mulled units and a 5' XO patio door. The text is what
pypdf extracts from the checklist PDF. Window City's dealer total for the
order is $13,853.03, the patio door $1,334.17.
"""
from __future__ import annotations

import io
from pathlib import Path

import pytest

from services.windowcity.engine import price_quote
from services.windowcity.order_checklist import OrderChecklistError, lines_from_text

FIXTURE = Path(__file__).parent / "fixtures" / "wc_order_125401043.txt"
TEXT = FIXTURE.read_text(encoding="utf-8")

TRIPLE_90_5 = {"loe180": True, "triple": True, "gas": "90/5"}
WINDOW_TRIM = [
    {"kind": "brickmould", "name": '1" brickmould (classic)'},
    {"kind": "wood_jamb", "name": '6 1/4"', "depth_in": 6.25, "finish": "primed"},
]


@pytest.fixture(scope="module")
def imported() -> dict:
    return lines_from_text(TEXT)


def _by_tag(imported: dict, tag: str) -> dict:
    return next(line for line in imported["windows"] if line["details"]["tag"] == tag)


def test_order_125401043_reads_24_lines_and_27_units(imported) -> None:
    assert imported["warnings"] == []
    assert imported["order"]["order_number"] == "125401043"
    assert imported["order"]["client"] == "Lee Bovsqwet"
    assert len(imported["windows"]) == 24
    assert imported["order"]["units"] == 27
    # Sections of mulled units are never lines of their own.
    assert [line["details"]["tag"] for line in imported["windows"]] == [str(n) for n in range(1, 25)]


def test_order_125401043_dealer_total_matches_window_city(imported) -> None:
    priced = price_quote({"lines": [line["spec"] for line in imported["windows"]]})
    assert priced["totals"]["dealer_cost"] == pytest.approx(13853.03, abs=0.005)
    patio = priced["lines"][[line["details"]["tag"] for line in imported["windows"]].index("11")]
    assert patio["dealer_each"] == pytest.approx(1334.17, abs=0.005)


def test_single_casement_maps_hinge_glazing_and_trim(imported) -> None:
    line = _by_tag(imported, "1")
    assert line["location"] == "Laundry"
    assert line["spec"] == {
        "type": "unit", "series": "classic", "width": 21, "height": 40, "qty": 1,
        "colour_ext": "white", "colour_int": "white", "glazing": TRIPLE_90_5,
        "accessories": WINDOW_TRIM, "layout": {"op": "casement", "hinge": "left"},
    }
    assert line["details"] == {
        "tag": "1", "screen": {"frame_colour": "white", "mesh_colour": "black"},
        "hardware": "Fold-away handle, white", "spacer": "4SG Black", "jamb_finish": "primed",
    }
    assert _by_tag(imported, "4")["spec"]["layout"] == {"op": "casement", "hinge": "right"}


def test_fixed_window_has_no_screen_and_keeps_its_qty(imported) -> None:
    line = _by_tag(imported, "13")
    assert line["location"] == "L.UP"
    assert line["spec"]["layout"] == {"op": "fixed"}
    assert line["spec"]["qty"] == 3
    assert (line["spec"]["width"], line["spec"]["height"]) == (29, 54)
    assert line["details"]["screen"] is None


def test_mulled_units_become_one_cols_unit(imported) -> None:
    pair = _by_tag(imported, "18")
    assert pair["location"] == "Master"
    assert (pair["spec"]["width"], pair["spec"]["height"]) == (72, 42)
    assert pair["spec"]["layout"] == {"split": "cols", "sizes": [36, "*"], "children": [
        {"op": "casement", "hinge": "left"}, {"op": "casement", "hinge": "right"}]}
    assert pair["spec"]["accessories"] == WINDOW_TRIM
    # Item 21's sections are printed after the parent, on the next page.
    mixed = _by_tag(imported, "21")
    assert mixed["spec"]["layout"] == {"split": "cols", "sizes": [24, "*"], "children": [
        {"op": "casement", "hinge": "left"}, {"op": "fixed"}]}
    assert mixed["details"]["notes"] == "Division 24:24"


def test_patio_door_maps_to_patio_sliding(imported) -> None:
    door = _by_tag(imported, "11")
    assert door["location"] == "Patio"
    assert door["spec"] == {
        "type": "patio_sliding", "nominal_ft": 5, "operation": "XO", "qty": 1,
        "colour_ext": "white", "colour_int": "white",
        "glazing": {"loe180": True, "triple": True, "gas": "argon"},
        "assembled": True, "kick_lock": True,
        "accessories": [{"kind": "brickmould", "name": "Brickmould EP326 installed"},
                        {"kind": "wood_jamb", "depth_in": 4.5, "finish": "primed"}],
    }


def test_mulled_unit_without_section_items_reads_the_configuration_line() -> None:
    start = TEXT.index("18.2 1 Master")
    end = TEXT.index("18 1 Master")
    result = lines_from_text(TEXT[:start] + TEXT[end:])
    pair = next(line for line in result["windows"] if line["details"]["tag"] == "18")
    assert pair["spec"]["layout"]["children"] == [{"op": "casement", "hinge": "left"},
                                                  {"op": "casement", "hinge": "right"}]
    assert any("Item 18" in warning for warning in result["warnings"])


def test_other_documents_are_refused() -> None:
    with pytest.raises(OrderChecklistError):
        lines_from_text("Invoice\n1 2 Something\n")


def _checklist_pdf(text: str) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    y = 760
    for row in text.splitlines():
        if y < 30:
            pdf.showPage()
            y = 760
        pdf.setFont("Helvetica", 7)
        pdf.drawString(20, y, row.replace("®", "(R)"))
        y -= 9
    pdf.save()
    return buffer.getvalue()


def test_import_route_returns_estimate_lines_that_price_like_the_order(tmp_path, monkeypatch) -> None:
    from fastapi.testclient import TestClient

    from db.init_db import init_db
    from db.session import reset_engine

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'checklist.db'}")
    reset_engine()
    init_db()
    from api.main import app

    client = TestClient(app)
    response = client.post("/api/order-checklist/import",
                           files={"file": ("order.pdf", _checklist_pdf(TEXT), "application/pdf")})
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["windows"]) == 24 and body["order"]["units"] == 27
    assert all(line["id"] for line in body["windows"])

    created = client.post("/api/customer-estimates", json={"customer_name": "Lee Bovsqwet",
                                                            "windows": body["windows"]})
    assert created.status_code == 200, created.text
    priced = client.post(f"/api/customer-estimates/{created.json()['id']}/price")
    assert priced.status_code == 200, priced.text
    window_quote = priced.json()["pricing"]["window_quote"]
    assert window_quote["totals"]["dealer_cost"] == pytest.approx(13853.03, abs=0.005)

    refused = client.post("/api/order-checklist/import",
                          files={"file": ("order.pdf", b"not a pdf", "application/pdf")})
    assert refused.status_code == 422
