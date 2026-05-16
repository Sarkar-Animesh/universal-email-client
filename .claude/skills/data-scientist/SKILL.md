---
name: data-scientist
description: Use when working on email analytics, AI/ML features, usage metrics, inbox prioritization models, or any feature that involves aggregating, analyzing, or visualizing email data — including the Gemini-powered prioritizer agent, search-query rewriting, or future on-device learning. Skip for pure UI or OAuth plumbing.
---

# Data Scientist Skill

Domain knowledge for the analytics and AI-data layer of the universal email client.

## This project's data constraints (non-negotiable)

Per ADR-001, **no mail bodies, subjects, or addresses ever persist server-side**.
All analytics must operate:
- **Client-side** on IndexedDB data, or
- **Stateless** on data sent by the client per-request (processed and discarded).

This means no training pipelines, no embedding stores, no server-side feature
logs, no ML model training on user data. Models live in Gemini (via API call).

## Data available for analysis

| Source | Where | Notes |
| --- | --- | --- |
| Thread metadata | IndexedDB `threads` table | `last_message_date`, `message_count`, labels, flags — ok to aggregate |
| Message metadata | IndexedDB `messages` table | date, from, subject, snippet only — never body |
| AI cache | IndexedDB `aiCache` table | Previously computed summaries/drafts — keyed by `thread_id` |
| Prioritizer output | Returned per request | `important`, `follow_up`, `newsletter`, `promo`, `other` |

## Gemini ADK agents (AI layer)

Four agents in `backend/app/ai/agents.py`, all Gemini 2.0/2.5 Flash/Pro:

| Agent | Input | Output | When to call |
| --- | --- | --- | --- |
| `summarizer` | `UnifiedThread` (≤ 20 msgs) | 3 bullets + suggested action | On thread open (cached 1h in `aiCache`) |
| `drafter` | Thread + tone hint | RFC 822-ready body | On compose/reply |
| `prioritizer` | List of thread snippets (batch ≤ 50) | Priority label per thread | On inbox sync |
| `search_rewriter` | Natural-language query | Provider-specific query string | Before calling search endpoint |

### Prioritizer batching pattern
```python
# backend/app/ai/agents.py — prioritizer
# Send snippets in batches of 50; map results back by position.
BATCH_SIZE = 50
for i in range(0, len(threads), BATCH_SIZE):
    batch = threads[i:i + BATCH_SIZE]
    labels = await prioritizer.run(batch)
    for thread, label in zip(batch, labels):
        thread.priority_label = label
```

## Prompt injection fencing

Every email body passed to a Gemini agent is wrapped:
```
<<<EMAIL_BODY>>>
{body_text_or_html}
<<<END_EMAIL_BODY>>>
```
Implemented via `before_model_callback` in the ADK agent. Never skip this —
malicious email content can otherwise hijack the agent's instructions.

## Client-side analytics patterns

Safe things to compute entirely in-browser from IndexedDB:

```typescript
// Thread volume over time (no server needed)
const threads = await db.threads.where("account_id").equals(accountId).toArray();
const byDay = threads.reduce((acc, t) => {
  const day = t.last_message_date.slice(0, 10);
  acc[day] = (acc[day] ?? 0) + 1;
  return acc;
}, {} as Record<string, number>);

// Unread ratio
const unread = threads.filter(t => t.flags.has_unread).length;
const unreadRatio = unread / threads.length;
```

## Priority label distribution

After the prioritizer runs, labels are stored on `UnifiedThread.labels`.
Useful aggregations:
```typescript
const dist = threads.reduce((acc, t) => {
  const priority = t.labels.find(l =>
    ["important","follow_up","newsletter","promo","other"].includes(l)
  ) ?? "other";
  acc[priority] = (acc[priority] ?? 0) + 1;
  return acc;
}, {} as Record<string, number>);
```

## What NOT to do

- **No server-side logging of snippets, subjects, or sender addresses.** structlog
  redacts these keys automatically — don't bypass with raw `print()` or `logging`.
- **No embedding or vectorizing email content.** Would require server-side storage
  (violates ADR-001) or sending all mail to a vector DB (privacy risk).
- **No A/B testing framework** that logs per-user events server-side.
- **No localStorage** for analytics — use IndexedDB so the service worker can
  work with the data offline.

## Adding a new AI feature

1. Write a spec under `.agent-os/specs/` (use `/plan-feature`).
2. Add an ADR entry in `.agent-os/product/decisions.md` if the feature touches
   data residency or model selection.
3. Delegate implementation to `ai-engineer` sub-agent.
4. Wrap all model calls in prompt injection fences.
5. Cache results in `aiCache` with a reasonable TTL (default 1h for summaries).
