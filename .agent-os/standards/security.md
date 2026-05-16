# Security Standards

## Threat model (summary)
- **In scope:** OAuth token theft, mail body exposure, XSS via rendered mail HTML,
  CSRF on the OAuth callback, prompt injection from email content into AI agents.
- **Out of scope:** physical device compromise, malicious browser extensions,
  social-engineering on the user's provider account directly.

## Token handling
- OAuth access + refresh tokens are encrypted client-side using a key derived
  from a user-supplied passphrase (PBKDF2-SHA256, ≥600k iters) before storage
  in IndexedDB.
- Plain tokens never leave the browser except in `Authorization: Bearer` headers
  to our backend, over HTTPS.
- Backend never writes tokens to disk. Tokens are held only in the request scope.
- Refresh: when a 401 is returned by a provider, the backend asks the client to
  refresh and retries once. The refresh token is also passed per-request.

## HTML rendering
- All inbound mail HTML is parsed and sanitized with **DOMPurify** (strict
  config: no `<script>`, no inline events, no `javascript:` URLs).
- External images are blocked by default; user opts in per-sender.
- Rendered inside a sandboxed `<iframe sandbox>` with `allow-same-origin`
  explicitly **off**.

## OAuth flow
- Authorization Code with PKCE for both Gmail and Microsoft.
- `state` param: HMAC-signed (key = `TOKEN_SIGNING_KEY`) carrying the client's
  one-time nonce + provider id. Validated on callback. ≥ 120-bit entropy.
- Redirect URIs are pinned to the deployed frontend domain — never wildcards.

## Prompt injection
- Email body is treated as untrusted input. The AI prompt builder wraps body
  content in delimited fences with explicit instructions to ignore directives
  contained within (`<<<EMAIL_BODY>>> ... <<<END>>>`).
- The drafter agent has no tools that can send mail directly; drafts are
  returned to the user for review and sent via an explicit user action.

## Logging
- No bodies, no subjects (subjects can leak PII), no addresses, no tokens.
- Log: request id, route, status, latency, provider, account-id-hash (HMAC of
  account id with `TOKEN_SIGNING_KEY`).

## CORS
- Backend allows only `NEXT_PUBLIC_APP_URL` and Vercel preview wildcard for the
  project. No `*`.

## Dependency hygiene
- `pip-audit` and `pnpm audit` on CI.
- Dependabot weekly.
