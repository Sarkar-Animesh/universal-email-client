---
name: oauth-pkce
description: Use when implementing or debugging OAuth Authorization Code + PKCE flows for Gmail or Microsoft Graph in this project — generating the code verifier/challenge, building the auth URL, validating the state HMAC on callback, exchanging code for tokens, refreshing. Skip for non-OAuth auth (app passwords, basic auth).
---

# OAuth + PKCE Skill

## Why PKCE even with a backend client_secret?
- Defense in depth. The backend still uses the secret for token exchange, but
  PKCE means a stolen `code` is useless without the verifier.
- Required by Microsoft for SPAs; required by Google for desktop/mobile; works
  fine for web too.

## State parameter (CSRF)
Never use a bare nonce. We HMAC the nonce so the callback can verify it
originated from us without server-side storage:

```python
import hmac, hashlib, base64, json, secrets, time

def make_state(provider: str, signing_key: bytes) -> str:
    payload = {"p": provider, "n": secrets.token_urlsafe(24), "t": int(time.time())}
    body = json.dumps(payload, separators=(",", ":")).encode()
    sig = hmac.new(signing_key, body, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(body + b"." + sig).decode().rstrip("=")

def verify_state(state: str, signing_key: bytes, max_age_s: int = 600) -> dict:
    raw = base64.urlsafe_b64decode(state + "==")
    body, sig = raw.rsplit(b".", 1)
    expected = hmac.new(signing_key, body, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("bad state signature")
    p = json.loads(body)
    if time.time() - p["t"] > max_age_s:
        raise ValueError("stale state")
    return p
```

## Code verifier / challenge
```python
import secrets, hashlib, base64

def make_pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)   # 43-128 chars after b64url
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).decode().rstrip("=")
    return verifier, challenge
```

## Endpoints (current as of 2026)
| | Gmail | Microsoft |
| --- | --- | --- |
| Auth | `https://accounts.google.com/o/oauth2/v2/auth` | `https://login.microsoftonline.com/common/oauth2/v2.0/authorize` |
| Token | `https://oauth2.googleapis.com/token` | `https://login.microsoftonline.com/common/oauth2/v2.0/token` |
| Scope (mail) | `https://www.googleapis.com/auth/gmail.modify` | `Mail.ReadWrite Mail.Send offline_access` |
| Offline access | `access_type=offline&prompt=consent` | `offline_access` scope |

## Refresh
- Gmail: POST token endpoint with `grant_type=refresh_token` + the refresh token.
  Refresh token is long-lived; access token TTL ~1h.
- Microsoft: same shape. Refresh tokens rotate — *the response includes a new
  refresh_token*. You must store the new one or future refreshes will fail.

## Don't
- Don't log the `code`, `access_token`, or `refresh_token`. Ever.
- Don't store the verifier server-side (we're stateless). Return it to the
  client to hold for the callback round-trip, encrypted via WebCrypto.
- Don't use the implicit flow. Anywhere.
