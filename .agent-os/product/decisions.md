# Architectural Decision Log

Append-only. Each entry is dated, numbered, and immutable once accepted. Reverse
a decision by adding a new entry that supersedes it (link back to the original).

---

## ADR-001 — Mail bodies never persist on the server
**Date:** 2026-05-14 · **Status:** Accepted

**Context.** AI email products typically index mail server-side for retrieval.
This is a meaningful privacy concession the user is making in exchange for
convenience.

**Decision.** Backend is stateless. No database tables for messages, threads,
attachments, drafts, or AI outputs. All mail lives in the client's IndexedDB.
The backend is a request-scoped broker only.

**Consequences.**
- (+) Privacy: a backend breach exposes no mail.
- (+) GDPR/CCPA: data deletion is trivial (uninstall the PWA).
- (−) No server-side search index — search runs against provider APIs (Gmail
  `q=`, Graph `$search`, IMAP `SEARCH`).
- (−) AI cannot pre-compute summaries; all AI work is on-demand per-request.

**Reversal cost.** High — would require a schema, a sync engine, and a privacy-
posture rewrite. Do not reverse without product re-approval.

---

## ADR-002 — Gemini ADK for AI orchestration
**Date:** 2026-05-14 · **Status:** Accepted

**Context.** Summaries, drafts, and prioritization are distinct tasks with
different prompts, tools, and quality bars. Hand-rolling agent loops invites
inconsistency.

**Decision.** Use Google's Agent Development Kit (`google-adk`) to define
discrete agents (`summarizer`, `drafter`, `prioritizer`, `search_rewriter`)
with handoffs. Models default to `gemini-2.0-flash` for fast paths and
`gemini-2.5-pro` for prioritization/drafting where quality matters more than
latency.

**Consequences.**
- (+) Multi-agent primitives, tool calling, and tracing come for free.
- (+) Agent definitions are testable in isolation.
- (−) Provider lock-in to Gemini. Swap cost is meaningful but contained to
  `backend/app/ai/`.

---

## ADR-003 — Deploy frontend and backend as two separate Vercel projects
**Date:** 2026-05-14 · **Status:** Accepted · **Supersedes:** none

**Context.** User requirement: keep both on Vercel. Vercel's Python runtime is
file-per-function (each `api/*.py` is a function), which fights FastAPI's
single-app convention. Co-locating Python under the Next.js project's `app/api/`
isn't possible — those are JS route handlers.

**Decision.** Two Vercel projects from one monorepo:
- `frontend/` → Next.js project.
- `backend/` → Python project with a single catch-all `api/index.py` that
  exports the FastAPI ASGI app; `vercel.json` rewrites all paths to it.

**Consequences.**
- (+) Each side deploys independently; frontend cold starts unaffected by Python.
- (+) Standard FastAPI structure preserved.
- (−) Two domains (or one custom domain with subdomain split). CORS required.
- (−) Two preview-URL chains in PRs.

---

## ADR-004 — IMAP push (IDLE) not used; client-driven polling instead
**Date:** 2026-05-14 · **Status:** Accepted

**Context.** Vercel functions have a 60–300s max duration. IMAP IDLE requires a
long-lived TCP connection. Not viable on Vercel.

**Decision.** No server-side IDLE. Frontend polls `/mail/sync?cursor=...` every
60s in foreground. Background notifications deferred to Phase 6 (Web Push), at
which point we revisit whether a separate always-on worker is justified.

**Consequences.**
- (−) Notifications have up to 60s delay vs. real push.
- (+) Stays within Vercel free-tier compute envelope.

---

## ADR-005 — Provider abstraction is enforced in Python, not duplicated client-side
**Date:** 2026-05-14 · **Status:** Accepted

**Context.** Three providers with very different APIs (Gmail REST, MS Graph,
IMAP+SMTP). The frontend should not know which one it's talking to.

**Decision.** `backend/app/providers/base.py` defines a `MailProvider`
Protocol. `gmail.py`, `microsoft.py`, `imap.py` implement it. All backend routes
accept a `provider` discriminator and dispatch via a registry. The frontend only
sees `UnifiedMessage` / `UnifiedThread` schemas.

**Consequences.**
- (+) Adding a fourth provider is a single new file + registry entry.
- (+) AI prompts are written against the unified shape, not provider-specific.
- (−) Some provider-specific features (Gmail's important markers, Outlook's
  categories) flatten into a common `labels: string[]` field. Lossy but
  acceptable.
