/**
 * E2E: first-run flow.
 *
 * Verifies the boot logic — a fresh install lands on /setup, sets a
 * passphrase, and is redirected to the connect-account screen. Doesn't go
 * through the real Google OAuth (that needs a mock backend, which we'll add
 * in the Phase 1 hardening pass).
 */
import { expect, test } from "@playwright/test";

test("first-run passphrase setup routes to connect-account", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel("Passphrase").fill("correct horse battery staple");
  await page.getByLabel("Confirm").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/accounts\/connect$/);
  await expect(page.getByRole("heading", { name: "Connect an account" })).toBeVisible();
});

test("passphrase mismatch is rejected", async ({ page }) => {
  await page.goto("/setup");
  await page.getByLabel("Passphrase").fill("one-passphrase-here");
  await page.getByLabel("Confirm").fill("a-different-passphrase");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Passphrases don't match.")).toBeVisible();
});
