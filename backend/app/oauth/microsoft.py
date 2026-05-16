"""Microsoft Entra ID OAuth (Authorization Code + PKCE).

Two endpoints expose this:
- `/auth/microsoft/start` builds the auth URL with PKCE challenge + signed state.
- `/auth/microsoft/callback` exchanges the code for tokens and hands them back to
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
from app.providers.microsoft import MicrosoftProvider


def _auth_url(tenant: str) -> str:
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"


def _token_url(tenant: str) -> str:
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"


SCOPES = " ".join(
    [
        "Mail.ReadWrite",
        "Mail.Send",
        "offline_access",
        "User.Read",
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


def build_auth_url(
    settings: Settings, *, state: str, code_challenge: str, redirect_uri: str
) -> str:
    tenant = settings.microsoft_oauth_tenant or "common"
    params = {
        "client_id": settings.microsoft_oauth_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
    }
    return f"{_auth_url(tenant)}?{urlencode(params)}"


async def exchange_code(
    settings: Settings,
    *,
    code: str,
    code_verifier: str,
    redirect_uri: str,
    client: httpx.AsyncClient | None = None,
) -> dict:
    """Exchange the auth code for tokens. Returns the raw token response, which
    contains `access_token`, `refresh_token`, `expires_in`, `token_type`, `scope`.
    The route returns this to the client unchanged (over HTTPS), where it gets
    encrypted with WebCrypto before IndexedDB storage.
    """
    tenant = settings.microsoft_oauth_tenant or "common"
    payload = {
        "code": code,
        "client_id": settings.microsoft_oauth_client_id,
        "client_secret": settings.microsoft_oauth_client_secret,
        "code_verifier": code_verifier,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    c = client or httpx.AsyncClient(timeout=15.0)
    try:
        r = await c.post(_token_url(tenant), data=payload)
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
    """Refresh the access token. Microsoft always returns a new refresh_token in
    the response — do NOT preserve the old one."""
    tenant = settings.microsoft_oauth_tenant or "common"
    payload = {
        "client_id": settings.microsoft_oauth_client_id,
        "client_secret": settings.microsoft_oauth_client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
        "scope": SCOPES,
    }
    c = client or httpx.AsyncClient(timeout=15.0)
    try:
        r = await c.post(_token_url(tenant), data=payload)
        if not r.is_success:
            raise RuntimeError(f"Token refresh failed: {r.status_code} {r.text}")
        return r.json()
    finally:
        if client is None:
            await c.aclose()


async def whoami(access_token: str) -> UnifiedAccount:
    """Convenience: fetch the account record after exchanging a code."""
    return await MicrosoftProvider().whoami(access_token)
