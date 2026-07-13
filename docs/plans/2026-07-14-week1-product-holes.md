# Week 1 — Product Holes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Applications stop being append-only, from any device: a stage `<select>` on every kanban/timeline card (touch + keyboard accessible, fixing the desktop-drag-only hole), an inline edit form (company/role/next-action/notes, clearable next-action datetime), and delete with confirm — all wired to the already-built, reminder-aware server actions in `lib/applications.ts`.

**Architecture:** `ApplicationCard` stays presentational (RSC-safe) and gains a `footer` slot. A new `'use client'` `ApplicationCardInteractive` owns edit-mode state and renders either the card + an actions footer (stage select, pencil, trash) or the edit form. Both `PipelineKanban` and `PipelineTimeline` swap to the interactive card. All calls follow the `AddApplicationForm` template: server action → `ActionResult.ok` branch → error banner → `router.refresh()`; optimistic stage updates go through the kanban's existing `useOptimistic`. Non-trivial logic lives in `lib/` as pure, tested helpers (the repo's only automated coverage layer).

**Reference:** `.superpowers/sdd/w1-patterns.md` (untracked scout report — full sources and idioms; implementers should read it first). Roadmap: `docs/FINISH_PLAN.md` Week 1.

## Global Constraints

- Verification = `npx tsc --noEmit` + `npm test` (CI runs exactly these; there is NO build/lint/component-test layer). Every new `lib/*.test.ts` needs BOTH a `test:<name>` script AND appending to the `&&`-chained `"test"` script in package.json, or CI won't gate it.
- Design tokens only (`bg-bg*`, `text-ink*`, `border-ink*`, `text-urgent`, `text-stage-*`); never raw colors. Button idioms per `.superpowers/sdd/w1-patterns.md` §6.
- Server-action calling convention: `const res = await action(...); if (!res.ok) setError(res.error ?? '<verb>_failed');` then `router.refresh()` in all cases (refresh-to-truth rollback — no manual revert). Raw error codes are acceptable THIS week (Week 2 builds the friendly-copy/toast layer).
- Do NOT add another copy of the lane→stage rule (two already exist); the stage select works at 8-stage granularity via `updateApplication`, which needs no lane mapping at all.
- Native `confirm()` for delete (repo idiom; no dialog component exists).
- `.superpowers/` and `.env.local` are never committed. No changes under `app/api/` (HANDOFF rule).
- Auth-gated UI cannot be live-verified locally (magic-link only) — the automated gate is typecheck + lib tests; the user eyeballs the deployed preview after merge.

## File Structure

```
lib/datetimeLocal.ts                              # iso<->datetime-local pure helpers
lib/datetimeLocal.test.ts
lib/applicationPatch.ts                           # stage-change patch builder (terminal→active reactivation fix)
lib/applicationPatch.test.ts
lib/applicationStage.ts                           # MODIFY: + STAGE_LABELS export
components/applications/AddApplicationForm.tsx    # MODIFY: import STAGE_LABELS from lib (drop local copy)
components/applications/ApplicationCard.tsx       # MODIFY: + footer?: ReactNode slot
components/applications/ApplicationActions.tsx    # 'use client' stage select + edit/delete buttons
components/applications/ApplicationEditForm.tsx   # 'use client' inline edit form
components/applications/ApplicationCardInteractive.tsx  # 'use client' edit-state owner
components/applications/PipelineKanban.tsx        # MODIFY: swap card, direct-stage optimistic action
components/applications/PipelineTimeline.tsx      # MODIFY: swap card
package.json                                      # MODIFY: two new test scripts + chain
```

---

### Task 1: Pure helpers + tests (the tested foundation)

**Files:**
- Create: `lib/datetimeLocal.ts`, `lib/datetimeLocal.test.ts`, `lib/applicationPatch.ts`, `lib/applicationPatch.test.ts`
- Modify: `lib/applicationStage.ts` (add `STAGE_LABELS`), `components/applications/AddApplicationForm.tsx` (import it), `package.json`

