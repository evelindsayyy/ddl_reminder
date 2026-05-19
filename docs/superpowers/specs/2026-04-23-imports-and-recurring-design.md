# Design: Canvas/Gradescope imports + recurring assignments

**Status:** approved for planning
**Date:** 2026-04-23
**Scope:** extends DDLReminder beyond the CLAUDE.md spec with three related features
**Related:** [CLAUDE.md](../../../CLAUDE.md) — canonical project spec; this doc adds to it

## 1. Motivation

Manually typing every assignment is friction the user doesn't want to sustain. Two sources of friction:

- **LMS assignments are already tracked elsewhere.** Duke uses Canvas and Gradescope. Re-entering deadlines from both is wasted effort and error-prone.
- **Weekly/recurring assignments repeat mechanically.** Example: "COMPSCI 372 homework every Tuesday 11:59pm" — 14 near-identical entries per semester.

CLAUDE.md §14 explicitly flags recurring as "revisit in week 3 if I find myself re-entering the same thing." The user hit that trigger before even completing the 48-hour use-it period. LMS imports were not in the original spec at all; this doc adds them as a scoped extension.

## 2. Goals and non-goals

### Goals

- Pull Canvas assignments via each user's Canvas `.ics` calendar feed URL, daily.
- Pull Gradescope assignments via a user-installed bookmarklet that scrapes visible course-page assignments and POSTs to an authed sync endpoint.
- Support recurring assignments with a fixed pattern set: weekly or biweekly, on any subset of weekdays (typical use: 1–3 days, e.g. MWF, TuTh).
- Edit or delete recurring assignments one-at-a-time OR across all upcoming occurrences in the series.
- Add `semester_end_date` to user prefs as the default series-end date.
- Preserve user's local edits where it's safe to do so (e.g., `completed_at`, `notes`).

### Non-goals

- No Canvas OAuth or API-token flow. ICS-only, same rationale as CLAUDE.md §1 rejecting Google Calendar sync.
- No Gradescope password storage. SSO-only authentication at Duke rules it out.
- No grades, submissions, or assignment bodies imported — just `title`, `due_at`, course, and link-back URL.
- No cross-platform deduplication. If the same thing appears in Canvas *and* Gradescope, both show until the user deletes one.
- No monthly recurrence, no "except spring break" / holiday exceptions, no arbitrary RRULEs. Fixed pattern set only.
- No "walk all Gradescope courses with one click." Per-course-page click model.
- No two-way sync. Canvas/Gradescope are sources of truth for their own data; we do not push changes back.

## 3. Recurring assignments

### 3.1 Supported patterns

| Pattern | Natural-language input accepted | Internal representation |
|---|---|---|
| Weekly, one day | `every Tuesday`, `weekly on Tue` | `interval: 1, byweekday: [TU]` |
| Biweekly, one day | `every other Tuesday`, `biweekly Tue` | `interval: 2, byweekday: [TU]` |
| Twice per week | `every TuTh`, `every Tue and Thu` | `interval: 1, byweekday: [TU, TH]` |
| Three times per week | `every MWF`, `every Mon Wed Fri` | `interval: 1, byweekday: [MO, WE, FR]` |

Weekday tokens accepted: `M, T, W, Th, F, Sa, Su` and their full-word equivalents (`Mon`, `Monday`, etc.). Order-insensitive. Case-insensitive.

### 3.2 Two input paths

1. **Natural language in QuickAdd.** The parser (lib/parser/index.ts) learns the patterns above. When a recurrence phrase is detected, the parse result includes a new `recurrence` field; the preview card shows the resolved series summary, e.g. `🔁 every Tuesday · 12 occurrences through 2026-07-14`.

2. **Structured escape hatch.** A `🔁 Recurring` toggle on the QuickAdd preview panel exposes a small form: day-of-week checkboxes (M/T/W/Th/F/Sa/Su), interval (1 or 2 weeks), and an "until" date picker. Used when the natural-language detector misses or when the user wants to adjust what was detected.

### 3.3 "Until" default

Order of precedence when determining the end date of a new series:

1. Explicit `until DATE` in the input or in the structured form.
2. `user_prefs.semester_end_date` if set.
3. Fallback: first occurrence + 15 weeks.

### 3.4 Save behavior

