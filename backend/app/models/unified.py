"""Cross-provider data shapes.

These are the only shapes the frontend ever sees. Provider-specific shapes live
inside `app/providers/{gmail,microsoft,imap}.py` and are mapped here before
leaving the backend.

If you change anything here, bump `SCHEMA_VERSION` and update the frontend
Dexie migration in lockstep — IndexedDB is the source of truth for stored mail.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

SCHEMA_VERSION = 1
ProviderId = Literal["gmail", "microsoft", "imap"]


class EmailAddress(BaseModel):
    address: EmailStr
    name: str | None = None


class MessageFlags(BaseModel):
    unread: bool = False
    starred: bool = False
    important: bool = False
    has_attachments: bool = False
    draft: bool = False


class ThreadFlags(BaseModel):
    has_unread: bool = False
    has_starred: bool = False
    has_attachments: bool = False


class Attachment(BaseModel):
    """Metadata only — bodies are fetched on demand by id."""

    id: str
    filename: str
    mime_type: str
    size_bytes: int
    inline: bool = False
    content_id: str | None = None


class UnifiedAccount(BaseModel):
    id: str = Field(description="HMAC of provider + native account id; safe to log.")
    provider: ProviderId
    email: EmailStr
    display_name: str | None = None
    avatar_url: str | None = None


class UnifiedMessage(BaseModel):
    id: str = Field(description="Provider-native id namespaced by account.")
    thread_id: str
    account_id: str
    from_: EmailAddress = Field(alias="from")
    to: list[EmailAddress] = Field(default_factory=list)
    cc: list[EmailAddress] = Field(default_factory=list)
    bcc: list[EmailAddress] = Field(default_factory=list)
    reply_to: list[EmailAddress] = Field(default_factory=list)
    subject: str = ""
    snippet: str = Field(default="", max_length=200)
    body_html: str | None = None
    body_text: str | None = None
    date: datetime
    labels: list[str] = Field(default_factory=list)
    flags: MessageFlags = Field(default_factory=MessageFlags)
    in_reply_to: str | None = None
    references: list[str] = Field(default_factory=list)
    attachments: list[Attachment] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class UnifiedThread(BaseModel):
    id: str
    account_id: str
    subject: str = ""
    participants: list[EmailAddress] = Field(default_factory=list)
    message_count: int = 0
    last_message_date: datetime
    labels: list[str] = Field(default_factory=list)
    flags: ThreadFlags = Field(default_factory=ThreadFlags)
    snippet: str = Field(default="", max_length=200)


class ThreadListPage(BaseModel):
    threads: list[UnifiedThread]
    next_cursor: str | None = None


class ThreadDetail(BaseModel):
    thread: UnifiedThread
    messages: list[UnifiedMessage]


class SendRequest(BaseModel):
    account_id: str
    to: list[EmailAddress]
    cc: list[EmailAddress] = Field(default_factory=list)
    bcc: list[EmailAddress] = Field(default_factory=list)
    subject: str
    body_html: str | None = None
    body_text: str | None = None
    in_reply_to: str | None = None
    references: list[str] = Field(default_factory=list)
    thread_id: str | None = None
