"""Builder model, elevation and lot options named in permit descriptions.

Real examples (Oakville unless noted):
  "Model - C38E Thorncliffe - Elevation CN: 5bdrm ... Options: Next Step W/Raised Basement Ceiling, 5 Bedroom Plan"
  "Model - Model F34B Coxland- Elevation TA ... Lookout Deck"
  "New SFD, Model: 38-1. This Lot is Elev. &quot;C/4bdrm/alt 2nd flr&quot;"
  "Model 44-01 (The Anchor) w/ elev A, B, C ... Lot 17 Options: Elev. B ... rear LOB deck"
  "Model 2602 - Oxford ... Lot 144 Right - Selected Options: Elevation A, Reversed layout"
  "Lot 76- Repat of Model F34C- The Giddings (25-107980), Elev TA"
  Toronto  'MODEL NAME "CORNER UNIT" ELEVATION "END"'
  Caledon  "Model: Olive, Elevation C"
  Hamilton "Model: 'Wellwood Grande'"

A description often lists every elevation the model offers before naming
the one built on this lot, so the lot's elevation is the last single
elevation mentioned.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass
from typing import Optional

_PREFIX = r"\bMODEL\s*(?:NAME|TYPE|NO\.?|#)?\s*[:\-–]?\s*(?:MODEL\s+)?"
_QUOTED = re.compile(_PREFIX + r"[\"“'‘]([^\"”'’]{1,40})[\"”'’]", re.I)
_STOP = r"(?:ELEV\w*|WITH|W/|AND|IS|THIS|ON|LOT|FOR|OPTIONS?|OPTNS?|BLOCK|BLK|INCL\w*|C/W|TO|IN|REPEAT)\b"
_BARE = re.compile(_PREFIX + r"([A-Z0-9][\w/.]*(?:[\s\-]+(?!" + _STOP + r")[A-Z0-9][\w]*){0,3})", re.I)
_ELEVATION = re.compile(r"\bELEV(?:ATION)?S?\.?\s*[:\-–]?\s*[\"“'‘`]?([A-Z0-9]{1,4})(?![A-Z0-9])", re.I)
_LIST_AFTER = re.compile(r"^\s*[\"”'’`]?\s*(?:,|&|\bAND\b)\s*[\"“'‘]?(?:[A-Z]{1,2}|\d[A-Z]?|[A-Z]\d)\b", re.I)
_LOT_OPTIONS = re.compile(r"\b(?:LOT\s+\w+\s*(?:OPTIONS?|OPTS?|OPTNS?)|SELECTED\s+OPTIONS?|LOT\s+OPTS?)\s*[:\-–]?\s*([^\n]{3,240})", re.I)
_OPTIONS = re.compile(r"\bOPTIONS?\s*:\s*([^.\n]{3,200})", re.I)
_REPEAT = re.compile(r"\bRE(?:PEAT|PAT)\b.{0,60}?\b(\d{2}-\d{6})\b", re.I)
_PLAN = re.compile(r"\bPLAN\s+([A-Z]?\d+[A-Z]?)\b", re.I)
_LOT = re.compile(r"\bLOT\s+(\d+[A-Z]?)\b", re.I)

FLAG_PATTERNS = {
    "reversed": r"\bREVERS\w*|\bREV\b|\bMIRROR\w*",
    "corner": r"\bCORNER\b",
    "end": r"\bEND\b(?:\s+UNIT)?",
    "walk_out": r"\bWALK[\s\-]?OUT\b",
    "walk_up": r"\bWALK[\s\-]?UP\b",
    "lookout": r"\bLOOK[\s\-]?OUT\b|\bLOB\b",
    "loft": r"\bLOFT\b|\bRETREAT\b",
    "vaulted": r"\bVAULT\w*|HIGH LEVEL WINDOWS?",
    "side_door": r"\bSIDE\s+(?:DOOR|ENTRY)\b",
    "raised_ceiling": r"\b(?:RAISED|10\s*'|10\s*FT)\s*(?:BASEMENT\s+)?CEIL\w*",
}
FLAG_LABELS = {
    "reversed": "reversed layout", "corner": "corner lot", "end": "end unit", "walk_out": "walk-out basement",
    "walk_up": "walk-up basement", "lookout": "lookout basement", "loft": "loft", "vaulted": "vaulted / high windows",
    "side_door": "side door", "raised_ceiling": "raised ceiling",
}


@dataclass(frozen=True)
class ModelInfo:
    model: Optional[str] = None
    elevation: Optional[str] = None
    options: Optional[str] = None
    flags: tuple[str, ...] = ()
    parent_permit: Optional[str] = None


def _clean(text: Optional[str]) -> str:
    return re.sub(r"\s+", " ", html.unescape(text or "")).strip()


def _lot_elevation(text: str) -> Optional[str]:
    """The last single elevation named (earlier ones are often the model's list)."""
    chosen = None
    for match in _ELEVATION.finditer(text):
        if _LIST_AFTER.match(text[match.end():]):
            continue
        chosen = match.group(1).upper()
    return chosen


def parse_description(text: Optional[str]) -> ModelInfo:
    cleaned = _clean(text)
    if not cleaned:
        return ModelInfo()
    model = None
    match = _QUOTED.search(cleaned) or _BARE.search(cleaned)
    if match:
        model = re.sub(r"^MODEL\s+", "", match.group(1).strip(" .,:;-–").upper()) or None
    lot_options = _LOT_OPTIONS.search(cleaned)
    options_match = lot_options or _OPTIONS.search(cleaned)
    options = options_match.group(1).strip(" ,;.") if options_match else None
    # Lot-specific markers; when the description lists the model's options
    # before the lot's, only the lot's part counts.
    scope = cleaned[lot_options.start():] if lot_options else cleaned
    flags = tuple(name for name, pattern in FLAG_PATTERNS.items() if re.search(pattern, scope, re.I))
    repeat = _REPEAT.search(cleaned)
    parent = repeat.group(1) if repeat else None
    return ModelInfo(model=model, elevation=_lot_elevation(cleaned), options=options, flags=flags, parent_permit=parent)


def parse_model(text: Optional[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """(model, elevation, options) from a permit description."""
    info = parse_description(text)
    return info.model, info.elevation, info.options


def model_key(model: Optional[str]) -> str:
    """Compare model names on the builder's code when there is one.

    "C38E THORNCLIFFE" and "C38E" -> "C38E"; "OAK 432 WILLOW WAY" -> "OAK432";
    "RIVIERA 1" -> "RIVIERA1"; "OLIVE" -> "OLIVE".
    """
    tokens = re.sub(r"[^A-Z0-9\-\s]", " ", (model or "").upper()).split()
    tokens = [token.replace("-", "") for token in tokens]
    tokens = [token for token in tokens if token and token not in {"THE", "MODEL"}]
    for index, token in enumerate(tokens[:2]):
        if any(char.isdigit() for char in token):
            return "".join(tokens[: index + 1])
    # Letter-only builder codes ("DRLD The Chestnut End", "KTHC The Laurel").
    if len(tokens) > 1 and len(tokens[0]) >= 3 and not set(tokens[0]) & set("AEIOUY"):
        return tokens[0]
    return "".join(tokens)


def parse_legal(legal: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """(plan, lot) from a legal description like "PLAN M1255 LOT 51"."""
    cleaned = _clean(legal)
    plan = _PLAN.search(cleaned)
    lot = _LOT.search(cleaned)
    return (plan.group(1).upper() if plan else None), (lot.group(1).upper() if lot else None)