- On save, the backend **expands the pattern into N concrete assignment rows**, each with its own `due_at`. All rows share a generated `recurrence_group_id uuid`.
- Expansion runs server-side inside `POST /api/assignments` so the client cannot produce inconsistent sibling rows.
- Rows created by expansion are identical in shape to manual rows. All existing infrastructure (list view, mark-done, future QStash reminders) applies without modification.
- If expansion yields zero rows (e.g., the "until" date is before today), the request is rejected with HTTP 400 `{ error: 'recurrence_produces_no_rows' }`.

### 3.5 Series actions

Recurring cards display a small `🔁` badge with a tooltip (`every Tuesday · 3 more in this series`). A `⋯` menu on each card offers, in addition to the single-row defaults:

| Action | Effect |
|---|---|
| Edit this only (default) | Patches only the clicked row. Native behavior. |
| Edit this and all upcoming | Patches all rows in the same `recurrence_group_id` with `due_at >= this row's due_at`. |
| Delete this only (default) | Deletes only the clicked row. |
| Delete rest of series | Deletes all rows in the same `recurrence_group_id` with `due_at > now()`. |

API mechanism: `PATCH /api/assignments/[id]?scope=one|series` and `DELETE /api/assignments/[id]?scope=one|series`. Default scope is `one`; `series` triggers the group-wide operation.

### 3.6 Independent edits and additions

- Editing a single row within a series never affects siblings unless the user explicitly chooses "Edit this and all upcoming."
- Adding a non-recurring assignment via QuickAdd creates a plain row with no `recurrence_group_id`. This path is unaffected by the series logic.

## 4. Canvas import (`.ics` feed)

### 4.1 User setup flow