**Interfaces:**
- `isoToDatetimeLocal(iso: string | null): string` — ISO-UTC → browser-local `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`; `''` for null.
- `datetimeLocalToIso(value: string): string | null` — inverse; `''`/whitespace → null.
- `buildStageChangePatch(current: { stage: ApplicationStage; next_action_at: string | null }, nextStage: ApplicationStage): UpdateApplicationInput` — always `{ stage: nextStage }`; ADDITIONALLY carries `nextActionAt: current.next_action_at` when the move exits a terminal stage into a non-terminal one AND `next_action_at` is set — this re-triggers `updateApplication`'s reschedule branch, fixing the audit's "reactivation doesn't re-create cancelled reminders" edge.
- `STAGE_LABELS: Record<ApplicationStage, string>` exported from `lib/applicationStage.ts` (moved verbatim from AddApplicationForm's local copy).

- [ ] **Step 1: Write the failing tests** (repo harness style: `let passed/failed`, `eq(label, actual, expected)`, exit 1 on failure, header `// Run: npx tsx lib/<name>.test.ts` — copy the harness shape from `lib/applicationStage.test.ts`)

`lib/datetimeLocal.test.ts` — cases:
```ts
// roundtrip: datetimeLocalToIso('2026-03-05T14:30') parses in the local zone; isoToDatetimeLocal of that ISO returns '2026-03-05T14:30'
eq('roundtrip local wall time', isoToDatetimeLocal(datetimeLocalToIso('2026-03-05T14:30')), '2026-03-05T14:30');
eq('null iso -> empty string', isoToDatetimeLocal(null), '');
eq('empty local -> null', datetimeLocalToIso(''), null);
eq('whitespace local -> null', datetimeLocalToIso('   '), null);
// zero-padding: single-digit month/day/hour/minute all padded
const iso = datetimeLocalToIso('2026-01-02T03:04');
eq('padded roundtrip', isoToDatetimeLocal(iso), '2026-01-02T03:04');
// output shape is ISO-UTC with Z
assert('iso is utc-z', typeof iso === 'string' && iso.endsWith('Z'));
```

`lib/applicationPatch.test.ts` — cases:
```ts
eq('plain stage move', buildStageChangePatch({ stage: 'applied', next_action_at: null }, 'oa'), { stage: 'oa' });
eq('into terminal: no nextActionAt', buildStageChangePatch({ stage: 'onsite', next_action_at: '2026-08-01T12:00:00.000Z' }, 'rejected'), { stage: 'rejected' });
eq('terminal -> active with next_action_at: carries reschedule',
   buildStageChangePatch({ stage: 'rejected', next_action_at: '2026-08-01T12:00:00.000Z' }, 'phone_screen'),
   { stage: 'phone_screen', nextActionAt: '2026-08-01T12:00:00.000Z' });
eq('terminal -> active without next_action_at: plain', buildStageChangePatch({ stage: 'withdrawn', next_action_at: null }, 'applied'), { stage: 'applied' });
eq('terminal -> terminal: plain', buildStageChangePatch({ stage: 'rejected', next_action_at: '2026-08-01T12:00:00.000Z' }, 'withdrawn'), { stage: 'withdrawn' });
```
(For object equality use `JSON.stringify` comparison — consistent with the repo's `eq` on primitives; adapt `eq` locally to stringify objects.)

Run both: `npx tsx lib/datetimeLocal.test.ts` / `npx tsx lib/applicationPatch.test.ts` → FAIL (modules missing).

- [ ] **Step 2: Implement**

`lib/datetimeLocal.ts`:
```ts
// iso<->datetime-local conversion for nullable timestamps.
// datetime-local values are browser-local WALL TIME; ISO strings are UTC instants.
// Extracted from the inline block in AssignmentCard's EditForm so nullable
// fields (applications.next_action_at) share one tested implementation.

export function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v); // interpreted in the browser's local zone
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
```

`lib/applicationPatch.ts`:
```ts
import { isTerminalStage } from '@/lib/applicationStage';
import type { ApplicationStage, UpdateApplicationInput } from '@/lib/schemas';

// Patch for a stage change. updateApplication only (re)schedules reminders when
// nextActionAt is present in the payload — so a terminal→active move must carry
// the existing next_action_at or the previously-cancelled reminders stay dead.
export function buildStageChangePatch(
  current: { stage: ApplicationStage; next_action_at: string | null },
  nextStage: ApplicationStage
): UpdateApplicationInput {
  const patch: UpdateApplicationInput = { stage: nextStage };
  const reactivating = isTerminalStage(current.stage) && !isTerminalStage(nextStage);
  if (reactivating && current.next_action_at) {
    patch.nextActionAt = current.next_action_at;
  }
  return patch;
}
```
(Verify the exact import paths/type names against `lib/schemas.ts` — `UpdateApplicationInput` is exported there; `ApplicationStage` may live in schemas or applicationStage. Match reality.)

`lib/applicationStage.ts` — append (verbatim move from AddApplicationForm):
```ts
export const STAGE_LABELS: Record<ApplicationStage, string> = {
  applied: 'Applied', oa: 'OA', phone_screen: 'Phone screen', technical: 'Technical',
  onsite: 'Onsite', offer: 'Offer', rejected: 'Rejected', withdrawn: 'Withdrawn',
};
```
`AddApplicationForm.tsx`: delete the local `STAGE_LABELS`, import from `@/lib/applicationStage`.

`package.json`: add `"test:datetimelocal": "tsx lib/datetimeLocal.test.ts"` and `"test:apppatch": "tsx lib/applicationPatch.test.ts"`; append both to the `"test"` `&&`-chain.

- [ ] **Step 3: Verify + commit**

`npx tsx lib/datetimeLocal.test.ts && npx tsx lib/applicationPatch.test.ts` → pass counts; `npm test` → full chain green; `npx tsc --noEmit` → clean.

```bash
git add lib/ components/applications/AddApplicationForm.tsx package.json
git commit -m "feat: pure helpers for stage patches and nullable datetimes"
```

---

### Task 2: Actions footer — stage select, edit/delete buttons, kanban wiring

**Files:**
- Modify: `components/applications/ApplicationCard.tsx` (footer slot), `components/applications/PipelineKanban.tsx`
- Create: `components/applications/ApplicationActions.tsx`
- (Edit form arrives in Task 3; this task wires stage-change + delete and renders a disabled-free pencil that calls an `onEdit` callback the interactive wrapper will own — see Interfaces.)

**Interfaces:**
- `ApplicationCard` gains `footer?: React.ReactNode`, rendered as the last child of the `<article>` inside a `mt-2 border-t border-dashed border-ink-faint/50 pt-2` wrapper when present. No other card changes; stays non-`'use client'`.
- `ApplicationActions` (`'use client'`):
```ts
export interface ApplicationActionsProps {
  application: ApplicationCardData;      // uses id, stage, next_action_at, company
  onEdit?: () => void;                   // provided by Task 3's wrapper; hidden when absent
  onStageOptimistic?: (stage: ApplicationStage) => void; // kanban passes its useOptimistic apply
}
```
Renders one row: stage `<select>` (all 8 `APPLICATION_STAGES`, labels from `STAGE_LABELS`, `aria-label="Stage"`, value = `application.stage`, select idiom classes from AddApplicationForm) + pencil `onEdit` button + trash button (icons copied from AssignmentCard's local `PencilIcon`/`TrashIcon` — copy the SVGs into this file; `aria-label="Edit application"` / `aria-label="Delete application"`, min touch target `p-1.5`). Stage change handler:
```tsx
function onStageChange(next: ApplicationStage) {
  if (next === a.stage) return;
  setError(null);
  onStageOptimistic?.(next);
  startTransition(async () => {
    const res = await updateApplication(a.id, buildStageChangePatch(a, next));
    if (!res.ok) setError(res.error ?? 'move_failed');
    router.refresh();
  });
}
```
Delete: `if (!confirm(`Delete "${a.company} — ${a.role}"?`)) return;` then same shape with `deleteApplication(a.id)`, error code fallback `'delete_failed'`. Both controls `disabled={pending}`. Error banner: the standard `text-urgent` inline `<p>` under the row. IMPORTANT drag interplay: the actions row wrapper gets `draggable={false}` and `onPointerDown={(e) => e.stopPropagation()}` so interacting with the select/buttons never starts an HTML5 drag on desktop.
- `PipelineKanban` changes: extend its `useOptimistic` reducer to support a direct-stage action (`{ id, stage }` — plain `{ ...a, stage: action.stage }`; keep the existing lane action for drag) and render `<ApplicationCard … footer={<ApplicationActions application={a} onStageOptimistic={(s) => startTransition(() => applyOptimistic({ id: a.id, stage: s }))} />} />` inside the existing draggable wrapper. (Task 3 replaces this render with the interactive wrapper; structure this task so that swap is one line.)

- [ ] Steps: implement → `npx tsc --noEmit` + `npm test` green → commit `feat: stage select and delete on kanban cards`.

---

### Task 3: Inline edit form + interactive card in both views

**Files:**
- Create: `components/applications/ApplicationEditForm.tsx`, `components/applications/ApplicationCardInteractive.tsx`
- Modify: `components/applications/PipelineKanban.tsx` (render interactive card), `components/applications/PipelineTimeline.tsx` (same swap)

**Interfaces:**
- `ApplicationEditForm` (`'use client'`): props `{ application: ApplicationCardData; onCancel: () => void; onSaved: () => void }`. Local state seeded from the row: `company`, `role`, `nextAction` (`?? ''`), `nextActionLocal` (`isoToDatetimeLocal(a.next_action_at)`), `notes` (`?? ''`). Fields (labeled — use real `<label>` elements with the token classes, this is new UI so it meets the a11y bar from day one): company (text, required guard `!company.trim()`), role (text, required), next action (text), next action at (`datetime-local`, clearable — empty string → send `null`), notes (textarea rows=2). Submit via `useTransition`:
```tsx
startTransition(async () => {
  const res = await updateApplication(a.id, {
    company: company.trim(), role: role.trim(),
    nextAction: nextAction.trim() === '' ? null : nextAction.trim(),
    nextActionAt: datetimeLocalToIso(nextActionLocal),
    notes: notes.trim() === '' ? null : notes.trim(),
  });
  if (!res.ok) { setError(res.error ?? 'save_failed'); return; }
  onSaved(); router.refresh();
});
```
Save/Cancel buttons per idiom (`bg-ink text-bg` / bordered secondary), `disabled={pending}`, submit shows `saving…`.
- `ApplicationCardInteractive` (`'use client'`): props `{ application, timezone, variant, className?, onStageOptimistic? }`. `const [editing, setEditing] = useState(false);` — editing → `<ApplicationEditForm application={a} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />` inside a bordered card shell (`rounded border border-ink bg-bg p-3`); else → `<ApplicationCard {...} footer={<ApplicationActions application={a} onEdit={() => setEditing(true)} onStageOptimistic={onStageOptimistic} />} />`.
- `PipelineKanban`: draggable wrapper now wraps `<ApplicationCardInteractive …/>` (drag must still work when NOT editing; while editing the wrapper sets `draggable={false}` — pass `editing` up via render or simply set `draggable={!editingIds.has(a.id)}`… simplest correct: ApplicationCardInteractive renders its own outer div with `onPointerDown` stop-propagation while editing; keep the kanban wrapper unconditionally draggable and accept that drag-while-editing is prevented by the stopPropagation. Choose the simplest mechanism that typechecks and document it.)
- `PipelineTimeline`: swap `<ApplicationCard variant="timeline">` for the interactive card (no `onStageOptimistic` — plain refresh path is fine there).

- [ ] Steps: implement → `npx tsc --noEmit` + `npm test` green → boot `npm run dev` once and confirm `/login` still renders (no module-level crash) → commit `feat: inline edit and delete for applications in kanban and timeline`.

---

## Definition of Done (Week 1)

`npm test` green with the two new suites in the chain; `tsc --noEmit` clean; CI green on push; from a phone (deployed preview): change an application's stage without dragging, edit its fields, clear/set its next-action date, delete it; moving a rejected application back to an interview stage re-arms its reminders (the `buildStageChangePatch` test pins this).

## Out of Scope (later weeks)

Toasts/friendly error copy (W2), pending skeletons (W2), dnd-kit touch drag (stretch, only if W1 finishes early), component test harness (W3), notes display on the card (note for W2 polish: edit exposes notes the card never shows — decide whether the card should render notes).
