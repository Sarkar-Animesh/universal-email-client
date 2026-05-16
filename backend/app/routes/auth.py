"""OAuth routes.

Flow (Gmail):
1. Client calls `POST /auth/gmail/start` with the redirect URI it wants to use.
2. Server returns `{auth_url, state, code_verifier}`. The client redirects the
   browser to `auth_url` and holds `state` + `code_verifier` in sessionStorage.
3. Google redirects back to the client's redirect URI with `code` + `state`.
4. Client calls `POST /auth/gmail/callback` with `{code, code_verifier, state,
   redirect_uri}`. Server validates state, exchanges code for tokens, returns
   `{tokens, account}`. Client encrypts and stores in IndexedDB.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.core.security import StateError, make_state, verify_state
from app.models import UnifiedAccount
from app.oauth import gmail as gmail_oauth, microsoft as microsoft_oauth
from app.providers.imap import (
    ImapProvider,
    _connect as imap_connect_test,
    _safe_logout as imap_safe_logout,
    encode_token as imap_encode_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class StartGmailIn(BaseModel):
    redirect_uri: str = Field(description="Where Google should redirect after consent.")


class StartGmailOut(BaseModel):
    auth_url: str
    state: str
    code_verifier: str = Field(description="Hold this in sessionStorage until callback.")


class CallbackGmailIn(BaseModel):
    code: str
    code_verifier: str
    state: str
    redirect_uri: str


class TokenBundle(BaseModel):
    access_token: str
    refresh_token: str | None = None
    expires_in: int
    token_type: str
    scope: str


class CallbackGmailOut(BaseModel):
    tokens: TokenBundle
    account: UnifiedAccount


class RefreshIn(BaseModel):
    refresh_token: str


@router.post("/gmail/start", response_model=StartGmailOut)
async def gmail_start(
    body: StartGmailIn,
    settings: Settings = Depends(get_settings),
) -> StartGmailOut:
    if not settings.google_oauth_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server not configured: GOOGLE_OAUTH_CLIENT_ID missing.",
        )
    verifier, challenge = gmail_oauth.make_pkce()
    state = make_state("gmail", settings.token_signing_key)
    url = gmail_oauth.build_auth_url(
        settings,
        state=state,
        code_challenge=challenge,
        redirect_uri=body.redirect_uri,
    )
    return StartGmailOut(auth_url=url, state=state, code_verifier=verifier)


@router.post("/gmail/callback", response_model=CallbackGmailOut)
async def gmail_callback(
    body: CallbackGmailIn,
    settings: Settings = Depends(get_settings),
) -> CallbackGmailOut:
    try:
        payload = verify_state(body.state, settings.token_signing_key)
    except StateError as e:
        raise HTTPException(status_code=400, detail=f"Invalid state: {e}") from e
    if payload["p"] != "gmail":
        raise HTTPException(status_code=400, detail="State provider mismatch.")
    tokens = await gmail_oauth.exchange_code(
        settings,
        code=body.code,
        code_verifier=body.code_verifier,
        redirect_uri=body.redirect_uri,
    )
    account = await gmail_oauth.whoami(tokens["access_token"])
    return CallbackGmailOut(tokens=TokenBundle(**tokens), account=account)


@router.post("/gmail/refresh", response_model=TokenBundle)
async def gmail_refresh(
    body: RefreshIn,
    settings: Settings = Depends(get_settings),
) -> TokenBundle:
    data = await gmail_oauth.refresh_token(settings, refresh_token=body.refresh_token)
    # Google may omit refresh_token in the refresh response; preserve the input
    # one so the client doesn't lose it.
    data.setdefault("refresh_token", body.refresh_token)
    return TokenBundle(**data)


class StartMicrosoftIn(BaseModel):
    redirect_uri: str = Field(description="Where Microsoft should redirect after consent.")


class StartMicrosoftOut(BaseModel):
    auth_url: str
    state: str
    code_verifier: str = Field(description="Hold this in sessionStorage until callback.")


class CallbackMicrosoftIn(BaseModel):
    code: str
    code_verifier: str
    state: str
    redirect_uri: str


class CallbackMicrosoftOut(BaseModel):
    tokens: TokenBundle
    account: UnifiedAccount


@router.post("/microsoft/start", response_model=StartMicrosoftOut)
async def microsoft_start(
    body: StartMicrosoftIn,
    settings: Settings = Depends(get_settings),
) -> StartMicrosoftOut:
    if not settings.microsoft_oauth_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Server not configured: MICROSOFT_OAUTH_CLIENT_ID missing.",
        )
    verifier, challenge = microsoft_oauth.make_pkce()
    state = make_state("microsoft", settings.token_signing_key)
    url = microsoft_oauth.build_auth_url(
        settings,
        state=state,
        code_challenge=challenge,
        redirect_uri=body.redirect_uri,
    )
    return StartMicrosoftOut(auth_url=url, state=state, code_verifier=verifier)


@router.post("/microsoft/callback", response_model=CallbackMicrosoftOut)
async def microsoft_callback(
    body: CallbackMicrosoftIn,
    settings: Settings = Depends(get_settings),
) -> CallbackMicrosoftOut:
    try:
        payload = verify_state(body.state, settings.token_signing_key)
    except StateError as e:
        raise HTTPException(status_code=400, detail=f"Invalid state: {e}") from e
    if payload["p"] != "microsoft":
        raise HTTPException(status_code=400, detail="State provider mismatch.")
    tokens = await microsoft_oauth.exchange_code(
        settings,
        code=body.code,
        code_verifier=body.code_verifier,
        redirect_uri=body.redirect_uri,
    )
    account = await microsoft_oauth.whoami(tokens["access_token"])
    return CallbackMicrosoftOut(tokens=TokenBundle(**tokens), account=account)


@router.post("/microsoft/refresh", response_model=TokenBundle)
async def microsoft_refresh(
    body: RefreshIn,
    settings: Settings = Depends(get_settings),
) -> TokenBundle:
    data = await microsoft_oauth.refresh_token(settings, refresh_token=body.refresh_token)
    # Microsoft always returns a new refresh_token; use it (don't preserve old one)
    return TokenBundle(**data)


# ---------- IMAP (app-password) ----------


class ImapConnectIn(BaseModel):
    email: str
    password: str = Field(description="App-password (Yahoo/AOL) or account password.")
    host: str
    port: int = 993
    smtp_host: str
    smtp_port: int = 465


class ImapConnectOut(BaseModel):
    tokens: TokenBundle
    account: UnifiedAccount


@router.post("/imap/connect", response_model=ImapConnectOut)
async def imap_connect(body: ImapConnectIn) -> ImapConnectOut:
    creds = {
        "host": body.host,
        "port": body.port,
        "username": body.email,
        "password": body.password,
        "smtp_host": body.smtp_host,
        "smtp_port": body.smtp_port,
        "ssl": True,
    }
    token = imap_encode_token(creds)
    # Validate by actually connecting and logging in
    try:
        client = await imap_connect_test(creds)
        await imap_safe_logout(client)
        account = await ImapProvider().whoami(token)
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"IMAP login failed: {e}"
        ) from e
    return ImapConnectOut(
        tokens=TokenBundle(
            access_token=token,
            refresh_token=None,
            expires_in=60 * 60 * 24 * 365,  # IMAP creds don't expire
            token_type="imap",
            scope="imap",
        ),
        account=account,
    )
