"""API access control.

``require_api_token``: every router except /health and the token-addressed
customer portal requires ``Authorization: Bearer <API_ACCESS_TOKEN>``.
The Next.js frontend adds the header server-side (frontend/middleware.ts) and
the Better View CRM sends it as ESTIMATOR_API_TOKEN, so browsers never hold it.
Without API_ACCESS_TOKEN the API stays open only for local development; on a
Vercel deployment it refuses every request rather than run unprotected.

``require_pricing_admin``: shared manager/admin authorization for
configuration changes.
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
    """True when PRICING_ADMIN_TOKEN is set; without it no manager token is accepted."""
    return bool(os.getenv("PRICING_ADMIN_TOKEN", "").strip())


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
