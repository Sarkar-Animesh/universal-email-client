"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getDb } from "@/lib/db/schema";
import { mail, ai } from "@/lib/api/client";
import { decryptAccountTokens } from "@/lib/session";
import type { EmailAddress, StoredAccount, UnifiedMessage, UnifiedThread } from "@/lib/types";
import {
  ArrowLeftIcon,
  SendIcon,
  SparklesIcon,
  AlertIcon,
  PenIcon,
} from "@/components/Icons";
import { Avatar, ProviderBadge } from "@/components/ui";

function ComposeInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const replyTo = sp.get("reply");
  const draftPrefill = sp.get("draft");

  const [account, setAccount] = useState<StoredAccount | null>(null);
  const [thread, setThread] = useState<UnifiedThread | null>(null);
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const db = getDb();
      if (replyTo) {
        const t = await db.threads.get(replyTo);
        if (!t) return;
        const msgs = await db.messages.where("thread_id").equals(replyTo).sortBy("date");
        const acc = await db.accounts.get(t.account_id);
        if (!acc) return;
        setAccount(acc);
        setThread(t);
        setMessages(msgs);
        const last = msgs[msgs.length - 1];
        if (last) {
          setTo(last.reply_to[0]?.address ?? last.from.address);
          setSubject(/^re:\s*/i.test(last.subject) ? last.subject : `Re: ${last.subject}`);
        }
        if (draftPrefill) setBody(draftPrefill);
      } else {
        const first = (await db.accounts.toArray())[0];
        if (first) setAccount(first);
      }
    })();
  }, [replyTo, draftPrefill]);

  async function draft() {
    if (!thread || messages.length === 0) return;
    setDrafting(true);
    setErr(null);
    try {
      const out = await ai.draftReply({ thread, messages });
      setBody(out.body_text);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (!account) return;
    setBusy(true);
    setErr(null);
    try {
      const tokens = await decryptAccountTokens(account);
      const last = messages[messages.length - 1];
      const recipients: EmailAddress[] = to
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((address) => ({ address }));
      await mail.send(account.provider, tokens.access_token, {
        account_id: account.id,
        to: recipients,
        subject,
        body_text: body,
        thread_id: thread?.id,
        in_reply_to: last?.id,
        references: last ? [...last.references, last.id] : [],
      });
      router.replace(replyTo ? `/thread/${encodeURIComponent(replyTo)}` : "/inbox");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const charCount = body.length;

  return (
    <main className="min-h-screen pb-24">
      <header className="glass-header sticky top-0 z-10 px-3 py-3 flex items-center gap-2">
        <Link
          href={replyTo ? `/thread/${encodeURIComponent(replyTo)}` : "/inbox"}
          className="grid place-items-center w-10 h-10 rounded-full hover:bg-[hsl(var(--color-muted))] -ml-1"
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
        </Link>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="grid place-items-center w-8 h-8 rounded-xl bg-[hsl(var(--color-accent))] text-white">
            <PenIcon size={15} />
          </span>
          <h1 className="text-base font-semibold">
            {replyTo ? "Reply" : "New message"}
          </h1>
        </div>
        <button
          onClick={send}
          disabled={busy || !account || !to || !subject}
          className="btn-primary"
        >
          <SendIcon size={16} />
          {busy ? "Sending…" : "Send"}
        </button>
      </header>

      <div className="p-4 space-y-3">
        {account && (
          <div className="flex items-center gap-3 rounded-2xl bg-[hsl(var(--color-muted)/0.6)] px-3 py-2">
            <Avatar
              name={account.email}
              email={account.email}
              size={32}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[hsl(var(--color-muted-fg))]">From</div>
              <div className="text-sm font-medium truncate">{account.email}</div>
            </div>
            <ProviderBadge provider={account.provider} showLabel={false} />
          </div>
        )}

        <div className="card divide-y divide-[hsl(var(--color-border))] overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5">
            <label
              htmlFor="compose-to"
              className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-muted-fg))] w-16 shrink-0"
            >
              To
            </label>
            <input
              id="compose-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="someone@example.com"
              className="flex-1 bg-transparent border-0 outline-none text-sm py-1"
            />
          </div>
          <div className="flex items-center gap-2 px-4 py-2.5">
            <label
              htmlFor="compose-subject"
              className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-muted-fg))] w-16 shrink-0"
            >
              Subject
            </label>
            <input
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 bg-transparent border-0 outline-none text-sm py-1 font-medium"
            />
          </div>
        </div>

        <div className="card p-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            placeholder="Write your message…"
            className="w-full bg-transparent border-0 outline-none text-sm resize-none leading-relaxed"
          />
          <div className="flex items-center justify-between pt-2 border-t border-[hsl(var(--color-border))] mt-2">
            <span className="text-[11px] text-[hsl(var(--color-muted-fg))]">
              {charCount} characters
            </span>
            {replyTo && (
              <button
                onClick={draft}
                disabled={drafting}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[hsl(var(--color-violet))] hover:underline disabled:opacity-50"
              >
                <SparklesIcon size={14} />
                {drafting ? "Drafting…" : "AI draft"}
              </button>
            )}
          </div>
        </div>

        {err && (
          <div className="rounded-xl border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))] px-3 py-2 text-sm flex items-start gap-2">
            <AlertIcon size={16} className="mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ComposePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen grid place-items-center">
          <p className="text-sm text-[hsl(var(--color-muted-fg))]">Loading…</p>
        </main>
      }
    >
      <ComposeInner />
    </Suspense>
  );
}
