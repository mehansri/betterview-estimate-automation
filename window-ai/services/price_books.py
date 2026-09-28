"""Versioned supplier price-book datasets.

The JSON files under ``services/windowcity/data`` and ``data/doors`` are the
bundled defaults. A manager can import a replacement dataset, review the price
changes, and publish it; the published version then overrides the file for
every quote. Reverting simply unpublishes, falling back to the file.
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[1]
WINDOW_DATA = _ROOT / "services" / "windowcity" / "data"
DOOR_DATA = _ROOT / "data" / "doors"

ACTIVE_KEY = "price_book_active"
_TTL_SECONDS = 5.0
_active_cache: tuple[float, str, dict[str, str]] | None = None
_version_data: dict[str, Any] = {}


class PriceBookError(ValueError):
    pass


def datasets() -> dict[str, Path]:
    found = {f"windowcity/{path.stem}": path for path in sorted(WINDOW_DATA.glob("*.json"))}
    found.update({f"doors/{path.stem}": path for path in sorted(DOOR_DATA.glob("*.json"))})
    return found


def file_data(dataset: str) -> Any:
    path = datasets().get(dataset)
    if path is None:
        raise PriceBookError(f"unknown price-book dataset {dataset!r}")
    return json.loads(path.read_text(encoding="utf-8"))


def _database_url() -> str:
    from db.session import get_database_url

    return get_database_url()


def active_versions() -> dict[str, str]:
    """{dataset: version_id} for published imports (cached briefly)."""
    global _active_cache
    now = time.monotonic()
    url = _database_url()
    if _active_cache and _active_cache[1] == url and now - _active_cache[0] < _TTL_SECONDS:
        return _active_cache[2]
    from services.settings_store import get_setting

    value = get_setting(ACTIVE_KEY)
    active = value if isinstance(value, dict) else {}
    _active_cache = (now, url, active)
    return active


def _invalidate() -> None:
    global _active_cache
    _active_cache = None
    from services.settings_store import clear_cache

    clear_cache()


def active_fingerprint() -> str:
    active = active_versions()
    return hashlib.sha256(json.dumps(active, sort_keys=True).encode("utf-8")).hexdigest()[:12]


def load_override(dataset: str) -> Any | None:
    """The published version of a dataset, or None to use the bundled file."""
    version_id = active_versions().get(dataset)
    if not version_id:
        return None
    if version_id not in _version_data:
        from db.models import PriceBookVersion
        from db.session import get_session
        import uuid

        with get_session() as session:
            row = session.get(PriceBookVersion, uuid.UUID(version_id))
            if row is None:
                return None
            _version_data[version_id] = row.data
    return _version_data[version_id]


# ------------------------------------------------------------------ diffing
def _numbers(value: Any, path: str = "") -> dict[str, float]:
    out: dict[str, float] = {}
    if isinstance(value, bool):
        return out
    if isinstance(value, (int, float)):
        out[path] = float(value)
    elif isinstance(value, dict):
        for key, child in value.items():
            if str(key).startswith("source") or key == "raw":
                continue
            out.update(_numbers(child, f"{path}.{key}" if path else str(key)))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            label = index
            if isinstance(child, dict):
                label = child.get("code") or child.get("name") or child.get("id") or index
            out.update(_numbers(child, f"{path}[{label}]"))
    return out


def diff(old: Any, new: Any, *, sample: int = 25) -> dict[str, Any]:
    before, after = _numbers(old), _numbers(new)
    changed = []
    for path in sorted(set(before) & set(after)):
        if abs(before[path] - after[path]) > 1e-9:
            pct = ((after[path] - before[path]) / before[path] * 100.0) if before[path] else None
            changed.append({"path": path, "old": before[path], "new": after[path], "percent": pct})
    percents = [item["percent"] for item in changed if item["percent"] is not None]
    changed.sort(key=lambda item: abs(item["percent"] or 0), reverse=True)
    return {
        "values_compared": len(set(before) & set(after)),
        "changed": len(changed),
        "added": len(set(after) - set(before)),
        "removed": len(set(before) - set(after)),
        "average_change_percent": round(sum(percents) / len(percents), 2) if percents else 0.0,
        "largest_changes": changed[:sample],
    }


def _check_shape(old: Any, new: Any) -> None:
    if type(old) is not type(new):
        raise PriceBookError("the imported file does not have the same structure as the current price book")
    if isinstance(old, dict):
        missing = [key for key in old if key not in new]
        if missing:
            raise PriceBookError(f"the imported file is missing sections: {', '.join(map(str, missing[:8]))}")


def current_data(dataset: str) -> Any:
    override = load_override(dataset)
    return override if override is not None else file_data(dataset)


def create_version(dataset: str, label: str, data: Any) -> dict[str, Any]:
    from db.models import PriceBookVersion
    from db.session import get_session

    current = current_data(dataset)
    _check_shape(current, data)
    summary = diff(current, data)
    with get_session() as session:
        row = PriceBookVersion(dataset=dataset, label=label.strip() or dataset, data=data, summary=summary)
        session.add(row)
        session.flush()
        return _version_dict(row)


def _version_dict(row, active: dict[str, str] | None = None) -> dict[str, Any]:
    active = active if active is not None else active_versions()
    return {
        "id": str(row.id),
        "dataset": row.dataset,
        "label": row.label,
        "summary": row.summary,
        "active": active.get(row.dataset) == str(row.id),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "published_at": row.published_at.isoformat() if row.published_at else None,
    }


def list_versions() -> dict[str, Any]:
    from db.models import PriceBookVersion
    from db.session import get_session

    active = active_versions()
    with get_session() as session:
        rows = session.query(PriceBookVersion).order_by(PriceBookVersion.created_at.desc()).all()
        versions = [_version_dict(row, active) for row in rows]
    return {
        "datasets": [
            {"dataset": name, "file": str(path.relative_to(_ROOT)), "active_version": active.get(name)}
            for name, path in datasets().items()
        ],
        "versions": versions,
    }


def publish(version_id: str) -> dict[str, Any]:
    import uuid
    from datetime import datetime, timezone

    from db.models import PriceBookVersion
    from db.session import get_session
    from services.settings_store import get_setting, set_setting

    with get_session() as session:
        row = session.get(PriceBookVersion, uuid.UUID(version_id))
        if row is None:
            raise PriceBookError("price-book version not found")
        row.published_at = datetime.now(timezone.utc)
        dataset = row.dataset
    active = dict(get_setting(ACTIVE_KEY) or {})
    active[dataset] = version_id
    set_setting(ACTIVE_KEY, active)
    _invalidate()
    return list_versions()


def revert(dataset: str) -> dict[str, Any]:
    from services.settings_store import get_setting, set_setting

    active = dict(get_setting(ACTIVE_KEY) or {})
    active.pop(dataset, None)
    set_setting(ACTIVE_KEY, active)
    _invalidate()
    return list_versions()
