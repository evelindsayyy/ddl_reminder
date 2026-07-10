// Run: npx tsx lib/applicationStage.test.ts
// Pure assertion suite (no DB) for the application stage↔lane mapping.

import {
  toDisplayStage,
  resolveStageForLane,
  isTerminalStage,
  INTERVIEW_STAGES,
  TERMINAL_STAGES,
  type DisplayStage,
} from './applicationStage';
import { APPLICATION_STAGES, type ApplicationStage } from './schemas';

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

// --- toDisplayStage: every schema stage maps to exactly one lane ---
eq('applied → applied', toDisplayStage('applied'), 'applied');
eq('offer → offer', toDisplayStage('offer'), 'offer');
eq('rejected → rejected', toDisplayStage('rejected'), 'rejected');
eq('withdrawn → rejected', toDisplayStage('withdrawn'), 'rejected');
eq('oa → interview', toDisplayStage('oa'), 'interview');
eq('phone_screen → interview', toDisplayStage('phone_screen'), 'interview');
eq('technical → interview', toDisplayStage('technical'), 'interview');
eq('onsite → interview', toDisplayStage('onsite'), 'interview');

// Every schema stage must produce a valid lane (no stage falls through).
const LANES: DisplayStage[] = ['applied', 'interview', 'offer', 'rejected'];
for (const stage of APPLICATION_STAGES) {
  assert(`${stage} maps to a known lane`, LANES.includes(toDisplayStage(stage)));
}

// --- INTERVIEW_STAGES is exactly the set that folds into "interview" ---
for (const stage of APPLICATION_STAGES) {
  const inInterviewLane = toDisplayStage(stage) === 'interview';
  const listed = INTERVIEW_STAGES.includes(stage);
  assert(`INTERVIEW_STAGES agrees with lane for ${stage}`, inInterviewLane === listed);
}

// --- resolveStageForLane: terminal lanes are unconditional ---
eq('→applied is unconditional', resolveStageForLane('applied', 'onsite'), 'applied');
eq('→offer is unconditional', resolveStageForLane('offer', 'oa'), 'offer');

// rejected lane preserves the distinct "withdrawn" terminal state...
eq('→rejected keeps withdrawn', resolveStageForLane('rejected', 'withdrawn'), 'withdrawn');
// ...but turns anything else into 'rejected'.
eq('→rejected from technical', resolveStageForLane('rejected', 'technical'), 'rejected');
eq('→rejected from applied', resolveStageForLane('rejected', 'applied'), 'rejected');

// interview lane preserves an existing interview sub-stage...
for (const sub of INTERVIEW_STAGES) {
  eq(`→interview keeps ${sub}`, resolveStageForLane('interview', sub), sub);
}
// ...and defaults to phone_screen when the row wasn't already interviewing.
eq('→interview from applied defaults', resolveStageForLane('interview', 'applied'), 'phone_screen');
eq('→interview from offer defaults', resolveStageForLane('interview', 'offer'), 'phone_screen');
eq('→interview from rejected defaults', resolveStageForLane('interview', 'rejected'), 'phone_screen');

// --- round-trip: a stage dropped onto its own lane stays put ---
for (const stage of APPLICATION_STAGES) {
  const lane = toDisplayStage(stage as ApplicationStage);
  const resolved = resolveStageForLane(lane, stage as ApplicationStage);
  // Resolving back into the same lane must keep the stage in that lane
  // (it may normalize, e.g. there's no single canonical "interview" stage).
  assert(
    `round-trip keeps ${stage} in lane ${lane}`,
    toDisplayStage(resolved) === lane
  );
}

// --- isTerminalStage: the three closed stages, and only those ---
assert('offer is terminal', isTerminalStage('offer'));
assert('rejected is terminal', isTerminalStage('rejected'));
assert('withdrawn is terminal', isTerminalStage('withdrawn'));
assert('applied is not terminal', !isTerminalStage('applied'));
for (const sub of INTERVIEW_STAGES) {
  assert(`${sub} is not terminal`, !isTerminalStage(sub));
}

// TERMINAL_STAGES is exactly {offer, rejected, withdrawn} — no drift.
eq('TERMINAL_STAGES has 3 entries', TERMINAL_STAGES.length, 3);
for (const stage of APPLICATION_STAGES) {
  assert(
    `isTerminalStage agrees with TERMINAL_STAGES for ${stage}`,
    isTerminalStage(stage) === TERMINAL_STAGES.includes(stage)
  );
}

// Invariant the comment promises: a stage is terminal iff its display lane is
// 'offer' or 'rejected'. Keeps the two representations from diverging.
for (const stage of APPLICATION_STAGES) {
  const lane = toDisplayStage(stage);
  const laneIsTerminal = lane === 'offer' || lane === 'rejected';
  assert(
    `terminal(${stage}) matches its lane being offer/rejected`,
    isTerminalStage(stage) === laneIsTerminal
  );
}

if (failed > 0) {
  console.error(`\napplicationStage: ${passed} passed, ${failed} failed`);
  process.exit(1);
}
console.log(`applicationStage: ${passed} passed`);
