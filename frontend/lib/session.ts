/**
 * Session — derives the encryption key from the user's passphrase and keeps it
 * in memory only. Used to encrypt/decrypt account tokens at the IndexedDB
 * boundary. Cleared on tab close (we don't persist the key).
 *
 * Pattern: components read `getDerivedKey()`; if `null`, the UI routes the
 * user to /unlock. On unlock submit, we derive the key, verify it against the
 * stored verifier, then cache the key on this module.
 */

import { getDb } from "@/lib/db/schema";
import {
  decryptTokens,
  deriveKey,
  passphraseVerifier,
  randomBytes,
} from "@/lib/crypto/tokens";
import type { StoredAccount, TokenBundle } from "@/lib/types";

let _key: CryptoKey | null = null;

export function getDerivedKey(): CryptoKey | null {
  return _key;
}

export function isLocked(): boolean {
  return _key === null;
}

export function lock(): void {
  _key = null;
}

const enc = new TextEncoder();
const eq = (a: ArrayBuffer, b: ArrayBuffer) => {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
};

/** First-time setup: derives, stores verifier, caches key. */
export async function setupPassphrase(passphrase: string): Promise<void> {
  const db = getDb();
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt);
  const verifier = await passphraseVerifier(key);
  await db.prefs.put({
    id: "default",
    passphraseSalt: salt,
    passphraseVerifier: verifier,
    showRemoteImages: "ask",
    preferredTone: "professional and concise",
  });
  _key = key;
  void enc; // silence unused in some builds
}

/** Returning user: verifies passphrase against stored verifier. */
export async function unlock(passphrase: string): Promise<boolean> {
  const db = getDb();
  const prefs = await db.prefs.get("default");
  if (!prefs?.passphraseSalt || !prefs.passphraseVerifier) return false;
  const key = await deriveKey(passphrase, prefs.passphraseSalt);
  const verifier = await passphraseVerifier(key);
  if (!eq(verifier, prefs.passphraseVerifier)) return false;
  _key = key;
  return true;
}

export async function decryptAccountTokens(
  account: StoredAccount,
): Promise<TokenBundle> {
  if (!_key) throw new Error("locked");
  return decryptTokens(_key, account.tokenCipher, account.tokenIv);
}
