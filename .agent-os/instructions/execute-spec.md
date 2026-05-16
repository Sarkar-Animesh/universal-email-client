# Workflow: Execute a Spec

Use this when a spec exists in `.agent-os/specs/` and you're ready to build it.

## 1. Re-read
- Re-read the spec end to end before touching code. Specs evolve; the version on
  disk is authoritative.

## 2. Plan the work
- Use TodoWrite (Claude Code) to break the spec into 3–8 concrete tasks.
- Each task ends in a verifiable state (test passes, route returns expected JSON,
  UI renders expected element).

## 3. Execute task by task
- Mark each task `in_progress` before starting, `completed` immediately after.
- Run the relevant test after each task — don't batch failures.

## 4. Provider parity check
- If you touched `backend/app/providers/gmail.py`, you must also touch
  `microsoft.py` and `imap.py` (even if the change is "raise NotImplementedError
  with a TODO and a roadmap link"). Parity gaps are tracked in the spec.

## 5. Test discipline
- Backend: add unit tests for new functions, contract tests if you added a
  provider method, an integration test if you added a route.
- Frontend: add Vitest for any new util, Playwright for any new user-visible
  flow.

## 6. PR
- Title: `feat(NNN): one-line summary`.
- Body: links the spec, lists the roadmap item, calls out any ADR added.
- CI must be green before review.

## 7. Update product docs
- If behavior changed: update CLAUDE.md or relevant `.agent-os/` doc.
- If the public schema changed: bump the version in `backend/app/models/__init__.py`.
