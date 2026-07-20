"""PDF estimate parser using pdfplumber + layout profiles."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

import pdfplumber

from parser.base import ParsedEstimate, ParsedWindow
from parser.layout_profiles import default as profile
from parser.layout_profiles.keystone import looks_like_keystone, parse_keystone_text
from parser.normalize import normalize_estimate
from utils.logging import get_logger

logger = get_logger("windowai.parser")


class PDFEstimateParser:
    """Parse manufacturer estimate PDFs into structured estimates."""

    def parse(self, path: str | Path) -> ParsedEstimate:
        path = Path(path)
        text_parts: list[str] = []
        tables: list[list[list[Optional[str]]]] = []

        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                t = page.extract_text() or ""
                text_parts.append(t)
                for table in page.extract_tables() or []:
                    tables.append(table)

        full_text = "\n".join(text_parts)

        # Window City / Keystone Order Checklist (Better View exports)
        if looks_like_keystone(full_text):
            est = parse_keystone_text(full_text, source_filename=path.name)
            logger.info(
                "Keystone parser: %s → %s windows (order %s)",
                path.name,
                len(est.windows),
                est.estimate_number,
            )
            return est

        warnings: list[str] = []

        estimate_number = self._match_first(full_text, profile.ESTIMATE_NUMBER_PATTERNS)
        if not estimate_number:
            estimate_number = path.stem
            warnings.append("estimate_number_fallback_filename")

        customer = self._match_first(full_text, profile.CUSTOMER_PATTERNS)
        if customer:
            customer = customer.strip().split("\n")[0][:255]

        date_raw = self._match_first(full_text, profile.DATE_PATTERNS)
        estimate_date = None
        if date_raw:
            dt = profile.parse_date(date_raw)
            if dt:
                estimate_date = dt.date()

        total_raw = self._match_first(full_text, profile.TOTAL_PATTERNS)
        total = self._to_float(total_raw) if total_raw else None

        windows = self._parse_line_items(full_text)
        if not windows:
            windows = self._parse_tables(tables)
        if not windows:
            warnings.append("no_windows_parsed")

        est = ParsedEstimate(
            estimate_number=str(estimate_number),
            customer=customer,
            estimate_date=estimate_date,
            windows=windows,
            total=total,
            source_filename=path.name,
            parse_warnings=warnings,
        )
        return normalize_estimate(est)

    def _match_first(self, text: str, patterns: list[re.Pattern[str]]) -> Optional[str]:
        for pat in patterns:
            m = pat.search(text)
            if m:
                return m.group(1)
        return None

    def _to_float(self, raw: str) -> Optional[float]:
        try:
            return float(raw.replace(",", "").replace("$", "").strip())
        except (TypeError, ValueError):
            return None

    def _parse_line_items(self, text: str) -> list[ParsedWindow]:
        windows: list[ParsedWindow] = []
        for line in text.splitlines():
            for pat in profile.LINE_PATTERNS:
                m = pat.search(line)
                if not m:
                    continue
                gd = m.groupdict()
                rest = (gd.get("rest") or "").lower()
                windows.append(
                    ParsedWindow(
                        type=gd.get("type"),
                        width=self._to_float(gd.get("width") or ""),
                        height=self._to_float(gd.get("height") or ""),
                        frame=self._find_token(rest, profile.FRAME_TOKENS),
                        glass=self._find_token(rest, profile.GLASS_TOKENS),
                        color=self._find_token(rest, profile.COLOR_TOKENS),
                        grid=self._find_token(rest, profile.GRID_TOKENS) or "None",
                        tempered="temper" in rest,
                        price=self._to_float(gd.get("price") or ""),
                    )
                )
                break
        return windows

    def _find_token(self, text: str, tokens: list[str]) -> Optional[str]:
        for tok in tokens:
            if tok in text:
                return tok
        return None

    def _parse_tables(
        self, tables: list[list[list[Optional[str]]]]
    ) -> list[ParsedWindow]:
        """Best-effort table parse: look for dimension + price columns."""
        windows: list[ParsedWindow] = []
        dim_re = re.compile(
            r"(\d+(?:\.\d+)?)\s*(?:\"|in)?\s*[xX×]\s*(\d+(?:\.\d+)?)", re.I
        )
        for table in tables:
            if not table or len(table) < 2:
                continue
            for row in table[1:]:
                cells = [ (c or "").strip() for c in row ]
                joined = " | ".join(cells)
                dm = dim_re.search(joined)
                if not dm:
                    continue
                price = None
                for cell in reversed(cells):
                    p = self._to_float(cell.replace("$", ""))
                    if p is not None and p > 20:
                        price = p
                        break
                w_type = None
                for cell in cells:
                    low = cell.lower()
                    for t in [
                        "casement",
                        "awning",
                        "double hung",
                        "slider",
                        "fixed",
                        "picture",
                    ]:
                        if t in low:
                            w_type = t
                            break
                    if w_type:
                        break
                windows.append(
                    ParsedWindow(
                        type=w_type,
                        width=float(dm.group(1)),
                        height=float(dm.group(2)),
                        frame=self._find_token(joined.lower(), profile.FRAME_TOKENS),
                        glass=self._find_token(joined.lower(), profile.GLASS_TOKENS),
                        color=self._find_token(joined.lower(), profile.COLOR_TOKENS),
                        tempered="temper" in joined.lower(),
                        price=price,
                    )
                )
        return windows
