import * as React from "react";
import { GoogleIcon, MailIcon, MicrosoftIcon, ServerIcon } from "./Icons";

const AVATAR_PALETTE = [
  { bg: "hsl(221 83% 92%)", fg: "hsl(221 83% 35%)" },
  { bg: "hsl(152 76% 88%)", fg: "hsl(152 76% 26%)" },
  { bg: "hsl(38 92% 88%)", fg: "hsl(28 80% 35%)" },
  { bg: "hsl(0 84% 92%)", fg: "hsl(0 70% 40%)" },
  { bg: "hsl(262 83% 92%)", fg: "hsl(262 70% 40%)" },
  { bg: "hsl(173 76% 86%)", fg: "hsl(173 80% 24%)" },
  { bg: "hsl(330 81% 92%)", fg: "hsl(330 70% 40%)" },
  { bg: "hsl(199 89% 89%)", fg: "hsl(199 89% 30%)" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initialsOf(name: string, fallback: string): string {
  const src = (name || fallback || "?").trim();
  if (!src) return "?";
  const parts = src.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 0) return src.slice(0, 1).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({
  name,
  email,
  size = 40,
  unread = false,
}: {
  name?: string | null;
  email?: string | null;
  size?: number;
  unread?: boolean;
}) {
  const seed = (email || name || "x").toLowerCase();
  const color = AVATAR_PALETTE[hashString(seed) % AVATAR_PALETTE.length]!;
  const initials = initialsOf(name || "", email || "");
  return (
    <div
      className="relative shrink-0 rounded-full grid place-items-center font-semibold select-none"
      style={{
        width: size,
        height: size,
        background: color.bg,
        color: color.fg,
        fontSize: size * 0.4,
      }}
      aria-hidden
    >
      {initials}
      {unread && (
        <span
          className="absolute -top-0.5 -right-0.5 rounded-full"
          style={{
            width: size * 0.28,
            height: size * 0.28,
            background: "hsl(var(--color-accent))",
            border: "2px solid hsl(var(--color-surface))",
          }}
        />
      )}
    </div>
  );
}

const PROVIDER_META: Record<
  string,
  { label: string; icon: React.ReactNode; tone: string }
> = {
  gmail: {
    label: "Gmail",
    icon: <GoogleIcon size={14} />,
    tone: "bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))]",
  },
  microsoft: {
    label: "Microsoft",
    icon: <MicrosoftIcon size={14} />,
    tone: "bg-[hsl(var(--color-accent-soft))] text-[hsl(var(--color-accent))]",
  },
  imap: {
    label: "IMAP",
    icon: <ServerIcon size={14} />,
    tone: "bg-[hsl(var(--color-teal-soft))] text-[hsl(var(--color-teal))]",
  },
};

export function ProviderBadge({
  provider,
  showLabel = true,
}: {
  provider: string;
  showLabel?: boolean;
}) {
  const meta = PROVIDER_META[provider] ?? {
    label: provider,
    icon: <MailIcon size={14} />,
    tone: "bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-fg))]",
  };
  return (
    <span className={`chip ${meta.tone}`}>
      {meta.icon}
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}

const CATEGORY_TONES: Record<string, string> = {
  important:
    "bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))]",
  "follow-up":
    "bg-[hsl(var(--color-warning-soft))] text-[hsl(var(--color-amber))]",
  followup:
    "bg-[hsl(var(--color-warning-soft))] text-[hsl(var(--color-amber))]",
  newsletter:
    "bg-[hsl(var(--color-accent-soft))] text-[hsl(var(--color-accent))]",
  promo:
    "bg-[hsl(var(--color-pink-soft))] text-[hsl(var(--color-pink))]",
  promotional:
    "bg-[hsl(var(--color-pink-soft))] text-[hsl(var(--color-pink))]",
  other:
    "bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-fg))]",
  reply:
    "bg-[hsl(var(--color-success-soft))] text-[hsl(var(--color-success))]",
  archive:
    "bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-fg))]",
  delete:
    "bg-[hsl(var(--color-danger-soft))] text-[hsl(var(--color-danger))]",
};

export function CategoryChip({ category }: { category: string }) {
  const tone =
    CATEGORY_TONES[category.toLowerCase()] ??
    "bg-[hsl(var(--color-muted))] text-[hsl(var(--color-muted-fg))]";
  return <span className={`chip ${tone}`}>{category}</span>;
}
