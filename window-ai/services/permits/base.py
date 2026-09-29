"""A city's building-permit open data, reduced to what model matching needs."""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import date
from typing import Any, Optional, Protocol


def dwelling_class(dwelling_type: Optional[str]) -> str:
    """Cities name dwelling types differently; compare on the broad class."""
    text = (dwelling_type or "").upper()
    if "SEMI" in text:
        return "semi"
    if any(word in text for word in ("TOWN", "ROW", "STACKED")):
        return "town"
    if "DETACH" in text or "SFD" in text or "SINGLE" in text:
        return "detached"
    return "other"


@dataclass(frozen=True)
class PermitRecord:
    permit_number: str
    address: str
    address_key: str
    dwelling_type: str  # as the city writes it: "Single Family Detached", "SFD - Townhouse", ...
    work: str  # "New Complete Building", "New Construction", "Revision", ...
    builder: Optional[str]
    gfa: Optional[float]  # gross (residential) floor area, m²
    storeys: Optional[int]
    bedrooms: Optional[int]
    issue_date: Optional[date]
    lat: Optional[float]
    lng: Optional[float]
    status: Optional[str] = None
    # Named in some cities' permit descriptions (services/permits/model_names.py).
    model: Optional[str] = None
    elevation: Optional[str] = None
    options: Optional[str] = None
    # Registered plan of subdivision ("M1255") and lot: one builder's phase.
    plan: Optional[str] = None
    lot: Optional[str] = None
    # Lot-specific variant markers: reversed, corner, end, walk_out, lookout,
    # walk_up, loft, vaulted, side_door, raised_ceiling.
    flags: tuple[str, ...] = ()
    # "Repeat of 25-107980": the model permit this house repeats.
    parent_permit: Optional[str] = None
    postal: Optional[str] = None
    # Set by the source when a record is known to be a new house.
    new_build: Optional[bool] = None

    @property
    def is_new_build(self) -> bool:
        if self.new_build is not None:
            return self.new_build
        return self.work.upper().startswith("NEW")

    @property
    def dwelling_class(self) -> str:
        return dwelling_class(self.dwelling_type)

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["issue_date"] = self.issue_date.isoformat() if self.issue_date else None
        data["flags"] = list(self.flags)
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PermitRecord":
        known = {name: data[name] for name in cls.__dataclass_fields__ if name in data}
        known["issue_date"] = date.fromisoformat(data["issue_date"]) if data.get("issue_date") else None
        known["flags"] = tuple(data.get("flags") or ())
        return cls(**known)


def distance_m(a_lat: Optional[float], a_lng: Optional[float], b_lat: Optional[float], b_lng: Optional[float]) -> Optional[float]:
    if None in (a_lat, a_lng, b_lat, b_lng):
        return None
    lat1, lat2 = math.radians(a_lat), math.radians(b_lat)
    d_lat, d_lng = lat2 - lat1, math.radians(b_lng - a_lng)
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lng / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(h))


class PermitSourceError(Exception):
    """The city's permit service could not be reached or answered badly."""


class PermitSource(Protocol):
    key: str
    label: str
    records_request_url: str
    # Cost / consent / turnaround of ordering a house's permit drawings.
    records_request_note: str
    # What this city's data can match on, shown to the salesperson.
    match_basis: str

    def supports(self, city: Optional[str]) -> bool: ...

    def lookup(self, address_key: str) -> list[PermitRecord]:
        """Every permit recorded at this address."""

    def nearby_new_builds(self, subject: PermitRecord, radius_m: float) -> list[PermitRecord]:
        """New-house permits around the subject (same builder where the city records it)."""
