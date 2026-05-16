"""Mail routes.

Each route picks a provider via the `provider` header/query and dispatches to
the registry. Tokens come in via `Authorization: Bearer ...`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

from app.core.security import BearerToken, bearer_token
from app.models import (
    ProviderId,
    SendRequest,
    ThreadDetail,
    ThreadListPage,
    UnifiedAccount,
)
from app.providers import (
    AuthExpiredError,
    ProviderError,
    ProviderUnsupportedError,
    get_provider,
)

router = APIRouter(prefix="/mail", tags=["mail"])


def _provider_header(x_mail_provider: str = Header(...)) -> ProviderId:
    if x_mail_provider not in {"gmail", "microsoft", "imap"}:
        raise HTTPException(400, "Invalid X-Mail-Provider header.")
    return x_mail_provider  # type: ignore[return-value]


async def _safe_call(coro):
    try:
        return await coro
    except AuthExpiredError as e:
        raise HTTPException(401, "Access token expired; refresh required.") from e
    except ProviderUnsupportedError as e:
        raise HTTPException(501, str(e)) from e
    except ProviderError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/whoami", response_model=UnifiedAccount)
async def whoami(
    provider: ProviderId = Depends(_provider_header),
    token: BearerToken = Depends(bearer_token),
) -> UnifiedAccount:
    return await _safe_call(get_provider(provider).whoami(token.raw))


@router.get("/threads", response_model=ThreadListPage)
async def list_threads(
    provider: ProviderId = Depends(_provider_header),
    token: BearerToken = Depends(bearer_token),
    label: str = Query("inbox"),
    cursor: str | None = Query(None),
    page_size: int = Query(50, ge=1, le=100),
    account_id: str = Query("unknown"),
) -> ThreadListPage:
    return await _safe_call(
        get_provider(provider).list_threads(
            token.raw, label=label, cursor=cursor, page_size=page_size, account_id=account_id
        )
    )


@router.get("/threads/{thread_id}", response_model=ThreadDetail)
async def get_thread(
    thread_id: str,
    provider: ProviderId = Depends(_provider_header),
    token: BearerToken = Depends(bearer_token),
    account_id: str = Query("unknown"),
) -> ThreadDetail:
    return await _safe_call(
        get_provider(provider).get_thread(token.raw, thread_id, account_id=account_id)
    )


class SendResponse(BaseModel):
    message_id: str


@router.post("/send", response_model=SendResponse)
async def send(
    body: SendRequest,
    provider: ProviderId = Depends(_provider_header),
    token: BearerToken = Depends(bearer_token),
) -> SendResponse:
    msg_id = await _safe_call(get_provider(provider).send(token.raw, body))
    return SendResponse(message_id=msg_id)


class LabelsIn(BaseModel):
    add: list[str] = []
    remove: list[str] = []


@router.post("/threads/{thread_id}/labels")
async def modify_labels(
    thread_id: str,
    body: LabelsIn,
    provider: ProviderId = Depends(_provider_header),
    token: BearerToken = Depends(bearer_token),
) -> dict[str, bool]:
    await _safe_call(
        get_provider(provider).modify_labels(
            token.raw, thread_id, add=body.add, remove=body.remove
        )
    )
    return {"ok": True}


@router.post("/threads/{thread_id}/archive")
async def archive(
    thread_id: str,
    provider: ProviderId = Depends(_provider_header),
    token: BearerToken = Depends(bearer_token),
) -> dict[str, bool]:
    await _safe_call(get_provider(provider).archive(token.raw, thread_id))
    return {"ok": True}


@router.post("/threads/{thread_id}/trash")
async def trash(
    thread_id: str,
    provider: ProviderId = Depends(_provider_header),
    token: BearerToken = Depends(bearer_token),
) -> dict[str, bool]:
    await _safe_call(get_provider(provider).trash(token.raw, thread_id))
    return {"ok": True}


@router.get("/search", response_model=ThreadListPage)
async def search(
    q: str = Query(..., min_length=1, max_length=500),
    provider: ProviderId = Depends(_provider_header),
    token: BearerToken = Depends(bearer_token),
    cursor: str | None = Query(None),
    page_size: int = Query(50, ge=1, le=100),
) -> ThreadListPage:
    return await _safe_call(
        get_provider(provider).search(
            token.raw, q, cursor=cursor, page_size=page_size
        )
    )
