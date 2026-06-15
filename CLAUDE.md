# CLAUDE.md — Deadline Tracker

A personal assignment and interview-prep tracker for Grace. This file is the
source of truth for architecture, conventions, and gotchas. Read it before
starting a session; update it whenever a decision changes.

---

## 1. Goals and non-goals

**Goals**
- Daily driver for tracking coursework and internship applications.
- Email reminders that actually reach me even if the app isn't open.
- Natural-language entry — typing a single line should create an assignment.
- Mobile-friendly (PWA) so I can add things walking out of class.
- `.ics` subscription feed so deadlines show up in Apple Calendar.

**Non-goals (on purpose)**
- Google Calendar two-way sync. OAuth is a week of work for a feature that
  `.ics` covers 80% of. Revisit only if I genuinely miss something.
- Multi-user. This is a personal tool. No teams, no sharing.
- SMS. Email + PWA push + calendar subscription is enough. Adding Twilio
  costs money and isn't justified unless email starts failing me.
- Mobile app. PWA gives me install-to-homescreen. Native app is overkill.
- LLM-powered parsing. `chrono-node` + regex is deterministic, instant,
  and free. An LLM call on every keystroke is the wrong tradeoff.

---

## 2. Stack

| Layer         | Choice                     | Why                                        |
|---------------|----------------------------|--------------------------------------------|
| Framework     | Next.js 14 App Router + TS | Same repo for frontend and API, serverless |
| Styling       | Tailwind + shadcn/ui       | Fast, consistent, I already know it        |
| Database      | Supabase Postgres          | Free tier, RLS, auth included              |
| Auth          | Supabase Auth (email magic link) | No passwords, no OAuth, no Google in the stack |
| Hosting       | Vercel (Hobby)             | Native Next.js integration                 |
| Email         | Resend                     | 3,000/mo free, clean DX                    |
| Job scheduler | Upstash QStash             | 1,000 delayed msgs/day free                |
| Daily sweeper | Vercel Cron (1×/day)       | Enough for a daily sync job                |
| NLP           | `chrono-node`              | Natural-language date parsing              |
| Calendar out  | `ical-generator` package   | Standards-compliant `.ics`                 |
| Time math     | `date-fns` + `date-fns-tz` | IANA zone support (chrono alone can't)     |

**Vercel Hobby has a hard limit of 1 cron/day.** Don't try to schedule
reminders via cron — use QStash's "publish with delay" for per-reminder
timing. Vercel Cron is only for the daily sweeper (see §6).

---

## 3. Project structure

```
deadline-tracker/
├── CLAUDE.md                       # this file
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              # nav, auth check
│   │   ├── page.tsx                # "what's next" dashboard
│   │   ├── assignments/page.tsx
│   │   ├── applications/page.tsx
│   │   └── settings/page.tsx
│   └── api/
│       ├── assignments/route.ts
│       ├── applications/route.ts
│       ├── parse/route.ts          # NLP endpoint
│       ├── ics/[token]/route.ts    # per-user calendar feed
│       ├── cron/daily/route.ts     # Vercel cron target
│       └── webhooks/reminder/route.ts  # QStash → send email
├── lib/
│   ├── supabase/{client,server}.ts
│   ├── parser/index.ts             # parseAssignment()
│   ├── parser/parser.test.ts
│   ├── reminders.ts                # QStash schedule/cancel
│   ├── email.ts                    # Resend wrapper
│   ├── tz.ts                       # offset helpers
│   └── ics.ts                      # .ics generation
├── components/                     # grouped by feature, not by type
│   ├── dashboard/                  # DashboardBuckets, BucketColumn, AssignmentCard
│   ├── assignments/                # AssignmentsView, QuickAdd (the magic bar), calendar/timeline
│   ├── applications/               # ApplicationCard, pipeline (kanban/timeline/funnel)
│   ├── settings/                   # CoursesManager, SettingsForm, RemindersForm, IntegrationsPanel
│   ├── layout/                     # MobileBottomNav, MobileAddBar
│   └── ui/                         # CourseChip, TypePill, RelativeTime
├── supabase/migrations/
│   └── 0001_init.sql
├── design/                         # wireframes (index.html + *.jsx), HANDOFF, DESIGN_TOKENS — not in the build
├── public/manifest.json            # PWA
└── vercel.json                     # cron config
```

**Route groups:** `(auth)` and `(app)` share layouts without nesting URLs.
**Parser in `lib/`:** keeps it unit-testable and reusable (Telegram bot later).
**Components by feature:** every component lives under a domain folder
(`dashboard/`, `assignments/`, `applications/`, `settings/`, `layout/`) or
`ui/` — nothing loose at the `components/` root. Put new components in the
folder for the screen they serve.
**Design artifacts:** the prototype wireframes and design docs live in
`design/` and are never imported by the app. See `design/README.md`.

---

## 4. Data model

Full schema lives in `supabase/migrations/0001_init.sql`. Summary:

- **`courses`** — user's Duke courses. Unique on `(user_id, code)` so
  re-importing a syllabus doesn't duplicate.
- **`assignments`** — FK to `courses` (nullable — a one-off deadline has no
  course). `type` is an enum. `completed_at IS NULL` = open.
- **`applications`** — separate from assignments because the shape diverges:
  stage enum, `next_action_at`, no single "due date". Do not merge these.
- **`reminders`** — CHECK constraint: exactly one of `assignment_id` /
  `application_id` set. Stores the QStash message ID so I can cancel.
- **`user_prefs`** — `reminder_offsets_hours int[]` (default
  `{168, 48, 12}` = 1 week, 2 days, 12 hours). `timezone` as IANA string.

### Non-obvious decisions

**Partial indexes on open items.** The dashboard query is "what's open and
upcoming." Indexing only `WHERE completed_at IS NULL` keeps it fast even
after four years of completed assignments.

**RLS from day one.** Every table has `auth.uid() = user_id` policies. Even
if an API route forgets to filter, Postgres won't return other users' rows.
Configure this correctly or be sorry later.

**`reminder_offsets_hours` as an array.** Arrays are normally a smell, but
this is config that's always read whole and never queried relationally.
Array is correct here. Don't normalize.

**Polymorphic `reminders` via CHECK constraint.** Not elegant, but for two
parent types (assignments, applications) a check constraint is simpler than
a join table or STI. Reconsider if we add a third type.

---

## 5. Timezone handling (READ THIS BEFORE TOUCHING DATES)

This is where I will lose the most time if I'm not careful. Rules:

### Storage
- **All timestamps stored as `timestamptz` in UTC.** Never store naive
  local times. Postgres handles this automatically if I always pass
  Date objects or ISO strings with offset.

### Display
- Always render in the user's `timezone` from `user_prefs`.
  Use `toLocaleString('en-US', { timeZone: user.timezone, ... })`.
- Never use `.toLocaleString()` without the `timeZone` option on the
  server — Vercel containers are UTC and will silently render wrong.

### Parsing (the actual trap)
`chrono-node`'s `timezone` option takes a **numeric offset in minutes**
or an abbreviation like `"EDT"`. It does **not** accept IANA zones like
`America/New_York`. Two consequences:

1. I must compute the offset myself using `date-fns-tz`:
   ```ts
   import { getTimezoneOffset } from 'date-fns-tz';
   // returns ms; divide by 60_000 for minutes
   const offsetMin = getTimezoneOffset('America/New_York', atDate) / 60000;
   ```

2. **DST means the offset changes by date.** An offset computed for April
   (EDT, -240) is wrong for December (EST, -300). Compute the offset for
   each parsed date, not once at the top.

### The pattern to follow
```ts
// 1. Parse with a rough (reference-time) offset just to get the date.
const refOffset = getTimezoneOffset(tz, now) / 60000;
const results = chrono.parse(input, { instant: now, timezone: refOffset },
                             { forwardDate: true });

// 2. For each result, recompute offset at the actual target date.
for (const r of results) {
  const targetDate = r.start.date();
  const correctOffset = getTimezoneOffset(tz, targetDate) / 60000;

  // 3. Apply default times for exams vs everything else.
  if (!r.start.isCertain('hour')) {
    r.start.assign('hour', r.type === 'exam' ? 9 : 23);
    r.start.assign('minute', r.type === 'exam' ? 0 : 59);
  }
  // 4. Always assign timezoneOffset explicitly after assigning hours,
  //    otherwise chrono falls back to the system zone (UTC on Vercel).
  r.start.assign('timezoneOffset', correctOffset);
}
```

**Verified symptom of getting this wrong:** Friday 11:59pm typed in Durham
showing up in the DB as 3:59 UTC instead of 03:59 UTC the next day — i.e.,
4 hours early. Reminder fires at the wrong time. Calendar event appears on
the wrong day.

### DST edge cases to test
- Spring forward (2am → 3am, second Sunday of March)
- Fall back (2am → 1am, first Sunday of November)
- A reminder scheduled in October to fire in November — QStash delivers
  at a real UTC instant, but my 9am default might land at 8am or 10am
  depending on when I computed the offset.

### Default times
| Type       | Default (when no time given) |
|------------|------------------------------|
| exam       | 09:00 local                  |
| everything | 23:59 local                  |

---

## 6. Reminders architecture

**Two layers:**

### Layer 1: per-reminder scheduling (QStash)
When an assignment is created or updated:
1. Cancel any existing scheduled `reminders` rows for this assignment
   (`qstash.messages.delete(messageId)`).
2. For each offset in `user_prefs.reminder_offsets_hours`, compute
   `fire_at = due_at - offset_hours`.
3. Skip any `fire_at` that's in the past (e.g., adding "due tomorrow"
   skips the 168h reminder).
