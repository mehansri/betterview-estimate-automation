"""Find same-model homes from permit data and reuse their openings.

Tract builders put up a few house models per subdivision. A city's permit
data records the builder and gross floor area (GFA) of every new house, and
houses by the same builder with the same GFA, dwelling type and neighbourhood
are the same model. A model's windows and doors, taken from one measured job
or the permit drawings, give every other home of that model a preliminary
quote before a site visit.
"""
from __future__ import annotations

import copy
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from db.models import CustomerEstimate, HomeModel, PermitLookupCache
from services.address_key import address_key, city_of
from services.permits import PermitRecord, PermitSource, PermitSourceError, distance_m, source_for, supported_cities
from services.permits.model_names import FLAG_LABELS, model_key

RADIUS_M = 600
# Same model: GFA equal to the reported precision. Similar: within 3% (a
# builder's elevations of one model differ by 1-3 m²; options by more).
SAME_GFA_TOLERANCE_M2 = 0.05
SIMILAR_GFA_RATIO = 0.03
# Homes of one model in one phase are permitted within a few years.
MAX_ISSUE_GAP_DAYS = 3 * 365
CACHE_TTL = timedelta(days=30)


# ------------------------------------------------------------------ cache
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _cached_records(session: Session, key: str, fetch) -> list[PermitRecord]:
    row = session.get(PermitLookupCache, key)
    if row is not None:
        fetched = row.fetched_at if row.fetched_at.tzinfo else row.fetched_at.replace(tzinfo=timezone.utc)
        if _now() - fetched < CACHE_TTL:
            return [PermitRecord.from_dict(item) for item in row.payload]
    records = fetch()
    payload = [record.to_dict() for record in records]
    if row is None:
        session.add(PermitLookupCache(key=key, payload=payload, fetched_at=_now()))
    else:
        row.payload, row.fetched_at = payload, _now()
    return records


# ------------------------------------------------------------------ grouping
def gfa_relation(
    gfa: Optional[float], storeys: Optional[int], other_gfa: Optional[float], other_storeys: Optional[int]
) -> Optional[str]:
    """"same" model, "similar" (likely an elevation variant) or None."""
    if gfa is None or other_gfa is None:
        return None
    if storeys and other_storeys and storeys != other_storeys:
        return None
    if abs(gfa - other_gfa) <= SAME_GFA_TOLERANCE_M2:
        return "same"
    if abs(gfa - other_gfa) <= gfa * SIMILAR_GFA_RATIO:
        return "similar"
    return None


def relation(subject: PermitRecord, other: PermitRecord) -> Optional[str]:
    """How another house relates to the subject: "same" model, "similar" (a
    variant: another elevation, or a close floor area) or None.

    Model names win when both permits name one; otherwise floor area decides.
    Where the city records no builder, a different plan of subdivision means
    a different builder or phase.
    """
    if subject.dwelling_class != other.dwelling_class:
        return None
    if subject.builder and other.builder and subject.builder.upper() != other.builder.upper():
        return None
    if not (subject.builder and other.builder) and subject.plan and other.plan and subject.plan != other.plan:
        return None
    subject_model, other_model = model_key(subject.model), model_key(other.model)
    if subject_model and other_model:
        if subject_model != other_model:
            return None
        if subject.elevation and other.elevation and subject.elevation != other.elevation:
            return "similar"
        return "same"
    return gfa_relation(subject.gfa, subject.storeys, other.gfa, other.storeys)


def differences(subject: PermitRecord, other: PermitRecord) -> list[str]:
    """What to check when reusing the other house's openings for the subject."""
    notes = []
    if subject.elevation and other.elevation and subject.elevation != other.elevation:
        notes.append(f"elevation {other.elevation} (this home {subject.elevation}): front windows differ")
    if ("reversed" in subject.flags) != ("reversed" in other.flags):
        notes.append("mirror image: use mirrored")
    for flag in ("corner", "end", "walk_out", "walk_up", "lookout", "loft", "vaulted", "side_door", "raised_ceiling"):
        if (flag in subject.flags) != (flag in other.flags):
            side = "this home" if flag in subject.flags else "that home"
            notes.append(f"{FLAG_LABELS[flag]} on {side} only")
    if subject.gfa and other.gfa and abs(subject.gfa - other.gfa) > SAME_GFA_TOLERANCE_M2:
        notes.append(f"floor area {other.gfa:g} m² vs {subject.gfa:g} m²")
    return notes


