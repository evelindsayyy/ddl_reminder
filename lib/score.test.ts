// Assertion-based unit tests for lib/score.ts.
// Run: npx tsx lib/score.test.ts   (exits non-zero on any failure)
//
// urgencyScore = timeScore (decays from 100 at due-now to a floor of 10 a month
// out, with an overdue boost up to +50) + effortScore (0..15, estimated_hours
// capped at 5h). These tests pin the threshold edges, the overdue cap, the
// effort cap, and both comparators.

import { urgencyScore, compareUrgency, compareDueThenEffort, type Scoreable } from './score';

const TZ_NOW = new Date('2026-05-05T12:00:00Z');

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

const inHours = (h: number): string => new Date(TZ_NOW.getTime() + h * 3_600_000).toISOString();
function item(hoursUntilDue: number, estimated_hours: number | null = null, completed = false): Scoreable {
  return {
    due_at: inHours(hoursUntilDue),
    estimated_hours,
    completed_at: completed ? inHours(-1) : null,
  };
}
const score = (s: Scoreable): number => urgencyScore(s, { now: TZ_NOW });

// ---- completed ----
eq('completed → -Infinity', score(item(5, 3, true)), -Infinity);

// ---- time thresholds (no effort) ----
eq('due in 6h → 100', score(item(6)), 100);
eq('boundary 12h → 80 (not <12)', score(item(12)), 80);
eq('boundary 24h → 60', score(item(24)), 60);
eq('boundary 72h → 40', score(item(72)), 40);
eq('10 days out → 20', score(item(240)), 20); // 30 - 240/24 = 20
eq('30 days out → floor 10', score(item(720)), 10); // max(10, 30-30)

// ---- overdue boost + cap ----
eq('overdue 10h → 110', score(item(-10)), 110); // 100 + min(50,10)
eq('overdue 100h → 150 (boost capped at +50)', score(item(-100)), 150);

// ---- effort component ----
eq('effort: 2h adds 6 (due in 6h → 106)', score(item(6, 2)), 106);
eq('effort cap: 10h adds only 15 (due in 6h → 115)', score(item(6, 10)), 115);
eq('effort: null hours adds 0', score(item(6, null)), 100);

// ---- same-day tiebreak by effort ----
check('heavier item outranks lighter on the same day',
  score(item(6, 5)) > score(item(6, 1)));

// ---- compareUrgency: most urgent first ----
{
  const later = item(240);
  const overdue = item(-5);
  const today = item(6);
  const sorted = [later, overdue, today].sort(compareUrgency(TZ_NOW));
  check('compareUrgency sorts overdue → today → later',
    sorted[0] === overdue && sorted[1] === today && sorted[2] === later);
}

// ---- compareDueThenEffort: due asc, then effort desc ----
{
  const earlyLight = { due_at: inHours(10), estimated_hours: 1 };
  const lateHeavy = { due_at: inHours(50), estimated_hours: 5 };
  const sorted = [lateHeavy, earlyLight].sort(compareDueThenEffort());
  check('due asc: earlier due sorts first', sorted[0] === earlyLight);

  const fridayHeavy = { due_at: inHours(20), estimated_hours: 5 };
  const fridayLight = { due_at: inHours(20), estimated_hours: 1 };
  const tie = [fridayLight, fridayHeavy].sort(compareDueThenEffort());
  check('same due → heavier effort first', tie[0] === fridayHeavy);
}

console.log(`\nscore.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
