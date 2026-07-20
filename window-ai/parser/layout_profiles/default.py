"""Default regex / table heuristics for manufacturer estimate PDFs.

Tune this profile (or add sibling modules) once real Betterview PDFs are available.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Optional

# Header patterns
ESTIMATE_NUMBER_PATTERNS = [
    re.compile(r"(?:estimate|quote|order)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9\-]+)", re.I),
    re.compile(r"\bEST[-\s]?(\d{3,})\b", re.I),
]
CUSTOMER_PATTERNS = [
    re.compile(r"(?:customer|client|bill\s*to|sold\s*to)\s*[:\-]?\s*(.+)", re.I),
]
DATE_PATTERNS = [
    re.compile(
        r"(?:date|estimate\s*date|quote\s*date)\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        re.I,
    ),
    re.compile(r"\b(\d{4}-\d{2}-\d{2})\b"),
]
TOTAL_PATTERNS = [
    re.compile(r"(?:grand\s*)?total\s*[:\-]?\s*\$?\s*([\d,]+\.?\d*)", re.I),
]

# Line item: Type  W x H  ... $price
# Examples:
#   Casement 48 x 60 Aluminum Triple Black $1,450.00
#   Double Hung | 36" x 48" | Vinyl | Double | White | 1250
LINE_PATTERNS = [
    re.compile(
        r"(?P<type>Casement|Awning|Double\s*Hung|Slider|Fixed|Picture)"
        r"[^\d]{0,20}"
        r"(?P<width>\d+(?:\.\d+)?)\s*(?:\"|in)?\s*[xX×]\s*"
        r"(?P<height>\d+(?:\.\d+)?)\s*(?:\"|in)?"
        r"(?P<rest>.*?)"
        r"\$?\s*(?P<price>[\d,]+\.\d{2}|\d{3,})",
        re.I,
    ),
]

FRAME_TOKENS = ["vinyl", "aluminum", "aluminium", "fiberglass", "wood"]
GLASS_TOKENS = ["triple", "double", "single"]
COLOR_TOKENS = ["white", "black", "brown", "beige", "gray", "grey"]
GRID_TOKENS = ["colonial", "prairie", "diamond", "none"]


def parse_date(raw: str) -> Optional[datetime]:
    raw = raw.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%d/%m/%Y", "%m-%d-%Y"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None
