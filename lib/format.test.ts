// Assertion-based unit tests for lib/format.ts.
// Run: npx tsx lib/format.test.ts   (exits non-zero on any failure)
//
// formatRelative has exact integer thresholds (overdue h/d, in m/h/d/w) — pinned
// precisely. formatDueAt must render in the *given* timezone (CLAUDE.md §5);
// asserted via substring checks across zones (and space-agnostic around AM/PM,
// since modern ICU uses a narrow no-break space there).

import { formatRelative, formatDueAt } from './format';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: string, expected: string): void {
  check(name, actual === expected, `expected "${expected}", got "${actual}"`);
}
function has(name: string, haystack: string, needle: string): void {
  check(name, haystack.includes(needle), `"${haystack}" missing "${needle}"`);
}

// ================= formatRelative =================

const NOW = new Date('2026-05-05T12:00:00Z');
const H = 3_600_000;
const D = 24 * H;
const at = (ms: number): string => formatRelative(new Date(NOW.getTime() + ms).toISOString(), NOW);

// overdue
eq('overdue: -48h → 2d overdue', at(-48 * H), '2d overdue');
eq('overdue: -25h → 1d overdue', at(-25 * H), '1d overdue');
eq('overdue: -24h (boundary) → 24h overdue', at(-24 * H), '24h overdue');
eq('overdue: -5h → 5h overdue', at(-5 * H), '5h overdue');

// upcoming, sub-hour (minutes, clamped to >= 1)
eq('soon: +30m → in 30m', at(30 * 60_000), 'in 30m');
eq('soon: +20s → clamps to in 1m', at(20_000), 'in 1m');
eq('soon: now → in 1m', at(0), 'in 1m');

// upcoming hours
eq('hours: +5h → in 5h', at(5 * H), 'in 5h');
eq('hours: +1h (boundary) → in 1h', at(1 * H), 'in 1h');
eq('hours: +23h → in 23h', at(23 * H), 'in 23h');

// upcoming days
eq('days: +24h (boundary) → in 1d', at(24 * H), 'in 1d');
eq('days: +48h → in 2d', at(48 * H), 'in 2d');
eq('days: +6d → in 6d', at(6 * D), 'in 6d');

// upcoming weeks
eq('weeks: +7d (boundary) → in 1w', at(7 * D), 'in 1w');
eq('weeks: +10d → in 1w (rounds)', at(10 * D), 'in 1w');
eq('weeks: +14d → in 2w', at(14 * D), 'in 2w');

// ================= formatDueAt (timezone rendering) =================
// Same instant, three zones. 2026-04-28T03:30:00Z:
//   NY (EDT -4) → Mon Apr 27 11:30 PM
//   UTC          → Tue Apr 28 3:30 AM
//   Tokyo (+9)   → Tue Apr 28 12:30 PM

const INSTANT = '2026-04-28T03:30:00.000Z';

const ny = formatDueAt(INSTANT, 'America/New_York');
has('dueAt NY: weekday', ny, 'Mon');
has('dueAt NY: month+day', ny, 'Apr 27');
has('dueAt NY: time', ny, '11:30');
has('dueAt NY: meridiem', ny, 'PM');

const utc = formatDueAt(INSTANT, 'UTC');
has('dueAt UTC: weekday', utc, 'Tue');
has('dueAt UTC: month+day', utc, 'Apr 28');
has('dueAt UTC: time', utc, '3:30');
has('dueAt UTC: meridiem', utc, 'AM');

const tokyo = formatDueAt(INSTANT, 'Asia/Tokyo');
has('dueAt Tokyo: month+day', tokyo, 'Apr 28');
has('dueAt Tokyo: time', tokyo, '12:30');
has('dueAt Tokyo: meridiem', tokyo, 'PM');

// Same instant must render differently across zones (the actual point of §5).
check('dueAt: zones differ for the same instant', ny !== utc && utc !== tokyo);

// Default timezone is America/New_York when omitted.
eq('dueAt: default tz matches explicit NY', formatDueAt(INSTANT), ny);

console.log(`\nformat.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
