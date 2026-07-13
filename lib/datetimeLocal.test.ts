// Run: npx tsx lib/datetimeLocal.test.ts
// Pure assertion suite (no DB) for the nullable ISO <-> datetime-local conversion.

import { isoToDatetimeLocal, datetimeLocalToIso } from './datetimeLocal';

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

// roundtrip: datetimeLocalToIso('2026-03-05T14:30') parses in the local zone;
// isoToDatetimeLocal of that ISO returns '2026-03-05T14:30'
eq('roundtrip local wall time', isoToDatetimeLocal(datetimeLocalToIso('2026-03-05T14:30')), '2026-03-05T14:30');

eq('null iso -> empty string', isoToDatetimeLocal(null), '');
eq('empty local -> null', datetimeLocalToIso(''), null);
eq('whitespace local -> null', datetimeLocalToIso('   '), null);

// zero-padding: single-digit month/day/hour/minute all padded
const iso = datetimeLocalToIso('2026-01-02T03:04');
eq('padded roundtrip', isoToDatetimeLocal(iso), '2026-01-02T03:04');

// output shape is ISO-UTC with Z
assert('iso is utc-z', typeof iso === 'string' && iso.endsWith('Z'));

if (failed > 0) {
  console.error(`\ndatetimeLocal: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`datetimeLocal: ${passed} passed`);