4. For each remaining `fire_at`, call `qstash.publishJSON({ url,
   body: { reminderId }, notBefore: Math.floor(fire_at / 1000) })`.
5. Store the returned `messageId` in the `reminders` row.

### Layer 2: daily reconciliation (Vercel Cron)
Runs once per day at ~07:00 user-local:
- Find any `reminders` with `status = 'scheduled'` and `fire_at < now()` —
  QStash missed them somehow. Send them now, mark `sent`.
- Find any open assignments due in the next 24h that have no scheduled
  12h reminder — something got dropped. Re-schedule.
- Send the daily digest email ("Here's what's on your plate today").

This belt-and-suspenders setup means even if QStash goes down, I don't
miss a deadline — the daily sweeper catches it.

### Email auth
QStash calls `/api/webhooks/reminder` with a signed payload. Verify the
signature using `@upstash/qstash`'s `Receiver` — otherwise anyone who
guesses the URL can trigger emails.

Vercel cron calls `/api/cron/daily` with an `Authorization: Bearer
$CRON_SECRET` header. Verify it; reject otherwise.

---

## 7. NLP parser

Lives in `lib/parser/index.ts`. Test file in the same directory. Run
`npx tsx lib/parser/parser.test.ts` to see sample outputs.

### Extraction order (matters)
1. **Course code** first. Regex: `/\b([A-Z]{2,8})\s?(\d{1,4}[A-Z]?)\b/`.
   Handles `STA 240`, `COMPSCI 210D`, `ENGLISH 208S`. Strip the match from
   the input before further extraction.
