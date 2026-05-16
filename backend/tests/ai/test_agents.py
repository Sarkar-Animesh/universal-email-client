"""Agent wrapper tests. Stubs `_run_model` to assert on prompt structure +
parser robustness. Never hits the live Gemini API."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.ai import agents
from app.models import (
    EmailAddress,
    MessageFlags,
    ThreadFlags,
    UnifiedMessage,
    UnifiedThread,
)


def _make_thread_and_messages() -> tuple[UnifiedThread, list[UnifiedMessage]]:
    msg = UnifiedMessage.model_validate(
        {
            "id": "m1",
            "thread_id": "t1",
            "account_id": "a1",
            "from": {"address": "alice@example.com", "name": "Alice"},
            "to": [],
            "cc": [],
            "bcc": [],
            "reply_to": [],
            "subject": "Hi",
            "snippet": "snip",
            "body_html": None,
            "body_text": "Hi, can you confirm the meeting?",
            "date": datetime.now(tz=UTC),
            "labels": [],
            "flags": MessageFlags().model_dump(),
            "in_reply_to": None,
            "references": [],
            "attachments": [],
        }
    )
    thread = UnifiedThread(
        id="t1",
        account_id="a1",
        subject="Hi",
        participants=[EmailAddress(address="alice@example.com")],
        message_count=1,
        last_message_date=datetime.now(tz=UTC),
        labels=[],
        flags=ThreadFlags(),
        snippet="snip",
    )
    return thread, [msg]


@pytest.mark.asyncio
async def test_summarize_parses_bullet_format(monkeypatch):
    captured: dict[str, Any] = {}

    async def fake(*, system, user, model):
        captured["system"] = system
        captured["user"] = user
        captured["model"] = model
        return (
            "- First point\n"
            "- Second point\n"
            "- Third point\n"
            "Ask: confirm the meeting\n"
            "Action: REPLY"
        )

    monkeypatch.setattr(agents, "_run_model", fake)
    thread, msgs = _make_thread_and_messages()
    out = await agents.summarize_thread(thread, msgs)
    assert out.bullets == ["First point", "Second point", "Third point"]
    assert out.ask == "confirm the meeting"
    assert out.suggested_action == "REPLY"
    assert "Hi, can you confirm" in captured["user"]
    assert "<<<UNTRUSTED>>>" in captured["user"]


@pytest.mark.asyncio
async def test_summarize_parses_json_fallback(monkeypatch):
    async def fake(*, system, user, model):
        return (
            '{"bullets": ["a","b"], "ask": "ok", "suggested_action": "ARCHIVE"}'
        )

    monkeypatch.setattr(agents, "_run_model", fake)
    thread, msgs = _make_thread_and_messages()
    out = await agents.summarize_thread(thread, msgs)
    assert out.bullets == ["a", "b"]
    assert out.suggested_action == "ARCHIVE"


@pytest.mark.asyncio
async def test_prioritize_parses_json_list(monkeypatch):
    async def fake(*, system, user, model):
        return (
            '[{"thread_id":"t1","label":"IMPORTANT","confidence":0.9},'
            '{"thread_id":"t2","label":"PROMO","confidence":0.4}]'
        )

    monkeypatch.setattr(agents, "_run_model", fake)
    thread, _ = _make_thread_and_messages()
    out = await agents.prioritize_threads([thread, thread])
    assert len(out) == 2
    assert out[0].label == "IMPORTANT"
    assert out[1].label == "PROMO"


@pytest.mark.asyncio
async def test_prioritize_empty_input_short_circuits(monkeypatch):
    called = False

    async def fake(*, system, user, model):
        nonlocal called
        called = True
        return ""

    monkeypatch.setattr(agents, "_run_model", fake)
    out = await agents.prioritize_threads([])
    assert out == []
    assert called is False


@pytest.mark.asyncio
async def test_search_rewrite_strips_whitespace(monkeypatch):
    async def fake(*, system, user, model):
        return "  from:sarah@example.com newer_than:7d  \n"

    monkeypatch.setattr(agents, "_run_model", fake)
    out = await agents.rewrite_search("emails from sarah this week", provider="gmail")
    assert out == "from:sarah@example.com newer_than:7d"
