# Week 3 — Trust Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The money paths get real tests (reminder webhook, daily cron, ICS feed, Gradescope sync, assignments API), the interactive components get their first component tests (Toast, ApplicationActions, QuickAdd), and the ~20-item a11y backlog is closed — plus the W2-ledgered code fixes (createApplication reminder symmetry, network-error copy, toast dedupe/useMemo/updater purity).

**Architecture:** vitest joins the repo ALONGSIDE the tsx chain (which stays untouched, 23 suites): `vitest.config.ts` with `vite-tsconfig-paths` for the `@/` alias, node environment by default for route tests, `// @vitest-environment jsdom` pragma per component-test file. Route tests import the handler functions directly and `vi.mock` the seams the scout mapped (`@supabase/supabase-js` / `@supabase/ssr` for service-role routes; `@/lib/supabase/server` for the cookie route; `@upstash/qstash`, `@/lib/email`, `@/lib/reminders`, `@/lib/canvas`, `@/lib/prefs`, `next/navigation` as needed). CI gains a `vitest run` step; `npm test` chain untouched.

**Reference:** `.superpowers/sdd/w3-patterns.md` (untracked scout report: full route sources, import graphs, mock targets, a11y inventory with file:line, component-test facts). Roadmap: `docs/FINISH_PLAN.md` Week 3 + the W2 ledger.

## Global Constraints

