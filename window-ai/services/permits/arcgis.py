"""Querying an ArcGIS REST layer (Brampton, Oakville, Mississauga)."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Optional

from services.permits.base import PermitSourceError

TIMEOUT_S = 20
# Issue dates are stored as local midnight; EST keeps them on the right day.
_EASTERN = timezone(timedelta(hours=-5))


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def number(value: Any) -> Optional[float]:
    try:
        parsed = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def whole(value: Any) -> Optional[int]:
    parsed = number(value)
    return int(parsed) if parsed else None


def epoch_date(value: Any) -> Optional[date]:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, _EASTERN).date()
    if isinstance(value, str) and len(value) >= 10:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def fetch(url: str, params: dict[str, Any], label: str) -> dict[str, Any]:
    full = f"{url}?{urllib.parse.urlencode({**params, 'f': 'json'})}"
    request = urllib.request.Request(full, headers={"User-Agent": "BetterView-Estimator/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise PermitSourceError(f"{label} permit service unavailable: {exc}") from exc
    if payload.get("error"):
        raise PermitSourceError(f"{label} permit service error: {payload['error'].get('message')}")
    return payload


def query_all(
    fetch_page: Callable[[dict[str, Any]], dict[str, Any]],
    params: dict[str, Any],
    parse: Callable[[dict[str, Any]], Any],
    *,
    page_size: int,
    max_pages: int = 20,
) -> list[Any]:
    """All matching features, following the service's paging."""
    records: list[Any] = []
    offset = 0
    for _ in range(max_pages):
        payload = fetch_page({
            "returnGeometry": "true",
            "outSR": 4326,
            "resultRecordCount": page_size,
            "resultOffset": offset,
            **params,
        })
        features = payload.get("features") or []
        records += [record for record in map(parse, features) if record]
        if not payload.get("exceededTransferLimit") or not features:
            break
        offset += len(features)
    return records


def near(lat: float, lng: float, radius_m: float) -> dict[str, Any]:
    return {
        "geometry": f"{lng},{lat}",
        "geometryType": "esriGeometryPoint",
        "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects",
        "distance": radius_m,
        "units": "esriSRUnit_Meter",
    }
