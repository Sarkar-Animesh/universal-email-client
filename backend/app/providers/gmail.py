"""Gmail provider implementation.

Reference: https://developers.google.com/gmail/api/reference/rest

Mapping rules (all pure functions, all tested in tests/providers/test_gmail.py):
- System labels: lowercase, strip `CATEGORY_` prefix for unified labels.
- Flags: derived from labels (`UNREAD`, `STARRED`, `IMPORTANT`).
- Bodies: walk parts recursively, base64url-decode `body.data`.
"""
from __future__ import annotations

import base64
from datetime import UTC, datetime
from email.utils import parseaddr
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.security import account_id_hash
from app.models import (
    Attachment,
    EmailAddress,
    MessageFlags,
    SendRequest,
    ThreadDetail,
    ThreadFlags,
    ThreadListPage,
    UnifiedAccount,
    UnifiedMessage,
    UnifiedThread,
)
from app.providers.base import AuthExpiredError, MailProvider, ProviderError

GMAIL_API = "https://gmail.googleapis.com/gmail/v1"


class GmailProvider(MailProvider):
    provider_id = "gmail"

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(timeout=20.0)

    async def _get(self, path: str, token: str, params: dict | None = None) -> dict[str, Any]:
        r = await self._client.get(
            f"{GMAIL_API}{path}",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
        )
        return _check(r)

    async def _post(self, path: str, token: str, json: dict[str, Any]) -> dict[str, Any]:
        r = await self._client.post(
            f"{GMAIL_API}{path}",
            headers={"Authorization": f"Bearer {token}"},
            json=json,
        )
        return _check(r)

    async def whoami(self, access_token: str) -> UnifiedAccount:
        data = await self._get("/users/me/profile", access_token)
        email = data["emailAddress"]
        return UnifiedAccount(
            id=account_id_hash("gmail", email, get_settings().token_signing_key),
            provider="gmail",
            email=email,
            display_name=email.split("@")[0],
        )

    async def list_threads(
        self,
        access_token: str,
        *,
        label: str = "inbox",
        cursor: str | None = None,
        page_size: int = 50,
        account_id: str = "unknown",
    ) -> ThreadListPage:
        params: dict[str, Any] = {
            "labelIds": label.upper(),
            "maxResults": page_size,
        }
        if cursor:
            params["pageToken"] = cursor
        data = await self._get("/users/me/threads", access_token, params=params)
        ids = [t["id"] for t in data.get("threads", [])]
        threads: list[UnifiedThread] = []
        for tid in ids:
            detail = await self._get(
                f"/users/me/threads/{tid}",
                access_token,
                params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
            )
            detail["_account_id"] = account_id
            threads.append(_thread_meta_to_unified(detail))
        return ThreadListPage(threads=threads, next_cursor=data.get("nextPageToken"))

    async def get_thread(
        self, access_token: str, thread_id: str, *, account_id: str = "unknown"
    ) -> ThreadDetail:
        native_id = _native_id(thread_id)
        data = await self._get(
            f"/users/me/threads/{native_id}",
            access_token,
            params={"format": "full"},
        )
        data["_account_id"] = account_id
        return _thread_full_to_unified(data)

    async def send(self, access_token: str, request: SendRequest) -> str:
        raw = _build_rfc822(request)
        encoded = base64.urlsafe_b64encode(raw).decode().rstrip("=")
        body: dict[str, Any] = {"raw": encoded}
        if request.thread_id:
            body["threadId"] = _native_id(request.thread_id)
        data = await self._post("/users/me/messages/send", access_token, body)
        return data["id"]

    async def modify_labels(
        self,
        access_token: str,
        thread_id: str,
        *,
        add: list[str] | None = None,
        remove: list[str] | None = None,
    ) -> None:
        await self._post(
            f"/users/me/threads/{_native_id(thread_id)}/modify",
            access_token,
            {"addLabelIds": add or [], "removeLabelIds": remove or []},
        )

    async def archive(self, access_token: str, thread_id: str) -> None:
        await self.modify_labels(access_token, thread_id, remove=["INBOX"])

    async def trash(self, access_token: str, thread_id: str) -> None:
        await self._post(f"/users/me/threads/{_native_id(thread_id)}/trash", access_token, {})

    async def search(
        self,
        access_token: str,
        query: str,
        *,
        cursor: str | None = None,
        page_size: int = 50,
    ) -> ThreadListPage:
        params: dict[str, Any] = {"q": query, "maxResults": page_size}
        if cursor:
            params["pageToken"] = cursor
        data = await self._get("/users/me/threads", access_token, params=params)
        ids = [t["id"] for t in data.get("threads", [])]
        threads: list[UnifiedThread] = []
        for tid in ids:
            detail = await self._get(
                f"/users/me/threads/{tid}",
                access_token,
                params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
            )
            threads.append(_thread_meta_to_unified(detail))
        return ThreadListPage(threads=threads, next_cursor=data.get("nextPageToken"))


