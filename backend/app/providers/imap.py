"""Generic IMAP provider (Yahoo, AOL, custom servers).

Auth model: app-password. Yahoo and AOL each issue revocable app passwords
from their account-security pages. Custom servers may accept the regular
account password.

Token format: the "access_token" parameter for IMAP carries a URL-safe-base64
encoding of a JSON object with connection details:

    {
      "host": "imap.mail.yahoo.com",
      "port": 993,
      "username": "user@yahoo.com",
      "password": "app-password",
      "smtp_host": "smtp.mail.yahoo.com",
      "smtp_port": 465,
      "ssl": true
    }

Threading: IMAP has no native threads. We synthesize them by hashing the first
Message-Id in the References header (or In-Reply-To, or the message's own
Message-Id if it's a root). This is a simplified JWZ.

Stateless: every operation opens a fresh IMAP connection and closes it. No
persistent state on the server.
"""
from __future__ import annotations

import base64
import email
import email.policy
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import getaddresses, parseaddr, parsedate_to_datetime

import aioimaplib
import aiosmtplib

from app.core.config import get_settings
from app.core.security import account_id_hash
from app.models import (
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

log = logging.getLogger(__name__)


def _parse_token(access_token: str) -> dict:
    """Decode the base64-encoded JSON credentials blob."""
    try:
        # Add padding back if it was stripped
        padded = access_token + "=" * (-len(access_token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode())
        data = json.loads(raw)
    except (ValueError, json.JSONDecodeError) as e:
        raise AuthExpiredError(f"Invalid IMAP token: {e}") from e
    for key in ("host", "port", "username", "password"):
        if not data.get(key):
            raise AuthExpiredError(f"IMAP token missing field: {key}")
    return data


def encode_token(creds: dict) -> str:
    """Encode credentials into the URL-safe-base64 JSON token format."""
    raw = json.dumps(creds, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _truncate(text: str | None, max_len: int = 200) -> str:
    if not text:
        return ""
    text = text.strip()
    return text[:max_len] if len(text) > max_len else text


def _hash_thread_key(key: str) -> str:
    return hashlib.sha1(key.encode(), usedforsecurity=False).hexdigest()[:16]


def _thread_key(msg: EmailMessage) -> str:
    """Pick a stable thread key from headers.

    Order: first id in References → In-Reply-To → own Message-Id.
    """
    refs = msg.get("References", "")
    if refs:
        first = refs.split()[0].strip("<>")
        if first:
            return first
    irt = msg.get("In-Reply-To", "")
    if irt:
        return irt.strip("<> \t")
    mid = msg.get("Message-Id", "")
    return mid.strip("<> \t") or "no-id"


def _parse_addr(raw: str) -> EmailAddress | None:
    name, addr = parseaddr(raw)
    if not addr or "@" not in addr:
        return None
    return EmailAddress(address=addr, name=name or None)


def _parse_addrs(raw: str) -> list[EmailAddress]:
    if not raw:
        return []
    out = []
    for name, addr in getaddresses([raw]):
        if addr and "@" in addr:
            out.append(EmailAddress(address=addr, name=name or None))
    return out


def _extract_body(msg: EmailMessage) -> tuple[str | None, str | None]:
    """Return (html, text) bodies from an email.message.EmailMessage."""
    html: str | None = None
    text: str | None = None
    if msg.is_multipart():
        for part in msg.walk():
            ctype = part.get_content_type()
            disp = (part.get("Content-Disposition") or "").lower()
            if "attachment" in disp:
                continue
            if ctype == "text/html" and html is None:
                try:
                    html = part.get_content()
                except Exception:
                    payload = part.get_payload(decode=True) or b""
                    html = payload.decode(part.get_content_charset() or "utf-8", "replace")
            elif ctype == "text/plain" and text is None:
                try:
                    text = part.get_content()
                except Exception:
                    payload = part.get_payload(decode=True) or b""
                    text = payload.decode(part.get_content_charset() or "utf-8", "replace")
    else:
        ctype = msg.get_content_type()
        try:
            content = msg.get_content()
        except Exception:
            payload = msg.get_payload(decode=True) or b""
            content = payload.decode(msg.get_content_charset() or "utf-8", "replace")
        if ctype == "text/html":
            html = content
        else:
            text = content
    return html, text


def _snippet_from(text: str | None, html: str | None) -> str:
    if text:
        cleaned = re.sub(r"\s+", " ", text).strip()
        return _truncate(cleaned)
    if html:
        stripped = re.sub(r"<[^>]+>", " ", html)
        cleaned = re.sub(r"\s+", " ", stripped).strip()
        return _truncate(cleaned)
    return ""


def _message_to_unified(
    raw: bytes, uid: str, account_id: str, folder: str
) -> UnifiedMessage:
    msg = email.message_from_bytes(raw, policy=email.policy.default)
    assert isinstance(msg, EmailMessage)

    from_addr = _parse_addr(msg.get("From", "")) or EmailAddress(
        address="unknown@unknown.invalid", name=None
    )
    to = _parse_addrs(msg.get("To", ""))
    cc = _parse_addrs(msg.get("Cc", ""))
    bcc = _parse_addrs(msg.get("Bcc", ""))
    reply_to = _parse_addrs(msg.get("Reply-To", ""))

    date_hdr = msg.get("Date", "")
    try:
        date = parsedate_to_datetime(date_hdr) if date_hdr else datetime.now(timezone.utc)
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        date = datetime.now(timezone.utc)

    body_html, body_text = _extract_body(msg)
    snippet = _snippet_from(body_text, body_html)

    refs_hdr = msg.get("References", "")
    references = [r.strip("<> \t") for r in refs_hdr.split() if r.strip()]
    in_reply_to = (msg.get("In-Reply-To", "") or "").strip("<> \t") or None

    thread_key = _thread_key(msg)
    thread_id = f"{account_id}:{_hash_thread_key(thread_key)}"
    msg_id = f"{account_id}:{folder}:{uid}"

    return UnifiedMessage(
        id=msg_id,
        thread_id=thread_id,
        account_id=account_id,
        from_=from_addr,
        to=to,
        cc=cc,
        bcc=bcc,
        reply_to=reply_to,
        subject=msg.get("Subject", "") or "",
        snippet=snippet,
        body_html=body_html,
        body_text=body_text,
        date=date,
        in_reply_to=in_reply_to,
        references=references,
    )


# Folder mapping per provider. Yahoo and AOL use the same names; custom servers
# may use different conventions but these defaults work for most.
def _folder_for(label: str) -> str:
    return {
        "inbox": "INBOX",
        "archive": "Archive",
        "trash": "Trash",
        "sent": "Sent",
        "drafts": "Drafts",
    }.get(label.lower(), label)


async def _connect(creds: dict) -> aioimaplib.IMAP4_SSL:
    use_ssl = creds.get("ssl", True)
    if not use_ssl:
        raise ProviderError("Plain IMAP not supported — TLS required.")
    client = aioimaplib.IMAP4_SSL(host=creds["host"], port=creds["port"], timeout=30)
    await client.wait_hello_from_server()
    # App passwords are often shown as "xxxx xxxx xxxx xxxx" — strip spaces so
    # users can paste either form.
    password = creds["password"].replace(" ", "")
    resp = await client.login(creds["username"], password)
    if resp.result != "OK":
        # aioimaplib returns server tagline in resp.lines; surface it so the
        # user sees Gmail's actual reason (e.g. "Application-specific password
        # required").
        detail = ""
        for line in getattr(resp, "lines", []) or []:
            if isinstance(line, bytes):
                detail = line.decode(errors="replace")
                break
            if isinstance(line, str):
                detail = line
                break
        raise AuthExpiredError(
            f"IMAP login {resp.result}: {detail or 'credentials rejected'}"
        )
    # Yahoo's IMAP requires RFC 2971 ID handshake — without it SEARCH ALL
    # returns 0 UIDs even when the mailbox has messages. Yahoo doesn't list
    # ID in its pre-auth CAPABILITY so we can't gate on has_capability; just
    # send it and ignore servers that respond BAD.
    try:
        await client.id(name="universal-email-client", version="0.1")
    except Exception as e:
        log.debug("IMAP ID handshake skipped: %s", e)
    return client


async def _safe_logout(client: aioimaplib.IMAP4_SSL) -> None:
    try:
        await client.logout()
    except Exception:
        pass


def _parse_fetch_response(lines: list) -> dict[str, bytes]:
    """Extract {uid: rfc822_bytes} from a FETCH response.

    aioimaplib returns the header line as `bytes` and the RFC822 literal body
    as `bytearray` — `bytearray` is not a subclass of `bytes`, so we accept
    both and coerce to `bytes` when storing.
    """
    out: dict[str, bytes] = {}
    i = 0
    while i < len(lines):
        line = lines[i]
        if isinstance(line, (bytes, bytearray)):
            m = re.search(rb"UID (\d+)", bytes(line))
            if m and i + 1 < len(lines):
                uid = m.group(1).decode()
                body = lines[i + 1]
                if isinstance(body, (bytes, bytearray)):
                    out[uid] = bytes(body)
                    i += 2
                    continue
        i += 1
    return out


class ImapProvider(MailProvider):
    provider_id = "imap"

    async def whoami(self, access_token: str) -> UnifiedAccount:
        creds = _parse_token(access_token)
        email_addr = creds["username"]
        account_id = account_id_hash(
            "imap", email_addr, get_settings().token_signing_key
        )
        return UnifiedAccount(
            id=account_id,
            provider="imap",
            email=email_addr,
            display_name=email_addr.split("@")[0],
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
        creds = _parse_token(access_token)
        folder = _folder_for(label)
        client = await _connect(creds)
        try:
            sel = await client.select(folder)
            if sel.result != "OK":
                raise ProviderError(f"IMAP SELECT {folder} failed: {sel.result}")
            log.info("IMAP SELECT %s lines=%r", folder, sel.lines)
            search = await client.uid_search("ALL", charset=None)
            if search.result != "OK":
                raise ProviderError(f"IMAP SEARCH failed: {search.result}")
            log.info("IMAP SEARCH ALL lines=%r", search.lines)
            uids = (search.lines[0] or b"").decode().split() if search.lines else []
            if not uids:
                return ThreadListPage(threads=[], next_cursor=None)
            # Most recent N UIDs (UID order ≈ chronological for inbox)
            tail = uids[-page_size:]
            uid_set = ",".join(tail)
            # Fetch headers + body preview
            fetch = await client.uid("fetch", uid_set, "(RFC822)")
            if fetch.result != "OK":
                raise ProviderError(f"IMAP FETCH failed: {fetch.result}")
            raw_by_uid = _parse_fetch_response(fetch.lines)
            messages = []
            for uid, raw in raw_by_uid.items():
                try:
                    messages.append(_message_to_unified(raw, uid, account_id, folder))
                except Exception as e:
                    log.warning("IMAP _message_to_unified failed for uid=%s: %s", uid, e)
                    continue
            log.info(
                "IMAP fetched %d/%d messages from %s",
                len(messages),
                len(raw_by_uid),
                folder,
            )
            # Group by thread_id
            threads_map: dict[str, list[UnifiedMessage]] = {}
            for m in messages:
                threads_map.setdefault(m.thread_id, []).append(m)
            threads: list[UnifiedThread] = []
            for tid, msgs in threads_map.items():
                msgs.sort(key=lambda m: m.date)
                latest = msgs[-1]
                participants: dict[str, EmailAddress] = {}
                for m in msgs:
                    if m.from_.address not in participants:
                        participants[m.from_.address] = m.from_
                threads.append(
                    UnifiedThread(
                        id=tid,
                        account_id=account_id,
                        subject=latest.subject,
                        participants=list(participants.values()),
                        message_count=len(msgs),
                        last_message_date=latest.date,
                        labels=[label],
                        flags=ThreadFlags(),
                        snippet=latest.snippet,
                    )
                )
            threads.sort(key=lambda t: t.last_message_date, reverse=True)
            return ThreadListPage(threads=threads, next_cursor=None)
        finally:
            await _safe_logout(client)

    async def get_thread(
        self, access_token: str, thread_id: str, *, account_id: str = "unknown"
    ) -> ThreadDetail:
        creds = _parse_token(access_token)
        # thread_id is "{account_id}:{thread_hash}". To resolve, we re-scan
        # INBOX and find messages whose synthesized thread_id matches.
        # Simple approach: fetch recent messages, filter.
        client = await _connect(creds)
        try:
            sel = await client.select("INBOX")
            if sel.result != "OK":
                raise ProviderError("IMAP SELECT INBOX failed")
            search = await client.uid_search("ALL", charset=None)
            uids = (search.lines[0] or b"").decode().split() if search.lines else []
            # Look at the last 200 UIDs — covers most active threads
            tail = uids[-200:]
            if not tail:
                raise ProviderError("Thread not found")
            uid_set = ",".join(tail)
            fetch = await client.uid("fetch", uid_set, "(RFC822)")
            raw_by_uid = _parse_fetch_response(fetch.lines)
            messages = []
            for uid, raw in raw_by_uid.items():
                try:
                    m = _message_to_unified(raw, uid, account_id, "INBOX")
                    if m.thread_id == thread_id:
                        messages.append(m)
                except Exception:
                    continue
            if not messages:
                raise ProviderError("Thread not found")
            messages.sort(key=lambda m: m.date)
            latest = messages[-1]
            participants: dict[str, EmailAddress] = {}
            for m in messages:
                if m.from_.address not in participants:
                    participants[m.from_.address] = m.from_
            thread = UnifiedThread(
                id=thread_id,
                account_id=account_id,
                subject=latest.subject,
                participants=list(participants.values()),
                message_count=len(messages),
                last_message_date=latest.date,
                labels=["inbox"],
                flags=ThreadFlags(),
                snippet=latest.snippet,
            )
            return ThreadDetail(thread=thread, messages=messages)
        finally:
            await _safe_logout(client)

    async def send(self, access_token: str, request: SendRequest) -> str:
        creds = _parse_token(access_token)
        smtp_host = creds.get("smtp_host") or creds["host"].replace("imap.", "smtp.")
        smtp_port = int(creds.get("smtp_port", 465))

        msg = EmailMessage()
        msg["From"] = creds["username"]
        msg["To"] = ", ".join(a.address for a in request.to)
        if request.cc:
            msg["Cc"] = ", ".join(a.address for a in request.cc)
        if request.bcc:
            msg["Bcc"] = ", ".join(a.address for a in request.bcc)
        msg["Subject"] = request.subject
        if request.in_reply_to:
            msg["In-Reply-To"] = f"<{request.in_reply_to}>"
        if request.references:
            msg["References"] = " ".join(f"<{r}>" for r in request.references)
        if request.body_html:
            msg.set_content(request.body_text or "")
            msg.add_alternative(request.body_html, subtype="html")
        else:
            msg.set_content(request.body_text or "")

        await aiosmtplib.send(
            msg,
            hostname=smtp_host,
            port=smtp_port,
            username=creds["username"],
            password=creds["password"],
            use_tls=smtp_port == 465,
            start_tls=smtp_port == 587,
            timeout=30,
        )
        return msg["Message-Id"] or ""

    async def modify_labels(
        self,
        access_token: str,
        thread_id: str,
        *,
        add: list[str] | None = None,
        remove: list[str] | None = None,
    ) -> None:
        # IMAP only supports flags (\Seen, \Flagged, \Answered, \Deleted).
        # Map our "starred" label → \Flagged.
        creds = _parse_token(access_token)
        client = await _connect(creds)
        try:
            await client.select("INBOX")
            search = await client.uid_search("ALL", charset=None)
            uids = (search.lines[0] or b"").decode().split() if search.lines else []
            if not uids:
                return
            tail = uids[-200:]
            fetch = await client.uid("fetch", ",".join(tail), "(RFC822.HEADER)")
            raw_by_uid = _parse_fetch_response(fetch.lines)
            matching: list[str] = []
            for uid, raw in raw_by_uid.items():
                try:
                    parsed = email.message_from_bytes(raw, policy=email.policy.default)
                    tk = _thread_key(parsed)  # type: ignore[arg-type]
                    if thread_id.endswith(f":{_hash_thread_key(tk)}"):
                        matching.append(uid)
                except Exception:
                    continue
            if not matching:
                return
            uid_set = ",".join(matching)
            if add and "starred" in add:
                await client.uid("store", uid_set, "+FLAGS", "(\\Flagged)")
            if remove and "starred" in remove:
                await client.uid("store", uid_set, "-FLAGS", "(\\Flagged)")
        finally:
            await _safe_logout(client)

    async def archive(self, access_token: str, thread_id: str) -> None:
        await self._move_thread(access_token, thread_id, "Archive")

    async def trash(self, access_token: str, thread_id: str) -> None:
        await self._move_thread(access_token, thread_id, "Trash")

    async def _move_thread(
        self, access_token: str, thread_id: str, dest_folder: str
    ) -> None:
        creds = _parse_token(access_token)
        client = await _connect(creds)
        try:
            await client.select("INBOX")
            search = await client.uid_search("ALL", charset=None)
            uids = (search.lines[0] or b"").decode().split() if search.lines else []
            if not uids:
                return
            tail = uids[-200:]
            fetch = await client.uid("fetch", ",".join(tail), "(RFC822.HEADER)")
            raw_by_uid = _parse_fetch_response(fetch.lines)
            matching: list[str] = []
            for uid, raw in raw_by_uid.items():
                try:
                    parsed = email.message_from_bytes(raw, policy=email.policy.default)
                    tk = _thread_key(parsed)  # type: ignore[arg-type]
                    if thread_id.endswith(f":{_hash_thread_key(tk)}"):
                        matching.append(uid)
                except Exception:
                    continue
            if not matching:
                return
            uid_set = ",".join(matching)
            # COPY then mark deleted in source (some servers support MOVE)
            try:
                await client.uid("move", uid_set, dest_folder)
            except Exception:
                await client.uid("copy", uid_set, dest_folder)
                await client.uid("store", uid_set, "+FLAGS", "(\\Deleted)")
                await client.expunge()
        finally:
            await _safe_logout(client)

    async def search(
        self,
        access_token: str,
        query: str,
        *,
        cursor: str | None = None,
        page_size: int = 50,
        account_id: str = "unknown",
    ) -> ThreadListPage:
        creds = _parse_token(access_token)
        client = await _connect(creds)
        try:
            await client.select("INBOX")
            # IMAP SEARCH is awkward — TEXT searches body+headers
            safe = query.replace('"', "")
            search = await client.uid_search("TEXT", f'"{safe}"', charset=None)
            uids = (search.lines[0] or b"").decode().split() if search.lines else []
            if not uids:
                return ThreadListPage(threads=[], next_cursor=None)
            tail = uids[-page_size:]
            fetch = await client.uid("fetch", ",".join(tail), "(RFC822)")
            raw_by_uid = _parse_fetch_response(fetch.lines)
            messages = []
            for uid, raw in raw_by_uid.items():
                try:
                    messages.append(_message_to_unified(raw, uid, account_id, "INBOX"))
                except Exception:
                    continue
            threads_map: dict[str, list[UnifiedMessage]] = {}
            for m in messages:
                threads_map.setdefault(m.thread_id, []).append(m)
            threads = []
            for tid, msgs in threads_map.items():
                msgs.sort(key=lambda m: m.date)
                latest = msgs[-1]
                participants: dict[str, EmailAddress] = {}
                for m in msgs:
                    if m.from_.address not in participants:
                        participants[m.from_.address] = m.from_
                threads.append(
                    UnifiedThread(
                        id=tid,
                        account_id=account_id,
                        subject=latest.subject,
                        participants=list(participants.values()),
                        message_count=len(msgs),
                        last_message_date=latest.date,
                        labels=[],
                        flags=ThreadFlags(),
                        snippet=latest.snippet,
                    )
                )
            threads.sort(key=lambda t: t.last_message_date, reverse=True)
            return ThreadListPage(threads=threads, next_cursor=None)
        finally:
            await _safe_logout(client)
