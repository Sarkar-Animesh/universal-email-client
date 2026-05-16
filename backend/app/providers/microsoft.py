"""Microsoft Graph API provider — implements MailProvider for Office 365 / Outlook.

Key differences from Gmail:
- Threads are virtual: grouped by conversationId (not a native object)
- Message bodies: body.content (HTML or text), not MIME tree
- Archives/trash: move messages to folders, not labels
- Refresh tokens rotate: new one in every response, old one immediately invalid
- Pagination: @odata.nextLink with $skipToken

Reference: https://learn.microsoft.com/en-us/graph/api/resources/message
"""
from __future__ import annotations

import urllib.parse
from datetime import datetime, timezone
from email.utils import parseaddr
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.security import account_id_hash
from app.models import (
    EmailAddress,
    MessageFlags,
    ThreadFlags,
    UnifiedAccount,
    UnifiedMessage,
    UnifiedThread,
    ThreadDetail,
    ThreadListPage,
    SendRequest,
)
from app.providers.base import AuthExpiredError, MailProvider, ProviderError


API_BASE = "https://graph.microsoft.com/v1.0"


def _check(r: httpx.Response) -> None:
    """Raise AuthExpiredError on 401; ProviderError on other failures."""
    if r.status_code == 401:
        raise AuthExpiredError("Access token expired or invalid.")
    if not r.is_success:
        raise ProviderError(f"Graph API {r.status_code}: {r.text[:200]}")


def _native_id(prefixed_id: str) -> str:
    """Strip the '{account_id}:' prefix to recover the raw Graph ID."""
    return prefixed_id.split(":", 1)[-1] if ":" in prefixed_id else prefixed_id


def _truncate(text: str | None, max_len: int = 200) -> str:
    """Truncate text to max length."""
    if not text:
        return ""
    return text[:max_len] if len(text) > max_len else text


def _addr(raw: str | dict | None) -> EmailAddress | None:
    """Parse an RFC 5322 address or a Graph emailAddress object."""
    if not raw:
        return None
    if isinstance(raw, dict):
        addr = raw.get("address", "")
        if addr:
            return EmailAddress(address=addr, name=raw.get("name"))
        return None
    name, addr = parseaddr(raw)
    return EmailAddress(address=addr, name=name or None) if addr else None


def _addrs(raw: list[dict] | None) -> list[EmailAddress]:
    """Parse a list of Graph emailAddress objects with nested structure."""
    if not raw:
        return []
    result = []
    for item in raw:
        if item and isinstance(item, dict):
            email_obj = item.get("emailAddress", {})
            if email_obj:
                addr_obj = _addr(email_obj)
                if addr_obj:
                    result.append(addr_obj)
    return result


def _header(headers: list[dict] | None, name: str) -> str | None:
    """Case-insensitive header lookup from internetMessageHeaders."""
    if not headers:
        return None
    name_lower = name.lower()
    for h in headers:
        if h.get("name", "").lower() == name_lower:
            return h.get("value")
    return None


