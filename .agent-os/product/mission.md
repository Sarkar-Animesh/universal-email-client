# Mission

## Pitch
A privacy-respecting, AI-first universal email client that runs in any browser and
installs to any phone as a PWA. One inbox across Gmail, Office 365, and IMAP, with
AI that actually earns its keep: summaries you trust, drafts that sound like you,
and a prioritized inbox you don't have to micromanage.

## Why this exists
- **Native clients fragment.** Gmail-only apps don't help if you have a work O365
  account and a personal Yahoo account. Native clients (Outlook, Spark, Superhuman)
  are platform-locked and either send your mail through their servers or limit AI
  to a single provider.
- **Existing AI email tools are bolt-ons.** They wrap a thin LLM call around a
  retrieval system that doesn't know thread context, sender history, or your
  reply style. Quality is mediocre and trust is low.
- **Privacy gap.** Most AI email products store mail on a server they control. We
  keep mail bodies on the device; the backend is a stateless broker.

## Target user
Knowledge worker with 2–5 mail accounts across providers. Comfortable installing
a PWA. Wants AI help but unwilling to hand a vendor permanent access to mail.

## Out of scope (deliberately)
- Calendar, contacts, tasks, notes.
- Native mobile apps (iOS/Android). PWA only.
- Self-hosted SMTP / receiving mail (we send via provider APIs).
- Group features (shared inboxes, team templates).

## Success criteria
- Connect Gmail + O365 + an IMAP account in under 3 minutes total.
- First inbox view loads in <2s on a mid-range Android device on 4G.
- AI summary for a 10-message thread is rated useful by the user ≥80% of the time
  (in-app thumbs-up rate).
- Reply draft is accepted (sent with ≤20% edits) ≥40% of the time.
- Works fully offline for already-synced mail.
