# Tech Stack

## Frontend
| Layer | Choice | Version | Notes |
| --- | --- | --- | --- |
| Framework | Next.js | 15.x (App Router) | RSC where helpful; most mail UI is client components for offline. |
| Language | TypeScript | 5.6+ | `strict: true`. |
| UI | React | 19 | |
| Styles | Tailwind CSS | 4.x | Mobile-first. |
| State | Zustand | 5.x | Lightweight; per-account stores. |
| Storage | Dexie | 4.x | IndexedDB schema in `frontend/lib/db/schema.ts`. |
| Service worker | Serwist | 9.x | Replaces deprecated next-pwa. |
| Crypto | WebCrypto API | native | AES-GCM for token-at-rest, PBKDF2 for KDF. |
| Tests | Vitest, Playwright | latest | Unit + E2E. |

## Backend
| Layer | Choice | Version | Notes |
| --- | --- | --- | --- |
| Runtime | Python | 3.12 | Vercel Python runtime. |
| Framework | FastAPI | 0.115+ | Async; exposed via ASGI handler. |
| HTTP client | httpx | 0.27+ | Async. |
| IMAP | aioimaplib | 1.0+ | Async IMAP4rev1. |
| SMTP | aiosmtplib | 3.x | |
| Validation | pydantic | 2.x | |
| AI | google-adk + google-genai | latest | Gemini ADK for multi-agent. |
| Tests | pytest, pytest-asyncio | latest | |
| Lint/format | ruff, black | latest | |

## Deployment — both on Vercel (two projects in one monorepo)

| Project | Root | Runtime | Notes |
| --- | --- | --- | --- |
| `email-client-web` | `frontend/` | Next.js (Node 20) | Vercel auto-detects Next.js. |
| `email-client-api` | `backend/` | Python 3.12 (Vercel Functions) | Entry: `api/index.py` exporting a FastAPI ASGI app. `vercel.json` rewrites `/(.*)` → `/api/index`. |

Set `NEXT_PUBLIC_API_BASE_URL` in the frontend Vercel project to the backend
project's URL (e.g. `https://email-client-api.vercel.app`).

### Known Vercel constraints (and our mitigations)
- **Function max duration** 60s (Hobby) / 300s (Pro). → All endpoints designed
  for <10s. Long syncs are chunked via cursor pagination, driven from the client.
- **No long-lived connections** → IMAP IDLE not used. Push relies on
  client-driven polling (every 60–120s when foreground, Web Push when bg later).
- **Cold starts** → keep `requirements.txt` lean; lazy-import provider modules.
- **Ephemeral filesystem** → never write tokens or mail to disk; all transient
  state lives in memory per-request only.

## Secrets / env vars
| Variable | Where | Purpose |
| --- | --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | backend | Gmail OAuth |
| `MICROSOFT_OAUTH_CLIENT_ID` / `_SECRET` | backend | MS Graph OAuth |
| `GEMINI_API_KEY` | backend | Gemini ADK |
| `TOKEN_SIGNING_KEY` | backend | HMAC for OAuth state param (CSRF) |
| `NEXT_PUBLIC_API_BASE_URL` | frontend | Backend URL |
| `NEXT_PUBLIC_APP_URL` | frontend | For OAuth redirect construction |

No mail body, no OAuth token, and no AI output is persisted server-side.

## Rationale (see decisions.md for full ADRs)
- **Python backend** keeps Gemini ADK (Python-first) and email parsing libraries
  in their natural home.
- **IndexedDB only** preserves the "no mail at rest on server" privacy invariant.
- **Two Vercel projects** rather than one because Vercel's Python runtime is
  function-per-file; co-locating with Next.js would either force fragmenting
  FastAPI across files or running everything through a single catch-all route
  anyway. Two projects make the boundary clean and let each deploy independently.
- **Gemini ADK** for multi-agent orchestration with built-in tool/handoff
  primitives instead of reinventing in plain Gemini calls.
