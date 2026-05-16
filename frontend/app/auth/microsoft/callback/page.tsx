"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/lib/api/client";
import { getDb } from "@/lib/db/schema";
import { encryptTokens, randomBytes } from "@/lib/crypto/tokens";
import { getDerivedKey, unlock } from "@/lib/session";
import type { StoredAccount } from "@/lib/types";
import { MicrosoftIcon, LockIcon, AlertIcon, RefreshIcon } from "@/components/Icons";

function CallbackInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const ran = useRef(false);
  const [msg, setMsg] = useState("Connecting…");
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [pw, setPw] = useState("");
  const [unlockErr, setUnlockErr] = useState<string | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);

  async function doExchange() {
    const code = sp.get("code");
    const stateFromUrl = sp.get("state");
    const stateExpected = sessionStorage.getItem("microsoft_oauth_state");
    const verifier = sessionStorage.getItem("microsoft_oauth_verifier");
    const redirect = sessionStorage.getItem("microsoft_oauth_redirect");

    if (!code || !stateFromUrl || !verifier || !redirect) {
      setMsg("Missing OAuth parameters. Try again.");
      return;
    }
    if (stateFromUrl !== stateExpected) {
      setMsg("State mismatch. Possible CSRF — try again.");
      return;
    }

    const key = getDerivedKey();
    if (!key) {
      setMsg("Session locked. Enter your passphrase to finish connecting.");
      setNeedsUnlock(true);
      return;
    }

    setNeedsUnlock(false);
    setMsg("Connecting…");

    try {
      const { tokens, account } = await auth.microsoftCallback({
        code,
        code_verifier: verifier,
        state: stateFromUrl,
        redirect_uri: redirect,
      });
      const salt = randomBytes(16);
      const { cipher, iv } = await encryptTokens(key, tokens);
      const stored: StoredAccount = {
        ...account,
        tokenCipher: cipher,
        tokenIv: iv,
        tokenSalt: salt,
        accessExpiresAt: Date.now() + tokens.expires_in * 1000,
        addedAt: Date.now(),
      };
      await getDb().accounts.put(stored);
      sessionStorage.removeItem("microsoft_oauth_state");
      sessionStorage.removeItem("microsoft_oauth_verifier");
      sessionStorage.removeItem("microsoft_oauth_redirect");
      router.replace("/inbox");
    } catch (e) {
      setMsg(`Failed to connect: ${(e as Error).message}`);
    }
  }

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void doExchange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setUnlockBusy(true);
    setUnlockErr(null);
    const ok = await unlock(pw);
    setUnlockBusy(false);
    if (!ok) {
      setUnlockErr("Incorrect passphrase.");
      return;
    }
    await doExchange();
  }

  if (needsUnlock) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-3">
            <div className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-white border border-[hsl(var(--color-border))] shadow-sm">
              <MicrosoftIcon size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Unlock to continue</h1>
              <p className="text-sm text-[hsl(var(--color-muted-fg))] mt-1 px-2">
                {msg}
              </p>
            </div>
          </div>
          <form onSubmit={handleUnlock} className="card p-5 space-y-4">
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
            {unlockErr && (
              <div className="rounded-xl border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))] px-3 py-2 text-sm flex items-start gap-2">
                <AlertIcon size={16} className="mt-0.5 shrink-0" />
                <span>{unlockErr}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={unlockBusy}
              className="btn-primary w-full"
            >
              <LockIcon size={16} />
              {unlockBusy ? "Unlocking…" : "Unlock & Connect"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="flex flex-col items-center gap-4">
        <div className="grid place-items-center w-16 h-16 rounded-2xl bg-white border border-[hsl(var(--color-border))] shadow-sm">
          <MicrosoftIcon size={32} />
        </div>
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--color-muted-fg))]">
          <RefreshIcon size={14} className="animate-spin" />
          <span>{msg}</span>
        </div>
      </div>
    </main>
  );
}

export default function MicrosoftCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen grid place-items-center p-6">
          <p className="text-sm text-[hsl(var(--color-muted-fg))]">Loading…</p>
        </main>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
