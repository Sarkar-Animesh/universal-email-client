# Spec NNN — {{Feature Name}}

**Status:** Draft | In Review | Approved | Implemented
**Roadmap item:** Phase X — {{item}}
**Owner:** {{name or sub-agent}}
**Created:** YYYY-MM-DD
**Related ADRs:** (none / ADR-XXX)

## Motivation
Two to four sentences. What does the user want? Why now?

## In scope
- ...

## Out of scope
- ...

## User stories
- As a {{user}}, I want to {{do thing}} so that {{outcome}}.

## Unified schema impact
Does this change `UnifiedMessage`, `UnifiedThread`, `UnifiedAccount`? If yes,
show the diff. If no, write "No changes."

## Per-provider details
| Concern | Gmail | Microsoft Graph | IMAP |
| --- | --- | --- | --- |
| Endpoint / verb | | | |
| Auth scope | | | |
| Edge cases | | | |

## AI considerations
- Which agent(s)? (summarizer / drafter / prioritizer / search_rewriter / new)
- Prompt changes?
- Cost envelope per call?

## Privacy & security
- Any new data leaving the device? (default answer: no)
- Any new server-side persistence? (default answer: no — if yes, write an ADR)
- Any new HTML rendering surface? Sanitization plan?

## Test plan
- Unit:
- Contract:
- Integration:
- E2E:

## Rollout
- Behind a flag? Default off?
- Migration of existing IndexedDB data?

## Open questions
- ...
