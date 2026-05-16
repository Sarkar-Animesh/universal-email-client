"""Security helpers.

- `make_state` / `verify_state`: HMAC-signed OAuth state parameter.
- `account_id_hash`: HMAC of a provider+account-id for safe-to-log identifiers.
- `Bearer` dependency: extracts the access token from `Authorization: Bearer X`.

We never persist tokens. Tokens flow through `Authorization` headers per
request and live only in request scope.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException, status


class StateError(ValueError):
    pass


def _b64url_encode(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def make_state(provider: str, signing_key: str, *, ttl_s: int = 600) -> str:
    """Produce an HMAC-signed OAuth `state` parameter.

    Payload carries provider id, a 192-bit nonce, and an issue timestamp. The
    verifier checks signature + TTL. No server-side storage required.
    """
    payload = {
        "p": provider,
        "n": secrets.token_urlsafe(24),
        "t": int(time.time()),
        "ttl": ttl_s,
    }
    body = json.dumps(payload, separators=(",", ":")).encode()
    sig = hmac.new(signing_key.encode(), body, hashlib.sha256).digest()
    return _b64url_encode(body) + "." + _b64url_encode(sig)


def verify_state(state: str, signing_key: str) -> dict:
    try:
        body_b64, sig_b64 = state.split(".", 1)
        body = _b64url_decode(body_b64)
        sig = _b64url_decode(sig_b64)
    except (ValueError, base64.binascii.Error) as e:
        raise StateError("malformed state") from e

    expected = hmac.new(signing_key.encode(), body, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise StateError("bad state signature")
    payload = json.loads(body)
    ttl = payload.get("ttl", 600)
    if time.time() - payload["t"] > ttl:
        raise StateError("stale state")
    return payload


def account_id_hash(provider: str, native_account_id: str, signing_key: str) -> str:
    """Stable but non-reversible identifier safe to log."""
    msg = f"{provider}|{native_account_id}".encode()
    return hmac.new(signing_key.encode(), msg, hashlib.sha256).hexdigest()[:24]


@dataclass(slots=True, frozen=True)
class BearerToken:
    raw: str


def bearer_token(authorization: str | None = Header(default=None)) -> BearerToken:
    """FastAPI dependency: parses Authorization: Bearer <token>."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return BearerToken(raw=authorization[7:].strip())
