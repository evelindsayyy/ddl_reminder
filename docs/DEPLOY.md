# First deploy — Vercel (free hobby tier)

The app has run locally until now. This runbook takes it to a public URL — which is also what makes the reminder loop real: QStash webhooks and the daily cron need to reach the app over the internet, so **email reminders have never actually fired before this deploy**.

Everything below happens in your accounts; ~20 minutes.

## 1. Create the Vercel account + import the repo

1. https://vercel.com/signup → **Continue with GitHub** (free Hobby plan).
2. "Import Project" → pick `evelindsayyy/ddl_reminder` → framework auto-detects Next.js. Don't deploy yet — add env vars first (step 2), then deploy.
3. Project Settings → **Node.js Version: 20.x or later** (Next 16 requires ≥20.9; check this before the first build).

## 2. Environment variables (Settings → Environment Variables, all three environments)

Copy the values from your local `.env.local`, with ONE change:

| var | value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | as in `.env.local` |
| `QSTASH_TOKEN` / `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | as in `.env.local` |
| `RESEND_API_KEY` / `FROM_EMAIL` | as in `.env.local` (see step 5 about the sender domain) |
| `CRON_SECRET` | as in `.env.local` |
| `NEXT_PUBLIC_APP_URL` | ⚠️ **your production URL** — set to `https://<project>.vercel.app` after the first deploy assigns the domain, then redeploy. Reminder emails embed links from this; QStash callbacks target it. |

## 3. Supabase: allow the new domain + run the new migration

1. Supabase Dashboard → Authentication → **URL Configuration**: set Site URL to `https://<project>.vercel.app` and add `https://<project>.vercel.app/auth/callback` to the Redirect URLs. **Magic-link login will not work on the deployed app until this is done.**
2. SQL Editor → run `supabase/migrations/0006_sync_rate_limits.sql` (the Gradescope rate-limit table — new this release; earlier migrations are already applied since the app worked locally). The app degrades gracefully without it, but the rate limit is dormant until it exists.

## 4. Deploy + verify

Deploy (or redeploy after setting `NEXT_PUBLIC_APP_URL`). Then on the live URL:

- Log in via magic link (proves step 3.1).
- Add a deadline with a reminder offset a few minutes out — the **email should actually arrive** (a first for this app). QStash console (console.upstash.com) shows the scheduled message; Resend dashboard shows the send.
- `curl https://<project>.vercel.app/api/ics/<your-token>` → calendar with `REFRESH-INTERVAL`.
- Vercel → Project → **Cron Jobs**: confirm the daily job from `vercel.json` is registered (Hobby allows daily crons). After its first run, the function log should show the sweeper/canvas/backfill/digest summary and no 401.
- Install the PWA to your phone from the live URL.
- Update your Gradescope bookmarklet + Apple Calendar subscription to the production URL (Settings page regenerates both).

## 5. Two footnotes

- **Resend sender**: if `FROM_EMAIL` is on a domain you haven't verified in Resend, production sends may be limited to your own inbox (fine for a personal tool) — verify the domain in Resend's dashboard if you ever want to send to others.
- **Local dev unchanged**: `.env.local` keeps `NEXT_PUBLIC_APP_URL=http://localhost:3000`; only the Vercel env carries the public URL.
