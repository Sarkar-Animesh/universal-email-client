/**
 * Token encryption.
 *
 * Tokens (OAuth access + refresh) are encrypted at rest in IndexedDB using
 * AES-GCM. The encryption key is derived from a user-supplied passphrase via
 * PBKDF2-SHA256 (600k iters). The passphrase is never stored — we store a
 * verifier (HMAC of the constant "verify" with the derived key) so we can
 * check that an entered passphrase is correct before attempting to decrypt.
 *
 * On the wire (to the backend) tokens are plaintext over HTTPS in an
 * `Authorization: Bearer` header — the backend can't operate on ciphertext.
 */

import type { TokenBundle } from "@/lib/types";

const ALGO = "AES-GCM";
const KDF_ITERS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function deriveKey(
  passphrase: string,
  salt: ArrayBuffer,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: KDF_ITERS, salt },
    baseKey,
    { name: ALGO, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function randomBytes(n: number): ArrayBuffer {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a.buffer;
}

export async function encryptTokens(
  key: CryptoKey,
  tokens: TokenBundle,
): Promise<{ cipher: ArrayBuffer; iv: ArrayBuffer }> {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    enc.encode(JSON.stringify(tokens)),
  );
  return { cipher, iv };
}

export async function decryptTokens(
  key: CryptoKey,
  cipher: ArrayBuffer,
  iv: ArrayBuffer,
): Promise<TokenBundle> {
  const buf = await crypto.subtle.decrypt({ name: ALGO, iv }, key, cipher);
  return JSON.parse(dec.decode(buf)) as TokenBundle;
}

/** Produce a verifier byte string from a derived key. Stored once at setup;
 *  used later to confirm a re-entered passphrase produces the same key. */
export async function passphraseVerifier(key: CryptoKey): Promise<ArrayBuffer> {
  // Encrypt a known constant under a zero IV. Cheap and adequate for
  // "is this passphrase correct" — not used for any other purpose.
  const iv = new Uint8Array(12); // all zeros, fine because we only ever
  // encrypt one constant plaintext with it; we never reuse for variable data.
  return crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    enc.encode("verify"),
  );
}
