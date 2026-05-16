# Universal Email Client

An **AI-first universal email client** delivered as a mobile-ready PWA.
Connects Gmail, Office 365, and IMAP (Yahoo, AOL) under one unified inbox.
Mail stays on the device — the backend is a stateless broker.

> **Status:** Phase 0 (foundation) + Phase 1 slice (Gmail OAuth → inbox →
> summary → reply) scaffolded. Office 365 and IMAP are stubbed for parity but
> not yet implemented (Phase 2 / 3 — see [.agent-os/product/roadmap.md](.agent-os/product/roadmap.md)).

## Architecture

```
┌────────────────────────────┐        ┌────────────────────────────┐
│ Frontend (Next.js 15 PWA)  │  HTTPS │ Backend (FastAPI, Python)  │
│ React 19 + TS + Tailwind   │ ─────▶ │ - OAuth (Gmail, MS Graph)  │
│ IndexedDB (Dexie) — only   │ ◀──── │ - Provider broker            │
│ persistence layer          │  JSON  │ - Gemini ADK agents          │
│ Service worker, sandboxed  │        │ - Stateless: no mail at rest │
│ iframe for mail HTML       │        │                              │
└────────────────────────────┘        └────────────────────────────┘
       deployed: Vercel                deployed: Vercel (Python fn)
```

Read [CLAUDE.md](CLAUDE.md) for the full architectural overview and the rules
AI agents follow when working in this repo.

## What's in the box

| Piece | Path |
| --- | --- |
| **Specs & methodology** | [.agent-os/](.agent-os/) — mission, roadmap, decisions, tech-stack, per-feature specs |
| **Code style + security + testing standards** | [.agent-os/standards/](.agent-os/standards/) |
| **Sub-agents** | [.claude/agents/](.claude/agents/) — provider-engineer, ai-engineer, pwa-engineer |
| **Skills** | [.claude/skills/](.claude/skills/) — email-mime, oauth-pkce |
| **Hooks** | [.claude/hooks/](.claude/hooks/) — secret-scan, post-edit-format |
| **Backend** | [backend/](backend/) — FastAPI + Gemini ADK |
| **Frontend** | [frontend/](frontend/) — Next.js 15 PWA |
| **CI** | [.github/workflows/ci.yml](.github/workflows/ci.yml) |

## Local development

### Prerequisites
- **Node 20+** and **pnpm 9** (`npm i -g pnpm`)
- **Python 3.12** and **uv** (`pip install uv`)
- **Google OAuth credentials** — free, ~8 min one-time setup.
  Follow [docs/SETUP_GMAIL_OAUTH.md](docs/SETUP_GMAIL_OAUTH.md) step by step.
  (Required: Gmail uses OAuth, and Google won't issue tokens to any app it
  hasn't registered — there's no way around this for any third-party email
  client. The setup is straightforward and stays in test mode for evaluation.)
- **Gemini API key** — free from https://aistudio.google.com/apikey

### Backend
```bash
cd backend
cp .env.example .env       # fill in GOOGLE_OAUTH_* and GEMINI_API_KEY
uv pip install -e ".[dev]"
uv run uvicorn app.main:app --reload --port 8000
```

The OpenAPI docs are at http://localhost:8000/docs.

### Frontend
```bash
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev                    # http://localhost:3000
```

On first run you'll be prompted to set a passphrase. Then connect your Gmail
account. Mail is fetched and cached in IndexedDB; tokens are encrypted with
your passphrase before being stored.

## Running tests

```bash
# Backend
cd backend && uv run pytest

# Frontend unit
cd frontend && pnpm test

# Frontend E2E
cd frontend && pnpm test:e2e
```

## Deploy

Two Vercel projects from one monorepo:

| Project name | Root directory | Notes |
| --- | --- | --- |
| `email-client-web` | `frontend/` | Auto-detected as Next.js. Set `NEXT_PUBLIC_API_BASE_URL` to the API project's URL. |
| `email-client-api` | `backend/` | Vercel Python runtime via [`backend/vercel.json`](backend/vercel.json). Set all `*_OAUTH_*`, `GEMINI_API_KEY`, `TOKEN_SIGNING_KEY`. |

After deploy, add your frontend URL to the backend's CORS via `APP_URL` /
`CORS_EXTRA_ORIGINS` env vars, and add the Vercel domain to your Google OAuth
client's authorized redirect URIs (`https://<your-frontend>/auth/gmail/callback`).

## Working in this repo with Claude Code

1. Read [CLAUDE.md](CLAUDE.md) — the root rules of the project.
2. To start a feature, follow [.agent-os/instructions/plan-feature.md](.agent-os/instructions/plan-feature.md).
3. To execute a written spec, follow [.agent-os/instructions/execute-spec.md](.agent-os/instructions/execute-spec.md).
4. Three sub-agents are defined and auto-loaded:
   - [provider-engineer](.claude/agents/provider-engineer.md) — for backend/app/providers/
   - [ai-engineer](.claude/agents/ai-engineer.md) — for backend/app/ai/
   - [pwa-engineer](.claude/agents/pwa-engineer.md) — for frontend/
5. Hooks (configured in [.claude/settings.json](.claude/settings.json)):
   - Pre-Edit/Write: secret scan blocks if proposed content contains anything
     that looks like an OAuth client secret, AWS key, PEM private key, etc.
   - Post-Edit/Write: runs `ruff format` (Python) or `prettier` (web).

## Privacy posture (short version)

- No mail body, subject, or address ever persists server-side. The backend
  is a request-scoped broker.
- OAuth tokens are encrypted client-side (AES-GCM, key derived via PBKDF2
  from your passphrase) before storage in IndexedDB.
- Mail HTML is sanitized with DOMPurify and rendered inside a sandboxed
  `<iframe sandbox>` (no script execution, no same-origin access).
- External images blocked by default; opt-in per sender.
- All inbound mail content sent to Gemini is wrapped in injection-guard
  fences with explicit instructions that fenced content is data, not
  directives.

Full threat model + mitigations in [.agent-os/standards/security.md](.agent-os/standards/security.md).

## License

MIT.
