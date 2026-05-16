/**
 * Vitest setup.
 *
 * - Polyfill IndexedDB via fake-indexeddb so Dexie works in node.
 * - Provide a minimal WebCrypto SubtleCrypto if happy-dom doesn't expose one.
 */

import "fake-indexeddb/auto";

if (typeof globalThis.crypto === "undefined" || !globalThis.crypto.subtle) {
  const { webcrypto } = await import("node:crypto");
  // @ts-expect-error - assigning Node's webcrypto to the global slot
  globalThis.crypto = webcrypto;
}