def _close_in_time(subject: PermitRecord, other: PermitRecord) -> bool:
    if not subject.issue_date or not other.issue_date:
        return True
    return abs((subject.issue_date - other.issue_date).days) <= MAX_ISSUE_GAP_DAYS


def subject_permit(records: list[PermitRecord]) -> Optional[PermitRecord]:
    """The original new-house permit among everything filed at an address."""
    new_builds = [record for record in records if record.is_new_build and (record.gfa or record.model)]
    return min(new_builds, key=lambda record: record.issue_date or date.max, default=None)


def _unique_homes(records: list[PermitRecord], exclude: set[str]) -> list[PermitRecord]:
    """One permit per address (the earliest issued), skipping ``exclude``."""
    best: dict[str, PermitRecord] = {}
    for record in records:
        if record.address_key in exclude:
            continue
        current = best.get(record.address_key)
        if current is None or (record.issue_date or date.max) < (current.issue_date or date.max):
            best[record.address_key] = record
    return [best[key] for key in sorted(best)]


def group_neighbours(subject: PermitRecord, nearby: list[PermitRecord]) -> dict[str, list[PermitRecord]]:
    groups: dict[str, list[PermitRecord]] = {"same": [], "similar": []}
    for record in _unique_homes(nearby, {subject.address_key}):
        if not _close_in_time(subject, record):
            continue
        found = relation(subject, record)
        if found:
            groups[found].append(record)
    return groups


def build_lineup(subject: PermitRecord, nearby: list[PermitRecord]) -> list[dict[str, Any]]:
    """The builder's model lineup around the subject: each model with its
    elevations and how many homes use it (the "1, 2, 3, 4, 4A" list).

    Scoped to the subject's plan of subdivision, or its builder, where known.
    Models are grouped by name where the permits name them, otherwise by
    floor area (within the elevation-variant tolerance).
    """
    pool = [record for record in _unique_homes([subject, *nearby], set()) if _close_in_time(subject, record)]
    if subject.plan:
        pool = [record for record in pool if record.plan == subject.plan]
    elif subject.builder:
        pool = [record for record in pool if (record.builder or "").upper() == subject.builder.upper()]
    named: dict[str, list[PermitRecord]] = {}
    unnamed: list[PermitRecord] = []
    for record in pool:
        key = model_key(record.model)
        if key:
            named.setdefault(key, []).append(record)
        elif record.gfa:
            unnamed.append(record)
    clusters: list[list[PermitRecord]] = []
    for record in sorted(unnamed, key=lambda item: (item.dwelling_class, item.gfa or 0)):
        last = clusters[-1] if clusters else None
        if last and last[0].dwelling_class == record.dwelling_class and (record.gfa or 0) <= (last[0].gfa or 0) * (1 + SIMILAR_GFA_RATIO):
            last.append(record)
        else:
            clusters.append([record])

    def summary(key: Optional[str], homes: list[PermitRecord]) -> dict[str, Any]:
        names = Counter(home.model for home in homes if home.model)
        areas = [home.gfa for home in homes if home.gfa]
        return {
            "key": key or f"gfa:{min(areas):g}",
            "model": names.most_common(1)[0][0] if names else None,
            "dwelling_type": Counter(home.dwelling_type for home in homes).most_common(1)[0][0],
            "count": len(homes),
            "gfa_min": min(areas) if areas else None,
            "gfa_max": max(areas) if areas else None,
            "elevations": dict(Counter(home.elevation for home in homes if home.elevation).most_common()),
            "flags": dict(Counter(flag for home in homes for flag in home.flags).most_common()),
            "includes_subject": any(home.address_key == subject.address_key for home in homes),
            "addresses": [home.address for home in homes[:6]],
        }

    lineup = [summary(key, homes) for key, homes in named.items()] + [summary(None, homes) for homes in clusters]
    return sorted(lineup, key=lambda item: (not item["includes_subject"], -item["count"], item["gfa_min"] or 0))


def model_label(record: PermitRecord) -> str:
    parts = [record.builder.title() if record.builder else None]
    if record.model:
        parts.append(record.model.title())
    if record.elevation:
        parts.append(f"elevation {record.elevation}")
    if record.gfa:
        parts.append(f"{record.gfa:g} m²")
    if record.storeys:
        parts.append(f"{record.storeys}-storey")
    if record.dwelling_type:
        parts.append(record.dwelling_type.lower())
    return " · ".join(part for part in parts if part)


