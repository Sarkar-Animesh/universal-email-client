# Setting up Gmail OAuth (free, ~8 minutes)

You need this to run the app. Without a registered OAuth client, Google
refuses to issue tokens — there's no way around it for any third-party email
client.

Once set up, your reviewer (or anyone with a Gmail account you've listed as a
"test user") can sign in and use the full flow.

## What you'll end up with

Two strings in `backend/.env`:

```
GOOGLE_OAUTH_CLIENT_ID=123456789-abc...apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
```

## Step 1 — Open Google Cloud Console

Go to https://console.cloud.google.com/

Sign in with the Google account you want to *own* the OAuth client. (This
can be your personal Gmail — it doesn't have to be a paid workspace account.)

## Step 2 — Create a project

Top bar → project dropdown → **NEW PROJECT**.

- **Name:** `Universal Email Client` (anything works)
- **Organization:** leave as "No organization" for a personal account.

Click **CREATE**. Wait ~10 seconds. Then make sure the new project is selected
in the top bar.

## Step 3 — Enable the Gmail API

Direct link: https://console.cloud.google.com/apis/library/gmail.googleapis.com

Click **ENABLE**.

## Step 4 — Configure the OAuth consent screen

Direct link: https://console.cloud.google.com/apis/credentials/consent

- **User Type:** **External**, then **CREATE**.
- **App name:** `Universal Email Client`
- **User support email:** your email
- **Developer contact email:** your email
- Skip the optional fields (logo, app domain). Click **SAVE AND CONTINUE**.

### Scopes
- Click **ADD OR REMOVE SCOPES**.
- In the filter, paste: `gmail.modify`
- Check the row that says
  `.../auth/gmail.modify  Read, compose, send, and permanently delete...`
  (we use `.modify`, which does NOT include permanent delete despite the
  description; permanent delete needs the separate `.metadata` + delete scope
  combo).
- Also check `openid`, `.../auth/userinfo.email`.
- Click **UPDATE**, then **SAVE AND CONTINUE**.

### Test users
- Click **+ ADD USERS**.
- Add the Gmail address you'll use to demo (e.g., your own + your reviewer's).
- Up to 100 test users allowed — no Google verification needed for this many.
- **SAVE AND CONTINUE**, then **BACK TO DASHBOARD**.

## Step 5 — Create the OAuth 2.0 Client ID

Direct link: https://console.cloud.google.com/apis/credentials

- Click **+ CREATE CREDENTIALS** → **OAuth client ID**.
- **Application type:** **Web application**.
- **Name:** `Universal Email Client (dev)`.
- Under **Authorized redirect URIs**, click **+ ADD URI** and add **both**:
  - `http://localhost:3000/auth/gmail/callback`
  - `https://<your-vercel-frontend-domain>/auth/gmail/callback`
    (you can add this after you deploy; come back and edit anytime)
- Click **CREATE**.

A modal pops up with your **Client ID** and **Client Secret**. Copy both.

## Step 6 — Put them in `backend/.env`

```bash
cd backend
cp .env.example .env
# Edit .env and fill in:
#   GOOGLE_OAUTH_CLIENT_ID=...
#   GOOGLE_OAUTH_CLIENT_SECRET=...
#   GEMINI_API_KEY=...           (you already have this)
#   TOKEN_SIGNING_KEY=...        (generate one — see below)
```

### Generate `TOKEN_SIGNING_KEY`

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Paste the output into `TOKEN_SIGNING_KEY=` in `.env`.

## Step 7 — Run it

```bash
# Terminal 1
cd backend
uv pip install -e ".[dev]"
uv run uvicorn app.main:app --reload --port 8000

# Terminal 2
cd frontend
cp .env.example .env.local
pnpm install
pnpm dev
```

Open http://localhost:3000 on your phone (same Wi-Fi) or laptop, set a
passphrase, click **Gmail**, sign in with a Gmail address you added as a test
user in Step 4. You should land on the inbox.

## Reviewer's perspective

When you hand this off for evaluation:

1. The reviewer's Gmail address needs to be added as a **test user** in
   Step 4. Re-open the consent screen and add their email; takes 30 seconds.
2. They'll see a "Google hasn't verified this app" warning the first time —
   that's normal for any app in test mode and disappears after Google
   verification (which you only need for production, not eval).
3. They click **Continue** → **Allow** and the flow proceeds normally.

## When to graduate to "Published"

Stay in **Testing** mode for evaluation, prototypes, and demos. The only
reasons to publish:
- More than 100 users.
- You want to remove the "unverified" warning.

Publishing triggers a Google security review (1–6 weeks for sensitive
scopes like `gmail.modify`). Don't trigger it for an evaluation.

## What about Office 365?

Phase 2 of the roadmap. The Microsoft equivalent (Azure Portal → App
registrations) is conceptually the same flow but isn't needed for the Phase 1
evaluation slice. Skip until you're ready to implement
[backend/app/providers/microsoft.py](../backend/app/providers/microsoft.py).

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `redirect_uri_mismatch` | The URL the app uses isn't on the allowed list | Add the exact URL (scheme, host, port, path) to the OAuth client's Authorized redirect URIs |
| `access_denied` after consent | The Gmail account isn't a test user | Add the account to Test users in the OAuth consent screen |
| Stuck on "Google hasn't verified this app" | Normal for test mode | Click **Advanced** → **Go to Universal Email Client (unsafe)** — only "unsafe" because Google's verification hasn't run |
| `invalid_client` from `/auth/gmail/callback` | Wrong client ID/secret in `.env`, or backend didn't reload | Double-check the env vars; restart `uvicorn` |
| 503 `GOOGLE_OAUTH_CLIENT_ID missing` | Backend can't see the env var | Confirm `.env` is in `backend/` (not project root) and you started uvicorn from `backend/` |
