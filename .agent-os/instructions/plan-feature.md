# Workflow: Plan a Feature (specs-driven)

Use this when about to start work on a new feature, before writing code.

## 1. Pick the feature
- Look in `.agent-os/product/roadmap.md` for the next unchecked item.
- If working off a user request that isn't on the roadmap, add it to the roadmap
  in the appropriate phase first (or push back if it's out of scope per mission).

## 2. Write the spec
- Create `.agent-os/specs/NNN-short-slug.md` (NNN = next number, zero-padded).
- Use the template in `.agent-os/specs/_template.md`.
- Spec must include: motivation, scope (in and out), unified-shape changes,
  per-provider details, AI considerations, test plan, rollout plan.

## 3. Decision check
- Does this change a privacy or architectural invariant? If yes, write an ADR in
  `.agent-os/product/decisions.md` and link it from the spec.

## 4. Delegate
- Provider work → `provider-engineer` sub-agent.
- AI / Gemini ADK work → `ai-engineer` sub-agent.
- Frontend / PWA work → `pwa-engineer` sub-agent.
- Cross-cutting (auth, sync, security) → handle in main thread, citing the spec.

## 5. Implement
- Branch: `feat/NNN-short-slug`.
- Write tests *with* the code, not after. Each PR carries its tests.
- Run `ruff check && pytest` (backend) and `pnpm lint && pnpm test` (frontend)
  before opening a PR.

## 6. Close out
- Check the roadmap item.
- If a follow-up emerged, file it as a new spec or roadmap item — don't leave it
  as a comment in code.