# ------------------------------------------------------------------ openings
def _flip_side(value: Any) -> Any:
    return {"left": "right", "right": "left"}.get(value, value)


def _mirror_layout(node: Any) -> Any:
    if not isinstance(node, dict):
        return node
    if "split" in node:
        children = [_mirror_layout(child) for child in node.get("children") or []]
        sizes = list(node.get("sizes") or [])
        if node["split"] == "cols":
            children.reverse()
            sizes.reverse()
        return {**node, "children": children, "sizes": sizes}
    return {**node, "hinge": _flip_side(node["hinge"])} if "hinge" in node else node


def mirror_window(line: dict[str, Any]) -> dict[str, Any]:
    """The same window on a mirror-image (flipped) lot."""
    line = copy.deepcopy(line)
    spec = line.get("spec") or {}
    if isinstance(spec.get("layout"), dict):
        spec["layout"] = _mirror_layout(spec["layout"])
    details = line.get("details")
    if isinstance(details, dict):
        details["elevation"] = _flip_side(details.get("elevation"))
        sections = details.get("sections")
        if isinstance(sections, list):
            details["sections"] = [
                {**section, "handing": _flip_side(section.get("handing"))} if isinstance(section, dict) else section
                for section in reversed(sections)
            ]
    return line


def openings_for_new_home(model: HomeModel, *, mirror: bool = False) -> dict[str, list[dict[str, Any]]]:
    """A model's openings with fresh line ids, optionally mirrored."""
    windows = [mirror_window(line) if mirror else copy.deepcopy(line) for line in model.windows or []]
    doors = copy.deepcopy(model.doors or [])
    for line in windows:
        line["id"] = f"window-{uuid4().hex[:12]}"
    for opening in doors:
        opening["id"] = f"door-{uuid4().hex[:12]}"
    return {"windows": windows, "doors": doors}


# ------------------------------------------------------------------ matching
def backfill_address_keys(session: Session) -> None:
    """Estimates saved before address keys existed get one on first use."""
    rows = (
        session.query(CustomerEstimate)
        .filter(CustomerEstimate.address_key.is_(None))
        .filter(CustomerEstimate.project_address.isnot(None))
        .filter(CustomerEstimate.project_address != "")
        .all()
    )
    for row in rows:
        row.address_key = address_key(row.project_address) or ""


def _street_key(key: str) -> str:
    return key.split(" #")[0]


def home_model_record(row: HomeModel) -> PermitRecord:
    """A saved model as a permit-like record, so it matches like a neighbour."""
    return PermitRecord(
        permit_number="", address=row.source_address, address_key="", dwelling_type=row.dwelling_type,
        work="New", builder=row.builder or None, gfa=row.gfa or None, storeys=row.storeys, bedrooms=None,
        issue_date=None, lat=row.lat, lng=row.lng, model=row.model_name or None,
        elevation=row.elevation or None, plan=row.plan or None, flags=tuple(row.variant_flags or ()),
    )


def _home_models_for(session: Session, subject: PermitRecord, source: PermitSource) -> list[tuple[str, HomeModel]]:
    rows = session.query(HomeModel).filter(HomeModel.source_city == source.key).all()
    matched: list[tuple[str, HomeModel]] = []
    for row in rows:
        record = home_model_record(row)
        if not (subject.builder and record.builder):
            # Without builder names, only a template from the same plan or
            # the same neighbourhood can be the same model.
            distance = distance_m(subject.lat, subject.lng, record.lat, record.lng)
            nearby = distance is not None and distance <= 2 * RADIUS_M
            if not ((subject.plan and subject.plan == record.plan) or nearby):
                continue
        found = relation(subject, record)
        if found:
            matched.append((found, row))
    return sorted(matched, key=lambda item: (item[0] != "same", -(item[1].updated_at or _now()).timestamp()))