def _message_to_unified(msg: dict, account_id: str) -> UnifiedMessage:
    """Convert a Graph message to UnifiedMessage."""
    msg_id = f"{account_id}:{msg['id']}"
    subject = msg.get("subject", "")
    from_addr = _addr(msg.get("from", {}).get("emailAddress"))
    to = _addrs(msg.get("toRecipients", []))
    cc = _addrs(msg.get("ccRecipients", []))
    bcc = _addrs(msg.get("bccRecipients", []))

    date_str = msg.get("receivedDateTime", "")
    try:
        date = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        date = datetime.fromtimestamp(0, tz=timezone.utc)

    body_obj = msg.get("body", {})
    body_content = body_obj.get("content", "")
    body_type = body_obj.get("contentType", "text").lower()

    body_html = body_content if body_type == "html" else None
    body_text = body_content if body_type != "html" else None

    snippet = _truncate(msg.get("bodyPreview", ""))

    flags = MessageFlags(
        has_unread=not msg.get("isRead", False),
        has_starred=msg.get("flag", {}).get("flagStatus") == "flagged",
        has_attachments=msg.get("hasAttachments", False),
    )

    message_id = _header(msg.get("internetMessageHeaders"), "Message-Id") or msg.get(
        "internetMessageId", ""
    )
    in_reply_to = _header(msg.get("internetMessageHeaders"), "In-Reply-To")
    references_str = _header(msg.get("internetMessageHeaders"), "References") or ""
    references = [r.strip() for r in references_str.split() if r.strip()]

    return UnifiedMessage(
        id=msg_id,
        thread_id=f"{account_id}:{msg['conversationId']}",
        account_id=account_id,
        from_=from_addr or EmailAddress(address="unknown@unknown.invalid", name=None),
        to=to,
        cc=cc,
        bcc=bcc,
        subject=subject,
        date=date,
        body_html=body_html,
        body_text=body_text,
        snippet=snippet,
        flags=flags,
        in_reply_to=in_reply_to,
        references=references,
    )


