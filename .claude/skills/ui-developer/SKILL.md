---
name: ui-developer
description: Use when building or modifying frontend UI components — thread list, compose window, account switcher, search bar, AI summary cards, or any interactive element. Covers Tailwind v4 patterns, mobile-first layout, accessibility, touch targets, sandboxed mail rendering, and component composition in Next.js 15 App Router. Skip for backend, OAuth, or IndexedDB schema changes.
---

# UI Developer Skill

Patterns and gotchas for the universal email client's frontend (Next.js 15 App Router,
React 19, Tailwind v4, TypeScript strict mode).

## Mobile-first baseline

- **Primary viewport: 360×800** — design here first, then scale up.
- **Touch targets: ≥ 44×44 px** — use `min-h-[44px] min-w-[44px]` on all interactive elements.
- Swipe gestures: archive on swipe-left, star on swipe-right (use `touch-action: pan-y` to preserve vertical scroll).
- Bottom navigation bar for primary actions; top bar for title + search icon.

## Tailwind v4 conventions

Tailwind v4 uses CSS variables everywhere — no `tailwind.config.js` at the top level.
Configure in `globals.css`:
```css
@import "tailwindcss";
@theme {
  --color-brand: #60a5fa;   /* blue-400 — primary accent */
  --color-surface: #0b1220; /* dark navy background */
}
```

- Avoid `@apply` in component files — use inline class strings.
- Use `group` / `peer` for hover states on complex cards.
- Dark mode is the default (the app is always dark — no light toggle needed).

## App Router patterns

### Server vs client components
- Pages that only read static data → Server Components (faster, no hydration).
- Pages with `useState`, `useEffect`, browser APIs (IndexedDB, WebCrypto) → `"use client"`.
- `useSearchParams()` **must** be inside a `<Suspense>` boundary or Next.js 15 throws a build error:
```tsx
// WRONG — build error in Next.js 15
export default function Page() {
  const sp = useSearchParams(); // ❌
  ...
}

// CORRECT
function Inner() {
  const sp = useSearchParams(); // ✅
  ...
}
export default function Page() {
  return <Suspense fallback={<Loading />}><Inner /></Suspense>;
}
```

### Route structure
```
app/
  page.tsx              → redirect to /inbox (or /setup if first run)
  setup/page.tsx        → passphrase creation
  unlock/page.tsx       → passphrase entry
  inbox/page.tsx        → thread list (primary screen)
  thread/[id]/page.tsx  → thread detail + AI summary
  compose/page.tsx      → reply/new message
  search/page.tsx       → search results
  accounts/
    page.tsx            → account list + lock
    connect/page.tsx    → add Gmail / O365 / IMAP
  auth/gmail/callback/page.tsx  → OAuth callback handler
```

## Rendering untrusted email HTML

**Never render raw email HTML in a plain `<div dangerouslySetInnerHTML>`.** Use:
```tsx
// 1. Sanitize with DOMPurify first
const clean = DOMPurify.sanitize(bodyHtml, {
  FORBID_TAGS: ["script", "style", "form", "input"],
  FORBID_ATTR: ["onerror", "onload", "onclick"],
});

// 2. Render inside a sandboxed iframe
<iframe
  sandbox="allow-same-origin"   // no scripts, no top-navigation
  srcDoc={clean}
  className="w-full min-h-[200px]"
  onLoad={e => {
    // auto-size to content height
    const f = e.currentTarget;
    f.style.height = f.contentDocument!.body.scrollHeight + "px";
  }}
/>
```

Remote images are blocked by default (privacy / read-receipt protection).
Offer a "Show images" button that re-renders with images allowed.

## Component patterns

### ThreadRow (inbox list item)
```tsx
type ThreadRowProps = {
  thread: UnifiedThread;
  onOpen: (id: string) => void;
};

function ThreadRow({ thread, onOpen }: ThreadRowProps) {
  return (
    <button
      className="flex w-full items-start gap-3 px-4 py-3 min-h-[72px] text-left
                 hover:bg-white/5 active:bg-white/10 transition-colors"
      onClick={() => onOpen(thread.id)}
    >
      <Avatar participants={thread.participants} />
      <div className="flex-1 min-w-0">
        <p className={cn("truncate text-sm", thread.flags.has_unread && "font-semibold")}>
          {senderNames(thread.participants)}
        </p>
        <p className="truncate text-sm text-white/60">{thread.snippet}</p>
      </div>
      <time className="text-xs text-white/40 shrink-0">
        {relativeDate(thread.last_message_date)}
      </time>
    </button>
  );
}
```

### AI summary card
```tsx
function AISummaryCard({ summary }: { summary: string[] }) {
  return (
    <div className="rounded-xl bg-blue-950/40 border border-blue-400/20 p-4 space-y-1">
      <p className="text-xs font-medium text-blue-400 uppercase tracking-wider">AI Summary</p>
      <ul className="space-y-1">
        {summary.map((bullet, i) => (
          <li key={i} className="text-sm text-white/80 flex gap-2">
            <span className="text-blue-400 shrink-0">•</span>
            {bullet}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## State management

Use Zustand 5 for cross-component state (selected account, sync status, compose
draft). Use Dexie `useLiveQuery` for data that lives in IndexedDB — it re-renders
automatically when the DB changes, so no manual refresh needed:

```tsx
import { useLiveQuery } from "dexie-react-hooks";
import { getDb } from "@/lib/db/schema";

const threads = useLiveQuery(
  () => getDb().threads.where("account_id").equals(accountId).sortBy("last_message_date"),
  [accountId]
);
```

## Accessibility checklist

- All interactive elements have visible focus rings (`focus-visible:ring-2 ring-blue-400`).
- Icon-only buttons have `aria-label`.
- Thread list uses `role="list"` / `role="listitem"` so screen readers announce count.
- Loading states use `aria-busy="true"` on the container.
- Error messages use `role="alert"` so they're announced immediately.

## Performance tips

- Virtualise the thread list with `@tanstack/react-virtual` once thread count
  exceeds ~200 (Dexie queries are fast but DOM nodes are slow).
- Lazy-load the compose/thread panels — they're heavy (DOMPurify, iframe, AI card).
- Use `next/dynamic` with `ssr: false` for any component that touches browser APIs:
```tsx
const ThreadView = dynamic(() => import("@/components/ThreadView"), { ssr: false });
```

## Don't

- Don't use `localStorage` — use IndexedDB (Dexie). Service worker can read it;
  `localStorage` is not accessible in service worker scope.
- Don't render `<img>` tags from email HTML outside the sandboxed iframe.
- Don't use `window.alert()` / `window.confirm()` — build inline UI instead.
- Don't add a light theme — the app is dark-only, matching email client conventions.
- Don't set `overflow: hidden` on the body — breaks mobile scroll momentum.
