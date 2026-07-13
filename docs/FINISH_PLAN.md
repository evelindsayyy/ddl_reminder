# Finish Plan — four part-time weeks to "done"

**Baseline (2026-07-14 audit):** ~85–90% complete. Backend reliability layer is production-grade and fully specced-out; 563 assertions green in CI; zero stubs. The gap is product holes a daily user feels, the error/feedback layer, test depth above pure functions, and small spec stragglers. Full audit: `.completion-audit.md` (untracked).

**Definition of done (daily-driver emphasis):** every feature reachable from the phone; no silent failures anywhere; every user-visible error in human words; the money paths covered by route-level tests; PWA installs with proper icons; the deferred spec deviations closed or explicitly re-deferred with a reason.

---

## Week 1 — Close the product holes

The two things the backend already supports but the UI never exposed:

1. **Application edit + delete UI.** `lib/applications.ts` has reminder-aware `updateApplication`/`deleteApplication` with zero callers. Add an edit panel to `ApplicationCard` (mirror the assignments `EditForm` pattern: company, role, stage, next-action datetime, notes) and a delete affordance. Changing `next_action_at` reschedules reminders for free — the server action already does it. Include the terminal→active edge (audit: reminders aren't re-created when a stage moves back out of terminal with an unchanged `next_action_at` — surface next-action as part of the reactivation flow).
2. **Stage changes that work on a phone.** Keep desktop drag; add a universal fallback: a stage menu on each `ApplicationCard` (`moveApplicationToLane` is already the shared server action). This also becomes the keyboard-accessible path. Stretch (only if the week has room): swap native HTML5 DnD for `@dnd-kit` to get touch drag + `aria-grabbed` semantics properly.

## Week 2 — The feedback layer

What makes an app feel finished is what happens when things go wrong or slowly:

1. **Toast system** — one small `aria-live` toast component (no dependency), plus an error-copy map so users never see `PATCH 500`, `move_failed`, or `parse 400` again.
2. **Un-swallow every error** — `DashboardBuckets.onToggleDone` (empty catch: mark-done can fail silently), `IntegrationsPanel` copy/rotate-token/bookmarklet paths. Every mutation gets: optimistic UI where it exists today, toast on failure, state rollback.
3. **Loading affordances** — where `useTransition` pending is currently discarded (dashboard toggle, kanban move, views), show the pending state; skeletons only where trivially cheap.
4. **Design-token compliance** — migrate `QuickAdd`'s raw neutral/indigo/amber palette onto the app's token system (fixes likely dark-mode breakage).

## Week 3 — The trust layer

1. **Route-handler tests** for the money paths, with a lightweight Supabase double: reminder webhook (signature verify + mark-sent), daily cron (sweeper/backfill/digest branches), ICS feed (token auth + VEVENT shape), Gradescope sync (token + CORS), assignments PATCH/DELETE. Wire into `npm test` and CI.
2. **Component tests** for the two highest-risk flows: QuickAdd parse→save, and the new stage-move menu. React Testing Library, kept small.
3. **A11y sweep** — real `<label>`s on every input (QuickAdd textarea, add-application, edit forms, courses, reminders offset), 44px touch targets (dashboard checkbox, py-1 buttons), arrow-key nav on the two tablists, Escape/outside-click on the ColorPicker popover.

## Week 4 — Ship polish + spec stragglers

1. **PWA completeness** — 192/512 + maskable icons, manifest polish, install-flow sanity check on a real phone.
2. **Spec deviations, closed** — Gradescope rate limiting (`@upstash/ratelimit`; Upstash is already in the stack), ICS `METHOD:PUBLISH` + `REFRESH-INTERVAL`, timezone editable in Settings, Canvas re-sync preserving a manually-edited `type`.
3. **Quality plumbing** — ESLint configured and added to CI; refresh the README tests badge; README gets a real product screenshot now that the UI is polished.
4. **Buffer + cut list** — anything slipping lands here or gets explicitly re-deferred in CLAUDE.md §14 with a sentence of why.

---

**Sequencing logic:** weeks 1–2 change what the app *is* for its user; week 3 protects everything weeks 1–2 touched; week 4 is exteriors. Each week is independently shippable; if the month shrinks, cut from the bottom.

**Working style:** one branch per week, spec-driven task plans per week at execution time, review gate per task, full suite + CI green before merge (the same process that shipped LyricMood's elevation).
