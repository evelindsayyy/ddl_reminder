// Recurrence pattern detection and expansion for DDLReminder.
// Design note: supports a fixed pattern set (weekly / biweekly, 1+ weekdays).
// Spec: docs/superpowers/specs/2026-04-23-imports-and-recurring-design.md §3.

import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export interface Recurrence {
  interval: 1 | 2;
  byweekday: number[]; // 0=Sun ... 6=Sat (JS convention)
  until: string | null; // ISO YYYY-MM-DD (last allowed date, inclusive), or null
}

// ---------- detection ----------

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0, su: 0,
  mon: 1, monday: 1, m: 1,
  tue: 2, tues: 2, tuesday: 2, t: 2,
  wed: 3, weds: 3, wednesday: 3, w: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, th: 4,
  fri: 5, friday: 5, f: 5,
  sat: 6, saturday: 6, sa: 6,
};

// Compact compounds: MWF, TuTh, etc. These are conventional academic patterns.
const COMPOUND_MAP: Record<string, number[]> = {
  mwf: [1, 3, 5],
  tth: [2, 4],
  tuth: [2, 4],
  mw: [1, 3],
  wf: [3, 5],
  mf: [1, 5],
  mwth: [1, 3, 4],
  mthf: [1, 4, 5],
  twth: [2, 3, 4],
};

// Tokens that show up in day lists but carry no meaning (connectives).
// Ignored silently during parsing so "weekly on Tuesday" and "every Tue & Thu"
// both work.
const IGNORABLE_TOKENS = new Set(['on', 'the']);

function parseDayList(daysText: string): number[] | null {
  const raw = daysText.trim().toLowerCase().replace(/[.]/g, '');
  if (!raw) return null;

  // Compact (no spaces/separators) → compound check first
  const compact = raw.replace(/[\s,&/]+/g, '');
  if (compact in COMPOUND_MAP) return [...COMPOUND_MAP[compact]];
  if (compact in WEEKDAY_MAP) return [WEEKDAY_MAP[compact]];

  // Multi-token: split on commas / "and" / "&" / "/" / whitespace
  const tokens = raw
    .split(/\s*(?:,|\band\b|&|\/)\s*|\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !IGNORABLE_TOKENS.has(t));

  const days: number[] = [];
  for (const t of tokens) {
    if (t in WEEKDAY_MAP) days.push(WEEKDAY_MAP[t]);
    else if (t in COMPOUND_MAP) days.push(...COMPOUND_MAP[t]);
    else return null; // any unknown token aborts detection
  }
  if (days.length === 0) return null;
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

// Matches: "every other <days>", "biweekly <days>", "bi-weekly <days>",
//          "every <days>", "weekly <days>"
// `<days>` is captured broadly; parseDayList validates it.
const REC_RE =
  /\b(every\s+other|bi-?weekly|every|weekly)\s+([a-z][a-z,\s&/.]*?)(?=\s+(?:at|by|due|from|on|through|until|starting|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)|[,.;]|$)/i;

export interface DetectionResult {
  rec: Recurrence | null;
  rest: string;
}

export function detectRecurrence(text: string): DetectionResult {
  const match = text.match(REC_RE);
  if (!match || match.index === undefined) return { rec: null, rest: text };

  const marker = match[1].toLowerCase();
  const interval: 1 | 2 = marker === 'every other' || marker.startsWith('bi') ? 2 : 1;

  const byweekday = parseDayList(match[2]);
  if (!byweekday || byweekday.length === 0) return { rec: null, rest: text };

  const rest = (text.slice(0, match.index) + text.slice(match.index + match[0].length))
    .replace(/\s+/g, ' ')
    .trim();

  return { rec: { interval, byweekday, until: null }, rest };
}

// ---------- expansion ----------

interface ExpandOptions {
  firstDueAt: Date; // UTC Date of the first occurrence
  rec: Recurrence;
  until: Date; // UTC Date; last allowed instant (inclusive)
  timezone: string;
  maxOccurrences?: number;
}

export function expandRecurrence({
  firstDueAt,
  rec,
  until,
  timezone,
  maxOccurrences = 200,
}: ExpandOptions): Date[] {
  if (until < firstDueAt) return [];

  // Extract wall-clock components of the first occurrence in the user's zone.
  const firstZoned = toZonedTime(firstDueAt, timezone);
  const hour = firstZoned.getHours();
  const minute = firstZoned.getMinutes();

  // Anchor: Sunday of the week containing firstZoned (local-calendar math).
  const anchorSunday = new Date(
    firstZoned.getFullYear(),
    firstZoned.getMonth(),
    firstZoned.getDate() - firstZoned.getDay()
  );

  const dates: Date[] = [];
  const weekCap = 60; // sanity cap (~14 months with interval=1)

  for (let w = 0; w < weekCap; w++) {
    if (w % rec.interval === 0) {
      for (const dow of rec.byweekday) {
        const candidate = new Date(
          anchorSunday.getFullYear(),
          anchorSunday.getMonth(),
          anchorSunday.getDate() + w * 7 + dow,
          hour,
          minute,
          0,
          0
        );
        // fromZonedTime treats `candidate`'s getXXX() as wall-clock in `timezone`.
        const utc = fromZonedTime(candidate, timezone);
        if (utc < firstDueAt) continue; // skip early days in the first week
        if (utc > until) return dates;
        dates.push(utc);
        if (dates.length >= maxOccurrences) return dates;
      }
    }
  }

  return dates;
}

// ---------- first-occurrence computation (used by parser when recurrence detected) ----------

interface FirstOccurrenceOptions {
  baseDate: Date; // earliest UTC instant a first occurrence can be at (ref or chrono-date)
  hour: number;
  minute: number;
  byweekday: number[];
  timezone: string;
}

export function firstOccurrenceFor({
  baseDate,
  hour,
  minute,
  byweekday,
  timezone,
}: FirstOccurrenceOptions): Date {
  const baseZoned = toZonedTime(baseDate, timezone);
  const baseY = baseZoned.getFullYear();
  const baseM = baseZoned.getMonth();
  const baseD = baseZoned.getDate();
  const baseDow = baseZoned.getDay();

  // Find the smallest offset s.t. (baseDow + offset) % 7 is in byweekday.
  let offset = 0;
  while (offset < 7 && !byweekday.includes((baseDow + offset) % 7)) offset++;

  const wall = new Date(baseY, baseM, baseD + offset, hour, minute, 0, 0);
  return fromZonedTime(wall, timezone);
}

// ---------- default "until" computation ----------

export function computeDefaultUntil(
  firstDueAt: Date,
  semesterEndDate: string | null,
  timezone: string
): Date {
  if (semesterEndDate) {
    // semester_end_date is an ISO YYYY-MM-DD; interpret as 23:59:59 that day in user's tz.
    const [y, m, d] = semesterEndDate.split('-').map(Number);
    const wall = new Date(y, m - 1, d, 23, 59, 59, 0);
    return fromZonedTime(wall, timezone);
  }
  // Fallback: 15 weeks after the first occurrence.
  return new Date(firstDueAt.getTime() + 15 * 7 * 24 * 60 * 60 * 1000);
}
