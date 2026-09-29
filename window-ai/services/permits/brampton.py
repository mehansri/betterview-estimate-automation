"""City of Brampton building permits (live ArcGIS MapServer, open data).

Fields used: ADDRESS, PERMITNUMBER, SUBDESC (dwelling type), WORKDESC,
ISSUEDATE (epoch ms), BUILDER, GFA (m², text), STOREYS, BEDROOMS, SHAPE.
STOREYS/BEDROOMS are often blank or "0" on older permits; GFA is the
reliable model fingerprint.
"""
from __future__ import annotations

from typing import Any, Optional

from services.address_key import address_key, split_address
from services.permits import arcgis
from services.permits.base import PermitRecord

QUERY_URL = "https://maps1.brampton.ca/arcgis/rest/services/BuildingPermit/Building_Permits/MapServer/0/query"
OUT_FIELDS = "ADDRESS,PERMITNUMBER,SUBDESC,WORKDESC,ISSUEDATE,BUILDER,GFA,STOREYS,BEDROOMS,STATUSDESC"
PAGE_SIZE = 1000  # the service's maxRecordCount


def parse_feature(feature: dict[str, Any]) -> Optional[PermitRecord]:
    attributes = feature.get("attributes") or {}
    address = str(attributes.get("ADDRESS") or "").strip()
    key = address_key(address)
    if not key:
        return None
    geometry = feature.get("geometry") or {}
    return PermitRecord(
        permit_number=str(attributes.get("PERMITNUMBER") or ""),
        address=address,
        address_key=key,
        dwelling_type=str(attributes.get("SUBDESC") or "").strip(),
        work=str(attributes.get("WORKDESC") or "").strip(),
        builder=(str(attributes.get("BUILDER") or "").strip() or None),
        gfa=arcgis.number(attributes.get("GFA")),
        storeys=arcgis.whole(attributes.get("STOREYS")),
        bedrooms=arcgis.whole(attributes.get("BEDROOMS")),
        issue_date=arcgis.epoch_date(attributes.get("ISSUEDATE")),
        lat=geometry.get("y"),
        lng=geometry.get("x"),
        status=(str(attributes.get("STATUSDESC") or "").strip() or None),
    )


def fetch_json(params: dict[str, Any]) -> dict[str, Any]:
    """One query against the MapServer (tests replace this)."""
    return arcgis.fetch(QUERY_URL, params, "Brampton")


def _query(params: dict[str, Any]) -> list[PermitRecord]:
    return arcgis.query_all(lambda page: fetch_json(page), {"outFields": OUT_FIELDS, **params}, parse_feature, page_size=PAGE_SIZE)


class BramptonPermits:
    key = "brampton"
    label = "City of Brampton"
    records_request_url = "https://www.brampton.ca/EN/residents/Building-Permits/homeowners/pages/buildingrecords.aspx"
    records_request_note = "$35.59 + HST per PDF drawing set; no proof of ownership needed; reply within 5 business days"
    match_basis = "builder and floor area"

    def supports(self, city: Optional[str]) -> bool:
        return bool(city) and "BRAMPTON" in city

    def lookup(self, key: str) -> list[PermitRecord]:
        parts = split_address(key)
        if parts is None:
            return []
        number, street, _unit = parts
        first_word = street.split()[0]
        # LIKE narrows the search; the exact comparison is on the normalised key.
        where = f"UPPER(ADDRESS) LIKE {arcgis.sql_text(f'{number} {first_word}%')}"
        wanted = f"{number} {street}"
        return [record for record in _query({"where": where}) if record.address_key.split(" #")[0] == wanted]

    def nearby_new_builds(self, subject: PermitRecord, radius_m: float) -> list[PermitRecord]:
        if subject.lat is None or subject.lng is None or not subject.builder:
            return []
        where = " AND ".join([
            f"BUILDER = {arcgis.sql_text(subject.builder)}",
            "UPPER(WORKDESC) LIKE 'NEW%'",
            f"SUBDESC = {arcgis.sql_text(subject.dwelling_type)}",
        ])
        return _query({"where": where, **arcgis.near(subject.lat, subject.lng, radius_m)})
