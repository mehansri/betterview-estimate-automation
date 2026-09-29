"""City of Mississauga building permits (Growth Management layer, 2014 on).

No builder field and no storeys; residential GFA, dwelling type, point
location and the registered plan (MPlanNumber) identify a model. Most new
houses here since 2014 are custom infill, so matches are rarer than in
Brampton's subdivisions.
"""
from __future__ import annotations

from typing import Any, Optional

from services.address_key import address_key, split_address
from services.permits import arcgis
from services.permits.base import PermitRecord

QUERY_URL = (
    "https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/"
    "Growth_Management_%E2%80%93_Issued_Building_Permits/FeatureServer/0/query"
)
OUT_FIELDS = "BuildingPermitNumber,IssuedDate,BuildingPermitType,BuildingPermitScope,Address,ResidentialGFA_m2,ResidentialUnits,MPlanNumber"
PAGE_SIZE = 2000
HOUSES = "BuildingPermitType LIKE '%Dwelling%'"


def parse_feature(feature: dict[str, Any]) -> Optional[PermitRecord]:
    attributes = feature.get("attributes") or {}
    street = str(attributes.get("Address") or "").strip()
    key = address_key(street)
    if not key:
        return None
    geometry = feature.get("geometry") or {}
    scope = str(attributes.get("BuildingPermitScope") or "").strip()
    plan = str(attributes.get("MPlanNumber") or "").strip().upper() or None
    return PermitRecord(
        permit_number=str(attributes.get("BuildingPermitNumber") or ""),
        address=f"{street}, Mississauga, ON",
        address_key=key,
        dwelling_type=str(attributes.get("BuildingPermitType") or "").strip(),
        work=scope,
        builder=None,
        gfa=arcgis.number(attributes.get("ResidentialGFA_m2")),
        storeys=None,
        bedrooms=None,
        issue_date=arcgis.epoch_date(attributes.get("IssuedDate")),
        lat=geometry.get("y"),
        lng=geometry.get("x"),
        plan=plan,
        new_build=scope == "New Building",
    )


def fetch_json(params: dict[str, Any]) -> dict[str, Any]:
    return arcgis.fetch(QUERY_URL, params, "Mississauga")


def _query(params: dict[str, Any]) -> list[PermitRecord]:
    return arcgis.query_all(lambda page: fetch_json(page), {"outFields": OUT_FIELDS, **params}, parse_feature, page_size=PAGE_SIZE)


class MississaugaPermits:
    key = "mississauga"
    label = "City of Mississauga"
    records_request_url = "https://www.mississauga.ca/our-organization/submit-a-freedom-of-information-request/"
    records_request_note = "$5 FOI fee plus about $2-$6 per sheet; owner or signed owner letter; about 45 business days"
    match_basis = "floor area, dwelling type, plan of subdivision and location (2014 on, no builder names)"

    def supports(self, city: Optional[str]) -> bool:
        return bool(city) and "MISSISSAUGA" in city

    def lookup(self, key: str) -> list[PermitRecord]:
        parts = split_address(key)
        if parts is None:
            return []
        number, street, _unit = parts
        where = f"UPPER(Address) LIKE {arcgis.sql_text(f'{number} {street.split()[0]}%')}"
        wanted = f"{number} {street}"
        return [record for record in _query({"where": where}) if record.address_key.split(" #")[0] == wanted]

    def nearby_new_builds(self, subject: PermitRecord, radius_m: float) -> list[PermitRecord]:
        if subject.lat is None or subject.lng is None:
            return []
        where = f"BuildingPermitScope = 'New Building' AND ResidentialGFA_m2 > 0 AND {HOUSES}"
        return _query({"where": where, **arcgis.near(subject.lat, subject.lng, radius_m)})
