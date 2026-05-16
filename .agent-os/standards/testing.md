# Testing Standards

## Pyramid
1. **Unit** — provider parsers, AI prompt builders, schema validators. Fast,
   hermetic. No network.
2. **Contract** — provider implementations against recorded fixtures
   (`backend/tests/fixtures/`). One fixture per provider per operation.
3. **Integration** — FastAPI TestClient hitting routes with mocked providers
   and a stub Gemini agent.
4. **E2E (Playwright)** — OAuth (with provider mock) → inbox → summary → reply.
   Runs against a fully-built PWA.

## Coverage targets
- `backend/app/providers/`: ≥ 80% line.
- `backend/app/ai/`: ≥ 70% line (LLM calls are stubbed; we test prompts + routing).
- `frontend/lib/db/`, `frontend/lib/crypto/`: ≥ 90% line (these hold privacy
  invariants).
- Other code: no minimum, but every public API has at least one happy-path test.

## Rules
- Tests must not hit real provider APIs by default. Add `@pytest.mark.live` for
  live tests; skipped unless `LIVE_TESTS=1`.
- AI tests stub the model call; assert on prompt structure + tool calls, not on
  generated text.
- Playwright runs against a deterministic mock backend in CI; live OAuth is a
  manual pre-release check.
- No flaky tests. A test that fails intermittently is a bug to fix, not a retry
  to add.

## Fixtures
- `tests/fixtures/gmail/*.json` — recorded Gmail API responses (sanitized).
- `tests/fixtures/graph/*.json` — recorded MS Graph responses (sanitized).
- `tests/fixtures/imap/*.eml` — RFC 822 messages.
- Sanitization removes: real email addresses, real names, real attachments.
  See `tests/conftest.py:sanitize_fixture`.
