# Development Workflow

How this project was built using Claude Code CLI, the Agent OS methodology,
and a multi-agent spec-driven loop.

---

## The One-Sentence Version

Write a spec → have the right sub-agent implement it → run tests → repeat.

---

## Tools Used

| Tool | Role |
| --- | --- |
| **Claude Code CLI** | Primary development environment. All code, docs, and config written through it. |
| **Agent OS** | Methodology: spec first, code second. Specs live in `.agent-os/specs/` and are the source of truth for what to build. |
| **CLAUDE.md** | Master context file. Every AI agent (and human) reads this before touching anything. Encodes invariants, file map, quick commands. |
| **Sub-agents** | Three domain specialists (`provider-engineer`, `ai-engineer`, `pwa-engineer`) loaded from `.claude/agents/`. Claude Code dispatches to them automatically based on which files are being edited. |
| **Skills** | Two reference documents (`email-mime`, `oauth-pkce`) that encode hard-won domain knowledge so it doesn't have to be re-derived each session. |
| **Hooks** | Two Node.js scripts that enforce invariants on every edit — `secret-scan` (prevent credential commits) and `post-edit-format` (auto-format). |
| **Plugin manifest** | `.claude/plugins/plugin.json` — bundles the above into one unit; auto-loads in any collaborator's workspace. |

---

## The Spec → Sub-Agent → Test Loop

### 1. Plan a feature

Before writing any code, run:
```
/plan-feature <feature name>
```
This opens the `plan-feature` workflow (`.agent-os/instructions/plan-feature.md`),
which prompts for: problem statement, affected files, acceptance criteria, and
out-of-scope items. The output is a spec file in `.agent-os/specs/NNN-name.md`.

The spec is reviewed and approved before the next step. If the spec changes
scope, the ADR log (`.agent-os/product/decisions.md`) gets updated first.

### 2. Execute the spec

```
/execute-spec .agent-os/specs/NNN-name.md
```
The execute-spec workflow (`.agent-os/instructions/execute-spec.md`) reads the
spec, identifies which sub-agent owns the affected files, and hands the
implementation task to that agent.

**Which agent gets the work?**

| Files touched | Sub-agent dispatched |
| --- | --- |
| `backend/app/providers/` or `backend/app/oauth/` | provider-engineer |
| `backend/app/ai/` | ai-engineer |
| `frontend/` | pwa-engineer |
| Cross-cutting | Main agent co-ordinates across sub-agents sequentially |

Each sub-agent:
1. Re-reads the spec.
2. Writes the contract test first (assert the output shape before implementing).
3. Implements the code.
4. Verifies parity (for provider-engineer: same method signature in all three
   providers, even if two are stubs raising `ProviderUnsupportedError`).

### 3. Run tests

```bash
# Backend
cd backend && uv run pytest

# Frontend unit
cd frontend && pnpm test

# Frontend E2E
cd frontend && pnpm test:e2e
```

CI runs all three jobs on every push (`.github/workflows/ci.yml`).

### 4. Iterate

If tests fail, the same sub-agent fixes the implementation. The spec is the
acceptance bar — tests pass when the spec's acceptance criteria are met.

---

## Safety Invariants (Enforced Automatically)

Two hooks run on every file write, requiring no human enforcement:

**`secret-scan` (PreToolUse)** — any edit containing an OAuth client secret,
AWS key, PEM key, or high-entropy bearer token is blocked before it touches
disk. This makes it structurally impossible to accidentally commit credentials,
even if a sub-agent hallucinates a real-looking key.

**`post-edit-format` (PostToolUse)** — Python files are auto-formatted with
`ruff format`; TypeScript/JSON/Markdown with `prettier`. The repo stays
consistently formatted without a separate review step.

---

## Architectural Decision Records

Any change to a privacy invariant, hosting decision, or cross-cutting
architectural choice requires an ADR entry in `.agent-os/product/decisions.md`
before the code is written. Current ADRs:

| ADR | Decision |
| --- | --- |
| ADR-001 | No mail bodies, subjects, or addresses persist server-side |
| ADR-002 | Gemini ADK for all AI agents |
| ADR-003 | Two separate Vercel projects (frontend + backend) |
| ADR-004 | No IMAP IDLE; client-side polling instead |
| ADR-005 | Provider abstraction in Python (`MailProvider` Protocol) |

---

## Phase Gating

The roadmap (`.agent-os/product/roadmap.md`) is divided into six phases.
Code for Phase N+1 is not started until Phase N tests are green. This
prevents half-implemented features from being deployed.

Current state: **Phase 0** (foundation scaffold) + **Phase 1** (Gmail OAuth →
inbox → AI summary → reply) are implemented. Office 365 (Phase 2) and IMAP
(Phase 3) are stub-implemented — they satisfy the provider parity test but
raise `ProviderUnsupportedError` until their phases begin.

---

## Key Files Quick-Reference

| What | Where |
| --- | --- |
| Repo rules for AI | `CLAUDE.md` |
| Architecture decisions | `.agent-os/product/decisions.md` |
| Active specs | `.agent-os/specs/` |
| Sub-agent definitions | `.claude/agents/` |
| Domain skills | `.claude/skills/` |
| Hooks | `.claude/hooks/` |
| Plugin manifest | `.claude/plugins/plugin.json` |
| Backend entry (Vercel) | `backend/api/index.py` |
| Frontend entry (Next.js) | `frontend/app/page.tsx` |
