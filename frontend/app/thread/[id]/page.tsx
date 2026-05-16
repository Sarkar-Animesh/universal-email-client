"use client";

import { use, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db/schema";
import { archiveThread, syncThread, trashThread } from "@/lib/sync";
import { ai } from "@/lib/api/client";
import { sanitizeMailHtml } from "@/lib/sanitize";
import type { UnifiedMessage } from "@/lib/types";
import {
  ArrowLeftIcon,
  ArchiveIcon,
  TrashIcon,
  ReplyIcon,
  SparklesIcon,
  PenIcon,
  AlertIcon,
  ChevronDownIcon,
} from "@/components/Icons";
import { Avatar, CategoryChip } from "@/components/ui";

type Summary = {
  bullets: string[];
  ask: string;
  suggested_action: string;
};

export default function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);
  const threadId = decodeURIComponent(id);

  const thread = useLiveQuery(() => getDb().threads.get(threadId), [threadId]);
  const messages = useLiveQuery(
    () =>
      getDb()
        .messages.where("thread_id")
        .equals(threadId)
        .sortBy("date"),
    [threadId],
  );
  const account = useLiveQuery(
    () => (thread ? getDb().accounts.get(thread.account_id) : undefined),
    [thread?.account_id],
  );

  const [summary, setSummary] = useState<Summary | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const synced = useRef(false);

  useEffect(() => {
    synced.current = false;
  }, [threadId]);

  useEffect(() => {
    if (synced.current) return;
    if (thread && thread.account_id === "unknown") {
      void (async () => {
        const db = getDb();
        await db.transaction("rw", db.threads, db.messages, async () => {
          await db.threads.delete(threadId);
          await db.messages.where("thread_id").equals(threadId).delete();
        });
        router.replace("/inbox");
      })();
      return;
    }
    if (!account) return;
    synced.current = true;
    void syncThread(account, threadId).catch((e) => setErr((e as Error).message));
  }, [account, thread, threadId, router]);

  useEffect(() => {
    if (!threadId) return;
    (async () => {
      const db = getDb();
      const [cachedSum, cachedDraft] = await Promise.all([
        db.aiCache.get(`${threadId}:summary`),
        db.aiCache.get(`${threadId}:draft`),
      ]);
      if (cachedSum) setSummary(JSON.parse(cachedSum.payload) as Summary);
      if (cachedDraft) setDraft(JSON.parse(cachedDraft.payload).body_text as string);
    })();
  }, [threadId]);

  async function summarize() {
    if (!thread || !messages || messages.length === 0) return;
    setSummarizing(true);
    setErr(null);
    try {
      const out = await ai.summarize({ thread, messages });
      setSummary(out);
      await getDb().aiCache.put({
        key: `${threadId}:summary`,
        thread_id: threadId,
        kind: "summary",
        payload: JSON.stringify(out),
        inputHash: messages.map((m) => m.id).join(","),
        createdAt: Date.now(),
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSummarizing(false);
    }
  }

  async function suggestReply() {
    if (!thread || !messages || messages.length === 0) return;
    setDrafting(true);
    setErr(null);
    try {
      const out = await ai.draftReply({ thread, messages });
      setDraft(out.body_text);
      await getDb().aiCache.put({
        key: `${threadId}:draft`,
        thread_id: threadId,
        kind: "draft",
        payload: JSON.stringify(out),
        inputHash: messages.map((m) => m.id).join(","),
        createdAt: Date.now(),
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  async function archive() {
    if (!account) return;
    await archiveThread(account, threadId);
    router.replace("/inbox");
  }

  async function trash() {
    if (!account) return;
    await trashThread(account, threadId);
    router.replace("/inbox");
  }

  if (!thread || !messages) {
    return (
      <main className="min-h-screen p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-10 rounded-xl bg-[hsl(var(--color-muted))]" />
          <div className="h-32 rounded-2xl bg-[hsl(var(--color-muted))]" />
          <div className="h-24 rounded-2xl bg-[hsl(var(--color-muted))]" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-32">
      <header className="glass-header sticky top-0 z-10 px-3 py-3 flex items-center gap-2">
        <Link
          href="/inbox"
          className="grid place-items-center w-10 h-10 rounded-full hover:bg-[hsl(var(--color-muted))] -ml-1"
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">
            {thread.subject || "(no subject)"}
          </h1>
          <p className="text-[11px] text-[hsl(var(--color-muted-fg))]">
            {thread.message_count} message{thread.message_count !== 1 && "s"}
            {" · "}
            {thread.participants.length} participant
            {thread.participants.length !== 1 && "s"}
          </p>
        </div>
      </header>

      <section className="px-4 pt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={summarize}
            disabled={summarizing}
            className="btn-primary"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--color-violet)) 0%, hsl(var(--color-accent)) 100%)",
              boxShadow:
                "0 1px 2px hsl(var(--color-violet) / 0.4), 0 4px 12px hsl(var(--color-violet) / 0.25)",
            }}
          >
            <SparklesIcon size={16} />
            {summarizing ? "Summarizing…" : summary ? "Re-summarize" : "Summarize"}
          </button>
          <button
            onClick={suggestReply}
            disabled={drafting}
            className="btn-ghost"
            style={{
              borderColor: "hsl(var(--color-success) / 0.3)",
              background: "hsl(var(--color-success-soft))",
              color: "hsl(var(--color-success))",
            }}
          >
            <ReplyIcon size={16} />
            {drafting ? "Drafting…" : draft ? "Re-draft reply" : "Suggest reply"}
          </button>
        </div>
        {summary && <SummaryCard s={summary} />}
        {draft && <DraftCard body={draft} threadId={threadId} />}
        {err && (
          <div className="rounded-xl border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))] px-3 py-2 text-sm flex items-start gap-2">
            <AlertIcon size={16} className="mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}
      </section>

      <ul className="px-3 mt-4 space-y-3">
        {messages.map((m, i) => (
          <MessageRow
            key={m.id}
            m={m}
            defaultExpanded={i === messages.length - 1}
          />
        ))}
      </ul>

      <div className="fixed bottom-0 inset-x-0 z-10 glass-header border-t px-4 py-2.5 flex items-center justify-around gap-2">
        <button
          onClick={archive}
          className="flex flex-col items-center gap-0.5 text-[hsl(var(--color-muted-fg))] hover:text-[hsl(var(--color-fg))] px-3 py-1"
        >
          <ArchiveIcon size={20} />
          <span className="text-[10px] font-medium">Archive</span>
        </button>
        <Link
          href={`/compose?reply=${encodeURIComponent(threadId)}`}
          className="btn-primary -my-2"
        >
          <PenIcon size={16} />
          Reply
        </Link>
        <button
          onClick={trash}
          className="flex flex-col items-center gap-0.5 text-[hsl(var(--color-danger))] hover:opacity-80 px-3 py-1"
        >
          <TrashIcon size={20} />
          <span className="text-[10px] font-medium">Trash</span>
        </button>
      </div>
    </main>
  );
}

function SummaryCard({ s }: { s: Summary }) {
  return (
    <div
      className="card p-4 space-y-3"
      style={{
        background:
          "linear-gradient(180deg, hsl(var(--color-violet-soft)) 0%, hsl(var(--color-surface)) 100%)",
        borderColor: "hsl(var(--color-violet) / 0.25)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-7 h-7 rounded-lg bg-[hsl(var(--color-violet))] text-white">
          <SparklesIcon size={14} />
        </span>
        <span className="text-sm font-semibold text-[hsl(var(--color-violet))]">
          AI Summary
        </span>
      </div>
      <ul className="space-y-1.5">
        {s.bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[hsl(var(--color-violet))] shrink-0" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {s.ask && (
        <div className="rounded-lg bg-[hsl(var(--color-surface))] border border-[hsl(var(--color-border))] px-3 py-2 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-muted-fg))]">
            They want
          </span>
          <p className="mt-0.5">{s.ask}</p>
        </div>
      )}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs font-medium text-[hsl(var(--color-muted-fg))]">
          Suggested:
        </span>
        <CategoryChip category={s.suggested_action} />
      </div>
    </div>
  );
}

function DraftCard({ body, threadId }: { body: string; threadId: string }) {
  return (
    <div
      className="card p-4 space-y-3"
      style={{
        background:
          "linear-gradient(180deg, hsl(var(--color-success-soft)) 0%, hsl(var(--color-surface)) 100%)",
        borderColor: "hsl(var(--color-success) / 0.3)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-[hsl(var(--color-success))] text-white">
            <ReplyIcon size={14} />
          </span>
          <span className="text-sm font-semibold text-[hsl(var(--color-success))]">
            Suggested reply
          </span>
        </div>
        <Link
          href={`/compose?reply=${encodeURIComponent(threadId)}&draft=${encodeURIComponent(body)}`}
          className="text-xs font-semibold text-[hsl(var(--color-success))] hover:underline inline-flex items-center gap-1"
        >
          Use in compose
          <ArrowLeftIcon size={14} className="rotate-180" />
        </Link>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-sm text-[hsl(var(--color-fg))]">
        {body}
      </pre>
    </div>
  );
}

function MessageRow({
  m,
  defaultExpanded = false,
}: {
  m: UnifiedMessage;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const date = new Date(m.date).toLocaleString();
  const html = m.body_html ? sanitizeMailHtml(m.body_html) : null;
  return (
    <li className="card overflow-hidden">
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full text-left p-3 flex items-start gap-3 hover:bg-[hsl(var(--color-muted)/0.4)]"
      >
        <Avatar name={m.from.name} email={m.from.address} size={36} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-sm truncate">
              {m.from.name || m.from.address}
            </span>
            <span className="text-[11px] text-[hsl(var(--color-muted-fg))] shrink-0">
              {date}
            </span>
          </div>
          {m.from.name && (
            <div className="text-xs text-[hsl(var(--color-muted-fg))] truncate">
              {m.from.address}
            </div>
          )}
          {!expanded && (
            <p className="text-sm mt-1 text-[hsl(var(--color-muted-fg))] truncate">
              {m.snippet}
            </p>
          )}
        </div>
        <ChevronDownIcon
          size={16}
          className={
            "shrink-0 mt-1 text-[hsl(var(--color-muted-fg))] transition-transform " +
            (expanded ? "rotate-180" : "")
          }
        />
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          {html ? (
            <iframe
              key={m.id}
              sandbox="allow-scripts"
              srcDoc={html}
              className="w-full min-h-[60vh] rounded-xl border border-[hsl(var(--color-border))] bg-white"
              title="message"
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm font-sans bg-[hsl(var(--color-muted)/0.5)] rounded-xl p-3">
              {m.body_text}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
