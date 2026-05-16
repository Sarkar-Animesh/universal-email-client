"""Structured logging. Redacts anything that could carry mail content or tokens.

We use structlog with a JSON renderer. The redactor pass strips known-sensitive
keys (authorization, cookie, body, subject) anywhere they appear in event dicts.
"""
from __future__ import annotations

import logging
import sys
from typing import Any

import structlog

_REDACTED = "[redacted]"
_SENSITIVE_KEYS = {
    "authorization",
    "cookie",
    "set-cookie",
    "access_token",
    "refresh_token",
    "id_token",
    "body",
    "body_html",
    "body_text",
    "subject",
    "to",
    "from",
    "cc",
    "bcc",
}


def _redact(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    for k in list(event_dict.keys()):
        if k.lower() in _SENSITIVE_KEYS:
            event_dict[k] = _REDACTED
    return event_dict


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(stream=sys.stdout, level=level, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _redact,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, level)),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
