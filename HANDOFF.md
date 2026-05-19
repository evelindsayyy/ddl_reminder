# Handoff — Deadline Tracker UI implementation

This document is the brief for implementing the chosen wireframe variants
into the Next.js codebase. **Read `CLAUDE.md` first** — it is the source
of truth for stack, schema, and conventions. This file only covers the
UI layer being built.

The visual reference is `index.html` (open it locally) plus the
`wireframes-*.jsx` files in the same folder as this doc — those are the
exact layouts being implemented.

---

## Scope

| Screen        | Variant(s)                          | Wireframe component(s) in `wireframes-*.jsx` |
|---------------|-------------------------------------|----------------------------------------------|
| Dashboard     | C — Today / This week / Later       | `DashC` in `wireframes-dashboard.jsx`        |
| Assignments   | A (grouped by course) **+** D (calendar) — toggle between them | `AssignA`, `AssignD` in `wireframes-assignments.jsx` |
| Applications  | A (kanban) **+** B (timeline) **+** D (funnel) — toggle between them | `AppsA`, `AppsB`, `AppsD` in `wireframes-other.jsx` |
| Mobile        | All three frames                    | `MobileDash`, `MobileAdd`, `MobileList` in `wireframes-other.jsx` |

The wireframes are sketchy and monochrome — that's the **layout**, not the
final look. See `DESIGN_TOKENS.md` for the production type/color/spacing
system to apply.

---

## Files to touch

### New
- `components/dashboard/DashboardBuckets.tsx` — main bucketed view
- `components/dashboard/BucketColumn.tsx` — single bucket column
- `components/dashboard/AssignmentCard.tsx` — card used inside buckets and lists
- `components/assignments/AssignmentsView.tsx` — wraps the list/calendar toggle
- `components/assignments/GroupedByCourseList.tsx` — variant A
- `components/assignments/CalendarMonthView.tsx` — variant D
- `components/applications/ApplicationsView.tsx` — wraps the kanban/timeline/funnel toggle
- `components/applications/PipelineKanban.tsx` — variant A
- `components/applications/PipelineTimeline.tsx` — variant B
- `components/applications/PipelineFunnel.tsx` — variant D
- `components/applications/ApplicationCard.tsx` — card used inside kanban + timeline
- `components/ui/CourseChip.tsx` — reusable chip (per `lib/colors.ts`)
- `components/ui/TypePill.tsx` — reusable type badge
- `components/ui/RelativeTime.tsx` — "in 2 days" / "5 hrs ago" helper
- `lib/bucket.ts` — pure function: assignments[] → { today, thisWeek, later, overdue }
- `lib/score.ts` — urgency score (used to order within a bucket)

### Replace / wire up
- `app/(app)/page.tsx` — replace stub with `<DashboardBuckets/>` fed by Supabase query
- `app/(app)/assignments/page.tsx` — render `<AssignmentsView/>` with view-mode in URL search param (`?view=list|calendar`)
- `app/(app)/applications/page.tsx` — render `<ApplicationsView/>` with view-mode in URL search param (`?view=kanban|timeline|funnel`)
- `app/(app)/layout.tsx` — ensure top nav matches the wireframe (4 items: dashboard, assignments, applications, settings) and shows the email
- `components/AssignmentsList.tsx` — keep existing logic but refactor it to use the new `<AssignmentCard/>` so the dashboard and the list view stay visually consistent

