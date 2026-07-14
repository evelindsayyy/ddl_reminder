# Week 2 — Feedback Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** No silent failures, no raw error codes, visible pending states, dark-mode-correct QuickAdd — plus the five W1 carryovers (drag-path reminder reactivation, drag-vs-edit isolation, timeline dedupe, save-only-when-changed, and the toast plumbing they all report through).

**Architecture:** A dependency-free `ToastProvider` (context + `aria-live="polite"` region) mounts in the authed layout `app/(app)/layout.tsx`; a pure, tested `lib/errorCopy.ts` maps every raw action/HTTP code to human copy. Rule of thumb enforced across the sweep: **async mutation failures → toast (friendly copy); form-validation messages → stay inline next to the field.** Every handler follows: optimistic-if-exists → on failure `toast(humanizeError(code))` → `router.refresh()` (refresh-to-truth).

**Reference:** `.superpowers/sdd/w2-patterns.md` (untracked scout report — verbatim current sources, the raw-error inventory, token list, and mechanism recommendations; implementers read it first). Roadmap: `docs/FINISH_PLAN.md` Week 2 + the W1-carryover ledger entries.

## Global Constraints

- Verification = `npx tsc --noEmit` + `npm test` (21-suite chain + any new suites — new lib tests need the `test:<name>` script AND the `&&`-chain append). No component-test harness exists; push logic into `lib/` for coverage.
- Design tokens only. QuickAdd's fix ADDS a `warn` semantic token (tailwind.config.ts + globals.css light/dark vars, modeled on the existing `urgent`/`success`/`info` pattern) rather than repurposing an ill-fitting token.
- Server actions keep their raw error codes (API contract unchanged) — humanization happens client-side only.
- Validation strings that stay inline (do NOT toast): `Company and role are required.`, `Enter a course code.`, `No due date — add one and try again.`, QuickAdd's parse-confidence warning.
- No new dependencies. No changes under `app/api/`. Never commit `.superpowers/` or `.env.local`.
- Auth-gated UI: automated gates are tsc + lib tests; user phone-verifies on the deployed preview after merge.

## File Structure

```
lib/errorCopy.ts + lib/errorCopy.test.ts          # pure code→copy map (T1)
components/ui/Toast.tsx                            # provider + useToast + region (T2)
app/(app)/layout.tsx                               # MODIFY: mount provider (T2)
components/applications/{ApplicationActions,ApplicationEditForm,AddApplicationForm,PipelineKanban}.tsx  # toast conversion (T2)
components/assignments/{AssignmentsView,QuickAdd}.tsx                                                   # toast conversion (T3)
components/dashboard/DashboardBuckets.tsx          # un-swallow + pending (T3)
components/settings/{IntegrationsPanel,CoursesManager,RemindersForm,SettingsForm}.tsx                   # un-swallow + toast (T3)
components/assignments/QuickAdd.tsx                # token migration (T4)
tailwind.config.ts + app/globals.css               # + warn token (T4)
lib/applications.ts                                # moveApplicationToLane reactivation (T5)
lib/applicationPatch.ts (+test)                    # reuse for lane moves if cleanly possible (T5)
components/applications/{PipelineKanban,ApplicationCardInteractive,ApplicationCard,ApplicationEditForm}.tsx  # carryovers (T5)
package.json                                       # test wiring
```

---

### Task 1: Error-copy map (pure + tested)

**Interfaces:**
- `lib/errorCopy.ts`: `humanizeError(code: string | null | undefined): string`. Exact-match map for the inventoried codes → short human sentences (write them once, well — e.g. `move_failed` → `Couldn't move it — check your connection and try again.`, `unauthenticated` → `Your session expired — sign in again.`, `invalid_input` → `That didn't validate — check the fields and try again.`, `not_found` → `That item no longer exists — it may have been deleted elsewhere.`, plus `delete_failed`, `save_failed`, `create_failed`, `update_failed`, `sync_failed`, `rotate_failed`, `copy_failed`, `parse_failed`). Pattern-match fallbacks: `/^(PATCH|DELETE|POST|GET) \d+$/` and `/\b\d{3}$/` (the `verb ${status}` strings) → `The server said no (${code}) — try again in a moment.`; everything else → `Something went wrong — try again.` Never returns the raw code alone; unknown codes are embedded in the generic server sentence only when they look like HTTP-status strings.
- Test in repo harness style (exact-match cases, both regex fallback shapes, null/undefined/empty → generic, unknown gibberish → generic). Wire `test:errorcopy` + chain append.
- Commit: `feat: friendly error copy map`

### Task 2: Toast system + applications-side conversion

