// Assertion-based unit tests for lib/supabaseJoin.ts.
// Run: npx tsx lib/supabaseJoin.test.ts   (exits non-zero on any failure)
//
// firstRow normalizes PostgREST's "single object OR one-element array OR null"
// embedded-relationship shape to a single row. Every join read in the app
// (webhook, cron sweeper/digest, ics feed, dashboard, assignments list) relies
// on this collapse being correct; a subtle bug here silently drops course
// codes and user-prefs (wrong emails, no timezone) from reminders.

import { firstRow } from './supabaseJoin';

let passed = 0;
let failed = 0;
function eq<T>(name: string, actual: T, expected: T): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else {
    failed++;
    console.error(
      `  ✗ ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// ---- single object → itself ----
eq('single object → itself', firstRow({ code: 'STA 240' }), { code: 'STA 240' });

// ---- one-element array → the element ----
eq('one-element array → element', firstRow([{ code: 'STA 240' }]), { code: 'STA 240' });

// ---- multi-element array → the first element (PostgREST shouldn't send this
//      for a to-one, but be defensive) ----
eq(
  'multi-element array → first element',
  firstRow([{ code: 'A' }, { code: 'B' }]),
  { code: 'A' }
);

// ---- empty array → null (no related row) ----
eq('empty array → null', firstRow([]), null);

// ---- null / undefined → null (nullable FK, or relationship absent) ----
eq('null → null', firstRow(null), null);
eq('undefined → null', firstRow(undefined), null);

// ---- realistic user_prefs join shapes ----
const prefs = { email: 'grace@example.com', timezone: 'America/New_York' };
eq('prefs single object → itself', firstRow(prefs), prefs);
eq('prefs one-element array → element', firstRow([prefs]), prefs);
eq('prefs empty array → null', firstRow<typeof prefs>([]), null);

// ---- field access after normalization (the common call-site pattern) ----
eq('courseCode from array via ?.code', firstRow([{ code: 'CS 210' }])?.code ?? null, 'CS 210');
eq('courseCode from null via ?.code', firstRow<{ code: string }>(null)?.code ?? null, null);

// ---- falsy-but-present first element is preserved (not coerced to null) ----
eq('array with 0 → 0', firstRow([0]), 0);
eq('array with empty string → ""', firstRow(['']), '');

console.log(`\nsupabaseJoin.test.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
