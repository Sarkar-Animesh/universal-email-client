"""Gemini ADK agent definitions.

The ADK import is intentionally lazy: cold-start time on Vercel is dominated by
the SDK import, and we'd rather pay that cost on first AI call than on every
unrelated request (e.g., OAuth callback).

Each agent here is a thin wrapper that:
1. Builds the prompt (from `app.ai.prompts`),
2. Calls the model,
3. Parses the structured output.

Tests stub `_run_model` to assert on prompt shape and tool routing rather than
on generated text.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.ai.prompts import (
    drafter_system,
    prioritizer_system,
    search_rewriter_system,
    summarizer_system,
    summarizer_user,
)
from app.core.config import get_settings
from app.models import UnifiedMessage, UnifiedThread


@dataclass(slots=True)
class Summary:
    bullets: list[str]
    ask: str
    suggested_action: str  # REPLY | WAIT | ARCHIVE | DELEGATE
    trace_id: str | None = None


@dataclass(slots=True)
class Draft:
    body_text: str
    trace_id: str | None = None


@dataclass(slots=True)
class Priority:
    thread_id: str
    label: str  # IMPORTANT | FOLLOW_UP | NEWSLETTER | PROMO | OTHER
    confidence: float


async def _run_model(*, system: str, user: str, model: str) -> str:
    """Single point of model invocation. Stubbed in tests.

    We use `google.genai` directly here rather than the full ADK runtime, because
    each of our agents is a single-shot LLM call with no tool loop. ADK becomes
    valuable when we add multi-agent handoffs (Phase 4 prioritizer-feeds-
    summarizer composition); the wiring point stays in this file.
    """
    from google import genai  # noqa: PLC0415 — deferred import for cold-start

    client = genai.Client(api_key=get_settings().gemini_api_key)
    resp = await client.aio.models.generate_content(
        model=model,
        contents=[{"role": "user", "parts": [{"text": user}]}],
        config={"system_instruction": system, "temperature": 0.3},
    )
    return resp.text or ""


async def summarize_thread(
    thread: UnifiedThread, messages: list[UnifiedMessage]
) -> Summary:
    raw = await _run_model(
        system=summarizer_system(),
        user=summarizer_user(thread, messages),
        model=get_settings().gemini_summary_model,
    )
    return _parse_summary(raw)


async def draft_reply(
    thread: UnifiedThread,
    messages: list[UnifiedMessage],
    *,
    tone_hint: str | None = None,
) -> Draft:
    body = await _run_model(
        system=drafter_system(tone_hint),
        user=summarizer_user(thread, messages),  # same context shape
        model=get_settings().gemini_quality_model,
    )
    return Draft(body_text=body.strip())


async def prioritize_threads(
    threads: list[UnifiedThread],
) -> list[Priority]:
    if not threads:
        return []
    user = json.dumps(
        [
            {
                "thread_id": t.id,
                "subject": t.subject,
                "snippet": t.snippet,
                "from": t.participants[0].address if t.participants else "",
                "labels": t.labels,
            }
            for t in threads
        ]
    )
    raw = await _run_model(
        system=prioritizer_system(),
        user=user,
        model=get_settings().gemini_summary_model,
    )
    return _parse_priorities(raw)


async def rewrite_search(query: str, *, provider: str) -> str:
    return (
        await _run_model(
            system=search_rewriter_system(provider),
            user=query,
            model=get_settings().gemini_summary_model,
        )
    ).strip()


# ---------- parsers ----------

def _parse_summary(raw: str) -> Summary:
    """The summarizer's output is loosely structured. We try a structured parse
    first; if that fails, we fall back to heuristic bullet extraction so a
    half-formed response still degrades gracefully."""
    raw = raw.strip()
    if raw.startswith("{"):
        try:
            data = json.loads(raw)
            return Summary(
                bullets=data.get("bullets", [])[:5],
                ask=data.get("ask", ""),
                suggested_action=data.get("suggested_action", "WAIT"),
            )
        except json.JSONDecodeError:
            pass
    bullets: list[str] = []
    ask = ""
    action = "WAIT"
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith(("- ", "* ", "• ")):
            bullets.append(line[2:].strip())
        elif line.lower().startswith("ask:"):
            ask = line.split(":", 1)[1].strip()
        elif line.lower().startswith(("action:", "next:")):
            candidate = line.split(":", 1)[1].strip().upper()
            if candidate in {"REPLY", "WAIT", "ARCHIVE", "DELEGATE"}:
                action = candidate
    return Summary(bullets=bullets[:5], ask=ask, suggested_action=action)


def _parse_priorities(raw: str) -> list[Priority]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        data: Any = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[Priority] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        out.append(
            Priority(
                thread_id=str(item.get("thread_id", "")),
                label=str(item.get("label", "OTHER")).upper(),
                confidence=float(item.get("confidence", 0.5)),
            )
        )
    return out
