// Run: npx tsx lib/errorCopy.test.ts
// Pure assertion suite (no DB) for the raw-code -> human-copy map.

import { humanizeError } from './errorCopy';

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function eq(label: string, actual: unknown, expected: unknown): void {
  assert(`${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`, actual === expected);
}

// --- exact-match codes: every inventoried code maps to a distinct, non-raw sentence ---
const EXACT_CASES: Record<string, string> = {
  move_failed: "Couldn't move it — check your connection and try again.",
  unauthenticated: 'Your session expired — sign in again.',
  invalid_input: "That didn't validate — check the fields and try again.",
  not_found: 'That item no longer exists — it may have been deleted elsewhere.',
  delete_failed: "Couldn't delete it — check your connection and try again.",
  save_failed: "Couldn't save your changes — check your connection and try again.",
  create_failed: "Couldn't create that — check your connection and try again.",
  update_failed: "Couldn't update it — check your connection and try again.",
  sync_failed: "Sync didn't go through — try again in a moment.",
  rotate_failed: "Couldn't generate a new token — try again in a moment.",
  copy_failed: "Couldn't copy that — try again.",
  parse_failed: "Couldn't read that — check the format and try again.",
};

for (const [code, expected] of Object.entries(EXACT_CASES)) {
  eq(`humanizeError(${code})`, humanizeError(code), expected);
}

// No exact-match code ever returns itself or another raw code verbatim.
for (const code of Object.keys(EXACT_CASES)) {
  assert(`humanizeError(${code}) is not the raw code`, humanizeError(code) !== code);
}

// --- regex fallback shape 1: `${VERB} ${status}` with an uppercase HTTP verb ---
const HTTP_VERB_CASES = ['PATCH 500', 'DELETE 500', 'POST 404', 'GET 403'];
for (const code of HTTP_VERB_CASES) {
  eq(`humanizeError(${JSON.stringify(code)})`, humanizeError(code), `The server said no (${code}) — try again in a moment.`);
}

// --- regex fallback shape 2: bare trailing 3-digit status (lowercase custom verbs too) ---
const TRAILING_STATUS_CASES = ['save 500', 'sync 500', 'create 500', 'update 500', 'parse 400'];
for (const code of TRAILING_STATUS_CASES) {
  eq(`humanizeError(${JSON.stringify(code)})`, humanizeError(code), `The server said no (${code}) — try again in a moment.`);
}

// --- never returns a raw code bare: an unmapped code that merely LOOKS like a status
// string still gets wrapped in the "server said no" sentence, never emitted alone ---
eq('humanizeError("PATCH 500") is wrapped, not bare', humanizeError('PATCH 500'), 'The server said no (PATCH 500) — try again in a moment.');
assert('humanizeError("PATCH 500") !== "PATCH 500"', humanizeError('PATCH 500') !== 'PATCH 500');

// --- null / undefined / empty string -> generic sentence ---
const GENERIC = 'Something went wrong — try again.';
eq('humanizeError(null)', humanizeError(null), GENERIC);
eq('humanizeError(undefined)', humanizeError(undefined), GENERIC);
eq('humanizeError("")', humanizeError(''), GENERIC);

// --- unmapped gibberish (does not look like an HTTP-status string) -> generic sentence ---
const GIBBERISH_CASES = ['asdfghjkl', 'totally_unknown_code', 'xyz123abc', 'not-a-real-code!', '   '];
for (const code of GIBBERISH_CASES) {
  eq(`humanizeError(${JSON.stringify(code)})`, humanizeError(code), GENERIC);
}

// Gibberish is never echoed back bare or wrapped — it always collapses to the generic sentence.
for (const code of GIBBERISH_CASES) {
  assert(`humanizeError(${JSON.stringify(code)}) does not contain the raw code`, !humanizeError(code).includes(code.trim()) || code.trim() === '');
}

if (failed > 0) {
  console.error(`\nerrorCopy: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`errorCopy: ${passed} passed`);
