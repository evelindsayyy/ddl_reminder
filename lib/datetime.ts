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

/**
 * Returns the UTC ISO instant for a `YYYY-MM-DD` + `HH:mm` WALL TIME read in
 * the given IANA zone — or null when the date/time don't parse.
 *
 * This generalizes startOfDayInZone's offset round-trip: the wall time is
 * first built as a fake-UTC instant, the zone's offset *at that instant* is
 * measured via Intl (so DST on the target date is honored), and subtracting
 * the offset yields the real instant. The browser/server's own zone never
 * participates — unlike `new Date('YYYY-MM-DDTHH:mm')`, which reads the wall
 * time in the machine's local zone. The detailed add form uses this so its
 * dueAt matches what /api/parse produces for the same wall time in the user's
 * configured timezone pref.
 *
 * Example: wallTimeToIsoInZone('2026-07-20', '23:59', 'America/New_York')
 *   → '2026-07-21T03:59:00.000Z'  (23:59 EDT, UTC-4)
 */
export function wallTimeToIsoInZone(date: string, time: string, tz: string): string | null {
  // Shape guards first: engines fall back to lenient legacy Date.parse for
  // non-ISO strings (e.g. an empty date/time still "parses"), so only the
  // exact input-element formats are accepted.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  // Fake-UTC instant carrying the wall-time fields. Out-of-range fields
  // (e.g. month 13) make an Invalid Date here → null.
  const fakeUtc = new Date(`${date}T${time}:00Z`);
  if (Number.isNaN(fakeUtc.getTime())) return null;
  try {
    // What the zone's clock reads at that instant (en-CA gives ISO-style parts).
    const zoneStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(fakeUtc);
    const m = zoneStr.match(/(\d{4})-(\d{2})-(\d{2}),?\s*(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const fakeAsUtc = Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    );
    // Zone offset at that instant, in ms; subtracting it converts the wall
    // time from "pretend UTC" to the actual UTC instant.
    const offsetMs = fakeAsUtc - fakeUtc.getTime();
    return new Date(fakeUtc.getTime() - offsetMs).toISOString();
  } catch {
    // Invalid IANA zone — Intl throws. Callers pass the validated timezone
    // pref, so treat this like any other unparseable input.
    return null;
  }
}
