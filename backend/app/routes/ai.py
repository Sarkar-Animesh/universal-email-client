"""AI routes — summarize, draft, prioritize, search-rewrite.

These all take *full message content* in the request body. That body never
persists server-side; it lives only in request scope for the duration of the
Gemini call. The client is responsible for sending only what it wants
processed.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ai.agents import (
    Priority,
    draft_reply,
    prioritize_threads,
    rewrite_search,
    summarize_thread,
)
from app.models import UnifiedMessage, UnifiedThread

router = APIRouter(prefix="/ai", tags=["ai"])


class SummarizeIn(BaseModel):
    thread: UnifiedThread
    messages: list[UnifiedMessage] = Field(..., min_length=1)


class SummarizeOut(BaseModel):
    bullets: list[str]
    ask: str
    suggested_action: str


@router.post("/summarize", response_model=SummarizeOut)
async def summarize(body: SummarizeIn) -> SummarizeOut:
    s = await summarize_thread(body.thread, body.messages)
    return SummarizeOut(
        bullets=s.bullets, ask=s.ask, suggested_action=s.suggested_action
    )


class DraftIn(BaseModel):
    thread: UnifiedThread
    messages: list[UnifiedMessage] = Field(..., min_length=1)
    tone_hint: str | None = None


class DraftOut(BaseModel):
    body_text: str


@router.post("/draft-reply", response_model=DraftOut)
async def draft(body: DraftIn) -> DraftOut:
    d = await draft_reply(body.thread, body.messages, tone_hint=body.tone_hint)
    return DraftOut(body_text=d.body_text)


class PrioritizeIn(BaseModel):
    threads: list[UnifiedThread] = Field(..., min_length=1, max_length=50)


class PrioritizeOut(BaseModel):
    priorities: list[Priority]


@router.post("/prioritize", response_model=PrioritizeOut)
async def prioritize(body: PrioritizeIn) -> PrioritizeOut:
    return PrioritizeOut(priorities=await prioritize_threads(body.threads))


class SearchRewriteIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    provider: str = Field(..., pattern=r"^(gmail|microsoft|imap)$")


class SearchRewriteOut(BaseModel):
    rewritten: str


@router.post("/search-rewrite", response_model=SearchRewriteOut)
async def search_rewrite(body: SearchRewriteIn) -> SearchRewriteOut:
    rewritten = await rewrite_search(body.query, provider=body.provider)
    if not rewritten:
        raise HTTPException(502, "Empty rewrite from model.")
    return SearchRewriteOut(rewritten=rewritten)
