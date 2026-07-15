# UI Readability & Navigation Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Bigger, readable type everywhere; obvious wayfinding (active nav state); the dashboard becomes a guided home with an add-deadline panel; a new quick/detailed add toggle (labeled fields + date picker) sharing the quick add's save path; the assignments toolbar consolidated.

**Architecture:** Token-level type bump (root `font-size` + sweep of px-bracket sizes onto rem classes) so every page inherits; a client `NavLinks` component reusing `MobileBottomNav`'s `isActive` semantics; the file-private `SegmentedControl` in `AssignmentsView` extracted to `components/ui/` and reused for the new `AddDeadline` tabs; a pure `lib/assignmentDraft.ts` helper assembles the detailed form's payload (tsx-tested) so the form posts the exact same body QuickAdd does.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v3 tokens, vitest (+ jsdom) & tsx chain.

**Spec:** `docs/superpowers/specs/2026-07-15-ui-readability-navigation-design.md`
**Scout report (file:line facts, verbatim excerpts):** `.superpowers/sdd/ui-patterns.md` — each task cites its sections.

## Global Constraints

- Design tokens only (ink/ink-soft/ink-faint/bg/urgent/success/info/warn); the hand-drawn identity (Patrick Hand / Caveat / JetBrains Mono) is kept. Patrick Hand loads at weight 400 only — do not rely on `font-bold` on the body face.
- No schema, API, parser, or database changes. The detailed form posts the **exact payload QuickAdd posts today**: `{courseCode, title, type, dueAt, tags?, notes?, estimatedHours?, recurrence?}` to `POST /api/assignments` (course find-or-create already happens server-side).
- Type floors after this work: no `text-[10px]`/`text-[11px]` anywhere in `app/` or `components/`; smallest text is `text-xs` (rem-based, ≈13.5px at the new root).
- Touch targets ≥44px, every input labeled (repo a11y idiom: visible `<label>` where the surface shows field names, `aria-label` elsewhere).
- Applications page + Settings receive NO changes beyond inheriting the type scale. MobileAddBar / MobileBottomNav untouched apart from inherited type scale.
- Gates for every task: `npx tsc --noEmit` clean · `npm run test:all` green (tsx chain + vitest).
- `.superpowers/` and `.env.local` never committed.

---

### Task 1: Global type scale + small-text sweep

**Files:**
- Modify: `app/globals.css` (root font-size block, scout §1)
- Modify: sweep across `app/` + `components/` per scout §2 inventory
- Modify: `app/(app)/layout.tsx` (nav link + email sizes)
- Modify: `DESIGN_TOKENS.md` ("Type" section)

**Steps:**
- [ ] `app/globals.css`: root `html { font-size: 16.5px }` → `18px`; the mobile media-query value `15.5px` → `16.5px`. If body line-height is below 1.55 for the sans face, raise to 1.6 (handwritten faces need air).
- [ ] Sweep every `text-[10px]` and `text-[11px]` occurrence in `app/` and `components/` to `text-xs` (scout §2 is the checklist — it is exhaustive for the bracket sizes). These are fixed-px so they silently defeat the root bump; `text-xs` = 0.75rem ≈ 13.5px at the new root, meeting the spec's 13px floor.
- [ ] `app/(app)/layout.tsx`: desktop nav links `text-base` → `text-lg`; the email span moves to `text-xs` (covered by sweep) and gets `text-ink-faint` kept as-is.
- [ ] Page titles: each page's `font-display` h1 gains one desktop step (`text-4xl` → `text-4xl md:text-5xl`; dashboard greeting included). Scout §2/§4 lists them.
- [ ] Verify no `text-[10px]`/`text-[11px]` remain: `grep -rn "text-\[1[01]px\]" app components` → empty.
- [ ] `DESIGN_TOKENS.md` "Type" section updated: root sizes, floor rule ("smallest class is text-xs; bracket px sizes below it are banned").
- [ ] Gates. Dev-boot `/login` and eyeball one authed page for overflow regressions (long course codes, calendar cells).
- [ ] Commit: `feat: raise global type scale and sweep fixed-px small text`

### Task 2: SegmentedControl extraction + active nav state

**Files:**
- Create: `components/ui/SegmentedControl.tsx` (moved from `AssignmentsView.tsx:257-327`, scout §5/§10)
- Create: `components/layout/NavLinks.tsx` (client)
- Modify: `components/assignments/AssignmentsView.tsx` (import the extracted control)
- Modify: `app/(app)/layout.tsx` (use NavLinks)
- Test: `tests/components/segmented-control.test.tsx`, `tests/components/nav-links.test.tsx`

**Interfaces:**
- Produces: `SegmentedControl<T extends string>` — props `{ options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }` (keep the existing roving-tabindex/arrow-key/Home-End behavior verbatim; `label` feeds `aria-label`). Consumed by Task 3 (AddDeadline tabs) and Task 4 (toolbar).
- Produces: `NavLinks` — props `{ items: { href: string; label: string }[] }`; renders the desktop nav links.

