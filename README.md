<div align="center">
  <img src="public/icon.svg" width="84" alt="Deadline Tracker logo" />

# Deadline Tracker

**A full-stack Next.js + Supabase web app I built and use every day** to stay on
top of coursework and internship deadlines. Type a due date in plain English and
it parses, schedules email reminders, syncs to Apple Calendar, imports from Canvas
and Gradescope, and tracks application pipelines — deployed on Vercel as an
installable mobile PWA.

[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
&nbsp;[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
&nbsp;[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
&nbsp;[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
&nbsp;[![tests](https://img.shields.io/badge/tests-705%20passing-brightgreen)](.github/workflows/ci.yml)
&nbsp;[![CI](https://github.com/evelindsayyy/ddl_reminder/actions/workflows/ci.yml/badge.svg)](https://github.com/evelindsayyy/ddl_reminder/actions/workflows/ci.yml)

</div>

The canonical spec lives in [CLAUDE.md](CLAUDE.md) — read that first if you're
extending the project; this README is the install + run guide.

## Stack

| Layer          | Choice                              |
|----------------|-------------------------------------|
| Framework      | Next.js 16 App Router + TypeScript (React 19) |
| Styling        | Tailwind CSS (hand-drawn type system: Patrick Hand / Caveat / JetBrains Mono) |
| Database       | Supabase Postgres + Row-Level Security |
| Auth           | Supabase Auth (email magic link)    |
| Hosting        | Vercel                              |
| Email          | Resend                              |
| Job scheduler  | Upstash QStash                      |
| Daily cron     | Vercel Cron                         |
| NLP            | `chrono-node`                       |
| Calendar out   | `ical-generator`                    |
| Time math      | `date-fns` + `date-fns-tz`          |

## What it does

- **Quick add.** Type a line, get an assignment. `STA 240 HW5 due Friday 11:59pm`
  parses into a course code, type, title, due date, and tags using `chrono-node` +
  regex (no LLM round-trips on every keystroke).
- **Recurring assignments.** `COMPSCI 372 hw every Tuesday 11:59pm` expands into
  one row per Tuesday through your semester end. Includes biweekly and multi-day
  patterns (`every MWF`, `every Tue and Thu`).
- **Three assignments views.** `?view=list` (grouped by course),
  `?view=calendar` (month grid), `?view=timeline` (per-course Gantt swim lanes,
  desktop-only).
- **Three applications views.** `?view=kanban` (drag stages), `?view=timeline`
  (next-action ordering), `?view=funnel` (pipeline counts, response rate,
  decision-due).
- **Dashboard.** Today / this week / later buckets, computed in your IANA
  timezone, with optimistic mark-done.
- **Apple Calendar subscription.** Per-user `webcal://` feed at `/api/ics/[token]`.
  Subscribe in any calendar app that speaks ICS.
- **Canvas import.** Paste your Canvas `.ics` calendar feed URL into Settings,
  the daily cron upserts your assignments. No OAuth, no API tokens.
- **Gradescope sync.** SSO-friendly bookmarklet — drag to bookmarks bar, click
  on any Gradescope course page, assignments sync to your account. Rate-limited
  server-side (10 syncs/hour/user, DB-backed fixed window) to keep a runaway
  bookmarklet click from hammering the endpoint.
- **Email reminders.** At configurable offsets before each deadline (default
  168h / 48h / 12h). QStash schedules; Resend sends. Daily cron sweeper catches
  anything QStash drops.
- **Editable timezone.** Settings lets you pick your IANA timezone from a
  full `Intl.supportedValuesOf('timeZone')` list — every date parse, dashboard
  bucket, and reminder fire time follows it.
- **Mobile PWA.** Responsive collapse to single column, bottom tab nav, sticky
  add bar. Installable home-screen icon set (192/512/maskable PNGs generated
  from `public/icon.svg` via `scripts/generate-icons.mjs`).

## Screenshots

<!-- TODO(owner): the authed UI (dashboard, kanban, settings) can't be
     screenshotted headlessly — auth is Supabase email magic-link, so there's
     no scriptable login for a CI/agent screenshot job. Capture by hand:
       1. Sign in on desktop Chrome at 1440x900, go to the dashboard
          (today/this week/later buckets populated with a few real or seed
          assignments — not an empty state).
       2. Save as docs/images/dashboard-desktop.png.
       3. Open the same dashboard on a phone (or Chrome DevTools device
          toolbar at 390x844, iPhone 12/13 size) with the PWA installed to
          home screen if possible, to show the standalone chrome.
       4. Save as docs/images/dashboard-mobile.png.
       5. Replace this comment with:
          ![Dashboard](docs/images/dashboard-desktop.png)
          ![Dashboard on mobile](docs/images/dashboard-mobile.png)
     Keep both under ~500KB (PNG, cropped to the browser viewport, no OS
     chrome) so the README stays fast to load. -->

## Setup

### 1. Clone and install

```bash
git clone git@github.com:evelindsayyy/ddl_reminder.git
cd ddl_reminder
npm install
```

Requires Node ≥ 20 (`"engines"` in `package.json`; Next 16's minimum).

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in the values:

| Variable                          | Where to get it                                     | Required for                  |
|-----------------------------------|-----------------------------------------------------|-------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase → Project Settings → API → Project URL     | everything                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase → Project Settings → API → anon/public     | everything                    |
| `SUPABASE_SERVICE_ROLE_KEY`       | Supabase → Project Settings → API → service_role    | `/api/ics`, cron, webhooks    |
| `NEXT_PUBLIC_APP_URL`             | `http://localhost:3000` for dev                     | bookmarklet, ICS, email links |
| `CRON_SECRET`                     | `openssl rand -hex 32`                              | Vercel cron auth              |
| `RESEND_API_KEY` + `FROM_EMAIL`   | resend.com (verify a sending domain)                | reminder + digest email       |
| `QSTASH_TOKEN` + `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY` | console.upstash.com/qstash | scheduled reminders |

Resend and QStash are optional — the app gracefully no-ops if either is missing
(reminder rows are still written so the daily sweeper can pick them up once
Resend is configured).

### 3. Run database migrations

Paste each file in [supabase/migrations](supabase/migrations) into the Supabase
SQL Editor in order:

```
0001_init.sql              — courses, assignments, applications, reminders, user_prefs + RLS
0002_integrations.sql      — source tracking, recurrence groups, integration columns
0003_ics_token.sql         — outbound calendar feed token
0004_sync_status.sql       — Canvas last-sync timestamp + error
0005_assignment_tags.sql   — tags[] column on assignments
0006_sync_rate_limits.sql  — sync_rate_limits table (Gradescope bookmarklet rate limit)
```

### 4. Configure Supabase Auth

1. **Authentication → Providers → Email** — confirm enabled (default).
2. **Authentication → URL Configuration** — set Site URL to `http://localhost:3000`
   and add `http://localhost:3000/auth/callback` to Redirect URLs.

### 5. Run

```bash
npm run dev
```

Visit http://localhost:3000 — you'll be redirected to `/login`. Enter your
email, click the magic link, you're in.

## Commands

```bash
npm run dev             # Next.js dev server with hot reload
npm run build           # production build
npm run start           # serve the production build
npm run lint            # eslint . (flat config, eslint.config.mjs)
npm run typecheck       # tsc --noEmit
npm test                # tsx pure-lib chain: parser, recurrence, bucket, score, canvas, ics, …
npm run test:unit       # vitest — route + component tests (jsdom, RTL)
npm run test:all        # canonical local gate — npm test && vitest run
npm run test:parser     # smoke-test the NL parser against §7 cases (print-only)
npm run icons:generate  # regenerate public/icon-{192,512,maskable-512}.png from icon.svg
```

### Dual test harness

There are two separate test runners, and CI runs both as distinct steps:
`npm test` is a chain of `tsx <file>.test.ts` runs over the pure-function
modules (no DB, no React — plain assertions, `process.exit(1)` on failure);
`npm run test:unit` is vitest for route handlers and components (webhook,
cron, gradescope, assignments routes; toast/stage-actions/quickadd
components). `npm run test:all` runs both and is the gate to run locally
before pushing — don't assume either suite alone covers the other. See
[CLAUDE.md §11](CLAUDE.md#11-commands) for the full breakdown.

### CI

GitHub Actions (`.github/workflows/ci.yml`) runs, on every push to `main`
and on pull requests: `npm run typecheck`, `npm run lint` (ESLint 9 flat
config), `npm test`, and `npm run test:unit`. It does **not** run
`next build` (that needs Supabase/QStash secrets) — that gate is manual,
against a Vercel preview deploy, before merging to `main`.

## Subscribing to your calendar feed

1. Sign in → **Settings → integrations → calendar feed** → click **copy**.
2. In Apple Calendar: **File → New Calendar Subscription** → paste the
   `webcal://` URL → ✓. Updates poll every 15min–few hours (OS-controlled).

## Importing from Canvas

1. Log into your Canvas instance → sidebar **Calendar** → **Calendar Feed** →
   copy the URL.
2. **Settings → integrations → canvas import** → paste → **save** → **sync now**.
3. The daily cron (deployed to Vercel) will keep it in sync automatically.

## Importing from Gradescope

Gradescope has no public API and uses SSO at most universities, so we use a
bookmarklet that scrapes the assignments table from your authenticated session.

1. **Settings → integrations → gradescope** → **generate bookmarklet**.
2. Drag the **⤓ Sync to ddl** link to your bookmarks bar.
3. On any Gradescope course page (`.../courses/<id>/assignments`), click the
   bookmarklet. A toast confirms the sync.

The token sits in `user_prefs.gradescope_sync_token`; click **regenerate** at
any time to invalidate the old bookmarklet.

## Deployment to Vercel

1. Push to GitHub (this repo already has `origin`).
2. Import the project on vercel.com.
3. Add all environment variables from `.env.local` to the Vercel project
   settings.
4. [vercel.json](vercel.json) registers the daily cron at 11:00 UTC; Vercel
   wires it automatically.

## Project structure

```
app/
  (auth)/login/         — magic-link form
  (app)/                — authed routes (auth check in layout)
    page.tsx            — dashboard (today/this week/later buckets)
    assignments/        — list / calendar / timeline views
    applications/       — kanban / timeline / funnel views
    settings/           — semester, reminders, integrations, courses
  api/
    parse/              — NL parser endpoint
    assignments/        — CRUD
    courses/            — CRUD
    settings/           — PATCH
    canvas/sync/        — manual Canvas pull
    sync/gradescope/    — bookmarklet endpoint (CORS, token-authed)
    bookmarklet/        — emits the bookmarklet JS for the current user
    ics/[token]/        — outbound calendar feed
    ics-token/rotate/   — Settings regenerate
    gradescope-token/   — get/rotate the bookmarklet token
    webhooks/reminder/  — QStash → email
    cron/daily/         — Vercel cron entry
lib/
  parser/               — chrono-node + regex extraction
  recurrence.ts         — pattern detection + DST-safe expansion
  bucket.ts             — dashboard bucketing
  score.ts              — urgency score
  canvas.ts             — ICS feed parser + sync runner
  ics.ts                — outbound feed builder
  email.ts              — Resend wrapper + templates
  reminders.ts          — QStash schedule/cancel
  applications.ts       — server actions (no /api/applications routes)
  prefs.ts              — user_prefs helpers + token generation
  schemas.ts            — Zod schemas (single source of input validation)
  colors.ts             — course color palette
  format.ts             — formatDueAt / formatRelative
  supabase/             — SSR + browser clients + session middleware
components/
  dashboard/            — DashboardBuckets, BucketColumn, AssignmentCard
  assignments/          — GroupedByCourseList, CalendarMonthView, SwimLaneTimeline, AssignmentsView, QuickAdd
  applications/         — PipelineKanban, PipelineTimeline, PipelineFunnel, ApplicationsView, AddApplicationForm
  settings/             — CoursesManager, SettingsForm, RemindersForm, IntegrationsPanel
  layout/               — MobileBottomNav (md:hidden tabs), MobileAddBar (sticky add bar)
  ui/                   — CourseChip, TypePill, RelativeTime
supabase/migrations/    — 0001 init · 0002 integrations · 0003 ics_token · 0004 sync_status · 0005 assignment_tags · 0006 sync_rate_limits
design/                 — wireframes (index.html + *.jsx), HANDOFF, DESIGN_TOKENS
docs/                   — FINISH_PLAN.md, weekly implementation plans, images/ (README screenshot slot)
```

## Design system

The app uses a deliberately hand-drawn type system; this is the personality.
See [design/DESIGN_TOKENS.md](design/DESIGN_TOKENS.md) for the canonical reference.

- **Patrick Hand** — body text, list rows, card content, button labels (default `font-sans`)
- **Caveat** — page titles, bucket headers, greeting, empty states (`font-display`, semibold at ≥ `text-2xl`)
- **JetBrains Mono** — due dates, timestamps, course codes, counts (`font-mono`)

The course color palette in [lib/colors.ts](lib/colors.ts) is the only set of
hex values components are allowed to ship — everything else comes from Tailwind
tokens declared in [tailwind.config.ts](tailwind.config.ts).

## Status

| Feature                          | Status        |
|----------------------------------|---------------|
| Auth + quick add + list + courses (Days 1–3) | done   |
| Applications kanban/timeline/funnel (Days 8–9) | done |
| Dashboard with buckets (Day 11)  | done          |
| Recurring assignments            | done          |
| Outbound .ics feed (Day 10)      | done          |
| Canvas .ics import               | done — needs cron deployed for auto |
| Gradescope bookmarklet           | done          |
| Reminders infrastructure         | done — needs Resend + QStash to fire |
| Vercel cron config               | wired         |

## License

Personal project; no license. Don't redistribute without asking.
