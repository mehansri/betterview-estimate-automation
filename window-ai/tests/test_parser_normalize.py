from parser.base import ParsedEstimate, ParsedWindow
from parser.normalize import normalize_estimate, normalize_window, parse_inches


def test_parse_inches_variants():
    assert parse_inches(48) == 48.0
    assert parse_inches('48"') == 48.0
    assert parse_inches("48 in") == 48.0
    assert parse_inches("4'0\"") == 48.0
    assert parse_inches("4'") == 48.0


def test_normalize_color_and_type():
    w = normalize_window(
        ParsedWindow(
            type="casement",
            width='48"',
            height="60",
            frame="ALUMINUM",
            glass="triple pane",
            color="BLACK",
            grid="none",
            price=1450,
        )
    )
    assert w.type == "Casement"
    assert w.frame == "Aluminum"
    assert w.glass == "Triple"
    assert w.color == "Black"
    assert w.grid == "None"
    assert w.area == 48 * 60
    assert w.line_total == 1450


def test_normalize_estimate_total():
    est = normalize_estimate(
        ParsedEstimate(
            estimate_number="1002",
            windows=[
                ParsedWindow(type="Casement", width=48, height=60, price=100, quantity=2),
                ParsedWindow(type="Awning", width=36, height=24, price=50, quantity=1),
            ],
        )
    )
    assert est.total == 250