def home_model_summary(row: HomeModel, relation: Optional[str] = None, notes: Optional[list[str]] = None) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "relation": relation,
        "differences": notes or [],
        "label": row.label,
        "builder": row.builder,
        "model_name": row.model_name,
        "elevation": row.elevation,
        "plan": row.plan,
        "variant_flags": list(row.variant_flags or []),
        "dwelling_type": row.dwelling_type,
        "gfa": row.gfa,
        "storeys": row.storeys,
        "source": row.source,
        "source_address": row.source_address,
        "source_estimate_id": str(row.source_estimate_id) if row.source_estimate_id else None,
        "window_count": sum(int((line.get("spec") or {}).get("qty") or 1) for line in row.windows or []),
        "door_count": len(row.doors or []),
        "notes": row.notes,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _measured_jobs(
    session: Session, relation_by_key: dict[str, str], exclude_id: Optional[str]
) -> list[dict[str, Any]]:
    if not relation_by_key:
        return []
    backfill_address_keys(session)
    rows = (
        session.query(CustomerEstimate)
        .filter(CustomerEstimate.deleted_at.is_(None))
        .filter(CustomerEstimate.is_preliminary.is_(False))
        .filter(CustomerEstimate.address_key.in_(list(relation_by_key)))
        .order_by(CustomerEstimate.updated_at.desc())
        .all()
    )
    order = {"this_home": 0, "same": 1, "similar": 2}
    jobs = []
    for row in rows:
        relation = relation_by_key.get(row.address_key or "")
        if not relation or str(row.id) == exclude_id or not (row.windows or row.doors):
            continue
        jobs.append({
            "estimate_id": str(row.id),
            "estimate_number": row.estimate_number,
            "status": row.status,
            "customer_name": row.customer_name or "",
            "project_address": row.project_address or "",
            "relation": relation,
            "window_count": sum(int((line.get("spec") or {}).get("qty") or 1) for line in row.windows or []),
            "door_count": len(row.doors or []),
        })
    return sorted(jobs, key=lambda job: order[job["relation"]])


def match_address(session: Session, address: str, *, exclude_estimate_id: Optional[str] = None) -> dict[str, Any]:
    key = address_key(address)
    result: dict[str, Any] = {
        "address_key": key,
        "supported": False,
        "source": None,
        "subject": None,
        "same_model": [],
        "similar": [],
        "home_models": [],
        "measured_jobs": [],
        "lineup": [],
        "message": "",
    }
    if not key:
        result["message"] = "Enter a street address with a house number to look up the builder's permit."
        return result
    source = source_for(city_of(address))
    if source is None:
        city = city_of(address)
        where = f"for {city.title()} " if city else "without the city in the address "
        result["message"] = f"Permit lookup is not available {where}yet. Supported: {', '.join(supported_cities())}."
        return result
    result["supported"] = True
    result["source"] = {
        "key": source.key,
        "label": source.label,
        "records_request_url": source.records_request_url,
        "records_request_note": source.records_request_note,
        "match_basis": source.match_basis,
    }
    street = _street_key(key)
    try:
        records = _cached_records(session, f"{source.key}:address:{street}", lambda: source.lookup(street))
        subject = subject_permit(records)
        if subject is None:
            result["message"] = f"No new-house permit with a floor area or model name was found for {street} in {source.label}'s permit data."
            return result
        nearby = _cached_records(
            session,
            f"{source.key}:nearby:{subject.permit_number}:{RADIUS_M}",
            lambda: source.nearby_new_builds(subject, RADIUS_M),
        )
    except PermitSourceError as exc:
        result["message"] = str(exc)
        return result

    groups = group_neighbours(subject, nearby)
    result["subject"] = {**subject.to_dict(), "label": model_label(subject)}
    result["same_model"] = [{**record.to_dict(), "differences": differences(subject, record)} for record in groups["same"]]
    result["similar"] = [{**record.to_dict(), "differences": differences(subject, record)} for record in groups["similar"]]
    result["home_models"] = [
        home_model_summary(row, found, differences(subject, home_model_record(row)))
        for found, row in _home_models_for(session, subject, source)
    ]
    result["lineup"] = build_lineup(subject, nearby)
    relation_by_key = {record.address_key: "same" for record in groups["same"]}
    relation_by_key.update({record.address_key: "similar" for record in groups["similar"]})
    # An earlier job at this very address (a repeat customer, a second phase).
    relation_by_key[street] = "this_home"
    result["measured_jobs"] = _measured_jobs(session, relation_by_key, exclude_estimate_id)
    if not result["home_models"] and not result["measured_jobs"]:
        result["message"] = (
            "None of these homes has been measured yet. Measure this home and save it as the model "
            "template, or order the permit drawings."
        )
    return result
