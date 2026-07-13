// Run: npx tsx lib/applicationPatch.test.ts
// Pure assertion suite (no DB) for buildStageChangePatch — pins the
// terminal->active reactivation edge (see lib/applicationPatch.ts).

import { buildStageChangePatch } from './applicationPatch';

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

// Object-valued cases: adapt eq() locally to JSON.stringify comparison
// (the repo's shared eq() convention is `actual === expected`, which only
// works for primitives; patches here are plain objects).
function eq(label: string, actual: unknown, expected: unknown): void {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  assert(`${label} (got ${actualStr}, want ${expectedStr})`, actualStr === expectedStr);
}

eq(
  'plain stage move',
  buildStageChangePatch({ stage: 'applied', next_action_at: null }, 'oa'),
  { stage: 'oa' }
);

eq(
  'into terminal: no nextActionAt',
  buildStageChangePatch({ stage: 'onsite', next_action_at: '2026-08-01T12:00:00.000Z' }, 'rejected'),
  { stage: 'rejected' }
);

eq(
  'terminal -> active with next_action_at: carries reschedule',
  buildStageChangePatch({ stage: 'rejected', next_action_at: '2026-08-01T12:00:00.000Z' }, 'phone_screen'),
  { stage: 'phone_screen', nextActionAt: '2026-08-01T12:00:00.000Z' }
);

// Regression: PostgREST returns timestamptz with an offset (+00:00), which
// z.string().datetime() rejects. The helper must normalize it to a Z instant.
eq(
  'terminal -> active with PostgREST offset timestamp: normalizes to Z',
  buildStageChangePatch({ stage: 'rejected', next_action_at: '2026-08-01T12:00:00+00:00' }, 'phone_screen'),
  { stage: 'phone_screen', nextActionAt: '2026-08-01T12:00:00.000Z' }
);

eq(
  'terminal -> active with next_action_at: Z input stays Z output',
  buildStageChangePatch({ stage: 'rejected', next_action_at: '2026-08-01T12:00:00.000Z' }, 'phone_screen'),
  { stage: 'phone_screen', nextActionAt: '2026-08-01T12:00:00.000Z' }
);

eq(
  'terminal -> active without next_action_at: plain',
  buildStageChangePatch({ stage: 'withdrawn', next_action_at: null }, 'applied'),
  { stage: 'applied' }
);

eq(
  'terminal -> terminal: plain',
  buildStageChangePatch({ stage: 'rejected', next_action_at: '2026-08-01T12:00:00.000Z' }, 'withdrawn'),
  { stage: 'withdrawn' }
);

if (failed > 0) {
  console.error(`\napplicationPatch: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`applicationPatch: ${passed} passed`);
