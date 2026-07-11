// Timezone-aware instant math. Per CLAUDE.md §5, "today" is defined by the
// user's IANA zone, never the server's UTC clock — Vercel containers run in
// UTC and would otherwise compute the wrong calendar day.
//
// These helpers take a UTC `Date` instant plus an IANA zone string and return
// a UTC `Date`. They are pure: given the same inputs they always return the
// same instant, so the DST boundary behavior is unit-testable.

/**
 * Returns the UTC instant corresponding to "00:00:00 today" in the given zone.
 *
 * "Today" is the calendar date that `now` falls on when read in `tz`. The
 * returned instant is that date's local midnight, expressed back in UTC — so
 * it accounts for the zone's offset *on that date* (DST included).
 *
 * Example: startOfDayInZone(2026-07-05T12:00:00Z, 'America/New_York')
 *   → 2026-07-05T04:00:00Z  (midnight EDT, UTC-4)
 */
export function startOfDayInZone(now: Date, tz: string): Date {
  // Use Intl to extract Y-M-D in the zone.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const ymd = fmt.format(now); // YYYY-MM-DD
  // Build a UTC midnight for that date, then offset by the zone's offset to
  // express the same calendar moment back to UTC.
  const localMidnight = new Date(`${ymd}T00:00:00Z`);
  // Compute the offset between localMidnight (interpreted as UTC) and what
  // the zone calls midnight on that date.
  const tzMidnightStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(localMidnight);
  // Parse "YYYY-MM-DD, HH:MM:SS" or similar — en-CA uses ISO-style.
  const m = tzMidnightStr.match(/(\d{4})-(\d{2})-(\d{2}),?\s*(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return localMidnight;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  // Difference between what UTC says and what zone-local says, in ms.
  const fakeAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  const offsetMs = fakeAsUtc - localMidnight.getTime();
  return new Date(localMidnight.getTime() - offsetMs);
}

/**
 * Returns the UTC instant for "00:00:00 tomorrow" in the given zone — the start
 * of the calendar day *after* the one `now` falls on in `tz`.
 *
 * Use this to bound a "today" window (`[startOfDay, startOfNextDay)`) rather
 * than `startOfDayInZone(now) + 24h`. A DST-transition day is 23 or 25 hours
 * long, so a fixed 24h step lands an hour early or late: on spring-forward it
 * leaks tomorrow's first hour into today, and on fall-back it drops today's
 * last hour (see CLAUDE.md §5). Stepping ~36h past today's local midnight lands
 * squarely inside the next calendar day regardless of a ±1h DST shift, and
 * snapping that instant back to local midnight yields tomorrow's exact start.
 *
 * Example: startOfNextDayInZone(2026-11-01T12:00:00Z, 'America/New_York')
 *   → 2026-11-02T05:00:00Z  (Nov 2 is EST, UTC-5), not the 04:00Z a +24h step
 *     from the Nov 1 EDT midnight would wrongly produce.
 */
export function startOfNextDayInZone(now: Date, tz: string): Date {
  const startToday = startOfDayInZone(now, tz);
  const midNextDay = new Date(startToday.getTime() + 36 * 60 * 60 * 1000);
  return startOfDayInZone(midNextDay, tz);
}