**Interfaces:**
- `components/ui/Toast.tsx` (`'use client'`): `ToastProvider({ children })`, `useToast(): { toast: (message: string, opts?: { tone?: 'error' | 'success' }) => void }`. Region: fixed bottom (above the mobile bottom nav: `bottom-16 md:bottom-4`), `role="status"` `aria-live="polite"`, stack of max 3, auto-dismiss 5s + manual × button (`aria-label="Dismiss"`), tone styling via tokens (`error` → `border-urgent/40 bg-bg text-ink` with a `text-urgent` accent; `success` → `border-success/40`). Timeout cleanup on unmount. Hook throws a clear error outside the provider.
- Mount in `app/(app)/layout.tsx` wrapping the authed content (RSC file imports the client provider — standard Next composition; match the file's current structure per scout §2).
- Convert the applications-side mutation failures to `toast(humanizeError(res.error))`: `ApplicationActions` (move/delete — remove the inline error `<p>`), `ApplicationEditForm` (save failure → toast; required-fields guard stays inline), `AddApplicationForm` (create failure → toast; its validation line stays), `PipelineKanban.onDrop` (`move_failed` → toast, delete the component-level error banner state if now unused).
- Commit: `feat: toast system with friendly errors on the applications surface`

### Task 3: Un-swallow + sweep the rest + pending affordances

- `DashboardBuckets.onToggleDone`: replace the empty catch with toast + `router.refresh()`; surface the pending window (checkbox/card gets `opacity-60`/disabled while its transition is pending — per-item pending, mirror the fade pattern already there).
- `IntegrationsPanel`: all four silent handlers (clipboard copy, ICS rotate, bookmarklet generate, Gradescope rotate) get failure toasts (`copy_failed`, `rotate_failed`, …) and success toasts where silence is ambiguous (copy → `Copied.` success tone); keep the existing persisted last-sync error display; statuses that render inline gain no aria-live (the toast region carries it).
- `AssignmentsView` onEdit/onToggle/onDelete raw `PATCH 500`-style strings → toast(humanizeError(...)); QuickAdd SAVE failure → toast (parse warning + confidence hint stay inline).
- `CoursesManager` (create/update/delete — add the missing pending disables on update/delete), `RemindersForm`, `SettingsForm`: failure → toast; success stays quiet (forms already show saved state); course-code validation stays inline.
- Commit: `feat: no silent failures — toasts and pending states across dashboard and settings`

### Task 4: QuickAdd token migration (+ warn token)

- Add `warn` semantic token: tailwind.config.ts color entry + `--warn` CSS vars in `globals.css` `:root` and `.dark` (pick values consistent with the hand-drawn palette; amber-ish light, softened dark). Model EXACTLY on how `urgent`/`success`/`info` are defined (scout §3 has the token plumbing).
- Migrate QuickAdd's ~34 off-token instances (scout §3 line inventory): neutral-* → ink/bg tokens, indigo-* (incl. the inline `#6366f1` hex) → `info` or `ink` per context, amber-* (parse-confidence warning at 255/340/350) → `warn`. Visual parity in light mode; dark mode now legible.
- Commit: `fix: quickadd on design tokens with a warn semantic (dark-mode correctness)`

### Task 5: W1 carryovers

1. **`moveApplicationToLane` reactivation** (`lib/applications.ts`): change the read to `.select('stage, next_action_at')`; after a successful update, if `isTerminalStage(current.stage) && !isTerminalStage(nextStage) && current.next_action_at` → mirror `updateApplication`'s reschedule branch (`ensureUserPrefs` + `scheduleApplicationReminders` with `nextActionAtIso: current.next_action_at` normalized via `new Date(...).toISOString()` — the PostgREST `+00:00` lesson applies here too); keep the existing into-terminal cancel. All imports already present (scout §4).
2. **`draggable={!editing}`**: `ApplicationCardInteractive` gains optional `onEditingChange?: (editing: boolean) => void` (called in the setEditing paths); `PipelineKanban` tracks `const [editingIds, setEditingIds] = useState<Set<string>>` and sets `draggable={!editingIds.has(a.id)}` on the wrapper (scout §5 mechanism A). Remove the now-redundant editing-shell pointer hack if it's dead weight, or keep as belt-and-suspenders — implementer's call, documented.
3. **Timeline dedupe**: remove the due-time line from `ApplicationCard`'s `variant === 'timeline'` next-block (keep the rail's `formatDueAt · formatRelative` + `missed` styling — scout's recommendation); kanban variant unchanged.
4. **Edit-form save-only-when-changed**: include `nextActionAt` in the payload only when `nextActionLocal !== isoToDatetimeLocal(a.next_action_at)` (avoids needless reminder re-plans + second-truncation).
- Commit: `fix: drag-path reminder reactivation, drag-edit isolation, timeline dedupe, minimal save payloads`

### Definition of Done (Week 2)

tsc clean; chain green (22 suites with errorCopy); CI green; on the deployed preview: a forced failure (airplane mode) shows a human toast instead of silence or `PATCH 500`; QuickAdd legible in dark mode; dragging a rejected card back to interviewing re-arms reminders (desktop), matching the select path.

### Out of Scope

Route-handler/component tests (W3), a11y sweep beyond the new controls (W3), PWA icons + spec stragglers (W4), notes-on-card display decision (parked: revisit in W4 polish).
