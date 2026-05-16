"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { getDb } from "@/lib/db/schema";
import { syncInbox } from "@/lib/sync";
import { isLocked } from "@/lib/session";
import type { StoredAccount, UnifiedThread } from "@/lib/types";
import {
  InboxIcon,
  SearchIcon,
  UsersIcon,
  PenIcon,
  RefreshIcon,
  AlertIcon,
  ChevronDownIcon,
  MailIcon,
} from "@/components/Icons";
import { Avatar, ProviderBadge } from "@/components/ui";

export default function InboxPage() {
  const router = useRouter();
  const accounts = useLiveQuery(() => getDb().accounts.toArray(), []);
  const prefs = useLiveQuery(() => getDb().prefs.get("default"), []);
  const activeAccountId =
    prefs?.defaultAccountId &&
    accounts?.some((a) => a.id === prefs.defaultAccountId)
      ? prefs.defaultAccountId
      : accounts?.[0]?.id;
  const activeAccount = accounts?.find((a) => a.id === activeAccountId);
  const threads = useLiveQuery(
    () =>
      activeAccountId
        ? getDb()
            .threads.where("account_id")
            .equals(activeAccountId)
            .reverse()
            .sortBy("last_message_date")
            .then((rows) => rows.slice(0, 100))
        : Promise.resolve<UnifiedThread[]>([]),
    [activeAccountId],
  );
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isLocked()) router.replace("/unlock");
  }, [router]);

  useEffect(() => {
    if (accounts !== undefined && accounts.length === 0) {
      router.replace("/accounts/connect");
    }
  }, [accounts, router]);

  useEffect(() => {
    if (!activeAccount) return;
    void doSync(activeAccount);
    const t = setInterval(() => void doSync(activeAccount), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id]);

  async function doSync(acc: StoredAccount) {
    setSyncing(true);
    setErr(null);
    try {
      await syncInbox(acc);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  const unreadCount = threads?.filter((t) => t.flags.has_unread).length ?? 0;

  return (
    <main className="min-h-screen pb-24">
      <header className="glass-header sticky top-0 z-10 px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-[hsl(var(--color-accent))] text-white shadow-sm">
              <InboxIcon size={18} />
            </span>
            <div>
              <h1 className="text-base font-semibold leading-tight">Inbox</h1>
              <p className="text-[11px] text-[hsl(var(--color-muted-fg))]">
                {syncing ? (
                  <span className="inline-flex items-center gap-1">
                    <RefreshIcon size={12} className="animate-spin" /> syncing
                  </span>
                ) : (
                  <>
                    {threads?.length ?? 0} threads
                    {unreadCount > 0 && (
                      <>
                        {" · "}
                        <span className="font-semibold text-[hsl(var(--color-accent))]">
                          {unreadCount} unread
                        </span>
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => activeAccount && void doSync(activeAccount)}
            disabled={syncing || !activeAccount}
            className="grid place-items-center w-10 h-10 rounded-full text-[hsl(var(--color-muted-fg))] hover:bg-[hsl(var(--color-muted))] disabled:opacity-50"
            aria-label="Refresh inbox"
          >
            <RefreshIcon size={18} className={syncing ? "animate-spin" : ""} />
          </button>
        </div>
        {activeAccount && (
          <Link
            href="/accounts"
            className="flex items-center gap-3 rounded-2xl bg-[hsl(var(--color-muted))] px-3 py-2 hover:bg-[hsl(var(--color-border))] transition"
            title="Switch account"
          >
            <Avatar
              name={activeAccount.email}
              email={activeAccount.email}
              size={32}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">
                {activeAccount.email}
              </div>
              <div className="flex items-center gap-1.5">
                <ProviderBadge provider={activeAccount.provider} />
              </div>
            </div>
            <ChevronDownIcon
              size={16}
              className="text-[hsl(var(--color-muted-fg))]"
            />
          </Link>
        )}
      </header>

      {err && (
        <div className="mx-4 my-3 rounded-xl border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))] px-3 py-2 text-sm flex items-start gap-2">
          <AlertIcon size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{err}</span>
        </div>
      )}

      <ul className="px-2 py-1">
        {threads?.map((t) => <ThreadRow key={t.id} t={t} />)}
        {threads && threads.length === 0 && !syncing && (
          <li className="py-16 px-6 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-[hsl(var(--color-muted))] grid place-items-center mb-3 text-[hsl(var(--color-muted-fg))]">
              <MailIcon size={26} />
            </div>
            <p className="text-sm font-medium">All caught up</p>
            <p className="text-xs text-[hsl(var(--color-muted-fg))] mt-1">
              Pull to refresh, or tap the sync icon up top.
            </p>
          </li>
        )}
      </ul>

      <Link
        href="/compose"
        className="fixed bottom-20 right-5 z-20 grid place-items-center w-14 h-14 rounded-full text-white shadow-lg shadow-[hsl(var(--color-accent)/0.45)] hover:shadow-xl transition"
        style={{
          background:
            "linear-gradient(135deg, hsl(var(--color-accent)) 0%, hsl(262 83% 58%) 100%)",
        }}
        aria-label="Compose"
      >
        <PenIcon size={22} />
      </Link>

      <footer className="fixed bottom-0 inset-x-0 z-10 glass-header border-t px-4 py-2">
        <nav className="flex items-center justify-around">
          <Link
            href="/inbox"
            className="flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg text-[hsl(var(--color-accent))]"
          >
            <InboxIcon size={20} />
            <span className="text-[10px] font-medium">Inbox</span>
          </Link>
          <Link
            href="/search"
            className="flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg text-[hsl(var(--color-muted-fg))] hover:text-[hsl(var(--color-fg))] transition"
          >
            <SearchIcon size={20} />
            <span className="text-[10px] font-medium">Search</span>
          </Link>
          <Link
            href="/accounts"
            className="flex flex-col items-center gap-0.5 px-4 py-1 rounded-lg text-[hsl(var(--color-muted-fg))] hover:text-[hsl(var(--color-fg))] transition"
          >
            <UsersIcon size={20} />
            <span className="text-[10px] font-medium">Accounts</span>
          </Link>
        </nav>
      </footer>
    </main>
  );
}

function ThreadRow({ t }: { t: UnifiedThread }) {
  const date = new Date(t.last_message_date);
  const now = new Date();
  const sameDay =
    date.toDateString() === now.toDateString();
  const sameYear = date.getFullYear() === now.getFullYear();
  const dateLabel = sameDay
    ? date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : sameYear
      ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  const unread = t.flags.has_unread;
  const sender =
    t.participants[0]?.name ||
    t.participants[0]?.address ||
    "(unknown)";

  return (
    <li>
      <Link
        href={`/thread/${encodeURIComponent(t.id)}`}
        className={
          "flex gap-3 px-3 py-3 rounded-2xl transition active:scale-[0.99] " +
          (unread
            ? "bg-[hsl(var(--color-accent-soft)/0.5)] hover:bg-[hsl(var(--color-accent-soft))]"
            : "hover:bg-[hsl(var(--color-muted))]")
        }
      >
        <Avatar
          name={t.participants[0]?.name}
          email={t.participants[0]?.address}
          size={44}
          unread={unread}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div
              className={
                "truncate text-sm " +
                (unread ? "font-semibold" : "font-medium text-[hsl(var(--color-fg))]")
              }
            >
              {sender}
              {t.message_count > 1 && (
                <span className="ml-1 text-xs text-[hsl(var(--color-muted-fg))] font-normal">
                  · {t.message_count}
                </span>
              )}
            </div>
            <div
              className={
                "text-[11px] shrink-0 " +
                (unread
                  ? "text-[hsl(var(--color-accent))] font-semibold"
                  : "text-[hsl(var(--color-muted-fg))]")
              }
            >
              {dateLabel}
            </div>
          </div>
          <div
            className={
              "truncate text-sm mt-0.5 " +
              (unread
                ? "text-[hsl(var(--color-fg))]"
                : "text-[hsl(var(--color-muted-fg))]")
            }
          >
            {t.subject || "(no subject)"}
          </div>
          <div className="truncate text-xs text-[hsl(var(--color-muted-fg))] mt-0.5">
            {t.snippet}
          </div>
        </div>
      </Link>
    </li>
  );
}
