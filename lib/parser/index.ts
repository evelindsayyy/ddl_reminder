// lib/parser/index.ts
//
// Parses natural language assignment entries into structured data.
// Design: pure function, no external API calls, deterministic.
// Timezone-aware per CLAUDE.md §5.
// Recurrence detection per design spec §3.

import * as chrono from 'chrono-node';
import { getTimezoneOffset, toZonedTime } from 'date-fns-tz';
import {
  detectRecurrence,
  firstOccurrenceFor,
  type Recurrence,
} from '@/lib/recurrence';

// chrono-node's public `ParsedComponents` type hides the mutating API.
// At runtime, `result.start` is a `ParsingComponents` that exposes these.
// Cast via this narrow interface to keep strict TS happy without `any`.
interface MutableComponents {
  assign(key: 'hour' | 'minute' | 'timezoneOffset', value: number): void;
  isCertain(key: 'hour' | 'minute'): boolean;
  date(): Date;
}

export type AssignmentType =
  | 'homework' | 'lab' | 'exam' | 'essay'
  | 'project' | 'reading' | 'other';

export interface ParsedAssignment {
  courseCode: string | null;   // "STA 240" — match against user's courses
  title: string;
  type: AssignmentType;
  dueAt: Date | null;          // stored as UTC Date; convert for display
  tags: string[];
  confidence: number;          // 0–1, used by UI to warn on low confidence
  rawInput: string;
  recurrence: Recurrence | null;
}

// ----- 1. COURSE CODE ---------------------------------------
const COURSE_RE = /\b([A-Z]{2,8})\s?(\d{1,4}[A-Z]?)\b/;

function extractCourse(text: string): { code: string | null; rest: string } {
  const m = text.match(COURSE_RE);
  if (!m) return { code: null, rest: text };
  const code = `${m[1]} ${m[2]}`;
  const rest = text.replace(m[0], '').trim();
  return { code, rest };
}

// ----- 2. TYPE INFERENCE ------------------------------------
const TYPE_PATTERNS: [RegExp, AssignmentType][] = [
  [/\b(exam|midterm|final|test|quiz)\b/i,         'exam'],
  [/\b(lab\s?\d*|laboratory)\b/i,                 'lab'],
  [/\b(essay|paper|writeup|write-up)\b/i,         'essay'],
  [/\b(project|presentation|demo)\b/i,            'project'],
  [/\b(read(ing)?|chapter|ch\.?\s?\d+)\b/i,       'reading'],
  [/\b(hw\s?\d*|homework|problem\s?set|pset|ps\s?\d+|assignment)\b/i, 'homework'],
];

function inferType(text: string): AssignmentType {
  for (const [re, type] of TYPE_PATTERNS) {
    if (re.test(text)) return type;
  }
  return 'other';
}

// ----- 3. TAGS ----------------------------------------------
function extractTags(text: string): { tags: string[]; rest: string } {
  const tags: string[] = [];
  const rest = text.replace(/#([\w-]+)/g, (_, tag) => {
    tags.push(tag.toLowerCase());
    return '';
  }).trim();
  return { tags, rest };
}

// ----- 4. DATE (timezone-aware) -----------------------------
// Two-pass chrono approach per CLAUDE.md §5. If `recurrence` is set, the
// first-occurrence computation shifts the date forward to the first byweekday.
function extractDate(
  text: string,
  type: AssignmentType,
  referenceDate: Date,
  ianaZone: string,
  recurrence: Recurrence | null
): { dueAt: Date | null; rest: string } {
  const refOffsetMin = getTimezoneOffset(ianaZone, referenceDate) / 60000;

  const results = chrono.parse(
    text,
    { instant: referenceDate, timezone: refOffsetMin },
    { forwardDate: true }
  );

  const defaultHour = type === 'exam' ? 9 : 23;
  const defaultMinute = type === 'exam' ? 0 : 59;

  // No chrono match
  if (results.length === 0) {
    if (!recurrence) return { dueAt: null, rest: text };
    // Recurrence detected but no explicit date/time: first byweekday from now
    // at the default time.
    const firstDueAt = firstOccurrenceFor({
      baseDate: referenceDate,
      hour: defaultHour,
      minute: defaultMinute,
      byweekday: recurrence.byweekday,
      timezone: ianaZone,
    });
    return { dueAt: firstDueAt, rest: text };
  }

  const result = results[results.length - 1];
  const start = result.start as unknown as MutableComponents;

  if (!start.isCertain('hour')) {
    start.assign('hour', defaultHour);
    start.assign('minute', defaultMinute);
  }

  // Pass 2: recompute offset for the TARGET date (DST).
  const roughDate = start.date();
  const targetOffsetMin = getTimezoneOffset(ianaZone, roughDate) / 60000;
  start.assign('timezoneOffset', targetOffsetMin);

  const chronoDueAt = start.date();

  const restAfterChrono = (text.slice(0, result.index) + text.slice(result.index + result.text.length))
    .replace(/\b(due|by|on|at)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!recurrence) {
    return { dueAt: chronoDueAt, rest: restAfterChrono };
  }

  // Recurrence + chrono date: use chrono's time-of-day, but shift to first
  // matching byweekday on-or-after chrono's date.
  const chronoZoned = toZonedTime(chronoDueAt, ianaZone);
  const firstDueAt = firstOccurrenceFor({
    baseDate: chronoDueAt,
    hour: chronoZoned.getHours(),
    minute: chronoZoned.getMinutes(),
    byweekday: recurrence.byweekday,
    timezone: ianaZone,
  });
  return { dueAt: firstDueAt, rest: restAfterChrono };
}

// ----- 5. TITLE ---------------------------------------------
function cleanTitle(text: string): string {
  return text
    .replace(/\b(due|by|on|at|for|the|a|an)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ----- MAIN -------------------------------------------------
export function parseAssignment(
  input: string,
  opts: { referenceDate?: Date; timezone?: string } = {}
): ParsedAssignment {
  const referenceDate = opts.referenceDate ?? new Date();
  const timezone = opts.timezone ?? 'America/New_York';
  const raw = input.trim();

  const { code: courseCode, rest: afterCourse } = extractCourse(raw);
  const { tags, rest: afterTags } = extractTags(afterCourse);
  const { rec: recurrence, rest: afterRec } = detectRecurrence(afterTags);
  const type = inferType(afterRec);
  const { dueAt, rest: afterDate } = extractDate(afterRec, type, referenceDate, timezone, recurrence);
  const title = cleanTitle(afterDate) || 'Untitled';

  let confidence = 0.4;
  if (courseCode) confidence += 0.2;
  if (dueAt)      confidence += 0.3;
  if (type !== 'other') confidence += 0.1;
  // A recurrence match adds a small confidence boost because it's a strong
  // signal the user is specifying something structured.
  if (recurrence) confidence += 0.1;

  return {
    courseCode,
    title,
    type,
    dueAt,
    tags,
    confidence: Math.min(confidence, 1),
    rawInput: raw,
    recurrence,
  };
}