# ---------- helpers ----------

def _native_id(prefixed_id: str) -> str:
    """Strip the '{account_id}:' prefix to recover the raw Gmail ID."""
    return prefixed_id.split(":", 1)[-1] if ":" in prefixed_id else prefixed_id


# ---------- mappers (pure) ----------

def _check(r: httpx.Response) -> dict[str, Any]:
    if r.status_code == 401:
        raise AuthExpiredError("Gmail access token expired or invalid.")
    if r.status_code >= 400:
        raise ProviderError(f"Gmail {r.status_code}: {r.text[:300]}")
    return r.json() if r.content else {}


def _normalize_label(raw: str) -> str:
    lower = raw.lower()
    if lower.startswith("category_"):
        lower = lower[len("category_"):]
    return lower


def _addr(raw: str | None) -> EmailAddress | None:
    if not raw:
        return None
    name, addr = parseaddr(raw)
    if not addr:
        return None
    return EmailAddress(address=addr, name=name or None)


def _addrs(raw: str | None) -> list[EmailAddress]:
    if not raw:
        return []
    out: list[EmailAddress] = []
    for chunk in raw.split(","):
        a = _addr(chunk.strip())
        if a:
            out.append(a)
    return out


def _header(headers: list[dict[str, str]], name: str) -> str | None:
    nl = name.lower()
    for h in headers:
        if h.get("name", "").lower() == nl:
            return h.get("value")
    return None


def _walk_parts(part: dict[str, Any]):
    if part.get("parts"):
        for p in part["parts"]:
            yield from _walk_parts(p)
    else:
        yield part


def _decode_body(part: dict[str, Any]) -> str | None:
    data = part.get("body", {}).get("data")
    if not data:
        return None
    pad = "=" * (-len(data) % 4)
    try:
        return base64.urlsafe_b64decode(data + pad).decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return None


