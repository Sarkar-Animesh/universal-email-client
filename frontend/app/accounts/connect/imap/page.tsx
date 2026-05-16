"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/api/client";
import { getDb } from "@/lib/db/schema";
import { encryptTokens, randomBytes } from "@/lib/crypto/tokens";
import { getDerivedKey, isLocked } from "@/lib/session";
import type { StoredAccount } from "@/lib/types";
import {
  ArrowLeftIcon,
  ServerIcon,
  AlertIcon,
  ChevronDownIcon,
  MailIcon,
  LockIcon,
} from "@/components/Icons";

type Preset = {
  id: string;
  name: string;
  host: string;
  port: number;
  smtp_host: string;
  smtp_port: number;
  help: string;
};

const PRESETS: Preset[] = [
  {
    id: "gmail",
    name: "Gmail",
    host: "imap.gmail.com",
    port: 993,
    smtp_host: "smtp.gmail.com",
    smtp_port: 465,
    help: "Requires 2-Step Verification. Generate an app password at myaccount.google.com → Security → 2-Step Verification → App passwords.",
  },
  {
    id: "yahoo",
    name: "Yahoo Mail",
    host: "imap.mail.yahoo.com",
    port: 993,
    smtp_host: "smtp.mail.yahoo.com",
    smtp_port: 465,
    help: "Generate an app password at account.yahoo.com → Account security → Generate app password.",
  },
  {
    id: "aol",
    name: "AOL Mail",
    host: "imap.aol.com",
    port: 993,
    smtp_host: "smtp.aol.com",
    smtp_port: 465,
    help: "Generate an app password at login.aol.com → Account security → Generate app password.",
  },
  {
    id: "icloud",
    name: "iCloud Mail",
    host: "imap.mail.me.com",
    port: 993,
    smtp_host: "smtp.mail.me.com",
    smtp_port: 587,
    help: "Generate an app-specific password at appleid.apple.com → Sign-In and Security → App-Specific Passwords.",
  },
  {
    id: "custom",
    name: "Custom server",
    host: "",
    port: 993,
    smtp_host: "",
    smtp_port: 465,
    help: "Enter your provider's IMAP and SMTP settings manually.",
  },
];

const DEFAULT_PRESET: Preset = PRESETS[0]!;

export default function ConnectImapPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<Preset>(DEFAULT_PRESET);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState(DEFAULT_PRESET.host);
  const [port, setPort] = useState(DEFAULT_PRESET.port);
  const [smtpHost, setSmtpHost] = useState(DEFAULT_PRESET.smtp_host);
  const [smtpPort, setSmtpPort] = useState(DEFAULT_PRESET.smtp_port);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (isLocked()) router.replace("/unlock");
  }, [router]);

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id) ?? DEFAULT_PRESET;
    setPreset(p);
    setHost(p.host);
    setPort(p.port);
    setSmtpHost(p.smtp_host);
    setSmtpPort(p.smtp_port);
  }

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const key = getDerivedKey();
    if (!key) {
      router.replace("/unlock");
      return;
    }
    setBusy(true);
    try {
      const { tokens, account } = await auth.imapConnect({
        email,
        password,
        host,
        port,
        smtp_host: smtpHost,
        smtp_port: smtpPort,
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
      router.replace("/inbox");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <header className="glass-header sticky top-0 z-10 px-3 py-3 flex items-center gap-2">
        <Link
          href="/accounts/connect"
          className="grid place-items-center w-10 h-10 rounded-full hover:bg-[hsl(var(--color-muted))] -ml-1"
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
        </Link>
        <div className="flex items-center gap-2 flex-1">
          <span className="grid place-items-center w-8 h-8 rounded-xl bg-[hsl(var(--color-teal-soft))] text-[hsl(var(--color-teal))]">
            <ServerIcon size={16} />
          </span>
          <h1 className="text-base font-semibold">IMAP account</h1>
        </div>
      </header>

      <div className="p-6 mx-auto max-w-md">
        <form onSubmit={connect} className="space-y-4">
          <Field label="Provider">
            <div className="relative">
              <select
                value={preset.id}
                onChange={(e) => applyPreset(e.target.value)}
                className="input-base appearance-none pr-9"
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                size={16}
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[hsl(var(--color-muted-fg))]"
              />
            </div>
          </Field>

          <div className="card p-3 bg-[hsl(var(--color-accent-soft))] border-[hsl(var(--color-accent)/0.25)] flex items-start gap-2">
            <AlertIcon
              size={16}
              className="text-[hsl(var(--color-accent))] mt-0.5 shrink-0"
            />
            <p className="text-xs text-[hsl(var(--color-fg))]">{preset.help}</p>
          </div>

          <Field label="Email" icon={<MailIcon size={16} />}>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-base pl-10"
            />
          </Field>

          <Field label="App password" icon={<LockIcon size={16} />}>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="xxxx xxxx xxxx xxxx"
              className="input-base pl-10"
            />
          </Field>

          <button
            type="button"
            onClick={() => setShowAdvanced((x) => !x)}
            className="w-full text-left text-xs font-semibold text-[hsl(var(--color-muted-fg))] hover:text-[hsl(var(--color-fg))] inline-flex items-center gap-1.5"
          >
            <ChevronDownIcon
              size={14}
              className={
                "transition-transform " + (showAdvanced ? "rotate-180" : "")
              }
            />
            Advanced server settings
          </button>

          {showAdvanced && (
            <div className="space-y-3 pl-4 border-l-2 border-[hsl(var(--color-border))]">
              <Field label="IMAP host">
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  required
                  className="input-base"
                />
              </Field>
              <Field label="IMAP port">
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  required
                  className="input-base"
                />
              </Field>
              <Field label="SMTP host">
                <input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  required
                  className="input-base"
                />
              </Field>
              <Field label="SMTP port">
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value))}
                  required
                  className="input-base"
                />
              </Field>
            </div>
          )}

          {err && (
            <div className="rounded-xl border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))] px-3 py-2 text-sm flex items-start gap-2">
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="btn-primary w-full"
          >
            {busy ? "Connecting…" : "Connect"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-muted-fg))] block mb-1.5">
        {label}
      </span>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--color-muted-fg))] pointer-events-none">
            {icon}
          </div>
        )}
        {children}
      </div>
    </label>
  );
}