**Steps:**
- [ ] Extract the file-private `SegmentedControl` out of `AssignmentsView.tsx` into `components/ui/SegmentedControl.tsx` as a named export, behavior unchanged; `AssignmentsView` imports it. (Do NOT touch `ApplicationsView`'s inline copy — applications page is out of scope; note the dedup as a ledger item.)
- [ ] Vitest test (jsdom): renders all options; ArrowRight/ArrowLeft move focus+selection with wrap; Home/End jump; `role="tablist"`/`aria-selected` correct.
- [ ] `components/layout/NavLinks.tsx` (`'use client'`): `usePathname()` + the `isActive(pathname, href)` semantics copied from `MobileBottomNav` (exact match for `/`, prefix otherwise, scout §3). Active link: `text-ink underline decoration-wavy underline-offset-8` + `aria-current="page"`; inactive: `text-ink-soft hover:text-ink`. Each link `px-2 py-2.5` so the hit area reaches ≥44px without changing the drawn size.
- [ ] `app/(app)/layout.tsx`: replace the inline `NAV.map(...)` desktop links with `<NavLinks items={NAV} />` (layout stays a server component; NAV array unchanged).
- [ ] Vitest test: mock `next/navigation` `usePathname`; on `/assignments`, the assignments link has `aria-current="page"` and the dashboard link does not; on `/`, only dashboard is current.
- [ ] Gates. Commit: `feat: active nav state and shared segmented control`

### Task 3: AddDeadline quick/detailed toggle

**Files:**
- Create: `lib/assignmentDraft.ts` + `lib/assignmentDraft.test.ts` (tsx chain)
- Create: `components/assignments/DetailedAddForm.tsx`
- Create: `components/assignments/AddDeadline.tsx`
- Test: `tests/components/add-deadline.test.tsx`

**Interfaces:**
- Consumes: `SegmentedControl` (Task 2); `QuickAdd` (unchanged, mounted as the quick tab — its current props per scout §5); `datetimeLocalToIso` from `lib/datetimeLocal`; `humanizeError` (`lib/errorCopy`) + `useToast` (`components/ui/Toast`); `createAssignmentSchema` field shapes (scout §7).
- Produces: `AddDeadline` — props `{ courses: { code: string; name: string | null; color: string }[] }` (plus pass-through of whatever props QuickAdd requires today, unchanged). Consumed by Tasks 4 and 5.
- Produces: `buildAssignmentDraft(input): { ok: true; payload: CreateAssignmentPayload } | { ok: false; errors: Record<string, string> }` in `lib/assignmentDraft.ts`, where input is `{ courseCode: string; title: string; type: AssignmentType; date: string; time: string; repeats: 'never' | 'weekly' | 'biweekly'; until?: string; notes?: string; tags?: string[]; estimatedHours?: number | null }`.

**Steps:**
- [ ] tsx test first (`lib/assignmentDraft.test.ts`, mirror `lib/datetimeLocal.test.ts` runner registration): happy path assembles `dueAt` via `datetimeLocalToIso(\`${date}T${time}\`)`; empty title → `errors.title`; missing date or time → `errors.due`; `repeats: 'weekly'` → `recurrence { interval: 1, byweekday: [<weekday of date>] }`; `'biweekly'` → `interval: 2`; `until` passes through as `YYYY-MM-DD`; `'never'` → no `recurrence` key; empty courseCode → `courseCode: null`; output parses under `createAssignmentSchema.safeParse` (round-trip assertion). Register the new suite in the `npm test` chain the same way existing lib tests are.
- [ ] Implement `lib/assignmentDraft.ts` (pure, no imports beyond `lib/datetimeLocal`, `lib/schemas` types). Weekday derivation: `new Date(\`${date}T12:00:00\`).getDay()` (noon avoids DST edges; the value is the local weekday of the picked date — matches the parser's convention per scout §7).
- [ ] `components/assignments/DetailedAddForm.tsx` (`'use client'`): labeled fields per spec — course `<select>` of `courses` + a "new course…" option that swaps in a text input; title; type `<select>` over `ASSIGNMENT_TYPES`; due `<input type="date">` + `<input type="time">`; repeats select (never/weekly/biweekly) with an "until" date input shown when repeating; collapsed "more" `<details>` row → notes textarea, tags input (comma-separated, reuse QuickAdd's tag idiom per scout §5), estimated hours number input. Field/label classes follow the `ApplicationEditForm` idiom (scout §7) at the new type scale (`text-xs` labels, not `text-[10px]`). Submit: `buildAssignmentDraft` → inline field errors on `ok:false`; on `ok:true` `POST /api/assignments` with the payload; `res.ok` → reset + `router.refresh()`; failure or thrown fetch → `toast(humanizeError(...))` per the repo's try/catch/finally idiom. Save button shows pending state.
- [ ] `components/assignments/AddDeadline.tsx` (`'use client'`): card titled "add a deadline"; `SegmentedControl` with tabs `quick line | detailed`; quick renders the existing `QuickAdd` untouched, detailed renders `DetailedAddForm`. Tab persisted under localStorage key `ddl:add-mode` using the safe-read pattern from `lib/theme.ts` (scout §9/§10); default `quick`.
- [ ] Vitest (`tests/components/add-deadline.test.tsx`, scaffold per scout §9: jsdom pragma, `vi.hoisted` next/navigation mock, `vi.stubGlobal('fetch')`, real `ToastProvider`): tab switch swaps panels and writes localStorage; reload-simulated remount honors stored mode; detailed submit with empty title shows inline error and does NOT fetch; valid submit posts to `/api/assignments` with the QuickAdd-shaped payload keys; 500 response → friendly toast text visible.
- [ ] Gates. Commit: `feat: add-deadline panel with quick/detailed toggle`

### Task 4: Assignments page integration + toolbar merge

**Files:**
- Modify: `app/(app)/assignments/page.tsx` (mount AddDeadline instead of bare QuickAdd; courses already fetched, scout §6/§8)
- Modify: `components/assignments/AssignmentsView.tsx` (toolbar row, empty-state copy)

**Interfaces:**
- Consumes: `AddDeadline` (Task 3), `SegmentedControl` (Task 2).

**Steps:**
- [ ] `assignments/page.tsx`: replace the QuickAdd card mount with `<AddDeadline courses={courses} …/>` (same server-fetched courses it already passes, scout §6).
- [ ] `AssignmentsView.tsx`: the controls row at ~:160 loses `justify-between` — view switcher (list/calendar/timeline) and status filter (all/open/done) sit adjacent (`flex flex-wrap items-center gap-3`) in one toolbar directly above the list; status filter still renders only in list view. Segmented buttons pick up the new type scale (both already 44px-safe from W3).
- [ ] Empty-state copy points up: `nothing here yet — add a deadline above`  (it already says this per scout §6 — keep; adjust only if the panel heading changed the reference).
- [ ] Confirm existing `tests/components/quickadd.test.tsx` still passes unmodified (QuickAdd itself is untouched).
- [ ] Gates. Commit: `feat: assignments toolbar merge and add-deadline mount`

### Task 5: Dashboard becomes a home

**Files:**
- Modify: `app/(app)/page.tsx` (courses fetch + AddDeadline mount, scout §4/§8)
- Modify: `components/dashboard/DashboardBuckets.tsx`, `components/dashboard/BucketColumn.tsx` (counters, empty states)

**Interfaces:**
- Consumes: `AddDeadline` (Task 3); `bucketAssignments` from `lib/bucket.ts` (unchanged).

**Steps:**
- [ ] `app/(app)/page.tsx`: add the same courses select the assignments page uses (`courses.select('code,name,color')` scoped to the user, scout §8); render order per spec — greeting+date (kept), `<AddDeadline courses={…}/>`, buckets, failed-reminders banner unchanged.
- [ ] `BucketColumn.tsx`: replace the mono `"{n} open"` counter (scout §4, :54-56) with prose in the sans face at `text-sm`: today → `{n} due today` / this week → `{n} due this week` / later → `{n} later` (label passed as a prop, e.g. `countLabel: (n: number) => string`, so BucketColumn stays generic). Replace the `"~"` empty placeholder (:60): today bucket → `nothing due today 🎉`, others → `nothing here`.
- [ ] `DashboardBuckets.tsx`: when every bucket is empty (zero open assignments), render one account-level line under the buckets: `nothing yet — add your first deadline above.` (`font-display text-xl text-ink-soft`).
- [ ] Vitest: extend/add a small `tests/components/` case if DashboardBuckets is already covered; otherwise assert via a new `bucket-column` test — counter prose renders for n>0, celebration line for empty today bucket, account-level line when all empty.
- [ ] Gates. Commit: `feat: dashboard home with add panel and guided empty states`

---

## Ship gate (controller + user)

Fable whole-branch review → one fix subagent for all findings → re-review → push branch → **user eyeballs the Vercel preview on desktop** (type size, nav underline, dashboard add panel, detailed form save, toolbar) → merge to main → CI green → production auto-deploy.

## Definition of Done

All gates green; `grep -rn "text-\[1[01]px\]" app components` empty; tsx chain grown by `assignmentDraft`; vitest grown by segmented-control, nav-links, add-deadline (and bucket) tests; spec's out-of-scope untouched (applications/settings diffs are type-scale-only or absent); user-verified preview; merged; CI green.
