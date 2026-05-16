# Roadmap

Phases are scopes, not timelines. Each phase ships when its acceptance criteria
pass. Specs for each item live under `.agent-os/specs/`.

## Phase 0 — Foundation (this scaffold)
- [x] Repo structure, CLAUDE.md, Agent OS docs
- [x] Sub-agent definitions, skills, hooks
- [x] FastAPI skeleton with provider abstraction
- [x] Next.js 15 PWA shell with manifest + service worker
- [x] IndexedDB schema (Dexie)
- [x] Test harnesses (pytest, Vitest, Playwright)

## Phase 1 — Single-account Gmail MVP
- [ ] Gmail OAuth (PKCE, offline access, incremental scopes)
- [ ] List inbox via Gmail API, page through history
- [ ] Thread view (HTML sanitized, inline images)
- [ ] AI summary (Gemini ADK `summarizer` agent)
- [ ] Send (reply / forward / new) via Gmail API
- [ ] Archive, delete, label add/remove
- [ ] Search (server-side via Gmail q=)
- [ ] Offline read of cached threads
- **Acceptance:** install PWA on Android, sign in to Gmail, summarize a thread,
  reply, archive — all in under 60 seconds total.

## Phase 2 — Office 365 parity
- [ ] MS Graph OAuth (auth code + PKCE)
- [ ] List / fetch / send via Graph
- [ ] Folder ↔ label mapping (Outlook categories)
- **Acceptance:** all Phase-1 actions work on an O365 account.

## Phase 3 — Generic IMAP
- [ ] App-password flow (Yahoo, AOL, custom)
- [ ] IMAP fetch (BODYSTRUCTURE, ENVELOPE) via aioimaplib
- [ ] SMTP send (with STARTTLS/SSL)
- [ ] IDLE for push (where supported)
- **Acceptance:** Yahoo + AOL + a custom Dovecot test box all pass parity tests.

## Phase 4 — Unified inbox & AI prioritization
- [ ] Multi-account merge view, account-aware compose-from
- [ ] `prioritizer` agent: important / follow-up / newsletter / promo / other
- [ ] On-device feedback loop (thumbs up/down → user-style profile in IndexedDB)
- **Acceptance:** newsletters auto-bucketed with ≥90% precision on a 200-email
  test corpus.

## Phase 5 — Drafting & search polish
- [ ] `drafter` agent: tone-matched replies, style-profile-aware
- [ ] AI-rewritten search ("emails from Sarah about the Q3 launch" → provider q=)
- [ ] Voice dictation for compose (Web Speech API)
- **Acceptance:** drafter accept-rate ≥40% on internal dogfood.

## Phase 6 — Hardening
- [ ] Push notifications (Web Push, PWA)
- [ ] Encrypted on-device backup/export
- [ ] Accessibility audit (WCAG 2.2 AA)
- [ ] Lighthouse PWA score ≥95 on mobile

## Explicitly deferred
- Native iOS/Android.
- Server-side AI on encrypted mail (would require keys at rest).
- Calendar / contacts / tasks / notes — see [mission.md](mission.md).
