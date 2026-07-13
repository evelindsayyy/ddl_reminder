// Assertion-based unit tests for computeReminderFireTimes (lib/reminderSchedule.ts).
// Run: npx tsx lib/reminderSchedule.test.ts   (exits non-zero on any failure)
//
// This is the timing math behind every reminder. Getting it wrong means a
// deadline slips silently, so the contract is worth pinning: fire_at =
// due_at - offset_hours, past offsets skipped, bad input yields nothing.

import {
  computeReminderFireTimes,
  reminderFireAtIso,
  reminderFireAtMs,
} from './reminderSchedule';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const HOUR = 60 * 60 * 1000;
// Fixed reference instant so the suite is deterministic.
const now = new Date('2026-04-10T12:00:00.000Z').getTime();
const defaults = [168, 48, 12]; // 1 week, 2 days, 12 hours

// --- all offsets in the future -----------------------------------------
{
  // Due in 10 days → every default offset fires before the due date and
  // after `now`, so all three are scheduled.
  const due = new Date(now + 10 * 24 * HOUR).toISOString();
  const plan = computeReminderFireTimes(due, defaults, now);
  check('all three default offsets scheduled', plan.length === 3, `got ${plan.length}`);
  check('offsets preserved in input order',
    plan.map((p) => p.offsetHours).join(',') === '168,48,12',
    plan.map((p) => p.offsetHours).join(','));
  const dueMs = new Date(due).getTime();
  check('fire_at = due - 168h',
    plan[0].fireAtMs === dueMs - 168 * HOUR,
    `${plan[0].fireAtMs} vs ${dueMs - 168 * HOUR}`);
  check('fireAtIso matches fireAtMs',
    plan[0].fireAtIso === new Date(dueMs - 168 * HOUR).toISOString());
}

// --- "due tomorrow" drops the far-out reminders (§6 example) ------------
{
  // Due in 24h: the 168h and 48h offsets land in the past and are skipped;
  // only the 12h offset (fires 12h from now) survives.
  const due = new Date(now + 24 * HOUR).toISOString();
  const plan = computeReminderFireTimes(due, defaults, now);
  check('only the 12h reminder survives for a next-day due', plan.length === 1, `got ${plan.length}`);
  check('surviving offset is 12h', plan[0]?.offsetHours === 12, `got ${plan[0]?.offsetHours}`);
  check('12h reminder fires 12h from now', plan[0]?.fireAtMs === now + 12 * HOUR);
}

// --- fire_at exactly at `now` is skipped (strictly-future only) ---------
{
  // Due in exactly 12h with a 12h offset → fireAt === now → skipped.
  const due = new Date(now + 12 * HOUR).toISOString();
  const plan = computeReminderFireTimes(due, [12], now);
  check('fireAt == now is skipped (boundary)', plan.length === 0, `got ${plan.length}`);
}

// --- everything in the past → empty ------------------------------------
{
  const due = new Date(now - HOUR).toISOString(); // already overdue
  const plan = computeReminderFireTimes(due, defaults, now);
  check('overdue assignment schedules nothing', plan.length === 0, `got ${plan.length}`);
}

// --- empty offsets → empty ---------------------------------------------
{
  const due = new Date(now + 10 * 24 * HOUR).toISOString();
  const plan = computeReminderFireTimes(due, [], now);
  check('no offsets → no reminders', plan.length === 0, `got ${plan.length}`);
}

// --- invalid due date → empty, never throws (the latent-bug guard) -----
{
  let threw = false;
  let plan: ReturnType<typeof computeReminderFireTimes> = [];
  try {
    plan = computeReminderFireTimes('not-a-date', defaults, now);
  } catch {
    threw = true;
  }
  check('invalid dueAtIso does not throw', !threw);
  check('invalid dueAtIso yields no reminders', plan.length === 0, `got ${plan.length}`);
}

// --- notBefore (seconds) derivation is a clean floor of fireAtMs -------
{
  const due = new Date(now + 5 * 24 * HOUR).toISOString();
  const plan = computeReminderFireTimes(due, [48], now);
  const notBefore = Math.floor(plan[0].fireAtMs / 1000);
  check('notBefore is integer seconds', Number.isInteger(notBefore));
  check('notBefore * 1000 <= fireAtMs', notBefore * 1000 <= plan[0].fireAtMs);
}

// --- reminderFireAtMs: pure anchor − offset arithmetic ------------------
{
  const anchor = new Date(now + 5 * 24 * HOUR).toISOString();
  const anchorMs = new Date(anchor).getTime();
  check('reminderFireAtMs = anchor - 48h',
    reminderFireAtMs(anchor, 48) === anchorMs - 48 * HOUR,
    `${reminderFireAtMs(anchor, 48)} vs ${anchorMs - 48 * HOUR}`);
  check('reminderFireAtMs(0h) is the anchor itself',
    reminderFireAtMs(anchor, 0) === anchorMs);
  check('reminderFireAtMs on a bad anchor is NaN',
    Number.isNaN(reminderFireAtMs('not-a-date', 12)));
}

// --- reminderFireAtIso: guarded ISO, null on bad anchor -----------------
{
  const anchor = new Date(now + 3 * 24 * HOUR).toISOString();
  check('reminderFireAtIso matches new Date(fireAtMs).toISOString()',
    reminderFireAtIso(anchor, 12) ===
      new Date(new Date(anchor).getTime() - 12 * HOUR).toISOString());
  check('reminderFireAtIso returns null (never throws) on a bad anchor',
    reminderFireAtIso('not-a-date', 12) === null);
}

// --- the scheduler and the webhook must agree byte-for-byte -------------
{
  // computeReminderFireTimes stamps `reminders.fire_at`; the webhook later
  // recomputes it via reminderFireAtIso to target that exact row. If these
  // two ever diverge the "mark sent" update matches nothing, so pin equality.
  const due = new Date(now + 10 * 24 * HOUR).toISOString();
  const plan = computeReminderFireTimes(due, defaults, now);
  const agree = plan.every((p) => reminderFireAtIso(due, p.offsetHours) === p.fireAtIso);
  check('reminderFireAtIso reproduces every scheduled fire_at exactly', agree);
}

console.log(`\nreminderSchedule.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
