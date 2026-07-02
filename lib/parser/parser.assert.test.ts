// Assertion-based unit tests for parseAssignment (lib/parser/index.ts).
// Run: npx tsx lib/parser/parser.assert.test.ts   (exits non-zero on any failure)
//
// This pins the CLAUDE.md §7 "must-pass" contract plus the recurrence cases so a
// parser regression fails CI instead of shipping silently. The reference date is
// fixed (Thu Apr 23, 2026, America/New_York) so every relative expression
// ("Friday", "tomorrow", "every other Wednesday") resolves deterministically.
//
// parser.test.ts (the print-only smoke test) stays for eyeballing outputs;
// this file is the machine-checked companion wired into `npm test`.

import { parseAssignment } from './index';
import type { Recurrence } from '@/lib/recurrence';

const REF = new Date('2026-04-23T10:00:00-04:00');
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

// Local wall-clock parts in TZ, so we can assert time defaults (23:59 / 09:00)
// and calendar dates independent of the server's zone (UTC on Vercel).
function localParts(d: Date): { month: string; day: string; weekday: string; hour: string; minute: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  // hour12:false renders midnight as "24" in some engines; normalize to "00".
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return { month: parts.month, day: parts.day, weekday: parts.weekday, hour, minute: parts.minute };
}

function recEq(a: Recurrence | null, b: Recurrence | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.interval === b.interval &&
    a.until === b.until &&
    a.byweekday.length === b.byweekday.length &&
    a.byweekday.every((v, i) => v === b.byweekday[i])
  );
}

function parse(input: string) {
  return parseAssignment(input, { referenceDate: REF, timezone: TZ });
}

// ── CLAUDE.md §7 must-pass cases ──────────────────────────────────────────
{
  const r = parse('STA 240 HW5 due Friday 11:59pm');
  check('§7 STA240 course', r.courseCode === 'STA 240', String(r.courseCode));
  check('§7 STA240 title', r.title === 'HW5', r.title);
  check('§7 STA240 type', r.type === 'homework', r.type);
  const t = localParts(r.dueAt!);
  check('§7 STA240 Fri 23:59', t.weekday === 'Fri' && t.hour === '23' && t.minute === '59', JSON.stringify(t));
  check('§7 STA240 no tags', r.tags.length === 0);
  check('§7 STA240 no recurrence', r.recurrence === null);
}
{
  const r = parse('COMPSCI 210D lab 6 due tomorrow');
  check('§7 CS210D course', r.courseCode === 'COMPSCI 210D', String(r.courseCode));
  check('§7 CS210D type lab', r.type === 'lab', r.type);
  const t = localParts(r.dueAt!);
  check('§7 CS210D Fri 23:59 (tomorrow)', t.weekday === 'Fri' && t.hour === '23' && t.minute === '59', JSON.stringify(t));
}
{
  const r = parse('ENGLISH 208S Dark Knight paper due May 1');
  check('§7 ENG208S course', r.courseCode === 'ENGLISH 208S', String(r.courseCode));
  check('§7 ENG208S type essay', r.type === 'essay', r.type);
  const t = localParts(r.dueAt!);
  check('§7 ENG208S May 1 23:59', t.month === 'May' && t.day === '1' && t.hour === '23' && t.minute === '59', JSON.stringify(t));
}
{
  const r = parse('STA 199 final exam May 5');
  check('§7 STA199 course', r.courseCode === 'STA 199', String(r.courseCode));
  check('§7 STA199 type exam', r.type === 'exam', r.type);
  const t = localParts(r.dueAt!);
  check('§7 STA199 exam May 5 09:00 default', t.month === 'May' && t.day === '5' && t.hour === '09' && t.minute === '00', JSON.stringify(t));
}
{
  const r = parse('Cisco interview Thursday 2pm');
  check('§7 Cisco no course', r.courseCode === null, String(r.courseCode));
  check('§7 Cisco type other', r.type === 'other', r.type);
  const t = localParts(r.dueAt!);
  check('§7 Cisco Thu 14:00', t.weekday === 'Thu' && t.hour === '14' && t.minute === '00', JSON.stringify(t));
}
{
  const r = parse('Read ch 7 of Dracula by Sunday');
  check('§7 Dracula no course', r.courseCode === null, String(r.courseCode));
  check('§7 Dracula type reading', r.type === 'reading', r.type);
}
{
  const r = parse('HW due fri');
  check('§7 HWfri type homework', r.type === 'homework', r.type);
  const t = localParts(r.dueAt!);
  check('§7 HWfri Fri 23:59', t.weekday === 'Fri' && t.hour === '23' && t.minute === '59', JSON.stringify(t));
}
{
  const r = parse('project presentation next monday 3pm #group');
  check('§7 project type', r.type === 'project', r.type);
  check('§7 project tag group', r.tags.length === 1 && r.tags[0] === 'group', JSON.stringify(r.tags));
}
{
  const r = parse('groceries');
  check('§7 groceries no date', r.dueAt === null, String(r.dueAt));
  check('§7 groceries confidence 0.4', Math.abs(r.confidence - 0.4) < 1e-9, String(r.confidence));
  check('§7 groceries low-confidence banner (<0.6)', r.confidence < 0.6, String(r.confidence));
}

// ── DST edge: December date must resolve to EST, not EDT ───────────────────
{
  const r = parse('project due Dec 15 11:59pm');
  const t = localParts(r.dueAt!);
  check('DST Dec 15 23:59 local', t.month === 'Dec' && t.day === '15' && t.hour === '23' && t.minute === '59', JSON.stringify(t));
}

// ── Recurrence cases (weekday index: Sun=0 … Sat=6) ────────────────────────
{
  const r = parse('COMPSCI 372 homework every Tuesday 11:59pm');
  check('rec weekly Tuesday', recEq(r.recurrence, { interval: 1, byweekday: [2], until: null }), JSON.stringify(r.recurrence));
}
{
  const r = parse('STA 210 pset every other Wednesday 23:59');
  check('rec biweekly Wednesday', recEq(r.recurrence, { interval: 2, byweekday: [3], until: null }), JSON.stringify(r.recurrence));
}
{
  const r = parse('Spanish 101 reflection every MWF');
  check('rec MWF', recEq(r.recurrence, { interval: 1, byweekday: [1, 3, 5], until: null }), JSON.stringify(r.recurrence));
}
{
  const r = parse('COMPSCI 210 lab every Tue and Thu 11:59pm');
  check('rec Tue+Thu', recEq(r.recurrence, { interval: 1, byweekday: [2, 4], until: null }), JSON.stringify(r.recurrence));
}

console.log(`\nparser.assert.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
