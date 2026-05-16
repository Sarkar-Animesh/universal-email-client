"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unlock } from "@/lib/session";
import { LockIcon, AlertIcon } from "@/components/Icons";

export default function UnlockPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const ok = await unlock(pw);
    if (!ok) {
      setErr("Incorrect passphrase.");
      setBusy(false);
      return;
    }
    router.replace("/inbox");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div
            className="mx-auto grid place-items-center w-16 h-16 rounded-2xl text-white shadow-lg"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--color-accent)) 0%, hsl(262 83% 58%) 100%)",
              boxShadow: "0 10px 30px hsl(var(--color-accent) / 0.35)",
            }}
          >
            <LockIcon size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-sm text-[hsl(var(--color-muted-fg))] mt-1">
              Enter your passphrase to decrypt your accounts.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="card p-5 space-y-4">
          <div>
            <label
              htmlFor="pw"
              className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-muted-fg))]"
            >
              Passphrase
            </label>
            <input
              id="pw"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="Your passphrase"
              className="input-base mt-1"
            />
          </div>
          {err && (
            <div className="rounded-xl border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))] px-3 py-2 text-sm flex items-start gap-2">
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>
      </div>
    </main>
  );
}