class MicrosoftProvider(MailProvider):
    provider_id = "microsoft"

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self.client = client

    async def _request(
        self, method: str, endpoint: str, access_token: str, **kwargs: Any
    ) -> httpx.Response:
        """Make an authenticated request to Graph API."""
        url = f"{API_BASE}{endpoint}"
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        }
        c = self.client or httpx.AsyncClient(timeout=30.0)
        try:
            r = await c.request(method, url, headers=headers, **kwargs)
            _check(r)
            return r
        finally:
            if self.client is None:
                await c.aclose()

    async def whoami(self, access_token: str) -> UnifiedAccount:
        """Fetch the current user's account info."""
        r = await self._request("GET", "/me", access_token)
        data = r.json()
        email = data.get("mail") or data.get("userPrincipalName", "")
        return UnifiedAccount(
            id=account_id_hash("microsoft", email, get_settings().token_signing_key),
            provider="microsoft",
            email=email,
            display_name=data.get("displayName"),
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
        """List threads (conversations) in a folder."""
        select_fields = "id,conversationId,subject,from,receivedDateTime,isRead,hasAttachments,bodyPreview,toRecipients,ccRecipients"
        query = f"/me/mailFolders/{label}/messages?$select={select_fields}&$top={page_size}"

        if cursor:
            query += f"&$skipToken={cursor}"

        r = await self._request("GET", query, access_token)
        data = r.json()
        messages = data.get("value", [])

        # Sort by receivedDateTime descending (client-side)
        messages.sort(key=lambda m: m.get("receivedDateTime", ""), reverse=True)

        threads_map: dict[str, list[dict]] = {}
        for msg in messages:
            conv_id = msg.get("conversationId")
            if conv_id:
                if conv_id not in threads_map:
                    threads_map[conv_id] = []
                threads_map[conv_id].append(msg)

        threads = []
        for conv_id, conv_messages in threads_map.items():
            if not conv_messages:
                continue
            latest = conv_messages[0]
            thread_id = f"{account_id}:{conv_id}"

            participants_set = {}
            for msg in conv_messages:
                from_addr = _addr(msg.get("from", {}).get("emailAddress"))
                if from_addr and from_addr.address:
                    participants_set[from_addr.address] = from_addr

            thread = UnifiedThread(
                id=thread_id,
                account_id=account_id,
                subject=latest.get("subject", ""),
                participants=list(participants_set.values()),
                message_count=len(conv_messages),
                last_message_date=datetime.fromisoformat(
                    latest.get("receivedDateTime", "").replace("Z", "+00:00")
                ),
                labels=[label],
                flags=ThreadFlags(
                    has_unread=any(not msg.get("isRead", False) for msg in conv_messages),
                    has_starred=False,
                    has_attachments=any(
                        msg.get("hasAttachments", False) for msg in conv_messages
                    ),
                ),
                snippet=_truncate(latest.get("bodyPreview", "")),
            )
            threads.append(thread)

        next_link = data.get("@odata.nextLink")
        next_cursor = None
        if next_link:
            parsed = urllib.parse.urlparse(next_link)
            params = urllib.parse.parse_qs(parsed.query)
            if "$skipToken" in params:
                next_cursor = params["$skipToken"][0]

        return ThreadListPage(threads=threads, next_cursor=next_cursor)

    async def get_thread(
        self, access_token: str, thread_id: str, *, account_id: str = "unknown"
    ) -> ThreadDetail:
        """Fetch all messages in a thread (by conversationId) plus thread metadata."""
        native_id = _native_id(thread_id)

        select_fields = "id,conversationId,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,isRead,flag,hasAttachments,bodyPreview,body,internetMessageHeaders,internetMessageId"
        query = f"/me/messages?$filter=conversationId eq '{native_id}'&$select={select_fields}"

        r = await self._request("GET", query, access_token)
        data = r.json()
        messages_raw = data.get("value", [])

        if not messages_raw:
            raise ProviderError(f"Thread {thread_id} not found or empty.")

        # Sort by receivedDateTime ascending (oldest first)
        messages_raw.sort(key=lambda m: m.get("receivedDateTime", ""))

        messages = [_message_to_unified(msg, account_id) for msg in messages_raw]

        first = messages_raw[0]
        participants_set = {}
        for msg_raw in messages_raw:
            from_addr = _addr(msg_raw.get("from", {}).get("emailAddress"))
            if from_addr and from_addr.address:
                participants_set[from_addr.address] = from_addr

        thread = UnifiedThread(
            id=thread_id,
            account_id=account_id,
            subject=first.get("subject", ""),
            participants=list(participants_set.values()),
            message_count=len(messages),
            last_message_date=datetime.fromisoformat(
                messages_raw[-1].get("receivedDateTime", "").replace("Z", "+00:00")
            ),
            labels=["inbox"],
            flags=ThreadFlags(
                has_unread=any(not msg.get("isRead", False) for msg in messages_raw),
                has_starred=False,
                has_attachments=any(
                    msg.get("hasAttachments", False) for msg in messages_raw
                ),
            ),
            snippet=_truncate(first.get("bodyPreview", "")),
        )

        return ThreadDetail(thread=thread, messages=messages)

    async def send(self, access_token: str, request: SendRequest) -> str:
        """Send a message via Graph API."""
        body_obj = {"contentType": "HTML" if request.body_html else "text"}
        if request.body_html:
            body_obj["content"] = request.body_html
        else:
            body_obj["content"] = request.body_text or ""

        message = {
            "subject": request.subject,
            "body": body_obj,
            "toRecipients": [
                {"emailAddress": {"address": r.address, "name": r.name}} for r in request.to
            ],
            "ccRecipients": [
                {"emailAddress": {"address": r.address, "name": r.name}}
                for r in (request.cc or [])
            ],
            "bccRecipients": [
                {"emailAddress": {"address": r.address, "name": r.name}}
                for r in (request.bcc or [])
            ],
        }

        payload = {
            "message": message,
            "saveToSentItems": True,
        }

        await self._request("POST", "/me/sendMail", access_token, json=payload)
        return "sent"

    async def modify_labels(
        self,
        access_token: str,
        thread_id: str,
        *,
        add: list[str] | None = None,
        remove: list[str] | None = None,
    ) -> None:
        """Modify categories (Microsoft's equivalent of labels) on all messages in a thread."""
        native_id = _native_id(thread_id)

        query = f"/me/messages?$filter=conversationId eq '{native_id}'&$select=id"
        r = await self._request("GET", query, access_token)
        msg_ids = [msg["id"] for msg in r.json().get("value", [])]

        for msg_id in msg_ids:
            r = await self._request(
                "GET", f"/me/messages/{msg_id}", access_token, params={"$select": "categories"}
            )
            current = r.json().get("categories", [])

            new_categories = set(current)
            if add:
                new_categories.update(add)
            if remove:
                new_categories -= set(remove)

            await self._request(
                "PATCH",
                f"/me/messages/{msg_id}",
                access_token,
                json={"categories": list(new_categories)},
            )

    async def archive(self, access_token: str, thread_id: str) -> None:
        """Move all messages in a thread to the archive folder."""
        native_id = _native_id(thread_id)

        query = f"/me/messages?$filter=conversationId eq '{native_id}'&$select=id"
        r = await self._request("GET", query, access_token)
        msg_ids = [msg["id"] for msg in r.json().get("value", [])]

        for msg_id in msg_ids:
            await self._request(
                "POST",
                f"/me/messages/{msg_id}/move",
                access_token,
                json={"destinationId": "archive"},
            )

    async def trash(self, access_token: str, thread_id: str) -> None:
        """Move all messages in a thread to the trash (deleted items) folder."""
        native_id = _native_id(thread_id)

        query = f"/me/messages?$filter=conversationId eq '{native_id}'&$select=id"
        r = await self._request("GET", query, access_token)
        msg_ids = [msg["id"] for msg in r.json().get("value", [])]

        for msg_id in msg_ids:
            await self._request(
                "POST",
                f"/me/messages/{msg_id}/move",
                access_token,
                json={"destinationId": "deleteditems"},
            )

    async def search(
        self,
        access_token: str,
        query: str,
        *,
        cursor: str | None = None,
        page_size: int = 50,
    ) -> ThreadListPage:
        """Search messages by query string and return grouped by conversationId."""
        search_query = f'/me/messages?$search="{query}"&$select=id,conversationId,subject,from,receivedDateTime,isRead,hasAttachments,bodyPreview,toRecipients,ccRecipients&$top={page_size}'

        if cursor:
            search_query += f"&$skipToken={cursor}"

        r = await self._request("GET", search_query, access_token)
        data = r.json()
        messages = data.get("value", [])

        # Sort by receivedDateTime descending (client-side)
        messages.sort(key=lambda m: m.get("receivedDateTime", ""), reverse=True)

        threads_map: dict[str, list[dict]] = {}
        for msg in messages:
            conv_id = msg.get("conversationId")
            if conv_id:
                if conv_id not in threads_map:
                    threads_map[conv_id] = []
                threads_map[conv_id].append(msg)

        threads = []
        account_id = "unknown"
        for conv_id, conv_messages in threads_map.items():
            if not conv_messages:
                continue
            latest = conv_messages[0]
            thread_id = f"{account_id}:{conv_id}"

            participants_set = {}
            for msg in conv_messages:
                from_addr = _addr(msg.get("from", {}).get("emailAddress"))
                if from_addr and from_addr.address:
                    participants_set[from_addr.address] = from_addr

            thread = UnifiedThread(
                id=thread_id,
                account_id=account_id,
                subject=latest.get("subject", ""),
                participants=list(participants_set.values()),
                message_count=len(conv_messages),
                last_message_date=datetime.fromisoformat(
                    latest.get("receivedDateTime", "").replace("Z", "+00:00")
                ),
                labels=[],
                flags=ThreadFlags(
                    has_unread=any(not msg.get("isRead", False) for msg in conv_messages),
                    has_starred=False,
                    has_attachments=any(
                        msg.get("hasAttachments", False) for msg in conv_messages
                    ),
                ),
                snippet=_truncate(latest.get("bodyPreview", "")),
            )
            threads.append(thread)

        next_link = data.get("@odata.nextLink")
        next_cursor = None
        if next_link:
            parsed = urllib.parse.urlparse(next_link)
            params = urllib.parse.parse_qs(parsed.query)
            if "$skipToken" in params:
                next_cursor = params["$skipToken"][0]

        return ThreadListPage(threads=threads, next_cursor=next_cursor)
