// Assertion-based unit tests for lib/datetime.ts.
// Run: npx tsx lib/datetime.test.ts   (exits non-zero on any failure)
//
// startOfDayInZone is the "today boundary" the daily digest cron relies on
// (CLAUDE.md §5/§6). It must return the *given zone's* local midnight as a UTC
// instant, so the returned offset tracks DST on the target date. Each case
// pins an exact UTC instant computed by hand; inputs are fixed Dates so the
// results never depend on the machine clock or the server's own timezone.

import { startOfDayInZone, startOfNextDayInZone, wallTimeToIsoInZone } from './datetime';

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

// ---- startOfNextDayInZone: the exclusive upper bound of a "today" window. ----
// It must equal *tomorrow's* local midnight, which on a DST-transition day is
// NOT `today's midnight + 24h` (the digest window's old bug). These pin the
// difference explicitly.
const nextDay = (iso: string, tz: string): string =>
  startOfNextDayInZone(new Date(iso), tz).toISOString();

// Ordinary summer day: Jul 5 → Jul 6 midnight EDT (-4) = 04:00 UTC.
eq('NY next day (summer)', nextDay('2026-07-05T12:00:00Z', 'America/New_York'), '2026-07-06T04:00:00.000Z');
// Ordinary winter day: Jan 15 → Jan 16 midnight EST (-5) = 05:00 UTC.
eq('NY next day (winter)', nextDay('2026-01-15T12:00:00Z', 'America/New_York'), '2026-01-16T05:00:00.000Z');

// Spring forward: Mar 8 (EST -5, midnight 05:00Z) → Mar 9 midnight is EDT (-4)
// = 04:00 UTC. A +24h step would wrongly give 05:00Z (01:00 EDT), leaking the
// first hour of Mar 9 into Mar 8's window.
eq('NY next day (spring-forward day)', nextDay('2026-03-08T12:00:00Z', 'America/New_York'), '2026-03-09T04:00:00.000Z');
// Fall back: Nov 1 (EDT -4, midnight 04:00Z) → Nov 2 midnight is EST (-5) =
// 05:00 UTC. A +24h step would wrongly give 04:00Z (23:00 EST Nov 1), dropping
// the last hour of Nov 1.
eq('NY next day (fall-back day)', nextDay('2026-11-01T12:00:00Z', 'America/New_York'), '2026-11-02T05:00:00.000Z');

// Pre-midnight instant resolves to *its* zone-local day, then advances one day.
eq('NY next day from pre-midnight instant', nextDay('2026-07-05T03:30:00Z', 'America/New_York'), '2026-07-05T04:00:00.000Z');

// No-DST zones: plain +1 calendar day.
eq('Tokyo next day', nextDay('2026-07-05T20:00:00Z', 'Asia/Tokyo'), '2026-07-06T15:00:00.000Z');
eq('UTC next day', nextDay('2026-07-05T12:00:00Z', 'UTC'), '2026-07-06T00:00:00.000Z');

// ---- wallTimeToIsoInZone: a date+time WALL TIME read in a given zone, as a
//      UTC ISO instant. This is what the detailed add form uses so its dueAt
//      matches /api/parse (both honor the user's configured timezone pref,
//      never the machine's local zone). ----
const wall = (date: string, time: string, tz: string): string | null =>
  wallTimeToIsoInZone(date, time, tz);

// Normal case: summer NY is EDT (UTC-4) → 23:59 local = 03:59 next day UTC.
eq(
  'wall NY summer 23:59 → +4h UTC',
  wall('2026-07-20', '23:59', 'America/New_York') ?? 'null',
  '2026-07-21T03:59:00.000Z',
);
// DST-boundary sanity: Nov 1, 2026 falls back at 2am, so noon is EST (UTC-5).
eq(
  'wall NY fall-back day noon → EST (-5)',
  wall('2026-11-01', '12:00', 'America/New_York') ?? 'null',
  '2026-11-01T17:00:00.000Z',
);
// UTC zone: passthrough, no offset.
eq(
  'wall UTC passthrough',
  wall('2026-07-20', '23:59', 'UTC') ?? 'null',
  '2026-07-20T23:59:00.000Z',
);
// Garbage input → null (unparseable date or time).
eq('wall garbage date → null', wall('not-a-date', '23:59', 'UTC') ?? 'null', 'null');
eq('wall garbage time → null', wall('2026-07-20', 'later', 'UTC') ?? 'null', 'null');
eq('wall empty inputs → null', wall('', '', 'America/New_York') ?? 'null', 'null');

console.log(`\ndatetime.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
