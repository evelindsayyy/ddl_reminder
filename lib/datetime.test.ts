// Assertion-based unit tests for lib/datetime.ts.
// Run: npx tsx lib/datetime.test.ts   (exits non-zero on any failure)
//
// startOfDayInZone is the "today boundary" the daily digest cron relies on
// (CLAUDE.md §5/§6). It must return the *given zone's* local midnight as a UTC
// instant, so the returned offset tracks DST on the target date. Each case
// pins an exact UTC instant computed by hand; inputs are fixed Dates so the
// results never depend on the machine clock or the server's own timezone.

import { startOfDayInZone } from './datetime';

let passed = 0;
let failed = 0;
function eq(name: string, actual: string, expected: string): void {
  if (actual === expected) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name} — expected "${expected}", got "${actual}"`);
  }
}
const day = (iso: string, tz: string): string =>
  startOfDayInZone(new Date(iso), tz).toISOString();

// ---- America/New_York: offset depends on the season (DST) ----
// Summer EDT (UTC-4): midnight NY = 04:00 UTC.
eq('NY summer → midnight is EDT (-4)', day('2026-07-05T12:00:00Z', 'America/New_York'), '2026-07-05T04:00:00.000Z');
// Winter EST (UTC-5): midnight NY = 05:00 UTC.
eq('NY winter → midnight is EST (-5)', day('2026-01-15T12:00:00Z', 'America/New_York'), '2026-01-15T05:00:00.000Z');

// ---- DST transition days: the transition is at 2am, so *midnight* keeps the
//      pre-transition offset on both boundary days. ----
// Spring forward (Mar 8, 2026): midnight is still EST (-5).
eq('NY spring-forward day → midnight still EST (-5)', day('2026-03-08T12:00:00Z', 'America/New_York'), '2026-03-08T05:00:00.000Z');
// Fall back (Nov 1, 2026): midnight is still EDT (-4).
eq('NY fall-back day → midnight still EDT (-4)', day('2026-11-01T12:00:00Z', 'America/New_York'), '2026-11-01T04:00:00.000Z');

// ---- The calendar date is the one *in the zone*, not in UTC. ----
// 03:30 UTC is still the previous evening (11:30 PM) in NY → previous day.
eq('NY pre-midnight instant → previous calendar day', day('2026-07-05T03:30:00Z', 'America/New_York'), '2026-07-04T04:00:00.000Z');

// ---- Zones east of UTC and UTC itself. ----
// Tokyo (UTC+9, no DST): 20:00 UTC = 05:00 next day local → that day's midnight = 15:00 UTC prior.
eq('Tokyo → midnight is JST (+9)', day('2026-07-05T20:00:00Z', 'Asia/Tokyo'), '2026-07-05T15:00:00.000Z');
// UTC zone: midnight is 00:00 UTC on the same date.
eq('UTC → midnight is 00:00 UTC', day('2026-07-05T12:00:00Z', 'UTC'), '2026-07-05T00:00:00.000Z');

console.log(`\ndatetime.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
