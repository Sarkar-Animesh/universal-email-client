"""Smoke tests for the auth routes via FastAPI TestClient."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_gmail_start_requires_configured_client_id(client: TestClient, monkeypatch):
    # In the default test settings, the client id is empty, so /auth/gmail/start
    # should return 503 — that's the explicit configuration check.
    r = client.post(
        "/auth/gmail/start",
        json={"redirect_uri": "http://localhost:3000/auth/gmail/callback"},
    )
    assert r.status_code == 503
    assert "GOOGLE_OAUTH_CLIENT_ID" in r.json()["detail"]


def test_gmail_callback_rejects_bad_state(client: TestClient):
    r = client.post(
        "/auth/gmail/callback",
        json={
            "code": "abc",
            "code_verifier": "def",
            "state": "garbage.notvalid",
            "redirect_uri": "http://localhost:3000/auth/gmail/callback",
        },
    )
    assert r.status_code == 400
    assert "Invalid state" in r.json()["detail"]
