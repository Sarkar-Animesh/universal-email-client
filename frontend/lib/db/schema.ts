/**
 * IndexedDB schema (Dexie).
 *
 * This is the ONLY persistence layer in the product. Mail bodies, threads, and
 * AI cache all live here on the user's device.
 *
 * Versioning: every change bumps the version number and adds a `.version(n)`
 * call below. Never edit an existing `.version(n).stores(...)` definition.
 */

import Dexie, { type EntityTable } from "dexie";
import type {
  StoredAccount,
  UnifiedMessage,
  UnifiedThread,
} from "@/lib/types";

/** Per-thread AI cache row. Keyed by `thread_id + ":" + kind`. */
export type AiCacheRow = {
  key: string;
  thread_id: string;
  kind: "summary" | "draft" | "priority";
  /** JSON-encoded payload. Schema is per-`kind`, validated at read time. */
  payload: string;
  /** Hash of the thread message ids it was computed against — invalidate on change. */
  inputHash: string;
  createdAt: number;
};

/** User preferences row. Singleton (id = "default"). */
export type PrefsRow = {
  id: "default";
  /** AES-GCM key for token encryption is derived from this passphrase. We
   *  store a verifier (hash of "verify"+key), never the passphrase itself. */
  passphraseVerifier?: ArrayBuffer;
  passphraseSalt?: ArrayBuffer;
  defaultAccountId?: string;
  showRemoteImages: "never" | "ask" | "always";
  preferredTone: string;
};

export class EmailDB extends Dexie {
  accounts!: EntityTable<StoredAccount, "id">;
  threads!: EntityTable<UnifiedThread, "id">;
  messages!: EntityTable<UnifiedMessage, "id">;
  aiCache!: EntityTable<AiCacheRow, "key">;
  prefs!: EntityTable<PrefsRow, "id">;

  constructor() {
    super("universal-email-client");
    this.version(1).stores({
      accounts: "id, provider, email, addedAt",
      // Multi-entry index on labels lets us query "inbox" / "starred" cheaply.
      threads: "id, account_id, last_message_date, *labels",
      messages: "id, thread_id, account_id, date",
      aiCache: "key, thread_id, createdAt",
      prefs: "id",
    });
  }
}

let _db: EmailDB | null = null;
export function getDb(): EmailDB {
  if (!_db) _db = new EmailDB();
  return _db;
}
