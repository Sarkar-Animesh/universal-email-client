/**
 * Token encryption round-trip and verifier consistency.
 *
 * These tests guard the privacy invariant: tokens stored in IndexedDB are
 * unrecoverable without the user's passphrase. If we break this, a malicious
 * extension or device snapshot could siphon mail access.
 */
import { describe, expect, it } from "vitest";
import {
  deriveKey,
  encryptTokens,
  decryptTokens,
  passphraseVerifier,
  randomBytes,
} from "@/lib/crypto/tokens";

describe("token encryption", () => {
  it("round-trips access + refresh tokens", async () => {
    const salt = randomBytes(16);
    const key = await deriveKey("correct horse battery staple", salt);
    const original = {
      access_token: "ya29.abc",
      refresh_token: "1//abc.refresh",
      expires_in: 3600,
      token_type: "Bearer",
      scope: "https://www.googleapis.com/auth/gmail.modify",
    };
    const { cipher, iv } = await encryptTokens(key, original);
    const decoded = await decryptTokens(key, cipher, iv);
    expect(decoded).toEqual(original);
  });

  it("fails to decrypt with a different passphrase", async () => {
    const salt = randomBytes(16);
    const k1 = await deriveKey("first passphrase value", salt);
    const k2 = await deriveKey("a totally different one", salt);
    const { cipher, iv } = await encryptTokens(k1, {
      access_token: "a",
      expires_in: 1,
      token_type: "Bearer",
      scope: "",
    });
    await expect(decryptTokens(k2, cipher, iv)).rejects.toBeTruthy();
  });

  it("produces a consistent verifier for the same key", async () => {
    const salt = randomBytes(16);
    const k1 = await deriveKey("same pass", salt);
    const k2 = await deriveKey("same pass", salt);
    const v1 = new Uint8Array(await passphraseVerifier(k1));
    const v2 = new Uint8Array(await passphraseVerifier(k2));
    expect([...v1]).toEqual([...v2]);
  });

  it("produces different verifiers for different keys", async () => {
    const salt = randomBytes(16);
    const k1 = await deriveKey("one", salt);
    const k2 = await deriveKey("two", salt);
    const v1 = new Uint8Array(await passphraseVerifier(k1));
    const v2 = new Uint8Array(await passphraseVerifier(k2));
    expect([...v1]).not.toEqual([...v2]);
  });
});
