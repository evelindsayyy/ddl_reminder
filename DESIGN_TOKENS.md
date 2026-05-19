# Design tokens

Wireframes were sketchy/monochrome on purpose — here's the production
visual system to apply when implementing.

All values land in `tailwind.config.ts` (extend `theme.extend.colors`,
`fontFamily`, `spacing`, `borderRadius`) so they're available as utility
classes. Don't hard-code these in components.

---

## Type — full sketchy/hand-drawn

The app uses the same hand-drawn type system as the wireframes. This is
a deliberate aesthetic choice — the personality of the app is the type.

| Role                          | Family                  | Tailwind            | Where                                              |
|-------------------------------|-------------------------|---------------------|----------------------------------------------------|
| UI body text                  | **Patrick Hand**        | `font-sans` (default) | List rows, card body, buttons, form labels, table cells, calendar chips, assignment titles |
| Headings & decorative         | **Caveat** (600)        | `font-display`      | Page titles, section headers ("today", "this week"), greeting line, hero "right now" label, empty-state notes |
| Numbers / dates / course codes| **JetBrains Mono**      | `font-mono`         | Due dates, timestamps, counts, course codes inside chips, mono captions |

No wobble / hand-drawn SVG borders. Borders stay crisp 1px. The
hand-drawn feel comes entirely from the typography.

**Tailwind config additions** (`tailwind.config.ts`):

```ts
fontFamily: {
  sans: ['"Patrick Hand"', 'system-ui', 'sans-serif'],
  mono: ['"JetBrains Mono"', 'monospace'],
  display: ['Caveat', 'cursive'],
},
```

Load via `next/font` in `app/layout.tsx`:

```ts
import { Patrick_Hand, Caveat, JetBrains_Mono } from 'next/font/google';

const patrick = Patrick_Hand({
  subsets: ['latin'], weight: '400', variable: '--font-sans',
});
const caveat = Caveat({
  subsets: ['latin'], weight: ['400','600','700'], variable: '--font-display',
});
const mono = JetBrains_Mono({
  subsets: ['latin'], variable: '--font-mono',
});
```

Then add the variables to `<body className={...}>`.

**Sizes** (Tailwind):
- `text-xs` (12) — captions, mono timestamps
- `text-sm` (14) — list rows, table cells (Patrick Hand reads slightly smaller than Inter — bump one step up if anything looks cramped)
- `text-base` (16) — primary readable text, card titles
- `text-lg` (18) — secondary headings
- `text-xl` (20) — Caveat section headers (column titles like "today")
- `text-2xl` (24) — Caveat page titles
- `text-3xl` (30) — Caveat hero "right now" title

When using Caveat at sizes ≥ `text-2xl` apply `font-semibold` (600) — the
regular weight is too thin at display sizes.

**Bump base size up by ~1px globally** because Patrick Hand has shorter
x-height than Inter. In `app/globals.css`:

```css
html { font-size: 16.5px; }
@media (max-width: 640px) { html { font-size: 15.5px; } }
```

**Readability check:** if Patrick Hand becomes hard to scan in dense
data tables (lots of small text in a tight grid), use `font-mono`
(JetBrains Mono) for that table's body — it's already the convention
for any field that's a date/number/code, so extending it to titles in
a table is consistent.

---

## Color

### Brand
| Token            | Hex       | Usage                                              |
|------------------|-----------|----------------------------------------------------|
| `--color-bg`     | `#ffffff` | Page background                                    |
| `--color-bg-soft`| `#fafaf7` | Card background, alt rows                          |
| `--color-bg-dim` | `#f2f0e8` | Bucket column background, kanban lane background   |
| `--color-ink`    | `#1a1a1a` | Primary text                                       |
| `--color-ink-soft` | `#525252` | Secondary text, captions                          |
| `--color-ink-faint`| `#a3a3a3` | Disabled text, dividers                           |
| `--color-urgent` | `#d94a38` | Due-soon, overdue, primary destructive             |
| `--color-success`| `#4a7c59` | Offer stage, completed, success toasts             |
| `--color-info`   | `#3a6ea8` | Interview stage, neutral info                      |

### Course palette
**Use exactly the hex values in `lib/colors.ts`.** Don't invent new ones.
Build a `<CourseChip />` that takes the hex and renders:
- 6×6 dot at `bg-[hex]`
- text in `text-ink`
- background `[hex]/20` (20% alpha)
- border `border-[hex]`

For Tailwind arbitrary values: `style={{ background: color + '33', borderColor: color }}`.

### Stage colors (applications)
| Stage      | Tailwind class basis | Hex        |
|------------|----------------------|------------|
| applied    | `slate`              | `#525252`  |
| interview  | `blue`               | `#3a6ea8`  |
| offer      | `emerald`            | `#4a7c59`  |
| rejected   | `neutral` faded      | `#a3a3a3`  |

---

## Spacing

Use Tailwind defaults (`space-y-*`, `gap-*`, `p-*`). Density:

| Density       | Card padding | Row padding | Gap    |
|---------------|--------------|-------------|--------|
| Compact       | `p-2`        | `py-1.5`    | `gap-2`|
| Comfortable   | `p-3`        | `py-2.5`    | `gap-3`|
| Spacious      | `p-4`        | `py-3`      | `gap-4`|

Default to **comfortable**; expose density as a user pref later (out of scope for v1).

---

## Radius & elevation

| Token   | Value       | Usage                          |
|---------|-------------|--------------------------------|
| `rounded-sm` | 2px    | Type pills, course chips       |
| `rounded`    | 4px    | Cards, buttons                 |
| `rounded-md` | 6px    | Modals, popovers               |
| `rounded-lg` | 8px    | Hero cards                     |

Shadows: prefer borders over shadows for low elevation. Use `shadow-sm` on hover for cards. Use `shadow-md` only for modals/popovers.

---

## Iconography

**Use `lucide-react`** (already in shadcn world). Stick to outlined,
1.5px stroke. Do not use emoji as UI elements.

Icon size: 14px in chips, 16px in buttons, 20px in headers.

---

## Motion

- All transitions: `transition-colors duration-150` for hover states; `duration-200` for layout changes.
- Mark-done card removal: `opacity-0 max-h-0` over 200ms, easing `ease-out`.
- No bouncy springs. Keep it calm.

---

## Component primitives (shadcn)

Already in repo. Use these — don't reimplement:
- `Card`, `CardHeader`, `CardContent`
- `Button` (`variant="default" | "outline" | "ghost"`)
- `Badge` — base for `<TypePill/>`
- `Checkbox` — but for the inline mark-done, use a custom 18px button matching wireframe spec
- `Tabs` — for the page-level view toggles (list/calendar, kanban/timeline/funnel)
- `Popover` — for calendar day detail
- `Dialog` — for edit drawer
- `Tooltip` — on truncated text

If a primitive isn't shadcn-available, build it as a small file in
`components/ui/` matching the existing shadcn pattern (forwardRef + cn util).

---

## Course-chip implementation reference

```tsx
import { cn } from '@/lib/utils';

export function CourseChip({
  code, color, size = 'md',
}: { code: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-1 gap-1.5',
    lg: 'text-sm px-2.5 py-1 gap-2',
  }[size];
  return (
    <span
      className={cn(
        'inline-flex items-center font-mono font-medium rounded-sm border tracking-wide whitespace-nowrap',
        sz
      )}
      style={{ background: color + '20', borderColor: color, color: '#1a1a1a' }}
    >
      <span className="rounded-full" style={{
        width: 6, height: 6, background: color,
      }} />
      {code}
    </span>
  );
}
```
