# Universal Email Client — CLAUDE.md

This file is the root context for any AI agent (Claude Code, sub-agents, Gemini ADK
agents) operating on this repository. Read this first before touching anything.

## Product (one paragraph)

An **AI-first, universal email client** delivered as a mobile-ready **PWA**. Email
only — no calendar, contacts, tasks, or notes. Connects to **Gmail**, **Office 365**,
and generic **IMAP** (Yahoo, AOL, custom) under a single **unified inbox** with
account switching. Surface features: compose / reply / forward, search, labels,
archive, delete, threading. AI features: per-thread **summaries**, **reply drafts**,
and inbox **prioritization** (important / follow-up / newsletter / promo / other).

## Architecture (at a glance)

```
┌────────────────────────────┐        ┌────────────────────────────┐
│ Frontend (Next.js 15 PWA)  │  HTTPS │ Backend (FastAPI, Python)  │
│ React + TS + Tailwind      │ ─────▶ │ - OAuth (Gmail, MS Graph)  │
│ IndexedDB (Dexie) — ONLY   │ ◀──── │ - IMAP/Gmail/Graph fetch    │
│ persistence layer          │  JSON  │ - Gemini ADK agents (AI)    │
│ Service worker (offline)   │        │ - Stateless: no mail at rest│
└────────────────────────────┘        └────────────────────────────┘
```

**Key invariant — no mail bodies on the backend at rest.** The backend is a
stateless broker. OAuth tokens are encrypted client-side (WebCrypto) before
storage in IndexedDB and forwarded per-request. Mail bodies live only on device.

## Stack

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript 5, Tailwind v4,
  Dexie (IndexedDB wrapper), Serwist (service worker), Vitest, Playwright.
- **Backend:** Python 3.12, FastAPI, httpx, aioimaplib, google-genai (Gemini),
  google-adk (Agent Development Kit), pydantic v2, pytest, ruff.
- **AI:** Gemini 2.0/2.5 via ADK — multi-agent workflow (summarizer,
  drafter, prioritizer, search-query-rewriter).

See [.agent-os/product/tech-stack.md](.agent-os/product/tech-stack.md) for versions
and rationale, and [.agent-os/product/decisions.md](.agent-os/product/decisions.md)
for the architectural decision log.

## Repo layout

```
.
├── CLAUDE.md                      # this file
├── .agent-os/
│   ├── product/                   # mission, roadmap, decisions, tech-stack
│   ├── specs/                     # per-feature specs (specs-driven dev)
│   ├── instructions/              # workflows (plan-feature, execute-spec, ...)
│   └── standards/                 # code style, testing, security standards
├── .claude/
│   ├── agents/                    # sub-agent definitions (per-role)
│   ├── skills/                    # reusable skills (oauth-flow, mime-parser, ...)
│   ├── hooks/                     # pre/post tool hooks (lint, secret-scan)
│   ├── plugins/                   # plugin manifests
│   └── settings.json              # permissions + hooks
├── backend/                       # FastAPI service
│   ├── app/
│   │   ├── main.py
│   │   ├── core/                  # config, security, deps
│   │   ├── routes/                # /auth, /mail, /ai
│   │   ├── providers/             # gmail.py, microsoft.py, imap.py
│   │   ├── oauth/                 # auth flows
│   │   ├── ai/                    # Gemini ADK agents
│   │   └── models/                # pydantic schemas
│   ├── tests/
│   └── pyproject.toml
├── frontend/                      # Next.js 15 PWA
│   ├── app/                       # App Router pages
│   ├── components/                # UI components
│   ├── lib/
│   │   ├── db/                    # IndexedDB schema (Dexie)
│   │   ├── api/                   # backend client
│   │   ├── crypto/                # WebCrypto wrappers
│   │   └── providers/             # client-side provider helpers
│   ├── public/                    # icons, manifest
│   ├── tests/                     # Vitest + Playwright
│   └── package.json
└── docs/                          # user-facing docs
```

## Rules for AI agents working in this repo

1. **Specs first.** Don't write code for a non-trivial feature before there is a
   spec under `.agent-os/specs/`. Use the `/plan-feature` workflow.
2. **No mail at rest on the server.** Never add a database table for messages,
   threads, or attachments to the backend. If you think you need one, write an
   ADR in `.agent-os/product/decisions.md` first.
3. **Provider parity.** Any feature in `app/providers/gmail.py` must have a
   matching method signature in `microsoft.py` and `imap.py` (returning the same
   `UnifiedMessage` / `UnifiedThread` shape). See `app/providers/base.py`.
4. **Tests are not optional.** Backend: pytest, ≥80% coverage of `app/providers/`
   and `app/ai/`. Frontend: Vitest for utils, Playwright for the OAuth → inbox →
   summary slice.
5. **Token handling.** OAuth tokens never appear in logs and are never written
   to disk on the server. Encrypted in IndexedDB on the client; relayed via
   `Authorization: Bearer` headers per request.
6. **Mobile is the primary form factor.** Design components mobile-first; verify
   on 360×800 viewport. Desktop is a wider layout, not a different one.
7. **Use the sub-agents.** See `.claude/agents/` — delegate provider work to
   `provider-engineer`, AI work to `ai-engineer`, UI work to `pwa-engineer`.

## Quick commands

```bash
# Backend (in backend/)
uv sync                          # install deps
uv run uvicorn app.main:app --reload --port 8000
uv run pytest

# Frontend (in frontend/)
pnpm install
pnpm dev                         # http://localhost:3000
pnpm test                        # Vitest
pnpm test:e2e                    # Playwright
```

## Where to look next

- New here? Read [.agent-os/product/mission.md](.agent-os/product/mission.md) then
  [.agent-os/product/roadmap.md](.agent-os/product/roadmap.md).
- Picking up work? Look in [.agent-os/specs/](.agent-os/specs/) for an open spec.
- Want to make a structural change? Add an entry to
  [.agent-os/product/decisions.md](.agent-os/product/decisions.md) first.
