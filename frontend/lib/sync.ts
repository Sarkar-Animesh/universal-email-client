/**
 * Sync helpers — fetch from provider, write to IndexedDB, return what's stored.
 *
 * The frontend invariant is "IndexedDB is the source of truth for the UI." We
 * never render directly from a fetch response; we write first, then the UI
 * re-renders from Dexie via dexie-react-hooks.
 */

import { mail, AuthExpired, auth as authClient } from "@/lib/api/client";
import { getDb } from "@/lib/db/schema";
import {
  decryptAccountTokens,
  getDerivedKey,
} from "@/lib/session";
import { encryptTokens } from "@/lib/crypto/tokens";
import type {
  ProviderId,
  StoredAccount,
  UnifiedThread,
  TokenBundle,
} from "@/lib/types";

class StillLockedError extends Error {
  constructor() {
    super("locked");
  }
}

async function tokensFor(account: StoredAccount): Promise<TokenBundle> {
  if (!getDerivedKey()) throw new StillLockedError();
  return decryptAccountTokens(account);
}

async function persistTokens(account: StoredAccount, tokens: TokenBundle) {
  const key = getDerivedKey();
  if (!key) throw new StillLockedError();
  const { cipher, iv } = await encryptTokens(key, tokens);
  await getDb().accounts.update(account.id, {
    tokenCipher: cipher,
    tokenIv: iv,
    accessExpiresAt: Date.now() + tokens.expires_in * 1000,
  });
}

async function withFreshToken<T>(
  account: StoredAccount,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const tokens = await tokensFor(account);
  try {
    return await fn(tokens.access_token);
  } catch (e) {
    if (e instanceof AuthExpired && tokens.refresh_token) {
      const refreshed =
        account.provider === "gmail"
          ? await authClient.gmailRefresh(tokens.refresh_token)
          : account.provider === "microsoft"
            ? await authClient.microsoftRefresh(tokens.refresh_token)
            : (() => {
                throw new Error(
                  `Refresh not implemented for provider ${account.provider}`,
                );
              })();
      await persistTokens(account, refreshed);
      return fn(refreshed.access_token);
    }
    throw e;
  }
}

export async function syncInbox(account: StoredAccount): Promise<UnifiedThread[]> {
  const provider = account.provider as ProviderId;
  return withFreshToken(account, async (tok) => {
    const page = await mail.listThreads(provider, tok, account.id, {
      label: "inbox",
      pageSize: 50,
    });
    const db = getDb();
    // Drop orphan rows from before the account_id fix. These have a literal
    // "unknown:" prefix and are unreachable (Gmail 404s the bad id).
    await db.transaction("rw", db.threads, db.messages, async () => {
      await db.threads.where("id").startsWith("unknown:").delete();
      await db.messages.where("thread_id").startsWith("unknown:").delete();
    });
    await db.threads.bulkPut(page.threads);
    return page.threads;
  });
}

export async function syncThread(
  account: StoredAccount,
  threadId: string,
): Promise<void> {
  return withFreshToken(account, async (tok) => {
    const detail = await mail.getThread(account.provider, tok, threadId, account.id);
    const db = getDb();
    await db.transaction("rw", db.threads, db.messages, async () => {
      await db.threads.put(detail.thread);
      await db.messages.bulkPut(detail.messages);
    });
  });
}

export async function archiveThread(
  account: StoredAccount,
  threadId: string,
): Promise<void> {
  return withFreshToken(account, async (tok) => {
    await mail.archive(account.provider, tok, threadId);
    await getDb().threads.delete(threadId);
  });
}

export async function trashThread(
  account: StoredAccount,
  threadId: string,
): Promise<void> {
  return withFreshToken(account, async (tok) => {
    await mail.trash(account.provider, tok, threadId);
    await getDb().threads.delete(threadId);
  });
}
