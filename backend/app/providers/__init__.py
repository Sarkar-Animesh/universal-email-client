"""Provider registry. Look up by `ProviderId` ("gmail" | "microsoft" | "imap").

Provider instances are stateless and safe to share. We construct one per
provider at import time. If/when an httpx.AsyncClient becomes per-request, we'd
move construction into a FastAPI dependency.
"""
from __future__ import annotations

from app.providers.base import (
    AuthExpiredError,
    MailProvider,
    ProviderError,
    ProviderUnsupportedError,
)
from app.providers.gmail import GmailProvider
from app.providers.imap import ImapProvider
from app.providers.microsoft import MicrosoftProvider

_REGISTRY: dict[str, MailProvider] = {
    "gmail": GmailProvider(),
    "microsoft": MicrosoftProvider(),
    "imap": ImapProvider(),
}


def get_provider(provider_id: str) -> MailProvider:
    try:
        return _REGISTRY[provider_id]
    except KeyError as e:
        raise ProviderError(f"Unknown provider: {provider_id!r}") from e


__all__ = [
    "AuthExpiredError",
    "MailProvider",
    "ProviderError",
    "ProviderUnsupportedError",
    "get_provider",
]
