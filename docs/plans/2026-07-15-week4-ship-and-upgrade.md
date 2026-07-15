# Week 4 — Ship & Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Next.js 14.2.35 → 16.x (+ React 19) clearing the audit backlog; the four spec deviations closed (Gradescope rate limit, ICS refresh fields, editable timezone, Canvas type preservation); PWA icons; ESLint 9 in CI; the test-hardening ledger; notes-on-card; final docs. **Merge is gated on the user verifying the Vercel PREVIEW deploy** (merging main auto-deploys production).

**Reference:** `.superpowers/sdd/w4-patterns.md` (scout: async-API call sites, dependency ripple, per-item file:line facts). Roadmap: `docs/FINISH_PLAN.md` Week 4 + accumulated ledger.

## Global Constraints

- Gates for EVERY task: `npx tsc --noEmit` clean · `npm run test:all` green · after T1 also `npm run build` (works locally — .env.local present) and dev boot `/login` 200.
- New runtime deps: NONE except what Next 16 itself requires (react 19 etc.). `sharp` and eslint packages are devDependencies. No Upstash Redis — the rate limiter is DB-backed.
- Route/component tests updated HONESTLY for Next 16 API changes (e.g. handler `params` becomes a Promise — update fixtures to `Promise.resolve(...)`), never weakened.
- Design tokens; `.superpowers/`/`.env.local` never committed; migrations follow the existing `supabase/migrations/` numbering.
- If T1 (upgrade) gets BLOCKED (ecosystem incompatibility that can't be resolved honestly), STOP the task, report specifics, and the week continues on 14.2.35 with the upgrade re-scoped — do not force it.

## Tasks

### Task 1: Next 16 + React 19 upgrade

- `npm i next@16 react@19 react-dom@19` + `@types/react@19 @types/react-dom@19`; `@supabase/ssr@^0.6`. Run `npx @next/codemod@latest upgrade` reviewing each transform (commit only sensible ones).
- Migrations per scout §A: `lib/supabase/server.ts` → async `createClient()` with `getAll/setAll` cookie API (middleware.ts already modern); **await the fan-out** — every `createClient()` caller (server components, server actions in lib/applications.ts, route handlers) gains `await`; the 2 page `searchParams` + 3 route `params` become awaited Promises; add `"engines": { "node": ">=20" }`.
- Update tests for the new shapes (params Promise fixtures; anything else tsc/vitest flags). `@vitejs/plugin-react`/RTL16 are React-19 compatible per scout.
- Gates + `npm audit --omit=dev` in the report (expect the advisory pile + postcss nested dep cleared; document any advisories Next 16.x still carries).
- Commit: `feat: upgrade to next 16 / react 19 (async request apis, supabase ssr 0.6)`

### Task 2: Spec deviations

1. **Gradescope rate limit (DB-backed)**: migration `supabase/migrations/<next>_sync_rate_limits.sql` — table `sync_rate_limits(user_id uuid pk, window_start timestamptz, count int)` (service-role only; no RLS exposure needed—accessed by the service client). In the route after token auth: fixed window 10 syncs/hour/user → 429 with `Retry-After` + the CORS headers (jsonCors). Route-test cases: under limit passes, over limit 429 (mock the supabase counter path).
2. **ICS**: METHOD:PUBLISH + REFRESH-INTERVAL (+ X-PUBLISHED-TTL fallback) via ical-generator's calendar props (scout §B7 has the API shape); extend the ics route test to assert both lines.
3. **Canvas type preservation**: `lib/canvas.ts` UPDATE no longer writes `type` (INSERT keeps deriving it) — scout §B9 exact lines; update the canvas tsx test.
4. **Timezone setting**: SettingsForm gains a labeled timezone `<select>` from `Intl.supportedValuesOf('timeZone')` (current value from user prefs; save through the existing settings PATCH path per scout §B10).
- Commit: `feat: gradescope rate limit, ics refresh fields, canvas type preservation, timezone setting`

### Task 3: PWA icons + notes-on-card

- `sharp` devDep + `scripts/generate-icons.mjs` (icon.svg → icon-192.png, icon-512.png, icon-maskable-512.png with safe-zone padding); run it, COMMIT the PNGs; manifest entries (incl. `purpose: maskable`) + verify apple-icon path still valid.
- Notes-on-card: `ApplicationCard` renders `notes` (when present) as a `line-clamp-2 text-sm text-ink-soft` block under the next-action block, both variants — closes the "edit exposes a field the card never shows" decision.
- Commit: `feat: pwa icons and notes display on application cards`

### Task 4: ESLint 9 + test-hardening ledger

- Flat `eslint.config.mjs` with `eslint-config-next` (Next 16 compatible, per scout §B11); `"lint": "eslint ."` script; fix violations honestly (mechanical fixes direct, targeted disables WITH comments otherwise, inventory in report); CI step after typecheck.
- Ledger: webhook dev-bypass honored-direction test (INSECURE=1 + non-prod → accepted, mark-sent runs); `buildStageChangePatch` output round-trips `updateApplicationSchema.safeParse` (tsx chain case); toast dedupe eviction-position comment; ColorPicker `mousedown` → `pointerdown`.
- Commit: `chore: eslint 9 flat config in ci, test hardening from review ledger`

### Task 5: Docs + project close-out

- README: Week-4 features, dual-harness note, a `docs/images/` screenshot SLOT with an HTML comment telling the owner exactly what to capture (authed UI can't be screenshotted headlessly — user hand-off); FINISH_PLAN.md gets a status header marking all four weeks complete with dates; CLAUDE.md (tracked here) commands refreshed (lint, test:all, icon generation).
- Commit: `docs: week-4 features, finish-plan close-out, screenshot slot`

## Ship gate (controller + user)

Fable whole-branch review → fixes → **push the branch** → Vercel preview deploy → **USER verifies the preview** (login, dashboard, quick-add, kanban move, settings — on the phone) → only then merge to main (production deploy) → push → confirm CI green.

## Definition of Done

All gates green incl. `npm run build`; audit shows the Next advisory pile cleared; preview verified by the user; merged; CI green; FINISH_PLAN.md marked complete.
