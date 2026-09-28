"""Business settings stored in the database, with file defaults as fallback.

Settings live in the ``app_settings`` table so they persist on read-only
hosts (Vercel) and are shared by every API instance. Reads are cached briefly;
when no database is reachable (unit tests, scripts) callers get ``None`` and
fall back to their bundled JSON defaults.
"""
from __future__ import annotations

import copy
import time
from typing import Any

from utils.logging import get_logger

logger = get_logger("windowai.settings")

_TTL_SECONDS = 5.0
_cache: dict[tuple[str, str], tuple[float, Any]] = {}


def _cache_key(key: str) -> tuple[str, str]:
    from db.session import get_database_url

    return (get_database_url(), key)


def clear_cache() -> None:
    _cache.clear()


def get_setting(key: str) -> Any | None:
    now = time.monotonic()
    hit = _cache.get(_cache_key(key))
    if hit and now - hit[0] < _TTL_SECONDS:
        return copy.deepcopy(hit[1])
    value = None
    try:
        from db.models import AppSetting
        from db.session import database_available, get_session

        if not database_available():
            _cache[_cache_key(key)] = (now, None)
            return None
        with get_session() as session:
            row = session.get(AppSetting, key)
            value = copy.deepcopy(row.value) if row is not None else None
    except Exception as exc:  # no database, or tables not created yet
        logger.debug("setting %s unavailable from database: %s", key, exc)
        value = None
    _cache[_cache_key(key)] = (now, value)
    return copy.deepcopy(value)


def set_setting(key: str, value: Any) -> Any:
    from datetime import datetime, timezone

    from db.models import AppSetting
    from db.session import get_session

    with get_session() as session:
        row = session.get(AppSetting, key)
        if row is None:
            session.add(AppSetting(key=key, value=value))
        else:
            row.value = value
            row.updated_at = datetime.now(timezone.utc)
    _cache.pop(_cache_key(key), None)
    return value
