/**
 * Home / boot route.
 *
 * Decides where to send the user:
 * - No prefs row -> /setup (first-time passphrase)
 * - Locked       -> /unlock
 * - No accounts  -> /accounts/connect
 * - Otherwise    -> /inbox
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDb } from "@/lib/db/schema";
import { isLocked } from "@/lib/session";
import { MailIcon } from "@/components/Icons";

export default function Home() {
  const router = useRouter();
  const [msg, setMsg] = useState("Starting…");

  useEffect(() => {
    (async () => {
      const db = getDb();
      const prefs = await db.prefs.get("default");
      if (!prefs?.passphraseVerifier) {
        setMsg("First-time setup…");
        router.replace("/setup");
        return;
      }
      if (isLocked()) {
        router.replace("/unlock");
        return;
      }
      const count = await db.accounts.count();
      router.replace(count ? "/inbox" : "/accounts/connect");
    })();
  }, [router]);

  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="flex flex-col items-center gap-4">
        <div
          className="grid place-items-center w-16 h-16 rounded-2xl text-white animate-pulse"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--color-accent)) 0%, hsl(262 83% 58%) 100%)",
            boxShadow: "0 10px 30px hsl(var(--color-accent) / 0.35)",
          }}
        >
          <MailIcon size={28} />
        </div>
        <p className="text-sm text-[hsl(var(--color-muted-fg))]">{msg}</p>
      </div>
    </main>
  );
}
