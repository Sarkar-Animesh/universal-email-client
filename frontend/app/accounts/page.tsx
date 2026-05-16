"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/schema";
import { lock } from "@/lib/session";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  PlusIcon,
  LockIcon,
  LogoutIcon,
  CheckIcon,
  ChevronRightIcon,
} from "@/components/Icons";
import { Avatar, ProviderBadge } from "@/components/ui";

export default function AccountsPage() {
  const router = useRouter();
  const accounts = useLiveQuery(() => getDb().accounts.toArray(), []);
  const prefs = useLiveQuery(() => getDb().prefs.get("default"), []);
  const activeId =
    prefs?.defaultAccountId &&
    accounts?.some((a) => a.id === prefs.defaultAccountId)
      ? prefs.defaultAccountId
      : accounts?.[0]?.id;

  async function setActive(id: string) {
    const db = getDb();
    const current = (await db.prefs.get("default")) ?? {
      id: "default" as const,
      showRemoteImages: "ask" as const,
      preferredTone: "neutral",
    };
    await db.prefs.put({ ...current, defaultAccountId: id });
    router.push("/inbox");
  }

  async function logout() {
    if (!confirm("Clear all accounts and local data on this device?")) return;
    const db = getDb();
    await db.accounts.clear();
    await db.threads.clear();
    await db.messages.clear();
    await db.aiCache.clear();
    lock();
    router.replace("/setup");
  }

  return (
    <main className="min-h-screen pb-10">
      <header className="glass-header sticky top-0 z-10 px-3 py-3 flex items-center gap-2">
        <Link
          href="/inbox"
          className="grid place-items-center w-10 h-10 rounded-full hover:bg-[hsl(var(--color-muted))] -ml-1"
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
        </Link>
        <h1 className="text-base font-semibold flex-1">Accounts</h1>
        <Link
          href="/accounts/connect"
          className="grid place-items-center w-10 h-10 rounded-full text-[hsl(var(--color-accent))] hover:bg-[hsl(var(--color-accent-soft))]"
          aria-label="Add account"
        >
          <PlusIcon size={22} />
        </Link>
      </header>

      <div className="p-4 space-y-4">
        <p className="text-sm text-[hsl(var(--color-muted-fg))]">
          Tap an account to switch the inbox to it.
        </p>

        <ul className="space-y-2">
          {accounts?.map((a) => {
            const isActive = a.id === activeId;
            return (
              <li key={a.id}>
                <button
                  onClick={() => setActive(a.id)}
                  className={
                    "card w-full text-left p-3 flex items-center gap-3 transition " +
                    (isActive
                      ? "ring-2 ring-[hsl(var(--color-accent))]"
                      : "hover:bg-[hsl(var(--color-muted)/0.4)]")
                  }
                >
                  <Avatar name={a.email} email={a.email} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {a.email}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <ProviderBadge provider={a.provider} />
                    </div>
                  </div>
                  {isActive ? (
                    <span className="chip bg-[hsl(var(--color-accent))] text-white">
                      <CheckIcon size={12} />
                      Active
                    </span>
                  ) : (
                    <ChevronRightIcon
                      size={18}
                      className="text-[hsl(var(--color-muted-fg))]"
                    />
                  )}
                </button>
              </li>
            );
          })}
          {accounts && accounts.length === 0 && (
            <li className="card p-6 text-center text-sm text-[hsl(var(--color-muted-fg))]">
              No accounts yet.
            </li>
          )}
        </ul>

        <Link
          href="/accounts/connect"
          className="btn-primary w-full"
        >
          <PlusIcon size={18} />
          Add account
        </Link>

        <div className="card divide-y divide-[hsl(var(--color-border))] overflow-hidden mt-4">
          <button
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-[hsl(var(--color-muted)/0.4)]"
            onClick={() => {
              lock();
              router.replace("/unlock");
            }}
          >
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-[hsl(var(--color-warning-soft))] text-[hsl(var(--color-amber))]">
              <LockIcon size={16} />
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">Lock app</div>
              <div className="text-xs text-[hsl(var(--color-muted-fg))]">
                Wipes the in-memory key. Re-unlock to access mail.
              </div>
            </div>
          </button>
          <button
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-[hsl(var(--color-danger-soft)/0.6)]"
            onClick={logout}
          >
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))]">
              <LogoutIcon size={16} />
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium text-[hsl(var(--color-danger))]">
                Logout & clear data
              </div>
              <div className="text-xs text-[hsl(var(--color-muted-fg))]">
                Removes accounts, mail, and AI cache from this device.
              </div>
            </div>
          </button>
        </div>
      </div>
    </main>
  );
}
