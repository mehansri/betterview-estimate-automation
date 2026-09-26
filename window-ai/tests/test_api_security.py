"""Shared-token access control on the deployed API (api/security.py)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.main_vercel import app

client = TestClient(app)


def test_health_stays_open(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_ACCESS_TOKEN", "secret-token")
    assert client.get("/health").status_code == 200


def test_requests_without_the_token_are_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_ACCESS_TOKEN", "secret-token")
    assert client.get("/api/quotes/sales-presets").status_code == 401
    assert client.get("/api/quotes/sales-presets", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/api/quotes/sales-presets", headers={"Authorization": "Basic c2VjcmV0LXRva2Vu"}).status_code == 401


def test_the_token_grants_access(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_ACCESS_TOKEN", "secret-token")
    response = client.get("/api/quotes/sales-presets", headers={"Authorization": "Bearer secret-token"})
    assert response.status_code == 200
    assert response.json()["presets"]


def test_a_deployment_without_a_token_refuses_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_ACCESS_TOKEN", raising=False)
    monkeypatch.setenv("VERCEL", "1")
    assert client.get("/api/quotes/sales-presets").status_code == 503


def test_local_development_without_a_token_stays_open(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)
    assert client.get("/api/quotes/sales-presets").status_code == 200
