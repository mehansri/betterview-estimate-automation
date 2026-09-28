"""Shared manager/admin authorization for configuration changes."""
from __future__ import annotations

import os
import secrets

from fastapi import HTTPException


def require_pricing_admin(token: str | None) -> None:
    expected_token = os.getenv("PRICING_ADMIN_TOKEN")
    if not expected_token or not token or not secrets.compare_digest(token, expected_token):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "manager_authorization_required",
                "message": "A manager/admin token is required to change pricing settings.",
            },
        )
