"""Provider Protocol — every provider implements this exact shape.

If you find yourself adding `if provider == "gmail"` branches anywhere outside
this package, that's a bug. Push the divergence into the provider implementation
and keep the rest of the codebase generic.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.models import (
    SendRequest,
    ThreadDetail,
    ThreadListPage,
    UnifiedAccount,
)


class ProviderError(Exception):
    """Base class for provider-side failures we surface to clients."""


class ProviderUnsupportedError(ProviderError):
    """The provider genuinely cannot perform this operation."""


class AuthExpiredError(ProviderError):
    """Caller must refresh and retry."""


@runtime_checkable
class MailProvider(Protocol):
    """Operations every provider must support.

    All methods are async. All take a per-request `access_token` — providers
    never read from a shared token store because there isn't one.
    """

    provider_id: str

    async def whoami(self, access_token: str) -> UnifiedAccount: ...

    async def list_threads(
        self,
        access_token: str,
        *,
        label: str = "inbox",
        cursor: str | None = None,
        page_size: int = 50,
        account_id: str = "unknown",
    ) -> ThreadListPage: ...

    async def get_thread(
        self, access_token: str, thread_id: str, *, account_id: str = "unknown"
    ) -> ThreadDetail: ...

    async def send(self, access_token: str, request: SendRequest) -> str:
        """Send a message; return the provider-assigned message id."""
        ...

    async def modify_labels(
        self,
        access_token: str,
        thread_id: str,
        *,
        add: list[str] | None = None,
        remove: list[str] | None = None,
    ) -> None: ...

    async def archive(self, access_token: str, thread_id: str) -> None: ...

    async def trash(self, access_token: str, thread_id: str) -> None: ...

    async def search(
        self,
        access_token: str,
        query: str,
        *,
        cursor: str | None = None,
        page_size: int = 50,
    ) -> ThreadListPage: ...
