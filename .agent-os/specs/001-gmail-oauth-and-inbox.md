# Spec 001 — Gmail OAuth and Inbox

**Status:** Approved
**Roadmap item:** Phase 1 — Single-account Gmail MVP
**Owner:** main thread + `provider-engineer` sub-agent
**Created:** 2026-05-14
**Related ADRs:** ADR-001, ADR-003, ADR-005

## Motivation
Phase 1 starts with Gmail because the Gmail REST API is the cleanest of the
three and exercises every layer (OAuth, fetch, AI, send) end to end. Once this
slice ships, adding O365 and IMAP is structural rather than exploratory.

## In scope
- Google OAuth (Authorization Code + PKCE, offline access).
- Token relay model: client encrypts tokens with WebCrypto, sends per request.
- Backend Gmail provider implementing list, get-thread, send, modify-labels.
- Inbox list view in the PWA (newest first, 50 per page, cursor pagination).
- Thread view (HTML sanitized).
- "Summarize this thread" calling the `summarizer` Gemini ADK agent.

## Out of scope
- Multi-account merge (Phase 4).
- Search (next spec).
- Drafting / reply AI (Phase 5).
- Push notifications (Phase 6).

## User stories
- As a user, I want to sign in with my Gmail account so I can see my inbox.
- As a user, I want to tap a thread and read the messages.
- As a user, I want a one-tap AI summary of long threads.
- As a user, I want to archive or delete a thread.

## Unified schema impact
First introduction of the unified schemas:

```python
class UnifiedAccount(BaseModel):
    id: str                    # hash(provider + provider_account_id)
    provider: Literal["gmail", "microsoft", "imap"]
    email: EmailStr
    display_name: str
    avatar_url: str | None

class UnifiedMessage(BaseModel):
    id: str                    # provider-native id, namespaced by account
    thread_id: str
    account_id: str
    from_: EmailAddress
    to: list[EmailAddress]
    cc: list[EmailAddress]
    bcc: list[EmailAddress]
    subject: str
    snippet: str               # ≤ 200 chars
    body_html: str | None      # sanitized server-side? NO — sanitized on client
    body_text: str | None
    date: datetime
    labels: list[str]          # provider-native labels normalized
    flags: MessageFlags        # unread, starred, important, has_attachments
    in_reply_to: str | None
    references: list[str]

class UnifiedThread(BaseModel):
    id: str
    account_id: str
    subject: str
    participants: list[EmailAddress]
    message_count: int
    last_message_date: datetime
    labels: list[str]
    flags: ThreadFlags
    snippet: str
```

## Per-provider details
| Concern | Gmail |
| --- | --- |
| OAuth endpoint | `https://accounts.google.com/o/oauth2/v2/auth` |
| Token endpoint | `https://oauth2.googleapis.com/token` |
| Scope | `https://www.googleapis.com/auth/gmail.modify` (read + modify, not delete-forever) |
| List endpoint | `GET /gmail/v1/users/me/threads?labelIds=INBOX&maxResults=50` |
| Get thread | `GET /gmail/v1/users/me/threads/{id}?format=full` |
| Send | `POST /gmail/v1/users/me/messages/send` |
| Modify labels | `POST /gmail/v1/users/me/threads/{id}/modify` |
| Edge cases | Promotions/Updates categories appear as labels CATEGORY_PROMOTIONS etc. |

Microsoft and IMAP: see specs 002, 003 (TBD).

## AI considerations
- Agent: `summarizer`.
- Input: thread (≤ 20 messages, truncated if larger; oldest preserved as
  context, last 10 in full).
- Output: 3-bullet summary + optional "what's the ask?" sentence + suggested
  next action ("reply", "wait", "archive", "delegate").
- Cost: target < 1500 input tokens per summary at typical thread length.

## Privacy & security
- No new server persistence. Tokens encrypted in IndexedDB.
- HTML sanitization happens client-side with DOMPurify before render; server
  passes through `body_html` verbatim from Gmail.
- OAuth state HMAC-signed (see [security.md](../standards/security.md#oauth-flow)).

## Test plan
- **Unit:** Gmail message → `UnifiedMessage` mapper, label normalization,
  participant extraction.
- **Contract:** record one inbox-list and one thread-get response; assert
  mapper output.
- **Integration:** FastAPI TestClient hits `/auth/gmail/callback` → mocked
  token exchange → `/mail/threads` returns fixture data.
- **E2E:** Playwright mocks Google's OAuth endpoint and exercises sign-in →
  inbox → open thread → summarize button → assert summary appears.

## Rollout
- No flag — this is the first slice, off-master means nothing yet.
- IndexedDB schema version starts at 1.
