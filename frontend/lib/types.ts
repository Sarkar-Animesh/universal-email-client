/**
 * Cross-provider data shapes.
 *
 * Mirrors `backend/app/models/unified.py`. Bump `SCHEMA_VERSION` in lockstep
 * with the backend and add a Dexie migration to `lib/db/schema.ts`.
 */

export const SCHEMA_VERSION = 1;

export type ProviderId = "gmail" | "microsoft" | "imap";

export type EmailAddress = {
  address: string;
  name?: string | null;
};

export type MessageFlags = {
  unread: boolean;
  starred: boolean;
  important: boolean;
  has_attachments: boolean;
  draft: boolean;
};

export type ThreadFlags = {
  has_unread: boolean;
  has_starred: boolean;
  has_attachments: boolean;
};

export type Attachment = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  inline: boolean;
  content_id?: string | null;
};

export type UnifiedAccount = {
  id: string;
  provider: ProviderId;
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

export type UnifiedMessage = {
  id: string;
  thread_id: string;
  account_id: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  reply_to: EmailAddress[];
  subject: string;
  snippet: string;
  body_html: string | null;
  body_text: string | null;
  date: string; // ISO
  labels: string[];
  flags: MessageFlags;
  in_reply_to?: string | null;
  references: string[];
  attachments: Attachment[];
};

export type UnifiedThread = {
  id: string;
  account_id: string;
  subject: string;
  participants: EmailAddress[];
  message_count: number;
  last_message_date: string; // ISO
  labels: string[];
  flags: ThreadFlags;
  snippet: string;
};

export type TokenBundle = {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  token_type: string;
  scope: string;
};

export type ThreadListPage = {
  threads: UnifiedThread[];
  next_cursor?: string | null;
};

export type ThreadDetail = {
  thread: UnifiedThread;
  messages: UnifiedMessage[];
};

/** Stored row on the `accounts` table: encrypted token blob + metadata. */
export type StoredAccount = UnifiedAccount & {
  tokenCipher: ArrayBuffer;
  tokenIv: ArrayBuffer;
  tokenSalt: ArrayBuffer;
  /** epoch ms when the access token expires; refreshed via /auth/gmail/refresh. */
  accessExpiresAt: number;
  /** When this account was added. */
  addedAt: number;
};
