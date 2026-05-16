"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/schema";
import { ai, mail } from "@/lib/api/client";
import { decryptAccountTokens } from "@/lib/session";
import type { UnifiedThread } from "@/lib/types";
import {
  ArrowLeftIcon,
  SearchIcon,
  SparklesIcon,
  AlertIcon,
} from "@/components/Icons";
import { Avatar } from "@/components/ui";

export default function SearchPage() {
  const accounts = useLiveQuery(() => getDb().accounts.toArray(), []);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UnifiedThread[]>([]);
  const [busy, setBusy] = useState(false);
  const [rewritten, setRewritten] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!accounts || accounts.length === 0) return;
    setBusy(true);
    setErr(null);
    setRewritten(null);
    setHasSearched(true);
    try {
      const acc = accounts[0]!;
      const looksRaw = /(:|from |has:|label:)/i.test(q);
      const rewriteResp = looksRaw ? null : await ai.rewriteSearch(q, acc.provider);
      const expr = rewriteResp?.rewritten ?? q;
      if (rewriteResp) setRewritten(expr);
      const tokens = await decryptAccountTokens(acc);
      const page = await mail.search(acc.provider, tokens.access_token, expr);
      setResults(page.threads);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const examples = [
    "from Sarah about Q3 launch",
    "invoices this month",
    "unread newsletters",
    "attachments larger than 5MB",
  ];

  return (
    <main className="min-h-screen pb-20">
      <header className="glass-header sticky top-0 z-10 px-3 py-3 flex items-center gap-2">
        <Link
          href="/inbox"
          className="grid place-items-center w-10 h-10 rounded-full hover:bg-[hsl(var(--color-muted))] -ml-1"
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <span className="grid place-items-center w-8 h-8 rounded-xl bg-[hsl(var(--color-accent))] text-white">
            <SearchIcon size={15} />
          </span>
          <h1 className="text-base font-semibold">Search</h1>
        </div>
      </header>

      <div className="p-4 space-y-4">
        <form onSubmit={go}>
          <div className="card flex items-center gap-2 px-3 py-2">
            <SearchIcon
              size={18}
              className="text-[hsl(var(--color-muted-fg))] shrink-0"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask in plain English…"
              className="flex-1 bg-transparent outline-none text-sm py-1.5"
              autoFocus
            />
            <button
              type="submit"
              disabled={busy || !q}
              className="btn-primary -my-1"
            >
              {busy ? "…" : "Search"}
            </button>
          </div>
        </form>

        {!hasSearched && (
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <SparklesIcon
                size={16}
                className="text-[hsl(var(--color-violet))]"
              />
              <span className="text-sm font-semibold">Try a natural query</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setQ(ex)}
                  className="chip bg-[hsl(var(--color-muted))] text-[hsl(var(--color-fg))] hover:bg-[hsl(var(--color-border))] !normal-case !tracking-normal !text-xs !font-medium"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {rewritten && (
          <div className="card px-3 py-2.5 flex items-center gap-2 text-xs">
            <SparklesIcon
              size={14}
              className="text-[hsl(var(--color-violet))] shrink-0"
            />
            <span className="text-[hsl(var(--color-muted-fg))]">
              Rewritten as
            </span>
            <code className="px-1.5 py-0.5 rounded bg-[hsl(var(--color-muted))] font-mono text-[11px]">
              {rewritten}
            </code>
          </div>
        )}

        {err && (
          <div className="rounded-xl border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))] px-3 py-2 text-sm flex items-start gap-2">
            <AlertIcon size={16} className="mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {hasSearched && !busy && results.length === 0 && !err && (
          <div className="text-center py-12">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[hsl(var(--color-muted))] grid place-items-center mb-3 text-[hsl(var(--color-muted-fg))]">
              <SearchIcon size={26} />
            </div>
            <p className="text-sm font-medium">No matches</p>
            <p className="text-xs text-[hsl(var(--color-muted-fg))] mt-1">
              Try a different query.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {results.map((t) => {
            const sender =
              t.participants[0]?.name || t.participants[0]?.address || "—";
            return (
              <li key={t.id}>
                <Link
                  href={`/thread/${encodeURIComponent(t.id)}`}
                  className="card flex gap-3 p-3 hover:bg-[hsl(var(--color-muted)/0.4)] transition"
                >
                  <Avatar
                    name={t.participants[0]?.name}
                    email={t.participants[0]?.address}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{sender}</div>
                    <div className="text-sm truncate">
                      {t.subject || "(no subject)"}
                    </div>
                    <div className="text-xs text-[hsl(var(--color-muted-fg))] truncate mt-0.5">
                      {t.snippet}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
