"""Startup helpers shared by the full and Vercel API entrypoints."""
from __future__ import annotations

import os

from utils.logging import get_logger

logger = get_logger("windowai.api")


def cors_options() -> dict:
    """CORS from ALLOWED_ORIGINS (comma-separated); '*' when unset.

    The frontend normally reaches the API through its own same-origin proxy,
    so production deployments can safely restrict this to the app's origin.
    """
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()] or ["*"]
    return {
        "allow_origins": origins,
        # Browsers reject credentialed wildcard CORS, so only allow credentials
        # when explicit origins are configured.
        "allow_credentials": origins != ["*"],
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }


def ensure_database() -> None:
    """Create new tables/columns so upgrades need no manual migration step."""
    try:
        from db.init_db import init_db

        init_db()
    except Exception as exc:  # never block startup; requests will surface the error
        logger.warning("database initialization skipped: %s", exc)
