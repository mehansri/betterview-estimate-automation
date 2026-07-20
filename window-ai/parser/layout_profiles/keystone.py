"""Window City / Keystone Order Checklist parser (Better View manufacturer exports).

Typical fields:
  Client information: Dorothy - 613 Eden
  125401101 Dorothy - 613 Eden Date: 07/17/2026
  Frame Size W: 48.0000 x H: 42.0000 inch
  Type: Casement 100
  Color: outside: White / inside: White
  Glazing Option : Triple pane
  Net Price 10,006.06
  Total price CAD 11,306.85
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Optional

from parser.base import ParsedEstimate, ParsedWindow
from parser.normalize import normalize_estimate

ORDER_NO_RE = re.compile(r"\b(12\d{7,9})\b")
CLIENT_RE = re.compile(r"Client information:\s*(.+)", re.I)
ENTERED_ON_RE = re.compile(r"\bon:\s*(\d{1,2}/\d{1,2}/\d{4})", re.I)
DATE_RE = re.compile(r"\bDate:\s*(\d{1,2}/\d{1,2}/\d{4})", re.I)
NET_PRICE_RE = re.compile(r"Net Price\s*([\d,]+\.\d{2})", re.I)
TOTAL_PRICE_RE = re.compile(r"Total price\s*(?:CAD\s*)?([\d,]+\.\d{2})", re.I)

# Item header: "1 1 Kitchen" or "3.1 1 Living" or "2 7 F1 - Fixed..."
ITEM_START_RE = re.compile(
    r"^(\d+(?:\.\d+)?)\s+(\d+)\s+(.+)$",
    re.M,
)

# Note: PDFs use "Frame Size W: ..." (no colon after Size) and
# "Total outer dimension: W: ..." (colon after dimension).
FRAME_SIZE_RE = re.compile(
    r"(?:Frame Size|Total outer dimension):?\s*W:\s*([\d.]+)\s*x\s*H:\s*([\d.]+)\s*inch",
    re.I,
)
TYPE_LINE_RE = re.compile(r"^Type:\s*(.+)$", re.I | re.M)
COLOR_RE = re.compile(
    r"Color:\s*outside:\s*([^/\n]+?)\s*/\s*inside:\s*([^\n]+)",
    re.I,
)
GLAZING_RE = re.compile(r"Glazing Option\s*:\s*(Triple|Double|Single)\s*pane", re.I)
TEMPERED_RE = re.compile(r"\bTempered\b", re.I)
GRID_RE = re.compile(r"\b(Colonial|Prairie|Diamond)\s*(?:grid|grille|sdl)?\b", re.I)
BRICKMOULD_RE = re.compile(r"\bbrickmould\b", re.I)
WOOD_JAMB_RE = re.compile(r"wood\s+jamb", re.I)
SCREEN_RE = re.compile(r"\bFull Screen\b|\bscreen\b", re.I)
MULLED_RE = re.compile(r"\bmulled\b|\bMullion\b", re.I)
NAILING_FLANGE_RE = re.compile(r"nailing\s+flange", re.I)
KRYPTON_RE = re.compile(r"\bKrypton\b", re.I)
ARGON_RE = re.compile(r"\bArgon\b", re.I)
COLOR_UPCHARGE_RE = re.compile(r"color upcharge", re.I)

# Product line often ends with unit price and optional line total
# e.g. "AW1 - Awning SINGLE FRAME a 535.92 535.92"
# e.g. "F1 - Fixed SINGLE FRAME p 150.92 1,056.44"
PRODUCT_PRICE_RE = re.compile(
    r"^(?P<label>.+?)\s+(?P<unit>[\d,]+\.\d{2})(?:\s+(?P<total>[\d,]+\.\d{2}))?\s*$",
    re.M,
)

TYPE_KEYWORDS = [
    ("patio door", "Patio Door"),
    ("sliding door", "Patio Door"),
    ("double hung", "Double Hung"),
    ("casement", "Casement"),
    ("awning", "Awning"),
    ("slider", "Slider"),
    ("picture", "Picture"),
    ("fixed", "Fixed"),
    ("hopper", "Hopper"),
]


def _money(raw: Optional[str]) -> Optional[float]:
    if not raw:
        return None
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


def _parse_date(raw: str) -> Optional[date]:
    for fmt in ("%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _infer_type(block: str, type_line: Optional[str], product_label: str) -> str:
    if type_line:
        low = type_line.lower()
        for key, name in TYPE_KEYWORDS:
            if key in low:
                return name
    hay = f"{product_label}\n{block}".lower()
    for key, name in TYPE_KEYWORDS:
        if key in hay:
            return name
    return "Unknown"


def _infer_color(block: str) -> Optional[str]:
    m = COLOR_RE.search(block)
    if not m:
        return None
    outside = m.group(1).strip()
    # Prefer exterior color for pricing (color upcharges)
    # Preserve manufacturer names like "Dark Bronze"
    if not outside:
        return None
    # Normalize common variants without collapsing Dark Bronze → Brown
    low = outside.lower()
    mapping = {
        "white": "White",
        "black": "Black",
        "brown": "Brown",
        "beige": "Beige",
        "gray": "Gray",
        "grey": "Gray",
        "dark bronze": "Dark Bronze",
        "bronze": "Dark Bronze",
        "sandstone": "Beige",
        "almond": "Beige",
    }
    return mapping.get(low, outside.title())


def _infer_gas_fill(block: str) -> str:
    if KRYPTON_RE.search(block):
        return "Krypton"  # Krypton mix (e.g. 90% Argon / 5% Krypton) priced as premium
    if ARGON_RE.search(block):
        return "Argon"
    return "None"


def _infer_installation(block: str) -> str:
    if NAILING_FLANGE_RE.search(block):
        return "New Construction"
    return "Replacement"


def _infer_glass(block: str) -> str:
    m = GLAZING_RE.search(block)
    if m:
        return m.group(1).title()
    low = block.lower()
    if "triple" in low:
        return "Triple"
    if "double" in low:
        return "Double"
    if "single" in low:
        return "Single"
    return "Double"


def _infer_frame(block: str) -> str:
    low = block.lower()
    if "fiberglass" in low:
        return "Fiberglass"
    if "aluminum" in low or "aluminium" in low:
        return "Aluminum"
    if "wood" in low and "wood jamb" not in low and "classic collection" not in low:
        # wood jamb extension is common accessory, not frame material
        if "wood frame" in low:
            return "Wood"
    # Window City Classic / PVC
    return "Vinyl"


def _infer_grid(block: str) -> str:
    m = GRID_RE.search(block)
    return m.group(1).title() if m else "None"


def _split_item_blocks(text: str) -> list[tuple[str, str, str, str]]:
    """Return list of (item_no, qty, first_line_rest, full_block)."""
    matches = list(ITEM_START_RE.finditer(text))
    blocks: list[tuple[str, str, str, str]] = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[start:end].strip()
        item_no, qty, rest = m.group(1), m.group(2), m.group(3).strip()
        # Skip non-product headers that look like page footers accidentally matched
        if rest.lower().startswith("please examine"):
            continue
        blocks.append((item_no, qty, rest, block))
    return blocks


def _extract_prices(block: str, first_rest: str) -> tuple[Optional[float], Optional[float], str]:
    """
    Find unit price / line total from the product description lines.
    Returns (unit_price, line_total, product_label).
    """
    lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
    # First line is "item qty rest" — rest may be room name only ("Kitchen")
    # Product + prices usually on next non-empty line(s)
    candidates = [first_rest] + lines[1:8]
    for line in candidates:
        # Skip pure room names
        m = PRODUCT_PRICE_RE.match(line)
        if not m:
            continue
        unit = _money(m.group("unit"))
        total = _money(m.group("total"))
        label = m.group("label").strip()
        # Reject tiny numbers that are codes, require reasonable price
        if unit is not None and unit >= 20:
            return unit, total, label
    # Fallback: last two money amounts in first 15 lines
    money_hits = re.findall(r"([\d,]+\.\d{2})", "\n".join(lines[:20]))
    amounts = [_money(x) for x in money_hits]
    amounts = [a for a in amounts if a is not None and a >= 20]
    if len(amounts) >= 2:
        return amounts[-2], amounts[-1], first_rest
    if len(amounts) == 1:
        return amounts[0], amounts[0], first_rest
    return None, None, first_rest


def parse_keystone_text(text: str, source_filename: Optional[str] = None) -> ParsedEstimate:
    order_no = None
    m = ORDER_NO_RE.search(text)
    if m:
        order_no = m.group(1)

    customer = None
    m = CLIENT_RE.search(text)
    if m:
        customer = m.group(1).strip().split("\n")[0][:255]

    estimate_date = None
    m = ENTERED_ON_RE.search(text) or DATE_RE.search(text)
    if m:
        estimate_date = _parse_date(m.group(1))

    total = None
    m = NET_PRICE_RE.search(text)
    if m:
        total = _money(m.group(1))
    if total is None:
        m = TOTAL_PRICE_RE.search(text)
        if m:
            total = _money(m.group(1))

    windows: list[ParsedWindow] = []
    warnings: list[str] = []

    for item_no, qty_s, first_rest, block in _split_item_blocks(text):
        # Only keep product blocks that have a frame size (actual openings)
        size_m = FRAME_SIZE_RE.search(block)
        if not size_m:
            continue

        width = float(size_m.group(1))
        height = float(size_m.group(2))
        unit_price, line_total, product_label = _extract_prices(block, first_rest)
        if unit_price is None:
            warnings.append(f"no_price_item_{item_no}")
            continue

        qty = int(qty_s)
        type_m = TYPE_LINE_RE.search(block)
        type_line = type_m.group(1).strip() if type_m else None
        w_type = _infer_type(block, type_line, product_label)

        if line_total is None:
            line_total = round(unit_price * qty, 2)

        # Mulled assemblies: product label often has "+" (Casement+Fixed) or explicit mulled text
        is_mulled = bool(MULLED_RE.search(block)) or (
            "+" in product_label and "SINGLE FRAME" not in product_label.upper()
        )

        windows.append(
            ParsedWindow(
                type=w_type,
                width=round(width, 4),
                height=round(height, 4),
                area=round(width * height, 3),
                frame=_infer_frame(block),
                glass=_infer_glass(block),
                color=_infer_color(block) or "White",
                grid=_infer_grid(block),
                tempered=bool(TEMPERED_RE.search(block)),
                shape="Rectangular",
                installation=_infer_installation(block),
                hardware="Color Upcharge" if COLOR_UPCHARGE_RE.search(block) else None,
                quantity=qty,
                brickmould=bool(BRICKMOULD_RE.search(block)),
                wood_jamb=bool(WOOD_JAMB_RE.search(block)),
                screen=bool(SCREEN_RE.search(block)),
                mulled=is_mulled,
                nailing_flange=bool(NAILING_FLANGE_RE.search(block)),
                gas_fill=_infer_gas_fill(block),
                price=unit_price,
                line_total=line_total,
            )
        )

    if not windows:
        warnings.append("no_windows_parsed")
    if not order_no:
        order_no = (source_filename or "unknown").replace(".pdf", "")
        warnings.append("estimate_number_fallback_filename")

    est = ParsedEstimate(
        estimate_number=str(order_no),
        customer=customer,
        estimate_date=estimate_date,
        windows=windows,
        total=total,
        source_filename=source_filename,
        parse_warnings=warnings,
    )
    return normalize_estimate(est)


def looks_like_keystone(text: str) -> bool:
    markers = (
        "Order Checklist",
        "Frame Size W:",
        "Glazing Option",
        "BETTER VIEW",
        "Window City",
        "Classic Collection",
        "Keystone Certified",
    )
    hits = sum(1 for m in markers if m.lower() in text.lower())
    return hits >= 2
