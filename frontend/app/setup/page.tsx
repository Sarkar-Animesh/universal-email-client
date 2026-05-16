"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setupPassphrase } from "@/lib/session";
import { LockIcon, AlertIcon, CheckIcon, SparklesIcon } from "@/components/Icons";

export default function SetupPage() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 12) {
      setErr("Use at least 12 characters.");
      return;
    }
    if (pw !== pw2) {
      setErr("Passphrases don't match.");
      return;
    }
    setBusy(true);
    try {
      await setupPassphrase(pw);
      router.replace("/accounts/connect");
    } catch (e) {
      setErr(String(e));
      setBusy(false);
    }
  }

  const strength = pwStrength(pw);

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
            <h1 className="text-2xl font-bold">Set a passphrase</h1>
            <p className="text-sm text-[hsl(var(--color-muted-fg))] mt-1 px-2">
              Used to encrypt your account tokens on this device. There's no
              recovery — pick something long.
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
              autoComplete="new-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 12 characters"
              className="input-base mt-1"
            />
            {pw.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-[hsl(var(--color-muted))] overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${strength.score * 25}%`,
                      background: strength.color,
                    }}
                  />
                </div>
                <span
                  className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: strength.color }}
                >
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="pw2"
              className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-muted-fg))]"
            >
              Confirm
            </label>
            <input
              id="pw2"
              type="password"
              autoComplete="new-password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              placeholder="Re-enter passphrase"
              className="input-base mt-1"
            />
            {pw2.length > 0 && pw === pw2 && (
              <p className="mt-1 text-xs text-[hsl(var(--color-success))] inline-flex items-center gap-1">
                <CheckIcon size={12} />
                Matches
              </p>
            )}
          </div>

          {err && (
            <div className="rounded-xl border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))] px-3 py-2 text-sm flex items-start gap-2">
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary w-full">
            <SparklesIcon size={16} />
            {busy ? "Setting up…" : "Continue"}
          </button>
        </form>
      </div>
    </main>
  );
}

function pwStrength(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: 1, label: "Weak", color: "hsl(var(--color-danger))" };
  if (s === 2) return { score: 2, label: "Fair", color: "hsl(var(--color-amber))" };
  if (s === 3) return { score: 3, label: "Good", color: "hsl(var(--color-accent))" };
  return { score: 4, label: "Strong", color: "hsl(var(--color-success))" };
}
