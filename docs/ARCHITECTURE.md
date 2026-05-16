# Architecture Notes

A deeper companion to [CLAUDE.md](../CLAUDE.md) and
[.agent-os/product/decisions.md](../.agent-os/product/decisions.md). Read those
first; this doc fills in the *why* behind the bits.

## Why a stateless backend?

The product's distinguishing claim is **mail stays on your device**. The
backend exists for three things browsers can't do directly:

1. **Cross-origin TCP** (IMAP/SMTP). Not available from a browser.
2. **OAuth client secret handling.** Some flows technically work without it,
   but provider portals require pre-registered redirect URIs and (for Google)
   a confidential client; the secret has to live somewhere safer than a
   service worker.
3. **AI proxying.** We don't want to ship a Gemini API key to the browser.

Everything else is on the client. The backend never reads its own DB because
it doesn't have one.

## Why Gemini ADK?

Three reasons:

1. The product has discrete agents (summarize / draft / prioritize / search-
   rewrite), each with different prompts, models, and quality bars. ADK gives
   us a single primitive (`LlmAgent`) and a tracing surface that makes their
   behavior comparable.
2. Phase 4's prioritizer feeds the summarizer's "what's important right now"
   surface. That handoff is a first-class ADK concept.
3. We get a built-in feedback channel (the trace id) the client can attach to
   thumbs-up/down — that's how we'll improve over time without storing mail.

## Why IndexedDB only?

We considered a server cache layer for performance — pre-classify priorities
nightly so the morning open is instant. We rejected it because:
- It requires a long-lived mail-at-rest copy.
- The privacy regression isn't justified by the latency win on the *first
  open of the day*. Subsequent opens read from local IndexedDB anyway.
- The Vercel Hobby + Pro plans don't support always-on workers cheaply, so
  the engineering cost is also real.

## Why two Vercel projects instead of one?

Vercel's Python runtime is function-per-file: each `api/*.py` is its own
serverless function. Co-locating with Next.js would either:
- Force one giant `api/index.py` (which is what we *would* do if we collapsed
  this into one project), but then any breakage to the Python deploy could
  block the frontend deploy.
- Or fragment FastAPI into many small files, which fights the framework.

Two projects keeps each side independently deployable and lets the frontend's
cold starts stay pure-JS.

## Provider parity — the "third file" rule

Every method in `backend/app/providers/gmail.py` has a same-shape method in
`microsoft.py` and `imap.py`. If a feature genuinely can't work on one
provider, the method raises `ProviderUnsupportedError`. This is enforced by
the `MailProvider` `Protocol`, but more importantly by the parity test the
provider-engineer sub-agent writes as part of every spec implementation.

Why it matters: the rest of the codebase asks the provider directly. There
are zero `if provider == "gmail"` branches outside `app/providers/`. The unit
test that asserts this (a grep for `provider ==` in routes/ai/etc.) is
worth adding once you have all three providers wired up.

## Threading model

- **Gmail:** `threadId` is server-issued and stable. We use it directly.
- **Microsoft Graph:** `conversationId`. Same shape, different name.
- **IMAP:** no native thread id. We derive a thread id from the first
  message's `Message-ID` and group by `In-Reply-To` + `References`. This is
  the algorithm libraries like JMAP and notmuch use; it's standard but slow
  on huge mailboxes — Phase 3 spec will define the bounds.

## What ADRs aren't (yet)

- We haven't decided on a notification strategy beyond Phase 6 polling
  (Web Push vs. a small always-on worker on Cloudflare Workers vs. delegating
  to provider push). When we do, that becomes ADR-006.
- We haven't picked an encryption story for attachments beyond what the
  provider stores. Phase 5+.