def _extract_bodies(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    html: str | None = None
    text: str | None = None
    for part in _walk_parts(payload):
        mime = part.get("mimeType", "")
        if mime == "text/html" and html is None:
            html = _decode_body(part)
        elif mime == "text/plain" and text is None:
            text = _decode_body(part)
    return html, text


def _extract_attachments(payload: dict[str, Any]) -> list[Attachment]:
    out: list[Attachment] = []
    for part in _walk_parts(payload):
        body = part.get("body", {})
        att_id = body.get("attachmentId")
        if not att_id:
            continue
        filename = part.get("filename") or "attachment"
        out.append(
            Attachment(
                id=att_id,
                filename=filename,
                mime_type=part.get("mimeType", "application/octet-stream"),
                size_bytes=int(body.get("size", 0)),
                inline=_header(part.get("headers", []), "content-disposition")
                is not None
                and "inline" in (_header(part.get("headers", []), "content-disposition") or "").lower(),
                content_id=_header(part.get("headers", []), "content-id"),
            )
        )
    return out


def _message_to_unified(msg: dict[str, Any], account_id: str) -> UnifiedMessage:
    payload = msg.get("payload", {})
    headers = payload.get("headers", [])
    label_ids: list[str] = msg.get("labelIds", [])
    flags = MessageFlags(
        unread="UNREAD" in label_ids,
        starred="STARRED" in label_ids,
        important="IMPORTANT" in label_ids,
        has_attachments=any(
            p.get("body", {}).get("attachmentId") for p in _walk_parts(payload)
        ),
    )
    html, text = _extract_bodies(payload)
    references_raw = _header(headers, "References") or ""
    references = [r.strip() for r in references_raw.split() if r.strip()]
    from_ = _addr(_header(headers, "From")) or EmailAddress(address="unknown@unknown")
    date_raw = msg.get("internalDate")
    when = (
        datetime.fromtimestamp(int(date_raw) / 1000.0, tz=UTC)
        if date_raw
        else datetime.now(tz=UTC)
    )
    return UnifiedMessage.model_validate(
        {
            "id": f"{account_id}:{msg['id']}",
            "thread_id": f"{account_id}:{msg['threadId']}",
            "account_id": account_id,
            "from": from_.model_dump(),
            "to": [a.model_dump() for a in _addrs(_header(headers, "To"))],
            "cc": [a.model_dump() for a in _addrs(_header(headers, "Cc"))],
            "bcc": [a.model_dump() for a in _addrs(_header(headers, "Bcc"))],
            "reply_to": [a.model_dump() for a in _addrs(_header(headers, "Reply-To"))],
            "subject": _header(headers, "Subject") or "",
            "snippet": (msg.get("snippet") or "")[:200],
            "body_html": html,
            "body_text": text,
            "date": when,
            "labels": [_normalize_label(l) for l in label_ids],
            "flags": flags.model_dump(),
            "in_reply_to": _header(headers, "In-Reply-To"),
            "references": references,
            "attachments": [a.model_dump() for a in _extract_attachments(payload)],
        }
    )


def _thread_full_to_unified(data: dict[str, Any]) -> ThreadDetail:
    # account_id is reconstructed from each message; all messages in a thread
    # share an account so use the first.
    account_id = "unknown"
    messages_raw = data.get("messages", [])
    if messages_raw:
        # Gmail does not return account email in thread payload; we let the
        # route layer inject it via the path-level whoami. For unit tests, the
        # mapper accepts an account_id passed externally.
        account_id = data.get("_account_id", "unknown")  # set by route
    msgs = [_message_to_unified(m, account_id) for m in messages_raw]
    return ThreadDetail(
        thread=_summary_from_messages(data["id"], account_id, msgs),
        messages=msgs,
    )


def _thread_meta_to_unified(data: dict[str, Any]) -> UnifiedThread:
    account_id = data.get("_account_id", "unknown")
    msgs_raw = data.get("messages", [])
    msgs = [_message_to_unified(m, account_id) for m in msgs_raw]
    return _summary_from_messages(data["id"], account_id, msgs)


def _summary_from_messages(
    thread_id: str, account_id: str, msgs: list[UnifiedMessage]
) -> UnifiedThread:
    if not msgs:
        return UnifiedThread(
            id=f"{account_id}:{thread_id}",
            account_id=account_id,
            last_message_date=datetime.now(tz=UTC),
        )
    participants: dict[str, EmailAddress] = {}
    labels: set[str] = set()
    has_unread = False
    has_starred = False
    has_attachments = False
    for m in msgs:
        participants[m.from_.address] = m.from_
        for a in m.to + m.cc:
            participants[a.address] = a
        labels.update(m.labels)
        has_unread = has_unread or m.flags.unread
        has_starred = has_starred or m.flags.starred
        has_attachments = has_attachments or m.flags.has_attachments
    last = max(msgs, key=lambda m: m.date)
    return UnifiedThread(
        id=f"{account_id}:{thread_id}",
        account_id=account_id,
        subject=msgs[0].subject,
        participants=list(participants.values()),
        message_count=len(msgs),
        last_message_date=last.date,
        labels=sorted(labels),
        flags=ThreadFlags(
            has_unread=has_unread,
            has_starred=has_starred,
            has_attachments=has_attachments,
        ),
        snippet=last.snippet,
    )


def _build_rfc822(req: SendRequest) -> bytes:
    """Build a minimal RFC 5322 message for Gmail's send endpoint.

    For full MIME (attachments, multipart/alternative) the route layer should
    build the message with `email.message.EmailMessage` and pass the bytes here.
    """
    from email.message import EmailMessage

    msg = EmailMessage()
    msg["To"] = ", ".join(f'"{a.name or ""}" <{a.address}>' for a in req.to)
    if req.cc:
        msg["Cc"] = ", ".join(f'"{a.name or ""}" <{a.address}>' for a in req.cc)
    if req.bcc:
        msg["Bcc"] = ", ".join(f'"{a.name or ""}" <{a.address}>' for a in req.bcc)
    msg["Subject"] = req.subject
    if req.in_reply_to:
        msg["In-Reply-To"] = req.in_reply_to
    if req.references:
        msg["References"] = " ".join(req.references)
    if req.body_text:
        msg.set_content(req.body_text)
    if req.body_html:
        if req.body_text:
            msg.add_alternative(req.body_html, subtype="html")
        else:
            msg.set_content(req.body_html, subtype="html")
    return bytes(msg)