2. **Tags** (`#hard`, `#group`). Strip and collect.
3. **Type** via keyword regex (see `TYPE_PATTERNS`). Order matters — check
   specific terms before generic ones (`exam` before `assignment`).
4. **Date** via `chrono.parse` with timezone per §5. Use the **last**
   date match (handles "Lab 5 (started Tuesday) due Friday").
5. **Title** = whatever's left after stripping filler words (`due`, `by`,
   `on`, `at`). Fall back to `"Untitled"` if empty.

### Confidence score
Self-scored 0–1 based on which components extracted. UI should show a
warning banner if `confidence < 0.6`.

### Known limitations (fine to accept)
- "podcast analysis" classifies as `other` — add keywords as I notice them.
- No course code → `courseCode: null`, UI prompts to pick one.
- No date → banner "No due date found; add one?"
- Ambiguous course codes across terms (e.g., if I take both "ENG 208"
  and "ENGLISH 208S") — handle by matching against `courses` table at
  save time and letting me pick.

### Must-pass test cases
```
STA 240 HW5 due Friday 11:59pm      → STA 240, HW5, homework, Fri 23:59
COMPSCI 210D lab 6 due tomorrow     → COMPSCI 210D, lab 6, lab
ENGLISH 208S paper due May 1        → ENGLISH 208S, essay, May 1 23:59
STA 199 final exam May 5            → STA 199, exam, May 5 09:00
Cisco interview Thursday 2pm        → no course, other, Thu 14:00
Read ch 7 of Dracula by Sunday      → no course, reading
HW due fri                          → homework, Fri 23:59
project presentation monday #group  → project, tags=['group']
groceries                           → confidence 0.4, no date
```

