# Agents, Skills, Hooks & Plugins

A complete inventory of every AI-agent, skill, hook, and plugin wired into this
repo via Claude Code's agent/plugin system.

---

## Sub-Agents (`.claude/agents/`)

Three sub-agents auto-load from the plugin manifest. Each is a scoped
specialist that Claude Code can hand work to when edits fall in its domain.

| Agent | File | Scope | Model |
| --- | --- | --- | --- |
| **provider-engineer** | `agents/provider-engineer.md` | `backend/app/providers/` and `backend/app/oauth/` — Gmail/Graph/IMAP protocol quirks, provider-parity rule, mapper unit tests | claude-sonnet |
| **ai-engineer** | `agents/ai-engineer.md` | `backend/app/ai/` — Gemini ADK agent definitions, prompts, prompt-injection fences, cost envelopes | claude-sonnet |
| **pwa-engineer** | `agents/pwa-engineer.md` | `frontend/` — Next.js 15 App Router, IndexedDB/Dexie schema, WebCrypto token handling, service worker, mobile-first UI | claude-sonnet |

### What each agent knows

**provider-engineer**
- Gmail: thread-first REST API, label normalization (`CATEGORY_` prefix stripping,
  `UNREAD`/`IMPORTANT` flag mapping), base64url body decode, RFC 822 send with
  threading headers.
- Microsoft Graph: `conversationId`, delta-query sync, `$select` hygiene, JSON
  send via `/me/sendMail`.
- IMAP: TLS-993, `aioimaplib`, UID-stable fetching, client-side thread
  reconstruction from `In-Reply-To`/`References`, `aiosmtplib` send.

**ai-engineer**
- Four Gemini agents: `summarizer` (flash), `drafter` (pro), `prioritizer`
  (flash, batch-50), `search_rewriter` (flash).
- Prompt injection: every email body wrapped in
  `<<<EMAIL_BODY>>> … <<<END_EMAIL_BODY>>>` fences.
- ADK patterns: `LlmAgent`, `before_model_callback` for fence injection, trace
  ids returned in API responses for thumbs-up/down feedback.

**pwa-engineer**
- Offline-first: all read views work from IndexedDB alone.
- WebCrypto: PBKDF2-SHA256 (600 k iters) key derivation, AES-GCM token
  encryption, zero plaintext in IndexedDB.
- `<iframe sandbox>` for rendered mail HTML; DOMPurify sanitisation; remote
  image blocking by default.
- 360×800 mobile viewport baseline; 44×44 touch targets.

---

## AI Agents (Runtime — `backend/app/ai/agents.py`)

These are the Gemini ADK agents that run in the FastAPI backend at request time.

| Agent | Route | Input | Output |
| --- | --- | --- | --- |
| `summarizer` | `POST /ai/summarize` | `UnifiedThread` (≤ 20 msgs) | 3 bullets + suggested action |
| `drafter` | `POST /ai/draft-reply` | `UnifiedThread` + tone hint | RFC 822-ready body |
| `prioritizer` | `POST /ai/prioritize` | List of thread snippets | Priority label per thread (`important`, `follow_up`, `newsletter`, `promo`, `other`) |
| `search_rewriter` | `POST /ai/search-rewrite` | Natural-language query | Provider-specific query string |

---

## Skills (`.claude/skills/`)

Skills are reference documents Claude Code loads when working on related code.
They encode domain knowledge that would otherwise require web searches or be
re-derived each session.

| Skill | File | Content |
| --- | --- | --- |
| **email-mime** | `skills/email-mime/SKILL.md` | RFC 5322 gotchas: header folding, encoded-words, base64url vs standard base64, `In-Reply-To`/`References` threading, multipart MIME walk order, Gmail's `threadId` vs IMAP's `Message-ID` derivation |
| **oauth-pkce** | `skills/oauth-pkce/SKILL.md` | PKCE flow: `code_verifier` generation (43–128 chars, URL-safe), `code_challenge = BASE64URL(SHA256(verifier))`, state HMAC for CSRF protection, Google and Microsoft token endpoint differences |
| **data-scientist** | `skills/data-scientist/SKILL.md` | Client-side analytics patterns, Gemini ADK agent usage (prioritizer batching, prompt-injection fencing), data residency constraints (ADR-001), safe aggregations over IndexedDB thread/message metadata |
| **ui-developer** | `skills/ui-developer/SKILL.md` | Next.js 15 App Router patterns, Tailwind v4 conventions, mobile-first layout (360×800, 44px touch targets), sandboxed iframe for untrusted HTML, Dexie `useLiveQuery`, Zustand 5, accessibility checklist, performance tips |

---

## Hooks (`.claude/hooks/`)

Hooks are Node.js scripts that Claude Code runs automatically before/after
tool calls. They enforce invariants without requiring human review of every edit.

| Hook | Trigger | File | Effect |
| --- | --- | --- | --- |
| **secret-scan** | `PreToolUse` on Edit/Write | `hooks/secret-scan.js` | Blocks the write and exits non-zero if proposed content matches any of: Google OAuth secret (`GOCSPX-…`), AWS access key (`AKIA…`), Stripe live key (`sk_live_…`), Slack bot token (`xoxb-…`), GitHub PAT (`ghp_…`), PEM private key, or a high-entropy Bearer token on an `Authorization:` line. Prevents accidental secret commits. |
| **post-edit-format** | `PostToolUse` on Edit/Write | `hooks/post-edit-format.js` | Runs `ruff format` on `.py` files or `prettier --write` on `.ts`/`.tsx`/`.js`/`.json`/`.md` files after every edit. Keeps formatting consistent without a separate CI gate for style. |

---

## Plugin (`.claude/plugins/plugin.json`)

The plugin manifest bundles all of the above into a single loadable unit.
Claude Code reads this file when it opens the workspace and auto-loads every
referenced agent, skill, and hook.

```json
{
  "name": "universal-email-client",
  "displayName": "Universal Email Client Plugin",
  "version": "0.1.0",
  "agents": ["provider-engineer", "ai-engineer", "pwa-engineer"],
  "skills": ["email-mime", "oauth-pkce"],
  "hooks": {
    "PreToolUse":  ["secret-scan"],
    "PostToolUse": ["post-edit-format"]
  }
}
```

This means the full AI-agent + safety stack is active the moment any collaborator
(human or AI) opens the repo in Claude Code — no manual configuration required.
