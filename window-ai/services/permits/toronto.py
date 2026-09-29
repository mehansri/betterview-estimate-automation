"""City of Toronto building permits (CKAN datastore, open data).

Cleared permits (since 2017, with applications back to 1985) and active
permits. PERMIT_TYPE "New Houses" rows carry STRUCTURE_TYPE (dwelling type),
RESIDENTIAL (residential floor area, m²; 0 when not recorded), BUILDER_NAME
(mostly from 2017 on) and a DESCRIPTION that sometimes names the model
('MODEL NAME "CORNER UNIT" ELEVATION "END"'). Permits have no coordinates:
GEO_ID is the address point id in the city's Address Points dataset, which
has them. POSTAL is the forward sortation area (M2N), used to find
neighbours before measuring distance.
The 2000-2016 permits are a separate download-only CSV and are not
searched here.
"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

from services.address_key import DIRECTIONS, SUFFIXES, address_key, split_address
from services.permits.arcgis import epoch_date
from services.permits.base import PermitRecord, PermitSourceError, distance_m
from services.permits.model_names import parse_description

API = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search"
CLEARED = "a96c0ba4-3026-402b-b09d-5b1268b8f810"
ACTIVE = "6d0229af-bc54-46de-9c2b-26759b01dd05"
ADDRESS_POINTS = "0b3756af-9caf-4f0f-ac28-9c6617adede4"
PERMIT_FIELDS = (
    "PERMIT_NUM,REVISION_NUM,PERMIT_TYPE,STRUCTURE_TYPE,WORK,STREET_NUM,STREET_NAME,STREET_TYPE,"
    "STREET_DIRECTION,POSTAL,GEO_ID,ISSUED_DATE,STATUS,DESCRIPTION,RESIDENTIAL,BUILDER_NAME"
)
PAGE_SIZE = 5000
TIMEOUT_S = 30
NOT_BUILT = {"CANCELLED", "REFUSED", "REVOKED", "APPLICATION WITHDRAWN", "ABANDONED"}
# Candidates within this floor-area ratio are located; the rest are dropped
# before asking for coordinates.
GFA_PREFILTER = 0.04
TORONTO_CITIES = {"TORONTO", "NORTH YORK", "SCARBOROUGH", "ETOBICOKE", "EAST YORK", "YORK"}


def fetch_json(params: dict[str, Any]) -> dict[str, Any]:
    """One datastore_search call (tests replace this)."""
    url = f"{API}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": "BetterView-Estimator/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise PermitSourceError(f"Toronto permit service unavailable: {exc}") from exc
    if not payload.get("success"):
        raise PermitSourceError(f"Toronto permit service error: {payload.get('error')}")
    return payload["result"]


def _search(
    resource: str, filters: dict[str, Any], fields: str = PERMIT_FIELDS, max_rows: int = 30000, *, text: bool = False
) -> list[dict[str, Any]]:
    """Rows matching the filters.

    ``text`` uses the full-text index per field (about 15x faster than exact
    filters on this datastore) and then keeps only exact matches.
    """
    rows: list[dict[str, Any]] = []
    while len(rows) < max_rows:
        result = fetch_json({
            "resource_id": resource,
            ("q" if text else "filters"): json.dumps(filters),
            "fields": fields,
            "limit": PAGE_SIZE,
            "offset": len(rows),
        })
        page = result.get("records") or []
        rows += page
        if len(page) < PAGE_SIZE:
            break
    if text:
        rows = [row for row in rows if all(str(row.get(name) or "").strip().upper() == str(value).upper() for name, value in filters.items())]
    return rows


def _permits(filters: dict[str, Any]) -> list[dict[str, Any]]:
    return _search(CLEARED, filters, text=True) + _search(ACTIVE, filters, text=True)


def _street_address(row: dict[str, Any]) -> str:
    number = re.sub(r"\s+", "", str(row.get("STREET_NUM") or ""))
    parts = [number, row.get("STREET_NAME"), row.get("STREET_TYPE"), row.get("STREET_DIRECTION")]
    return " ".join(str(part).strip() for part in parts if part and str(part).strip())


def _gfa(value: Any) -> Optional[float]:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def parse_row(row: dict[str, Any], coordinates: dict[str, tuple[float, float]] | None = None) -> Optional[PermitRecord]:
    street = _street_address(row)
    key = address_key(street)
    if not key:
        return None
    info = parse_description(row.get("DESCRIPTION"))
    geo_id = str(row.get("GEO_ID") or "").strip()
    lat, lng = (coordinates or {}).get(geo_id, (None, None))
    status = str(row.get("STATUS") or "").strip()
    permit_type = str(row.get("PERMIT_TYPE") or "").strip()
    return PermitRecord(
        permit_number=str(row.get("PERMIT_NUM") or "").strip(),
        address=f"{street.title()}, Toronto, ON",
        address_key=key,
        dwelling_type=str(row.get("STRUCTURE_TYPE") or "").strip(),
        work=str(row.get("WORK") or "").strip(),
        builder=(str(row.get("BUILDER_NAME") or "").strip().upper() or None),
        gfa=_gfa(row.get("RESIDENTIAL")),
        storeys=None,
        bedrooms=None,
        issue_date=epoch_date(row.get("ISSUED_DATE")),
        lat=lat,
        lng=lng,
        status=status or None,
        model=info.model,
        elevation=info.elevation,
        options=info.options,
        flags=info.flags,
        parent_permit=info.parent_permit,
        postal=(str(row.get("POSTAL") or "").strip().upper() or None),
        new_build=permit_type == "New Houses" and status.upper() not in NOT_BUILT and bool(row.get("ISSUED_DATE")),
    )


def coordinates_for(geo_ids: list[str]) -> dict[str, tuple[float, float]]:
    """GEO_ID -> (lat, lng) from the Address Points dataset."""
    found: dict[str, tuple[float, float]] = {}
    ids = sorted({geo_id for geo_id in geo_ids if geo_id and geo_id.isdigit()})
    for start in range(0, len(ids), 200):
        chunk = [int(geo_id) for geo_id in ids[start:start + 200]]
        rows = _search(ADDRESS_POINTS, {"ADDRESS_POINT_ID": chunk}, fields="ADDRESS_POINT_ID,geometry", max_rows=len(chunk))
        for row in rows:
            try:
                lng, lat = json.loads(row["geometry"])["coordinates"][:2]
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                continue
            found[str(row["ADDRESS_POINT_ID"])] = (lat, lng)
    return found


def _dedupe(records: list[PermitRecord]) -> list[PermitRecord]:
    """One record per permit number (units and revisions repeat rows)."""
    best: dict[str, PermitRecord] = {}
    for record in records:
        current = best.get(record.permit_number)
        if current is None or (record.gfa and not current.gfa) or (record.issue_date and not current.issue_date):
            best[record.permit_number] = record
    return list(best.values())


class TorontoPermits:
    key = "toronto"
    label = "City of Toronto"
    records_request_url = "https://www.toronto.ca/services-payments/building-construction/preliminary-zoning-reviews-information/request-building-records/"
    records_request_note = (
        "$76.98 per request; owner consent needed except for post-2006 house plans inside the "
        "disclosure window; about 30 business days"
    )
    match_basis = "floor area, dwelling type and model names (builder names mostly from 2017 on)"

    def supports(self, city: Optional[str]) -> bool:
        return bool(city) and city.strip() in TORONTO_CITIES

    def lookup(self, key: str) -> list[PermitRecord]:
        parts = split_address(key)
        if parts is None:
            return []
        number, street, _unit = parts
        words = street.split()
        if len(words) > 1 and words[-1] in DIRECTIONS.values():
            words = words[:-1]
        if len(words) > 1 and words[-1] in set(SUFFIXES.values()):
            words = words[:-1]
        rows = _permits({"STREET_NUM": number, "STREET_NAME": " ".join(words)})
        wanted = f"{number} {street}"
        coordinates = coordinates_for([str(row.get("GEO_ID") or "") for row in rows])
        records = [parse_row(row, coordinates) for row in rows]
        return _dedupe([record for record in records if record and record.address_key.split(" #")[0] == wanted])

    def nearby_new_builds(self, subject: PermitRecord, radius_m: float) -> list[PermitRecord]:
        if not subject.postal or subject.lat is None:
            return []
        rows = _permits({"PERMIT_TYPE": "New Houses", "POSTAL": subject.postal})
        candidates = []
        for row in rows:
            record = parse_row(row)
            if record is None or not record.new_build or record.dwelling_class != subject.dwelling_class:
                continue
            if subject.builder and record.builder and record.builder != subject.builder:
                continue
            same_model = bool(subject.model and record.model)
            close_area = bool(subject.gfa and record.gfa and abs(subject.gfa - record.gfa) <= subject.gfa * GFA_PREFILTER)
            if same_model or close_area:
                candidates.append((row, record))
        coordinates = coordinates_for([str(row.get("GEO_ID") or "") for row, _ in candidates])
        located = [parse_row(row, coordinates) for row, _ in candidates]

        def within(record: PermitRecord) -> bool:
            distance = distance_m(subject.lat, subject.lng, record.lat, record.lng)
            return distance is not None and distance <= radius_m

        return _dedupe([record for record in located if record and within(record)])
