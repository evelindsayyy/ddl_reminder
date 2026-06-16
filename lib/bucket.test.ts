// Assertion-based unit tests for lib/bucket.ts.
// Run: npx tsx lib/bucket.test.ts   (exits non-zero on any failure)
//
// Bucketing is timezone-sensitive ("today" = the user's calendar day, not the
// server's UTC day) and order-sensitive (overdue is checked before today, so an
// incomplete item due earlier today is overdue, not today). These tests pin
// both, plus the 7-day window boundary and completed-item handling.

import { bucketAssignments, type Bucketable } from './bucket';

const TZ = 'America/New_York';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `expected ${String(expected)}, got ${String(actual)}`);
}

let seq = 0;
function row(due_at: string, completed_at: string | null = null): Bucketable {
  return { id: `r${seq++}`, due_at, completed_at };
}
const ids = (rows: Bucketable[]): string[] => rows.map((r) => r.id);

// now = Tue May 5 2026, 2:00pm EDT.
const NOW = new Date('2026-05-05T14:00:00-04:00');

// ---- core buckets ----
{
  const overdue = row('2026-05-05T10:00:00-04:00'); // 10am today, before now → overdue
  const today = row('2026-05-05T23:59:00-04:00'); // 11:59pm today, after now → today
  const thisWeek = row('2026-05-08T12:00:00-04:00'); // +3 days
  const later = row('2026-05-20T12:00:00-04:00'); // +15 days

  const b = bucketAssignments([overdue, today, thisWeek, later], { now: NOW, timezone: TZ });
  check('overdue: incomplete + due<now', ids(b.overdue).includes(overdue.id));
  check('today: same calendar day, due>now', ids(b.today).includes(today.id));
  check('thisWeek: 3 days out', ids(b.thisWeek).includes(thisWeek.id));
  check('later: 15 days out', ids(b.later).includes(later.id));
  check('overdue precedence: earlier-today item is overdue, not today',
    !ids(b.today).includes(overdue.id));
}

// ---- 7-day window boundary (absolute ms, tz-independent) ----
{
  const onBoundary = row(new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString());
  const pastBoundary = row(new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000 + 1).toISOString());
  const b = bucketAssignments([onBoundary, pastBoundary], { now: NOW, timezone: TZ });
  check('exactly now+7d → thisWeek (inclusive)', ids(b.thisWeek).includes(onBoundary.id));
  check('now+7d+1ms → later', ids(b.later).includes(pastBoundary.id));
}

// ---- timezone-defined "today" ----
{
  // now = May 5, 2:00am EDT (= May 5 06:00Z). A due at 8pm EDT is the same NY
  // calendar day but a *different* UTC day (May 6 00:00Z) — must be today.
  const nowEarly = new Date('2026-05-05T02:00:00-04:00');
  const sameNyDay = row('2026-05-05T20:00:00-04:00'); // 8pm EDT, May 5 in NY
  const nextNyDay = row('2026-05-06T20:00:00-04:00'); // next NY day
  const b = bucketAssignments([sameNyDay, nextNyDay], { now: nowEarly, timezone: TZ });
  check('tz: 8pm-EDT today is "today" despite crossing UTC midnight',
    ids(b.today).includes(sameNyDay.id));
  check('tz: next NY day is not "today"', !ids(b.today).includes(nextNyDay.id));
}

// ---- completed-item handling ----
{
  const doneToday = row('2026-05-05T23:00:00-04:00', '2026-05-05T09:00:00-04:00');
  const donePast = row('2026-05-01T10:00:00-04:00', '2026-05-01T11:00:00-04:00');

  const excluded = bucketAssignments([doneToday, donePast], {
    now: NOW,
    timezone: TZ,
    excludeCompleted: true,
  });
  const total =
    excluded.overdue.length + excluded.today.length + excluded.thisWeek.length + excluded.later.length;
  eq('excludeCompleted drops all completed rows', total, 0);

  const kept = bucketAssignments([donePast], { now: NOW, timezone: TZ, excludeCompleted: false });
  check('completed past-due item is never "overdue"', !ids(kept.overdue).includes(donePast.id));
}

console.log(`\nbucket.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
