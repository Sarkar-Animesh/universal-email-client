"""Gmail OAuth (Authorization Code + PKCE).

Two endpoints expose this:
- `/auth/gmail/start` builds the auth URL with PKCE challenge + signed state.
- `/auth/gmail/callback` exchanges the code for tokens and hands them back to
  the client to encrypt and store. Tokens never persist server-side.
"""
from __future__ import annotations

import base64
import hashlib
import secrets
from urllib.parse import urlencode

import httpx

from app.core.config import Settings
from app.models import UnifiedAccount
from app.providers.gmail import GmailProvider

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105
SCOPES = " ".join(
    [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/userinfo.email",
        "openid",
    ]
)


def make_pkce() -> tuple[str, str]:
    """Return (verifier, challenge) per RFC 7636. Verifier is returned to the
    client (over HTTPS) and stored in `sessionStorage` until the callback."""
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    return verifier, challenge


def build_auth_url(settings: Settings, *, state: str, code_challenge: str, redirect_uri: str) -> str:
    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


async def exchange_code(
    settings: Settings,
    *,
    code: str,
    code_verifier: str,
    redirect_uri: str,
    client: httpx.AsyncClient | None = None,
) -> dict:
    """Exchange the auth code for tokens. Returns the raw token response, which
    contains `access_token`, `refresh_token`, `expires_in`, `id_token`, `scope`,
    `token_type`. The route returns this to the client unchanged (over HTTPS),
    where it gets encrypted with WebCrypto before IndexedDB storage.
    """
    payload = {
        "code": code,
        "client_id": settings.google_oauth_client_id,
        "client_secret": settings.google_oauth_client_secret,
        "code_verifier": code_verifier,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    c = client or httpx.AsyncClient(timeout=15.0)
    try:
        r = await c.post(TOKEN_URL, data=payload)
        r.raise_for_status()
        return r.json()
    finally:
        if client is None:
            await c.aclose()


async def refresh_token(
    settings: Settings,
    *,
    refresh_token: str,
    client: httpx.AsyncClient | None = None,
) -> dict:
    payload = {
        "client_id": settings.google_oauth_client_id,
        "client_secret": settings.google_oauth_client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    c = client or httpx.AsyncClient(timeout=15.0)
    try:
        r = await c.post(TOKEN_URL, data=payload)
        r.raise_for_status()
        return r.json()
    finally:
        if client is None:
            await c.aclose()


async def whoami(access_token: str) -> UnifiedAccount:
    """Convenience: fetch the account record after exchanging a code."""
    return await GmailProvider().whoami(access_token)
