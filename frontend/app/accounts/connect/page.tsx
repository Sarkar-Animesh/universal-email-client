"use client";

import Link from "next/link";
import { useState } from "react";
import { auth } from "@/lib/api/client";
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  GoogleIcon,
  MicrosoftIcon,
  ServerIcon,
  LockIcon,
} from "@/components/Icons";

export default function ConnectAccountPage() {
  const [busy, setBusy] = useState(false);

  async function connectGmail() {
    setBusy(true);
    const redirect = `${window.location.origin}/auth/gmail/callback`;
    const { auth_url, state, code_verifier } = await auth.gmailStart(redirect);
    sessionStorage.setItem("gmail_oauth_state", state);
    sessionStorage.setItem("gmail_oauth_verifier", code_verifier);
    sessionStorage.setItem("gmail_oauth_redirect", redirect);
    window.location.href = auth_url;
  }

  async function connectMicrosoft() {
    setBusy(true);
    const redirect = `${window.location.origin}/auth/microsoft/callback`;
    const { auth_url, state, code_verifier } = await auth.microsoftStart(redirect);
    sessionStorage.setItem("microsoft_oauth_state", state);
    sessionStorage.setItem("microsoft_oauth_verifier", code_verifier);
    sessionStorage.setItem("microsoft_oauth_redirect", redirect);
    window.location.href = auth_url;
  }

  return (
    <main className="min-h-screen">
      <header className="glass-header sticky top-0 z-10 px-3 py-3 flex items-center gap-2">
        <Link
          href="/accounts"
          className="grid place-items-center w-10 h-10 rounded-full hover:bg-[hsl(var(--color-muted))] -ml-1"
          aria-label="Back"
        >
          <ArrowLeftIcon size={20} />
        </Link>
        <h1 className="text-base font-semibold">Connect an account</h1>
      </header>

      <div className="p-6 mx-auto max-w-md space-y-5">
        <div className="card p-4 flex items-start gap-3 bg-[hsl(var(--color-success-soft))] border-[hsl(var(--color-success)/0.25)]">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-[hsl(var(--color-success))] text-white shrink-0">
            <LockIcon size={16} />
          </span>
          <div className="text-sm">
            <div className="font-semibold text-[hsl(var(--color-success))]">
              Your mail stays on this device
            </div>
            <p className="text-xs text-[hsl(var(--color-muted-fg))] mt-0.5">
              We only relay calls to your provider. Tokens are encrypted in your
              browser.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <ProviderButton
            onClick={connectGmail}
            disabled={busy}
            icon={<GoogleIcon size={26} />}
            title="Gmail"
            subtitle="Google · OAuth 2.0 + PKCE"
          />
          <ProviderButton
            onClick={connectMicrosoft}
            disabled={busy}
            icon={<MicrosoftIcon size={26} />}
            title="Office 365 / Outlook"
            subtitle="Microsoft · OAuth 2.0 + PKCE"
          />
          <Link
            href="/accounts/connect/imap"
            className="card w-full p-4 flex items-center gap-3 hover:bg-[hsl(var(--color-muted)/0.4)] transition group"
          >
            <span className="grid place-items-center w-12 h-12 rounded-xl bg-[hsl(var(--color-teal-soft))] text-[hsl(var(--color-teal))]">
              <ServerIcon size={22} />
            </span>
            <div className="flex-1">
              <div className="font-semibold text-sm">IMAP</div>
              <div className="text-xs text-[hsl(var(--color-muted-fg))]">
                Yahoo, AOL, iCloud, custom · App password
              </div>
            </div>
            <ChevronRightIcon
              size={18}
              className="text-[hsl(var(--color-muted-fg))] group-hover:text-[hsl(var(--color-fg))]"
            />
          </Link>
        </div>
      </div>
    </main>
  );
}

function ProviderButton({
  onClick,
  disabled,
  icon,
  title,
  subtitle,
}: {
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="card w-full p-4 flex items-center gap-3 hover:bg-[hsl(var(--color-muted)/0.4)] transition disabled:opacity-50 group"
    >
      <span className="grid place-items-center w-12 h-12 rounded-xl bg-white border border-[hsl(var(--color-border))]">
        {icon}
      </span>
      <div className="flex-1 text-left">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-[hsl(var(--color-muted-fg))]">{subtitle}</div>
      </div>
      <ChevronRightIcon
        size={18}
        className="text-[hsl(var(--color-muted-fg))] group-hover:text-[hsl(var(--color-fg))]"
      />
    </button>
  );
}
