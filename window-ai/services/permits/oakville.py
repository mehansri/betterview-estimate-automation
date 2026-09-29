"""Town of Oakville building permits (ArcGIS Hub layer, 2013 on).

No builder field, but FOLDERDESCRIPTION usually names the builder's model
and elevation ("Model - C38E Thorncliffe - Elevation CN ... Options: ...")
and LEGALDESC gives the registered plan and lot ("PLAN M1255 LOT 51"),
which together identify a model better than a builder name would.
Folders that were never issued (cancelled duplicates) are skipped.
"""
from __future__ import annotations

from typing import Any, Optional

from services.address_key import address_key, split_address
from services.permits import arcgis
from services.permits.base import PermitRecord
from services.permits.model_names import parse_description, parse_legal

QUERY_URL = "https://services5.arcgis.com/QJebCdoMf4PF8fJP/arcgis/rest/services/Building_Permits_Hub/FeatureServer/0/query"
OUT_FIELDS = (
    "CUSTOMFOLDERNUMBER,FOLDERNAME,FOLDERDESCRIPTION,Subtype,AdjustedWorktype,ISSUEDATE,GFA,"
    "Number_of_Storeys,LEGALDESC,Status"
)
PAGE_SIZE = 2000
ISSUED = "ISSUEDATE IS NOT NULL"
HOUSES = "(Subtype LIKE '%Dwelling%' OR Subtype LIKE '%House%')"


def parse_feature(feature: dict[str, Any]) -> Optional[PermitRecord]:
    attributes = feature.get("attributes") or {}
    name = str(attributes.get("FOLDERNAME") or "").strip()
    key = address_key(name)
    if not key:
        return None
    geometry = feature.get("geometry") or {}
    work = str(attributes.get("AdjustedWorktype") or "").strip()
    info = parse_description(attributes.get("FOLDERDESCRIPTION"))
    plan, lot = parse_legal(attributes.get("LEGALDESC"))
    return PermitRecord(
        permit_number=str(attributes.get("CUSTOMFOLDERNUMBER") or ""),
        address=f"{name}, Oakville, ON",
        address_key=key,
        dwelling_type=str(attributes.get("Subtype") or "").strip(),
        work=work,
        builder=None,
        gfa=arcgis.number(attributes.get("GFA")),
        storeys=arcgis.whole(attributes.get("Number_of_Storeys")),
        bedrooms=None,
        issue_date=arcgis.epoch_date(attributes.get("ISSUEDATE")),
        lat=geometry.get("y"),
        lng=geometry.get("x"),
        status=(str(attributes.get("Status") or "").strip() or None),
        model=info.model,
        elevation=info.elevation,
        options=info.options,
        flags=info.flags,
        parent_permit=info.parent_permit,
        plan=plan,
        lot=lot,
        new_build=work == "New Construction",
    )


def fetch_json(params: dict[str, Any]) -> dict[str, Any]:
    return arcgis.fetch(QUERY_URL, params, "Oakville")


def _query(params: dict[str, Any]) -> list[PermitRecord]:
    return arcgis.query_all(lambda page: fetch_json(page), {"outFields": OUT_FIELDS, **params}, parse_feature, page_size=PAGE_SIZE)


class OakvillePermits:
    key = "oakville"
    label = "Town of Oakville"
    records_request_url = "https://www.oakville.ca/town-hall/online-services/property-records-and-tax/routine-disclosure-request/"
    records_request_note = "$60 plus retrieval/copying; the owner, or an agent with a signed Owner's Authorization"
    match_basis = "model name, elevation, plan of subdivision and floor area (2013 on)"

    def supports(self, city: Optional[str]) -> bool:
        return bool(city) and "OAKVILLE" in city

    def lookup(self, key: str) -> list[PermitRecord]:
        parts = split_address(key)
        if parts is None:
            return []
        number, street, _unit = parts
        where = f"{ISSUED} AND UPPER(FOLDERNAME) LIKE {arcgis.sql_text(f'{number} {street.split()[0]}%')}"
        wanted = f"{number} {street}"
        return [record for record in _query({"where": where}) if record.address_key.split(" #")[0] == wanted]

    def nearby_new_builds(self, subject: PermitRecord, radius_m: float) -> list[PermitRecord]:
        if subject.lat is None or subject.lng is None:
            return []
        where = f"{ISSUED} AND AdjustedWorktype = 'New Construction' AND {HOUSES}"
        return _query({"where": where, **arcgis.near(subject.lat, subject.lng, radius_m)})
