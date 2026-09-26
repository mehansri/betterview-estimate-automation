"""Shared-secret access control for the API.

Every router except /health requires ``Authorization: Bearer <API_ACCESS_TOKEN>``.
The Next.js frontend adds the header server-side (frontend/middleware.ts) and
the Better View CRM sends it as ESTIMATOR_API_TOKEN, so browsers never hold it.

Without API_ACCESS_TOKEN the API stays open only for local development; on a
Vercel deployment it refuses every request rather than run unprotected.
"""
from __future__ import annotations

import hmac
import os

from fastapi import Header, HTTPException


def require_api_token(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("API_ACCESS_TOKEN", "")
    if not expected:
        if os.getenv("VERCEL"):
            raise HTTPException(status_code=503, detail="API access token is not configured")
        return
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(token.strip().encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized", headers={"WWW-Authenticate": "Bearer"})
