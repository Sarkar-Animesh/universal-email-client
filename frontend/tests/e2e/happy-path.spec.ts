/**
 * E2E: full happy path with a mocked backend.
 *
 * Walks the slice that real users hit on day one:
 *   setup passphrase  →  connect Gmail (faked OAuth round-trip)  →
 *   unlock after the redirect wipes the in-memory key            →
 *   inbox lists a thread  →  open it  →  AI Summarize.
 *
 * The FastAPI backend (http://localhost:8000) and Google's authorize URL are
 * both stubbed via Playwright route interception. The fake `auth_url` points
 * back at our own /auth/gmail/callback so the redirect stays inside the test.
 */
import { test, expect, type Route } from "@playwright/test";

const API = "http://localhost:8000";
const PASSPHRASE = "correct horse battery staple";

const ACCOUNT = {
  id: "acct-1",
  provider: "gmail" as const,
  email: "tester@example.com",
  display_name: "Test User",
  avatar_url: null,
};

const THREAD = {
  id: "thread-1",
  account_id: ACCOUNT.id,
  subject: "Lunch tomorrow?",
  participants: [{ address: "alice@example.com", name: "Alice" }],
  message_count: 1,
  last_message_date: new Date().toISOString(),
  labels: ["inbox"],
  flags: { has_unread: true, has_starred: false, has_attachments: false },
  snippet: "Want to grab lunch tomorrow at noon?",
};

const MESSAGE = {
  id: "msg-1",
  thread_id: THREAD.id,
  account_id: ACCOUNT.id,
  from: { address: "alice@example.com", name: "Alice" },
  to: [{ address: ACCOUNT.email }],
  cc: [],
  bcc: [],
  reply_to: [],
  subject: THREAD.subject,
  snippet: THREAD.snippet,
  body_html: null,
  body_text: "Want to grab lunch tomorrow at noon?",
  date: THREAD.last_message_date,
  labels: ["inbox"],
  flags: {
    unread: true,
    starred: false,
    important: false,
    has_attachments: false,
    draft: false,
  },
  in_reply_to: null,
  references: [],
  attachments: [],
};

async function json(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test.describe("happy path (mocked backend)", () => {
  test.beforeEach(async ({ context }) => {
    await context.route(`${API}/auth/gmail/start`, async (route) => {
      const req = JSON.parse(route.request().postData() ?? "{}");
      // The "Google authorize URL" is just our own callback with the code/state
      // pre-filled — keeps the round-trip inside the test browser.
      const cb = new URL(req.redirect_uri);
      cb.searchParams.set("code", "fake-code");
      cb.searchParams.set("state", "fake-state");
      await json(route, {
        auth_url: cb.toString(),
        state: "fake-state",
        code_verifier: "fake-verifier",
      });
    });

    await context.route(`${API}/auth/gmail/callback`, (route) =>
      json(route, {
        tokens: {
          access_token: "access-1",
          refresh_token: "refresh-1",
          expires_in: 3600,
          token_type: "Bearer",
          scope: "https://www.googleapis.com/auth/gmail.modify",
        },
        account: ACCOUNT,
      }),
    );

    await context.route(/\/mail\/threads(\?|$)/, (route) =>
      json(route, { threads: [THREAD], next_cursor: null }),
    );

    await context.route(
      new RegExp(`/mail/threads/${THREAD.id}(\\?|$)`),
      (route) => json(route, { thread: THREAD, messages: [MESSAGE] }),
    );

    await context.route(`${API}/ai/summarize`, (route) =>
      json(route, {
        bullets: [
          "Alice asks about lunch tomorrow at noon",
          "No location proposed yet",
        ],
        ask: "Confirm whether noon works and propose a place",
        suggested_action: "follow-up",
      }),
    );
  });

  test("setup → connect → unlock → inbox → thread → summary", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/setup$/);

    await page.getByLabel("Passphrase").fill(PASSPHRASE);
    await page.getByLabel("Confirm").fill(PASSPHRASE);
    await page.getByRole("button", { name: /Continue/i }).click();

    await expect(page).toHaveURL(/\/accounts\/connect$/);
    await page.getByRole("button", { name: /Gmail/i }).click();

    // Full-page redirect wiped the derived key, so the callback prompts to
    // unlock before exchanging the code.
    await expect(page).toHaveURL(/\/auth\/gmail\/callback\?/);
    await expect(
      page.getByRole("heading", { name: /Unlock to continue/i }),
    ).toBeVisible();

    await page.getByLabel("Passphrase").fill(PASSPHRASE);
    await page.getByRole("button", { name: /Unlock & Connect/i }).click();

    await expect(page).toHaveURL(/\/inbox$/);
    await expect(page.getByText(ACCOUNT.email)).toBeVisible();

    const threadRow = page.getByRole("link", {
      name: /Alice.*Lunch tomorrow/i,
    });
    await expect(threadRow).toBeVisible();
    await threadRow.click();

    await expect(page).toHaveURL(new RegExp(`/thread/${THREAD.id}$`));
    await expect(
      page.getByRole("heading", { name: /Lunch tomorrow/i }),
    ).toBeVisible();
    await expect(page.getByText(/Want to grab lunch tomorrow/)).toBeVisible();

    await page.getByRole("button", { name: /^Summarize$/ }).click();
    await expect(page.getByText(/AI Summary/i)).toBeVisible();
    await expect(
      page.getByText(/Alice asks about lunch tomorrow at noon/),
    ).toBeVisible();
    await expect(page.getByText(/Confirm whether noon works/)).toBeVisible();
  });
});
