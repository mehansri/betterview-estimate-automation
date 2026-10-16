"""API access control.

``require_api_token``: every router except /health and the token-addressed
customer portal requires ``Authorization: Bearer <API_ACCESS_TOKEN>``.
The Next.js frontend adds the header server-side (frontend/middleware.ts) and
the Better View CRM sends it as ESTIMATOR_API_TOKEN, so browsers never hold it.
Without API_ACCESS_TOKEN the API stays open only for local development; on a
Vercel deployment it refuses every request rather than run unprotected.

``require_pricing_admin``: shared manager/admin authorization for
configuration changes; off while PRICING_ADMIN_TOKEN is unset.
"""
from __future__ import annotations

import hmac
import os
import secrets

from fastapi import Header, HTTPException


def require_api_token(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("API_ACCESS_TOKEN", "").strip()
    if not expected:
        if os.getenv("VERCEL"):
            raise HTTPException(status_code=503, detail="API access token is not configured")
        return
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.strip().encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized", headers={"WWW-Authenticate": "Bearer"})


def manager_token_configured() -> bool:
    """True when PRICING_ADMIN_TOKEN is set; without it the manager check is off."""
    return bool(os.getenv("PRICING_ADMIN_TOKEN", "").strip())


def manager_authorized(token: str | None) -> bool:
    """True when the manager check is off or ``token`` matches PRICING_ADMIN_TOKEN.

    The manager token is off while PRICING_ADMIN_TOKEN is unset (owner's
    decision 2026-10-15, app in testing): settings saves and discount overrides
    go through without one. Setting the variable turns the check back on.
    """
    expected_token = os.getenv("PRICING_ADMIN_TOKEN", "").strip()
    if not expected_token:
        return True
    return bool(token) and secrets.compare_digest(token.strip().encode(), expected_token.encode())


def require_pricing_admin(token: str | None) -> None:
    if not manager_authorized(token):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "manager_authorization_required",
                "message": "A manager/admin token is required to change pricing settings.",
            },
        )