Any regression on these, fix before shipping.

---

## 8. `.ics` calendar feed

### Why `.ics` instead of Google OAuth
- Apple Calendar is my primary calendar.
- Apple Calendar (and Google, and Outlook) natively support subscribing to
  `webcal://` URLs and polling for updates.
- No OAuth flow, no refresh tokens, no sync conflicts, no scopes to manage.
- One-way (app → calendar) is fine. I don't want calendar events mutating
  my assignments.

### How
- Route: `/api/ics/[token]/route.ts` where `token` is a long random per-user
  value stored in `user_prefs.ics_token`. Obscurity is the only auth —
  don't tie it to Supabase Auth because Apple Calendar can't send cookies.
- Use `ical-generator` to build the feed.
- For assignments: `VEVENT` with `DTSTART = due_at - 1h`, `DTEND = due_at`.
  Title: `[STA 240] HW5`. Description: notes + app link.
- For applications: `VEVENT` only if `next_action_at` is set.
- Set `X-WR-CALNAME` so Apple Calendar shows a nice name.
- Include `METHOD:PUBLISH` and reasonable `REFRESH-INTERVAL`.
- Respond with `Content-Type: text/calendar; charset=utf-8`.

### Gotcha: update latency
Apple Calendar polls subscribed feeds on a schedule the OS controls —
usually every 15min to a few hours. Don't expect instant updates. This is
acceptable for deadlines; email handles the time-sensitive notifications.

### Rotating the token
Settings page should have a "regenerate calendar link" button that
generates a new `ics_token` and invalidates the old one. Useful if I
accidentally share the URL.

---

## 9. PWA

- `public/manifest.json` with `display: standalone`, `start_url: /`.
- 192×192 and 512×512 icons.
- No service worker needed for v1 — Apple's iOS PWA support is still flaky
  and I don't need offline. Add later if I want push notifications.
- Theme color matches app (`#6366f1` or whatever I pick).

---

## 10. Build order

### Week 1 — ship something usable by day 4

**Day 1 — setup**
- [ ] `npx create-next-app@latest deadline-tracker --ts --tailwind --app`
- [ ] Supabase project, run `0001_init.sql`
- [ ] Install: `@supabase/ssr`, `chrono-node`, `date-fns`, `date-fns-tz`,
      `@upstash/qstash`, `resend`, `ical-generator`
- [ ] shadcn: `npx shadcn-ui@latest init`
- [ ] Enable Email provider in Supabase Auth (on by default) and set Site URL
- [ ] `/login` page with magic-link form, protected `(app)` route group
- [ ] Deploy to Vercel with env vars

**Day 2 — entry + list**
- [ ] Port `lib/parser/` from `/home/claude/parser.ts`, apply §5 fixes
- [ ] `/api/parse` route (POST `{ input, referenceDate }`)
- [ ] `QuickAdd` component — debounced live preview of parse result
- [ ] `/api/assignments` POST (accepts parsed result, validates, inserts)
- [ ] `/assignments` list view sorted by `due_at asc`, open items first
- [ ] Mark-done with optimistic update

**Day 3 — courses + polish**
- [ ] Courses CRUD (can be a settings page, no full UI needed)
- [ ] Course autocomplete in QuickAdd (match parsed code → course record,
      create new if unknown)
- [ ] Color coding by course on cards
- [ ] Mobile responsive pass
- [ ] PWA manifest + icons