1. User logs into Canvas (Duke's is `canvas.duke.edu`).
2. Sidebar → **Calendar** → **Calendar Feed** button (bottom-right of the calendar view).
3. Copy the URL (format: `https://canvas.duke.edu/feeds/calendars/user_<token>.ics`).
4. Paste into **Settings → Integrations → Canvas** and save.

### 4.2 Sync behavior

- **Cadence:** fetched once per day by the shared `/api/cron/daily` route (also used by the Day 5 reminder sweeper per CLAUDE.md §6). Phase 3 adds a "Sync now" button in Settings so the user can trigger it on demand before the cron is wired.
- **Fetch:** `GET <canvas_ics_url>` with a 30-second timeout and a `User-Agent: DDLReminder-Canvas-Sync`. Non-2xx responses are logged (without the URL body, per CLAUDE.md §13) and skipped for that user.
- **Parse:** iterate `VEVENT` entries. Extract:
  - `UID` → `external_id`
  - `DTSTART` (timestamp) → `due_at`
  - `SUMMARY` → title (strip leading `[COURSE CODE]` if present, use it as course code)
  - `URL` → `external_url`
  - `CATEGORIES` → fallback course code if the title has none
- **Upsert:** unique key `(user_id, 'canvas', external_id)`. For existing rows:
  - **Always overwrite:** `title`, `due_at`, `external_url`.
  - **Always preserve:** `completed_at`, `notes`, `estimated_hours`, `actual_hours` — user's own annotations.
  - A small "🔗 Canvas" badge renders on synced cards so the overwrite behavior is visible.
- **Deletion:** if a previously-seen `external_id` is missing from the current feed fetch, **do nothing** — the row stays as last seen. The user can manually delete if Canvas genuinely removed the event. Rationale: avoids a conflict-policy tangle with user-owned fields, and Canvas sometimes hiccups. Known limitation: stale Canvas rows accumulate if instructors frequently remove events; a manual "Clean up stale Canvas imports" action is a v2 candidate (§9).

### 4.3 Conflict policy

- On upsert: Canvas fields (`title`, `due_at`, `external_url`) always win. User's local edits to those fields are overwritten. The UI notes this on the Canvas settings row.
- `completed_at`, `notes`, `estimated_hours`, `actual_hours` are user-owned — never touched by sync.
- Rationale: the simpler the rule, the fewer surprises. "Pin to prevent Canvas overwrites" is a possible v2 feature noted in §9.

## 5. Gradescope bookmarklet

### 5.1 User setup flow

1. Settings → Integrations → Gradescope → click **Generate sync bookmarklet**.
2. The UI shows a draggable `Sync to ddl` link. User drags it to their browser bookmarks bar.
3. User visits any Gradescope course assignments page (`https://www.gradescope.com/courses/<id>/assignments`) and clicks the bookmarklet.
4. The bookmarklet scrapes the visible assignments table and POSTs to `https://<our-app>/api/sync/gradescope` with an embedded sync token.
5. A small in-page toast (injected by the bookmarklet) confirms `Synced 7 assignments to ddl.` or surfaces the error.

### 5.2 Auth model

- A **sync token** (64-char random hex, stored in `user_prefs.gradescope_sync_token`) is generated on first click of **Generate sync bookmarklet**.
- Token is **sync-only**: it authorizes exactly one endpoint (`POST /api/sync/gradescope`) and no other. It grants no ability to read or delete user data.
- Rotation: a **Regenerate bookmarklet** button creates a new token, invalidating the old bookmarklet.
- Security trade-offs accepted (see §9).

### 5.3 Scraping scope

- The bookmarklet only sees the assignments visible on the current page (the course assignments table). Users with 4 Gradescope courses click 4 times per sync session.
- Extracted per assignment:
  - Gradescope assignment ID → `external_id` (format `gs:<course_id>:<assignment_id>`)
  - Title → `title`
  - Due date → `due_at` (in ISO 8601, converted using user's timezone if page shows only local)
  - Assignment URL → `external_url`
  - Course name from the course header → used to find-or-create the `courses` row via the existing find-or-create path
- Submission status is NOT imported (out of scope).

### 5.4 Endpoint

`POST /api/sync/gradescope`

**Request:**
```json
{
  "token": "<64-char hex>",
  "courseName": "COMPSCI 372",
  "assignments": [
    {
      "externalId": "gs:12345:67890",
      "title": "Homework 5",
      "dueAt": "2026-04-28T03:59:00.000Z",
      "externalUrl": "https://www.gradescope.com/courses/12345/assignments/67890"
    }
  ]
}
```

**Response:** `{ synced: <count>, updated: <count>, created: <count> }` or `{ error: ... }`.

**Behavior:**
- Resolve token → `user_id`. 401 on bad token.
- For each incoming assignment: upsert on `(user_id, 'gradescope', external_id)`. Overwrite `title`, `due_at`, `external_url`. Preserve `completed_at`, `notes`, `estimated_hours`, `actual_hours`.
- Course find-or-create uses the existing logic in `lib/colors.ts` + inline helper.
- **CORS:** response includes `Access-Control-Allow-Origin: https://www.gradescope.com`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`. An `OPTIONS` preflight handler returns the same.

### 5.5 Brittleness

Gradescope's HTML structure is not a stable contract. When selectors break, the bookmarklet surfaces a `Sync failed: could not find assignments table` toast to the user. Fix path: update selectors in the server-side bookmarklet template (see §6.2), bump a `version` embedded in the bookmarklet source, user clicks **Regenerate bookmarklet**.

## 6. Data model

### 6.1 Schema migration (`supabase/migrations/0002_integrations.sql`)

```sql
-- Source tracking for external imports
alter table public.assignments
  add column source text not null default 'manual'
    check (source in ('manual','canvas','gradescope')),
  add column external_id text,
  add column external_url text,
  add column recurrence_group_id uuid;

create unique index assignments_source_external_idx
  on public.assignments (user_id, source, external_id)
  where external_id is not null;

create index assignments_recurrence_group_idx
  on public.assignments (recurrence_group_id)
  where recurrence_group_id is not null;

-- Settings additions
alter table public.user_prefs
  add column semester_end_date date,
  add column canvas_ics_url text,
  add column gradescope_sync_token text unique;
```

All columns are nullable or defaulted. **Applying this migration does not modify any existing row.**

### 6.2 New server-side modules

| Module | Responsibility |
|---|---|
| `lib/recurrence.ts` | Detect recurrence in a parsed string; expand `{interval, byweekday, time, until}` + first occurrence into concrete dates. |
| `lib/canvas.ts` | Fetch + parse a Canvas `.ics` feed into `{externalId, title, dueAt, externalUrl, courseCode}[]`. |
| `lib/gradescope.ts` (optional) | Helpers shared between the bookmarklet template and the server validator. The bookmarklet source itself lives in `app/api/bookmarklet/route.ts` as a templated response. |
| `app/api/sync/gradescope/route.ts` | The authed sync endpoint + `OPTIONS` preflight. |
| `app/api/bookmarklet/route.ts` | Returns the bookmarklet JS as text; UI embeds its content into a `javascript:` URL after substituting the user's token. |

### 6.3 Modifications to existing code

- `lib/parser/index.ts` — return an optional `recurrence` object when a pattern is detected.
- `lib/schemas.ts` — extend `createAssignmentSchema` to accept an optional `recurrence` payload; add schemas for `/api/sync/gradescope` and settings updates.
- `app/api/assignments/route.ts` — POST path now branches: plain insert vs expansion-and-bulk-insert.
- `app/api/assignments/[id]/route.ts` — PATCH/DELETE accept `?scope=one|series`.
- `components/AssignmentsList.tsx` — `🔁` badge + `⋯` series menu.
- `app/(app)/settings/page.tsx` — three new settings: `semester_end_date`, `canvas_ics_url`, Gradescope bookmarklet generator.

## 7. Implementation order

| Phase | Deliverable | Rough effort | Depends on |
|---|---|---|---|
| 1 | Migration `0002_integrations.sql` applied. Settings gains `semester_end_date` input. | ~30 min | — |
| 2 | Recurring: parser extension, expansion in POST, `?scope=` on PATCH/DELETE, `🔁` UI + series menu. | ~6 h | Phase 1 |
| 3 | Canvas: Settings URL input, `lib/canvas.ts`, `/api/cron/daily` Canvas pass, "Sync now" button. | ~4 h | Phase 1 |
| 4 | Gradescope: Settings token UI, `POST /api/sync/gradescope` + OPTIONS, bookmarklet template. | ~4 h | Phase 1 |

Total: ~14.5 hours. Phases can ship independently.

## 8. Security notes

Additions to the list in CLAUDE.md §13:

- **`canvas_ics_url` contains a user-bound secret.** Treat as sensitive; do not log its contents in non-debug paths.
- **`gradescope_sync_token` is a bearer credential** for the sync endpoint. Stored in plaintext in DB (like session cookies, it's what it authorizes), rotatable. Rate-limit the sync endpoint (simple per-token counter; TBD whether in v1).
- **Bookmarklet source** must not leak other users' tokens. The `/api/bookmarklet` route only emits the caller's own token.
- **Gradescope sync endpoint** uses explicit CORS (`https://www.gradescope.com` only); it does not rely on cookie auth.

## 9. Open questions noted but deferred

- **Canvas "pin" / "lock" field** to exempt specific rows from the Canvas-wins conflict policy. Not in v1; revisit if the user actually encounters a case where they want to override.
- **Clean up stale Canvas imports.** A Settings action "Show Canvas rows last seen >30 days ago" with bulk-delete. Cheap; add when the first stale row surfaces.
- **Bookmarklet auto-walk-all-courses** (click once, syncs every Gradescope course). v2 if per-page clicks get old.
- **Cross-platform dedup** heuristics. v2 if duplicates become annoying.
- **RRULE support** for non-fixed patterns (monthly, "weekly except spring break"). v2 only if needed.
- **Rate-limiting `/api/sync/gradescope`** — decide in implementation whether a per-token counter is necessary in v1 (probably yes, cheap).
- **Import-time course-code parsing.** Canvas titles like `[STA 240] HW5` need to be split so the course pill matches. If the VEVENT lacks a code, the assignment lands with `course_id = null`. Decide during Phase 3 whether to fall back to a separate `Uncategorized` course bucket in the UI.

## 10. Success criteria

The feature set is considered done when:

1. The user can paste their Canvas `.ics` URL into Settings, click "Sync now," and see Canvas assignments appear in the Assignments list with a `🔗 Canvas` badge and correct timezone-aware due dates.
2. The user can generate a Gradescope bookmarklet, drag it to their browser, click it on any Gradescope course assignments page, and see those assignments appear with a `🔗 Gradescope` badge.
3. The user can type `COMPSCI 372 homework every Tuesday 11:59pm` and save, producing ~14 linked assignments (to `semester_end_date`). Deleting one from the list removes only that row. Choosing "Delete rest of series" removes the remaining future occurrences. Choosing "Edit this and all upcoming" changes the selected row and all later siblings.
4. No existing data is lost or modified by applying `0002_integrations.sql` to a DB that already has manual assignments from earlier sessions.
5. Gradescope HTML selector changes fail loudly (user-visible toast) rather than silently syncing empty.
