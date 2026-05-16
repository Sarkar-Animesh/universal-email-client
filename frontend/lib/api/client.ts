/**
 * Typed API client for the FastAPI backend.
 *
 * Tokens flow through `Authorization: Bearer` headers per request. The
 * provider id flows through `X-Mail-Provider`. On 401 the client tries one
 * refresh (via `refreshTokens`) and retries; if that fails, it surfaces
 * `AuthExpired` and the UI should prompt re-auth.
 */

import type {
  EmailAddress,
  ProviderId,
  ThreadDetail,
  ThreadListPage,
  TokenBundle,
  UnifiedAccount,
  UnifiedMessage,
  UnifiedThread,
} from "@/lib/types";

const BASE =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").trim() || "http://localhost:8000";

export class AuthExpired extends Error {
  constructor() {
    super("auth_expired");
  }
}

type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json }
  | Json[];

type FetchOpts = {
  method?: string;
  body?: Json;
  provider?: ProviderId;
  token?: string;
  query?: Record<string, string | number | undefined>;
};

async function call<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  let url: URL;
  try {
    url = new URL(BASE + path);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_API_BASE_URL is not a valid URL: ${JSON.stringify(BASE)}. ` +
        `Set it in Vercel → Project Settings → Environment Variables to ` +
        `https://your-api.vercel.app (full origin, no trailing slash), then redeploy.`,
    );
  }
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.provider) headers["X-Mail-Provider"] = opts.provider;
  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) throw new AuthExpired();
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail ?? "";
    } catch {
      detail = await res.text();
    }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- auth ----------

export const auth = {
  gmailStart: (redirectUri: string) =>
    call<{ auth_url: string; state: string; code_verifier: string }>(
      "/auth/gmail/start",
      { body: { redirect_uri: redirectUri } },
    ),

  gmailCallback: (input: {
    code: string;
    code_verifier: string;
    state: string;
    redirect_uri: string;
  }) =>
    call<{ tokens: TokenBundle; account: UnifiedAccount }>(
      "/auth/gmail/callback",
      { body: input },
    ),

  gmailRefresh: (refresh_token: string) =>
    call<TokenBundle>("/auth/gmail/refresh", { body: { refresh_token } }),

  microsoftStart: (redirectUri: string) =>
    call<{ auth_url: string; state: string; code_verifier: string }>(
      "/auth/microsoft/start",
      { body: { redirect_uri: redirectUri } },
    ),

  microsoftCallback: (input: {
    code: string;
    code_verifier: string;
    state: string;
    redirect_uri: string;
  }) =>
    call<{ tokens: TokenBundle; account: UnifiedAccount }>(
      "/auth/microsoft/callback",
      { body: input },
    ),

  microsoftRefresh: (refresh_token: string) =>
    call<TokenBundle>("/auth/microsoft/refresh", { body: { refresh_token } }),

  imapConnect: (input: {
    email: string;
    password: string;
    host: string;
    port: number;
    smtp_host: string;
    smtp_port: number;
  }) =>
    call<{ tokens: TokenBundle; account: UnifiedAccount }>(
      "/auth/imap/connect",
      { body: input },
    ),
};

// ---------- mail ----------

export const mail = {
  whoami: (provider: ProviderId, token: string) =>
    call<UnifiedAccount>("/mail/whoami", { provider, token }),

  listThreads: (
    provider: ProviderId,
    token: string,
    accountId: string,
    opts: { label?: string; cursor?: string; pageSize?: number } = {},
  ) =>
    call<ThreadListPage>("/mail/threads", {
      provider,
      token,
      query: {
        account_id: accountId,
        label: opts.label,
        cursor: opts.cursor,
        page_size: opts.pageSize,
      },
    }),

  getThread: (provider: ProviderId, token: string, threadId: string, accountId: string) =>
    call<ThreadDetail>(`/mail/threads/${encodeURIComponent(threadId)}`, {
      provider,
      token,
      query: { account_id: accountId },
    }),

  archive: (provider: ProviderId, token: string, threadId: string) =>
    call<{ ok: true }>(
      `/mail/threads/${encodeURIComponent(threadId)}/archive`,
      { provider, token, method: "POST" },
    ),

  trash: (provider: ProviderId, token: string, threadId: string) =>
    call<{ ok: true }>(`/mail/threads/${encodeURIComponent(threadId)}/trash`, {
      provider,
      token,
      method: "POST",
    }),

  send: (
    provider: ProviderId,
    token: string,
    body: {
      account_id: string;
      to: EmailAddress[];
      cc?: EmailAddress[];
      bcc?: EmailAddress[];
      subject: string;
      body_html?: string;
      body_text?: string;
      in_reply_to?: string;
      references?: string[];
      thread_id?: string;
    },
  ) => call<{ message_id: string }>("/mail/send", { provider, token, body }),

  search: (
    provider: ProviderId,
    token: string,
    q: string,
    opts: { cursor?: string; pageSize?: number } = {},
  ) =>
    call<ThreadListPage>("/mail/search", {
      provider,
      token,
      query: { q, cursor: opts.cursor, page_size: opts.pageSize },
    }),
};

// ---------- ai ----------

export const ai = {
  summarize: (input: { thread: UnifiedThread; messages: UnifiedMessage[] }) =>
    call<{ bullets: string[]; ask: string; suggested_action: string }>(
      "/ai/summarize",
      { body: input },
    ),

  draftReply: (input: {
    thread: UnifiedThread;
    messages: UnifiedMessage[];
    tone_hint?: string;
  }) => call<{ body_text: string }>("/ai/draft-reply", { body: input }),

  prioritize: (threads: UnifiedThread[]) =>
    call<{
      priorities: {
        thread_id: string;
        label: string;
        confidence: number;
      }[];
    }>("/ai/prioritize", { body: { threads } }),

  rewriteSearch: (query: string, provider: ProviderId) =>
    call<{ rewritten: string }>("/ai/search-rewrite", {
      body: { query, provider },
    }),
};