**Day 4 — STOP. USE IT.**
- [ ] Enter every real assignment I have.
- [ ] Enter every active internship application.
- [ ] Use it for 48h before writing any more code.
- [ ] Keep a `friction.md` file of every annoyance.

**Days 5–7 — reminders**
- [ ] Sign up for Resend, verify sending domain
- [ ] Sign up for QStash
- [ ] `lib/reminders.ts` — schedule/cancel logic
- [ ] `/api/webhooks/reminder` — receives QStash callback, sends email
- [ ] Integrate: assignment create/update triggers reschedule
- [ ] Vercel Cron config for `/api/cron/daily`
- [ ] Test by scheduling a reminder 2 minutes out

### Week 2

**Days 8–9 — applications**
- [ ] `/applications` CRUD
- [ ] Stage pipeline UI (kanban or grouped list, pick whichever feels
      faster to build)
- [ ] `next_action_at` triggers reminders via same infra

**Day 10 — calendar feed**
- [ ] `ics_token` column on `user_prefs`, generate on first request
- [ ] `/api/ics/[token]/route.ts`
- [ ] Subscribe in Apple Calendar, verify events show up

**Day 11 — dashboard**
- [ ] `/` page: "what should I do right now?"
- [ ] Sort by a score combining urgency (time to due) and effort
      (estimated_hours). Keep the formula simple — I can tune it later.
- [ ] Overdue items in red at the top
- [ ] Today's items next
- [ ] This week's items collapsed

**Days 12–14 — whatever `friction.md` says**
- [ ] Burn down the annoyances. Resist adding new features.

---

## 11. Commands

```bash
# Dev
npm run dev

# Supabase migrations (use Supabase CLI or paste SQL in dashboard)
supabase db push

# Parser tests
npx tsx lib/parser/parser.test.ts

# Deploy
git push   # Vercel auto-deploys main

# Check QStash queue
# (use the Upstash console — no CLI needed for personal scale)
```

---

## 12. Environment variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=             # server-only, for cron job

# Resend
RESEND_API_KEY=
FROM_EMAIL=reminders@<verified-domain>

# QStash
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# Cron auth
CRON_SECRET=                           # random 32+ chars

# App
NEXT_PUBLIC_APP_URL=https://<my-domain>.vercel.app
```

Never commit `.env.local`. Vercel project settings store production values.

---

## 13. Security notes

- **RLS is the primary defense.** API routes use the user's session, not
  the service role key, except for the cron job.
- **Cron endpoint auth:** verify `Authorization: Bearer $CRON_SECRET`.
- **QStash webhook auth:** verify signature with `@upstash/qstash` Receiver.
- **`.ics` token:** 32+ random chars, stored in `user_prefs`, rotatable.
- **Never log raw parse inputs in production** — could contain sensitive
  interview notes. Log only parsed fields minus `notes`.

---

## 14. Open decisions / to revisit

- **Dark mode?** Defer. Not a priority. shadcn supports it if I want to
  add later.
- **Custom SMTP for auth email.** Supabase's built-in sender is rate-limited
  (~3/hr) and marked "not for production." Fine for personal use, but if I
  hit the limit, point Supabase Auth at Resend (same account I already use
  for reminder emails).
- **Recurring assignments.** Weekly problem sets, standing meetings. Skip
  for v1 — most things are one-off. Revisit in week 3 if I find myself
  re-entering the same thing.
- **Time estimates → learning curve.** Log `estimated_hours` vs
  `actual_hours`. Not in v1; add when I have 2+ weeks of data.
- **Telegram bot for entry.** Strongly tempting. Defer until web app
  is solid — one surface at a time.
- **Push notifications.** Requires a service worker and VAPID keys.
  Revisit when iOS PWA push support is less janky.

---

## 15. What to update in this file

Update CLAUDE.md whenever:
- A dependency changes (version, or swap out a service)
- A schema column is added/removed
- A new gotcha is found (especially timezone ones — §5 is the long memory)
- A decision in §14 gets resolved
- The build plan in §10 falls out of sync with reality

If a session ever diverges from this file, the file is canonical. Update
the file first, then write the code.