- The tsx chain (23 suites) keeps passing untouched; new dev-only dependencies allowed THIS week (vitest, @vitejs/plugin-react, jsdom, @testing-library/react, @testing-library/user-event, vite-tsconfig-paths) — devDependencies only, runtime deps unchanged.
- Route tests test the REAL handler functions (import the route module) — mocks only at the scouted seams; assert status codes, envelope shapes, side-effect calls (e.g. reminder cancel invoked), and security branches (fail-closed on bad signature, constant-time secret path still exercised via right/wrong secret).
- Component tests assert user-visible behavior (rendered text, toast messages, aria attributes) — not implementation internals.
- A11y changes must not change visual design: labels use the existing `sr-only`-or-visible idiom per surface (follow ApplicationEditForm's W1 pattern where visible labels fit; `aria-label` where the design has no room); hit-target fixes grow padding/hit area, not the drawn size, unless the inventory notes otherwise.
- Design tokens only; `.superpowers/`/`.env.local` never committed; nothing under `app/api/` changes EXCEPT none — route tests import, never modify. (`lib/applications.ts` createApplication fix is lib, allowed.)
- Every task: `npx tsc --noEmit` clean, `npm test` (tsx chain) green, `npx vitest run` green.

## Tasks

### Task 1: vitest harness + first route test (ICS feed)

- Install the six devDeps; `vitest.config.ts` (node env default, `vite-tsconfig-paths`, include `tests/**/*.test.ts?(x)`); create `tests/routes/` + `tests/components/` dirs; npm scripts `"test:unit": "vitest run"` (name avoids colliding with the tsx chain's `test`); CI: add a `run: npx vitest run` step after `npm test` in .github/workflows/ci.yml.
- First route test `tests/routes/ics.test.ts` — mock `@supabase/ssr` per scout §1: unknown token → 404 (no user-leak body), valid token → 200, `content-type: text/calendar; charset=utf-8`, body contains `BEGIN:VCALENDAR`, an assignment VEVENT with the `[CODE] title` summary shape, and the timezone-correct DTSTART (fixture rows from the scout's shapes; buildIcs runs REAL — that's the value).
- Commit: `test: vitest harness with ics feed route coverage`

### Task 2: money-path route tests

`tests/routes/webhook-reminder.test.ts`: missing signature → 401/rejected; invalid signature (Receiver.verify mock throws) → rejected fail-closed; valid → reminder row marked sent + email send invoked (mock `@/lib/email`); production-mode gating of the dev bypass (env stub both ways).
`tests/routes/cron-daily.test.ts`: CRON_SECRET unset → 500; wrong bearer → 401; correct → 200 and the four phases invoked (mock `@/lib/canvas`/`@/lib/reminders`/`@/lib/email` fns) asserting backfill runs AFTER canvas sync (call-order assertion — the same-run import scheduling guarantee).
`tests/routes/gradescope.test.ts`: OPTIONS → 204 + CORS headers (origin gradescope.com, Vary: Origin); bad/short token → 401 via jsonCors; happy POST → upsert called with user scoping, response CORS headers present.
`tests/routes/assignments-id.test.ts`: unauthenticated → 401; PATCH happy → update scoped `.eq('user_id', ...)` + reminder resync invoked when dueAt changes; DELETE happy → reminders cancelled before delete (order), scope=series branch smoke.
- All envelope/status assertions against the REAL handler code; keep each file's mock scaffold local (no shared magic helpers yet — three similar files first, extract later if a 4th needs it).
- Commit: `test: money-path route coverage (webhook, cron, gradescope, assignments)`

### Task 3: component tests + the ledgered Toast improvements

- FIRST the Toast improvements (they're being pinned by the new tests): `useMemo` the context value; move eviction `clearTimeout` out of the `setToasts` updater; duplicate-message dedupe (same message+tone while visible → reset its 5s timer instead of stacking).
- `tests/components/toast.test.tsx` (jsdom pragma, fake timers): auto-dismiss at 5s; max-3 eviction (oldest evicted, ITS timer cleared — no ghost dismissal); dedupe resets timer (one node, still visible at t=7s after re-toast at t=3s); unmount clears timers (no act warnings); dismiss button removes only its toast; `role="status"` present.
- `tests/components/application-actions.test.tsx` (mock `@/lib/applications` + `next/navigation` + wrap in ToastProvider): select stage → `updateApplication` called with `buildStageChangePatch` output (terminal→active carries nextActionAt); `ok:false` → friendly toast text visible; thrown action → friendly toast text visible; delete confirm=false → no action call.
- `tests/components/quickadd.test.tsx` (mock global fetch + `next/navigation`): type → debounced parse fetch fires with payload; save success → input cleared; save failure (500) → friendly toast text visible; parse failure stays inline (banner text present, no toast).
- Commit: `test: component coverage for toast, stage actions, quickadd (with toast dedupe)`

### Task 4: a11y sweep + ledger code fixes

- The ~20-item inventory (scout §7, file:line): associate labels on all 15 unlabeled inputs (visible label where the surface already shows field names; `aria-label` elsewhere — match each surface's idiom); dashboard checkbox + color swatches get ≥44px hit areas (padding/pseudo-hit, visual size preserved); ApplicationsView + AssignmentsView tablists get arrow-key nav + roving tabindex (Home/End included, `aria-controls` wired); ColorPicker popover closes on Escape and outside-click (and returns focus to the trigger).
- Ledger fixes: `lib/applications.ts` createApplication — skip reminder scheduling when the created stage is terminal (symmetry with update/move paths) + append a case to the apppatch-adjacent coverage if a pure seam exists, else assert via a route/component-adjacent vitest with the action mocked... (it's a server action: cover the CONDITION by extracting `shouldScheduleOnCreate(stage, nextActionAt): boolean` into `lib/applicationStage.ts` or a small lib fn + tsx test — keep the tested-pure-seam discipline). `lib/errorCopy.ts`: map `Failed to fetch` / `Load failed` / `NetworkError...` (case-insensitive contains) → "Can't reach the server — check your connection and try again." + tsx test cases (chain count grows).
- Commit: `feat: a11y sweep (labels, targets, tablists, popover) and reminder-symmetry fixes`

### Definition of Done (Week 3)

tsc clean; tsx chain green (24 suites with the new pure test); `vitest run` green (4 route files + 3 component files); CI green with the new step; keyboard-only walkthrough of the tabs + color picker works (user eyeballs deployed preview); axe-style spot check on the touched forms shows no unlabeled inputs.

### Out of Scope

W4: PWA icons, ESLint, README screenshot, ICS refresh-interval + Gradescope rate limit + timezone setting + Canvas type preservation, notes-on-card decision.
