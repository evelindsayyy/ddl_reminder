// Assertion-based unit tests for lib/email.ts (the pure compose helpers).
// Run: npx tsx lib/email.test.ts   (exits non-zero on any failure)
//
// Covers the two email composers (reminderEmailFor, digestEmailFor) and
// isEmailConfigured. Focus areas:
//   - subject lines are timezone-independent → asserted exactly;
//   - the days-vs-hours boundary in reminders (>=24h rounds to days) and the
//     Math.round behavior around it;
//   - item-count pluralization in the digest;
//   - HTML escaping of user-controlled title/courseCode (an XSS-relevant path,
//     since these strings flow straight into the email HTML body). The `text`
//     and `subject` variants are plain text and intentionally NOT escaped.
// Timestamps in text/html render in the given timezone (CLAUDE.md §5); those
// are asserted via substring checks, space-agnostic, to survive ICU changes.

import { reminderEmailFor, digestEmailFor, isEmailConfigured } from './email';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) passed++;
  else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: string, expected: string): void {
  check(name, actual === expected, `expected "${expected}", got "${actual}"`);
}
function has(name: string, haystack: string, needle: string): void {
  check(name, haystack.includes(needle), `"${haystack}" missing "${needle}"`);
}
function lacks(name: string, haystack: string, needle: string): void {
  check(name, !haystack.includes(needle), `"${haystack}" unexpectedly contains "${needle}"`);
}

const TZ = 'America/New_York';
const DUE = '2026-05-08T03:59:00.000Z'; // Fri 11:59 PM EDT in Durham

// ================= reminderEmailFor: subjects (tz-independent) =================

// courseCode present → "[CODE] " prefix; >=24h → "due in N days" (rounded).
const r2d = reminderEmailFor({
  appUrl: 'https://app.test',
  title: 'HW5',
  courseCode: 'STA 240',
  dueAtIso: DUE,
  timezone: TZ,
  hoursUntilDue: 48,
});
eq('reminder subject: tag + 2 days', r2d.subject, '[STA 240] HW5 — due in 2 days');

// no courseCode → no tag; <24h → "due in N hours".
const r12h = reminderEmailFor({
  appUrl: 'https://app.test',
  title: 'Cisco interview',
  courseCode: null,
  dueAtIso: DUE,
  timezone: TZ,
  hoursUntilDue: 12,
});
eq('reminder subject: no tag + 12 hours', r12h.subject, 'Cisco interview — due in 12 hours');
lacks('reminder subject: no leading bracket when course null', r12h.subject, '[');

// Boundary + rounding of the days branch (Math.round(h/24)).
const boundary = (h: number): string =>
  reminderEmailFor({
    appUrl: 'https://app.test',
    title: 'X',
    courseCode: null,
    dueAtIso: DUE,
    timezone: TZ,
    hoursUntilDue: h,
  }).subject;
eq('reminder: 24h boundary → 1 days', boundary(24), 'X — due in 1 days');
eq('reminder: 25h → rounds to 1 days', boundary(25), 'X — due in 1 days');
eq('reminder: 36h → rounds to 2 days', boundary(36), 'X — due in 2 days');
eq('reminder: 23h → 23 hours (hours branch)', boundary(23), 'X — due in 23 hours');
eq('reminder: 1h → 1 hours', boundary(1), 'X — due in 1 hours');

// text + html carry the app link and the tag; html renders a formatted time.
has('reminder text: app link', r2d.text, 'https://app.test/assignments');
has('reminder text: tag', r2d.text, '[STA 240] HW5');
has('reminder html: app link', r2d.html, 'https://app.test/assignments');
has('reminder html: formatted date in tz (May 7 EDT)', r2d.html, 'May 7');

// ---- HTML escaping (user-controlled title/courseCode → HTML body) ----
const xss = reminderEmailFor({
  appUrl: 'https://app.test',
  title: `A & B <script>alert('x')</script> "q"`,
  courseCode: 'C<D>',
  dueAtIso: DUE,
  timezone: TZ,
  hoursUntilDue: 5,
});
has('reminder html: escapes &', xss.html, '&amp;');
has('reminder html: escapes <', xss.html, '&lt;script&gt;');
has('reminder html: escapes "', xss.html, '&quot;');
has('reminder html: escapes \'', xss.html, '&#39;');
lacks('reminder html: no raw <script> tag', xss.html, '<script>');
lacks('reminder html: no raw course angle bracket', xss.html, 'C<D>');
// Plain-text variant is intentionally unescaped (not rendered as markup).
has('reminder text: raw (unescaped) title', xss.text, '<script>');

// ================= digestEmailFor =================

const items = [
  { title: 'HW5', courseCode: 'STA 240', dueAtIso: DUE },
  { title: 'Paper', courseCode: null, dueAtIso: DUE },
];
const digest = digestEmailFor({
  appUrl: 'https://app.test',
  todayLabel: 'Mon May 4',
  todayItems: items,
  timezone: TZ,
});
eq('digest subject: plural (2 items)', digest.subject, 'Today: 2 items — Mon May 4');
has('digest text: bullet + tag for item 1', digest.text, '· [STA 240] HW5 — ');
has('digest text: bullet for untagged item 2', digest.text, '· Paper — ');
has('digest text: app link (root)', digest.text, 'https://app.test/');
has('digest html: list item for tagged entry', digest.html, '[STA 240] HW5');

// Singular vs empty pluralization.
const one = digestEmailFor({
  appUrl: 'https://app.test',
  todayLabel: 'Tue',
  todayItems: [{ title: 'Solo', courseCode: null, dueAtIso: DUE }],
  timezone: TZ,
});
eq('digest subject: singular (1 item)', one.subject, 'Today: 1 item — Tue');

const none = digestEmailFor({
  appUrl: 'https://app.test',
  todayLabel: 'Wed',
  todayItems: [],
  timezone: TZ,
});
eq('digest subject: zero items is plural', none.subject, 'Today: 0 items — Wed');
has('digest html: empty list renders no <li>', none.html, '<ul');
lacks('digest html: no list items when empty', none.html, '<li>');

// digest HTML escaping of user-controlled fields.
const digestXss = digestEmailFor({
  appUrl: 'https://app.test',
  todayLabel: 'Thu',
  todayItems: [{ title: '<b>x</b> & y', courseCode: 'A<B>', dueAtIso: DUE }],
  timezone: TZ,
});
has('digest html: escapes title', digestXss.html, '&lt;b&gt;');
has('digest html: escapes &', digestXss.html, '&amp;');
lacks('digest html: no raw <b> tag', digestXss.html, '<b>x</b>');

// ================= isEmailConfigured (env-driven) =================

const origKey = process.env.RESEND_API_KEY;
const origFrom = process.env.FROM_EMAIL;
process.env.RESEND_API_KEY = 'test-key';
process.env.FROM_EMAIL = 'reminders@test.dev';
check('isEmailConfigured: true when both env vars set', isEmailConfigured() === true);
delete process.env.FROM_EMAIL;
check('isEmailConfigured: false when FROM_EMAIL missing', isEmailConfigured() === false);
delete process.env.RESEND_API_KEY;
check('isEmailConfigured: false when RESEND_API_KEY missing', isEmailConfigured() === false);
// Restore original env so we don't leak state into other suites.
if (origKey === undefined) delete process.env.RESEND_API_KEY;
else process.env.RESEND_API_KEY = origKey;
if (origFrom === undefined) delete process.env.FROM_EMAIL;
else process.env.FROM_EMAIL = origFrom;

console.log(`\nemail.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