### Don't touch
- `lib/parser/**` — parser is final and tested
- `app/api/**` — API contract is stable
- `supabase/migrations/**` — schema changes are out of scope
- `components/QuickAdd.tsx` — only restyle (don't rewrite logic) and only if needed to match `<TypePill/>` and chip styling
- `lib/reminders.ts`, `lib/email.ts`, `lib/ics.ts` — all out of scope
- Auth flow, magic link, RLS policies — out of scope

---

## Read first

In this order:

1. `CLAUDE.md` — stack, schema, timezone rules, build order, gotchas
2. `lib/schemas.ts` — Zod types you'll consume
3. `lib/colors.ts` — course color palette (don't invent new colors)
4. `lib/format.ts` — `formatDueAt`, `formatRelative` already exist; reuse them
5. `components/AssignmentsList.tsx` — current optimistic-update pattern; copy this approach for new mark-done UI
6. `components/QuickAdd.tsx` — debounced parse pattern to mirror for any new inline editors
7. `tailwind.config.ts` — know the theme tokens before adding utilities
8. `app/(app)/layout.tsx` — current nav shell
9. `index.html` (open in a browser) — see the target layouts
10. `DESIGN_TOKENS.md` — apply this throughout

---

## Behavior — Dashboard (Variant C)

Three columns: **today**, **this week**, **later**, plus an **overdue** banner above the columns when applicable.

- Bucket logic in `lib/bucket.ts`:
  - `overdue`: `due_at < now() AND completed_at IS NULL`
  - `today`: same calendar day as `now` in user's timezone
  - `thisWeek`: within next 7 calendar days, excluding today
  - `later`: > 7 days out
- Each card shows: course chip, type pill, title, `due_at` formatted, relative time. If `due_at` is within 12h, paint `due_at` text in the urgency red.
- Within each bucket, sort by `due_at asc`, then `estimated_hours desc` (heaviest items surface first within a day).
- Mark-done: optimistic toggle, same pattern as `AssignmentsList.tsx`. On done, the card animates out (fade + collapse) over ~200ms.
- Greeting line at top: `"hey Grace — {weekday} {Mon} {d}"` formatted in user's timezone.
- Empty bucket: render a faint dash or "nothing here" — do not omit the column.
- Loading: show 3 skeleton cards per column.
- The dashboard is a **server component** that runs the Supabase query; the bucket columns are client components for the optimistic toggle.

---

## Behavior — Assignments (Variants A + D, toggle)

Toggle in the page header: `[ list ] [ calendar ]` segmented control. Persist choice in URL search param `?view=list|calendar` so refreshes preserve it.

**Variant A — grouped by course (default):**
- Group `assignments` by `course_id`, ordered by course code asc.
- Each group has a header row: `<CourseChip size="lg" />` + open count + a divider line that fills remaining width.
- Items within a group are sorted by `due_at asc` (open) then completed at the bottom of the group, faded.
- Filter chips at top right: `all · open · done` — also URL-driven (`?filter=open`).
- Row layout: checkbox · title · type pill · due-date right-aligned (urgent in red).
- Empty state per course: "no open items" in faint italic.

**Variant D — calendar month grid:**
- 7-column grid, weeks as rows. Show 4–6 weeks at once depending on month.
- Each cell: day number top-left, then up to 3 assignment chips below; show "+N more" if overflow.
- Chip = course-color left border + faded course-color background + assignment title (truncate with ellipsis).
- Today's cell has a soft red tint background.
- Header: month/year + prev/today/next controls.
- Click a day → opens a small popover listing all assignments for that day.
- Click an assignment chip → opens edit drawer (reuse existing edit UX from `AssignmentsList.tsx`).

---

## Behavior — Applications (Variants A + B + D, toggle)

Toggle in the page header: `[ kanban ] [ timeline ] [ funnel ]`. Persist in `?view=kanban|timeline|funnel`.

**Variant A — kanban by stage:**
- 4 columns: `applied`, `interview`, `offer`, `rejected`. Use stage enum from schema; render `rejected` last and slightly faded.
- Each card: company (large), role (mono caption), and a "next" sub-block when `next_action_at` is set.
- "Next" sub-block formatting: light divider, label "next:", then the date in `formatDueAt`, with relative time below — red when < 48h.
- Drag a card between columns to change stage (use `react-dnd` or the same pattern shadcn uses; if introducing a dep, prefer `@dnd-kit/core` — it's lighter). On drop, optimistic update + PATCH `/api/applications/[id]`.

**Variant B — timeline by next action:**
- Vertical timeline, ordered by `next_action_at` asc; only includes applications with a `next_action_at`.
- Left rail: date + relative time (red dot for the soonest item).
- Right side: card with company, role, stage badge, next-action description.
- Items past their `next_action_at` get a "missed" pill.

**Variant D — funnel + insights:**
- Top: bar chart of counts per stage. Each bar is the stage color, with the count above.
- Below, three insight cards in a row:
  - **This week** — list of next actions due in the next 7 days.
  - **Response rate** — `(interview + offer) / (applied + interview + offer + rejected)`.
  - **Decision due** — soonest `offer` `next_action_at`.

Stage colors (in `DESIGN_TOKENS.md`):
- `applied` — neutral grey
- `interview` — blue
- `offer` — green
- `rejected` — faded grey

---

## Behavior — Mobile (PWA)

The site is responsive — these aren't separate routes, they're the same pages collapsing under `md:` breakpoint. Three frames in the wireframe map to three responsive states:

- **MobileDash** → dashboard at `< md`. Single column, "right now" hero on top, then a flat list of "this week" items. Bottom sticky nav (4 tabs). Sticky `+ add` bar above the nav.
- **MobileAdd** → quick-add full-screen sheet. Triggered by the sticky `+ add`. Reuses `<QuickAdd/>` logic; presentation is a full-screen modal with cancel/save buttons in the top bar.
- **MobileList** → assignments list at `< md`. Each row has a 4-px course-color left border + tighter spacing.

Bottom nav is mobile-only (`md:hidden`); the top nav stays for desktop (`hidden md:flex`).

44-px minimum hit targets everywhere.

---

## Components — APIs

```ts
// CourseChip.tsx
type CourseChipProps = {
  code: string;
  color: string;          // hex from lib/colors.ts
  size?: 'sm' | 'md' | 'lg';
};

// TypePill.tsx
type TypePillProps = {
  type: AssignmentType;   // from lib/schemas.ts
};

// AssignmentCard.tsx
type AssignmentCardProps = {
  assignment: AssignmentRow;
  timezone: string;
  density?: 'compact' | 'comfortable';
  onToggleDone: (id: string, completedAt: string | null) => void;
  onEdit?: (a: AssignmentRow) => void;
};

// ApplicationCard.tsx
type ApplicationCardProps = {
  application: ApplicationRow;
  timezone: string;
  variant: 'kanban' | 'timeline';
};

// RelativeTime.tsx
type RelativeTimeProps = {
  date: string;           // ISO
  now?: Date;             // for tests; default = new Date()
  className?: string;
};
```

---

## Acceptance criteria

- [ ] Dashboard renders real Supabase data with overdue, today, this week, later buckets correct in the user's timezone
- [ ] Mark-done toggles optimistically and rolls back on error (test by killing network in devtools)
- [ ] Assignments page toggle persists across refresh via URL param
- [ ] Calendar month view correctly handles month boundaries (a Sunday-start grid that includes trailing days from prev/next month, faded)
- [ ] Applications kanban supports drag-to-reorder-stage with optimistic update
- [ ] Applications timeline correctly orders by `next_action_at` and tints overdue items
- [ ] Applications funnel computes response rate from real data, not a constant
- [ ] At `< md` viewport, top nav is hidden, bottom nav is shown, dashboard collapses to one column
- [ ] All hit targets ≥ 44px on mobile
- [ ] No `.toLocaleString()` calls without an explicit `timeZone` option (per CLAUDE.md §5)
- [ ] No new colors invented — every course color is sourced from `lib/colors.ts`
- [ ] All new components have empty states and loading skeletons
- [ ] `npm run build` passes; no new TS errors; no new lint errors

---

## Non-goals (don't do this)

- Adding recurring assignments
- Building reminders/email/QStash plumbing — already done; don't touch
- Changing the parser or `/api/parse` route
- Changing the schema
- Adding a service worker or push notifications
- Adding dark mode (open decision in CLAUDE.md §14)
- Two-way Google Calendar sync
- Any LLM-powered features

---

## Suggested order

1. Build the shared primitives first (`CourseChip`, `TypePill`, `RelativeTime`, `AssignmentCard`, `ApplicationCard`) — these unblock everything.
2. Dashboard variant C — the highest-value screen.
3. Assignments variant A — refactor existing list to use the new card.
4. Assignments variant D — calendar.
5. Applications kanban (variant A).
6. Applications timeline (variant B).
7. Applications funnel (variant D).
8. Mobile responsive pass — verify each screen at 360×720.
9. Settings page polish if time allows.
