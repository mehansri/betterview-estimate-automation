"""Normalise a street address to a comparable key ("47 BROCK DR").

The same house is written many ways: Google autocomplete gives
"47 Brock Drive, Brampton, ON L6P 1A2, Canada", the city's permit data
"47 Brock Dr, Brampton, ON, L6P 1A2", a salesperson "47 brock dr.". The key
keeps the street number, street name, suffix (abbreviated) and direction, and
drops city, province, postal code and punctuation, so they all match.
"""
from __future__ import annotations

import re
from typing import Optional

# Canada Post abbreviations, which Brampton's permit data also uses.
SUFFIXES = {
    "AVENUE": "AVE", "AV": "AVE",
    "BOULEVARD": "BLVD", "BLV": "BLVD",
    "CIRCLE": "CIR", "CIRCUIT": "CIRCT",
    "COURT": "CRT", "CT": "CRT",
    "CRESCENT": "CRES", "CRESC": "CRES", "CR": "CRES",
    "DRIVE": "DR", "DRV": "DR",
    "GARDENS": "GDNS",
    "GATE": "GATE",
    "GROVE": "GROVE",
    "HEIGHTS": "HTS",
    "HIGHWAY": "HWY",
    "LANE": "LANE", "LN": "LANE",
    "PARKWAY": "PKY", "PKWY": "PKY",
    "PLACE": "PL",
    "ROAD": "RD",
    "SQUARE": "SQ",
    "STREET": "ST", "STR": "ST",
    "TERRACE": "TERR", "TER": "TERR",
    "TRAIL": "TRAIL", "TRL": "TRAIL",
    "WAY": "WAY",
}
DIRECTIONS = {"NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W"}
UNIT_WORDS = r"(?:UNIT|APT|SUITE|STE|#)"


def _segments(address: str) -> list[str]:
    """Comma/line segments, with a leading "Unit 3," joined to the street."""
    segments = [segment.strip() for segment in re.split(r"[,\n]", address) if segment.strip()]
    if len(segments) > 1 and re.fullmatch(rf"{UNIT_WORDS}\s*[A-Z0-9]+", segments[0].upper()):
        segments = [f"{segments[0]} {segments[1]}", *segments[2:]]
    return segments


def _first_segment(address: str) -> str:
    segments = _segments(address)
    return segments[0] if segments else ""


def split_address(address: str) -> Optional[tuple[str, str, Optional[str]]]:
    """(street number, street words, unit) or None when there is no number."""
    text = _first_segment(address or "").upper()
    text = re.sub(r"[.']", "", text)
    unit: Optional[str] = None
    # "Unit 5 47 Brock Dr" / "47 Brock Dr Unit 5"
    match = re.search(rf"\b{UNIT_WORDS}\s*([A-Z0-9]+)\b", text)
    if match:
        unit = match.group(1)
        text = (text[: match.start()] + " " + text[match.end():]).strip()
    # "5-47 Brock Dr" (unit-number)
    match = re.match(r"^\s*([A-Z0-9]+)\s*-\s*(\d+[A-Z]?)\s+(.*)$", text)
    if match:
        unit, number, rest = match.group(1), match.group(2), match.group(3)
    else:
        match = re.match(r"^\s*(\d+[A-Z]?)\s+(.*)$", text)
        if not match:
            return None
        number, rest = match.group(1), match.group(2)
    words = re.sub(r"[^A-Z0-9 ]", " ", rest).split()
    if not words:
        return None
    # A trailing direction ("Main St North"), then the suffix before it.
    direction = None
    if len(words) > 1 and (words[-1] in DIRECTIONS or words[-1] in DIRECTIONS.values()):
        direction = DIRECTIONS.get(words[-1], words[-1])
        words = words[:-1]
    if len(words) > 1 and words[-1] in SUFFIXES:
        words[-1] = SUFFIXES[words[-1]]
    if direction:
        words.append(direction)
    return number, " ".join(words), unit


def address_key(address: Optional[str]) -> Optional[str]:
    """ "47 Brock Drive, Brampton" -> "47 BROCK DR" (unit kept as "#5")."""
    parts = split_address(address or "")
    if parts is None:
        return None
    number, street, unit = parts
    key = f"{number} {street}"
    return f"{key} #{unit}" if unit else key


def street_of(address: Optional[str]) -> Optional[str]:
    parts = split_address(address or "")
    return parts[1] if parts else None


def city_of(address: Optional[str]) -> Optional[str]:
    """The city segment of a comma-separated address, upper-cased."""
    segments = _segments(address or "")
    if len(segments) < 2:
        return None
    return segments[1].upper()
