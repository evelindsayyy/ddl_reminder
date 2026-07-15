# UI Readability & Navigation Restructure — Design

**Date:** 2026-07-15
**Status:** Approved by user (brainstorm session)
**Driver:** User feedback on the deployed app: "the font is a bit small and the page design is a bit hard to navigate" — plus a feature request: a structured entry form (labeled fields, date picker) as an alternative to the plain-text quick add.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Primary device | Desktop browser first; phone inherits via existing responsive classes |
| Structured add vs. quick add | **Toggle** — one panel, two tabs: "quick line" (existing parse) and "detailed" (labeled fields). Same save path. |
| Scale of change | **Restructure the pages** — bigger type AND layout rework; top-bar navigation and the hand-drawn identity are kept |

## Problems observed (from authenticated screenshots of the deployed app)

1. **Type renders small.** Patrick Hand / Caveat are visually smaller than normal faces at equal pixel size; nothing compensates. Mono captions run at 10–11px.
2. **Pages are mostly emptiness.** Short cards float in a wide canvas; ~85% of the dashboard viewport is blank, which makes the small text feel smaller.
3. **The empty dashboard is a dead end.** Three "0 open ~" boxes with no call to action; a new user must discover the "assignments" nav link to add anything.
4. **No wayfinding.** The active nav page is visually identical to inactive links; related controls (view switcher vs. status filter) sit at opposite corners of the same row.
5. **Adding requires prose.** Quick add's plain-text line is fast but unguided; there is no field-based entry.

## Design

### 1. Type scale (global, token-level)

- Base body (`font-sans`, Patrick Hand): 16px → **18px**, via a Tailwind `fontSize` theme override so every page inherits.
- Mono captions/labels: **13px floor**. Sweep hardcoded one-offs (`text-[10px]`, `text-[11px]`) up to the floor.
- Nav links `text-base` → `text-lg`. Page titles (`font-display`) one step up on desktop (e.g. `text-4xl` → `text-5xl`).
- Line-height loosened slightly for the handwritten faces (e.g. `leading-relaxed` defaults where cramped).
- No color/token changes; DESIGN_TOKENS.md "Type" section updated to match.

### 2. App shell & wayfinding (`app/(app)/layout.tsx`)

- **Active nav state:** current page's link renders ink-dark with a hand-drawn marker underline (slightly wavy — SVG or styled border consistent with the aesthetic). Inactive links stay `ink-soft`. Match on pathname (exact for `/`, prefix for the rest).
- Nav links get larger hit areas (padding to ≥44px effective height, preserving the drawn size per the W3 a11y idiom).
- The email display shrinks into a quieter corner chip; sign out unchanged.
- Content wrapper stays `max-w-5xl`.

### 3. Dashboard becomes a real home (`app/(app)/page.tsx`, `components/dashboard/`)

Top-to-bottom order:
1. Greeting + date (kept, larger per §1).
2. **Add-deadline panel** — the shared component from §4, right on the dashboard.
3. The three buckets (today / this week / later) with legible counters: "3 due today" prose instead of tiny mono "3 open".
4. Empty states become guidance, not "~": bucket-level *"nothing due today 🎉"*; account-level (zero assignments anywhere) *"nothing yet — add your first deadline above."*
5. Failed-reminders banner unchanged.

### 4. Add panel: quick / detailed toggle (new `components/assignments/AddDeadline.tsx`)

A single card titled "add a deadline" with a two-tab toggle:

- **quick line** tab = the existing `QuickAdd` component, behavior unchanged (debounced parse preview, save, recurrence detection).
- **detailed** tab = labeled fields mapping 1:1 onto `createAssignmentSchema`:
  - course — dropdown of the user's courses plus a "new course" free-text option (course codes are created on save exactly as the quick-add path does)
  - title — text input (required)
  - type — select (existing `assignmentTypeSchema` values)
  - due — native `<input type="date">` + `<input type="time">`, assembled/split with the existing `lib/datetimeLocal` helpers
  - repeats — select: never / weekly / biweekly. When repeating, the payload's `recurrence` is built from the schema shape (`interval: 1|2`, `byweekday` derived from the chosen due date's weekday); an optional "until" date input appears when repeating (maps to `recurrence.until`, `YYYY-MM-DD`)
  - collapsed "more" row → notes (textarea), tags, estimated hours
- Both tabs submit through the **same existing save path** the quick add uses today (validated by `createAssignmentSchema`; same POST endpoint), with the same failure toasts (`lib/errorCopy`) and refresh-to-truth behavior. No schema or API changes.
- Tab choice persisted in `localStorage`; default = quick line.
- All inputs labeled (W3 a11y idiom); tab control follows the existing roving-tabindex tablist pattern.
- Used in two places: the dashboard (§3) and the assignments page (§5), replacing the bare QuickAdd card there.

### 5. Assignments page tune-up (`components/assignments/AssignmentsView.tsx`)

- The view switcher (list / calendar / timeline) and status filter (all / open / done) merge into **one toolbar row directly above the list**, adjacent, with larger segmented buttons (44px targets kept).
- The §4 add panel sits above the toolbar.
- Empty state keeps its friendly line but points at the panel above.
- Phone: MobileAddBar / MobileBottomNav untouched apart from inheriting the §1 type scale. The detailed tab must remain usable at phone widths (fields stack), since the panel is shared.

## Out of scope

- Applications page and Settings beyond inheriting the global type scale.
- Any navigation-structure change (sidebar, merged pages, command palette).
- Parser, API, schema, or database changes.
- Dark-mode token changes (existing tokens carry through).

## Error handling

Unchanged paths: detailed-form save failures surface through the existing toast + `errorCopy` mapping; client-side validation blocks empty title / missing date with inline field messages before submission.

## Testing

- **vitest component tests** for `AddDeadline`: tab switch renders the right panel and persists choice; detailed-form validation (empty title, missing date blocked inline); successful save calls the same endpoint payload shape as quick add; failure shows the friendly toast. Existing `QuickAdd` tests keep passing untouched.
- **tsx chain** untouched (no new pure-lib logic expected; if a pure helper emerges — e.g. detailed-form → payload assembly — it gets a tsx test per repo discipline).
- Existing suites (`npm run test:all`) and CI stay green; visual verification on the Vercel preview before merge.
