# Code Style

## Python (backend)
- Format: `ruff format` (line length 100).
- Lint: `ruff check` — rule set in `pyproject.toml`.
- Typing: full annotations on public functions. `from __future__ import annotations`.
- Async: prefer `httpx.AsyncClient`, `aioimaplib`, `aiosmtplib`. No sync I/O on the
  request path.
- Errors: raise `HTTPException` from routes; raise domain exceptions
  (`ProviderError`, `OAuthError`) from `providers/` and `oauth/`, mapped centrally.
- Logging: structlog JSON. Never log tokens, mail bodies, or headers containing
  `Authorization`, `Cookie`, or `Set-Cookie`.

## TypeScript (frontend)
- Format: Prettier defaults; semicolons on.
- Lint: ESLint, Next.js config.
- `strict: true`, `noUncheckedIndexedAccess: true`.
- Components: function components, PascalCase files for components,
  kebab-case for routes.
- No `any` without an inline justification comment.
- Client/server boundary: components default to server; mark `"use client"`
  only where needed (anything touching IndexedDB, crypto, or interactive state).

## Naming
- Unified schemas: `UnifiedMessage`, `UnifiedThread`, `UnifiedAccount` — the
  word *unified* is the signal that this is the cross-provider shape.
- Provider-specific shapes: `GmailMessage`, `GraphMessage`, `ImapMessage`.

## Imports
- Backend: stdlib → third-party → local, each group sorted.
- Frontend: external → `@/lib` → `@/components` → relative.
