import type { ApplicationStage } from './schemas';

// The schema has eight stages (see APPLICATION_STAGES in lib/schemas.ts):
//   'applied','oa','phone_screen','technical','onsite','offer','rejected','withdrawn'
// The kanban / funnel / timeline views collapse them to four display lanes:
//   applied · interview · offer · rejected
export type DisplayStage = 'applied' | 'interview' | 'offer' | 'rejected';

// The four schema stages that all fold into the single "interview" lane.
export const INTERVIEW_STAGES: ApplicationStage[] = [
  'oa',
  'phone_screen',
  'technical',
  'onsite',
];

// The terminal stages — once an application reaches one of these it is closed,
// so its next-action reminders should be cancelled and none scheduled. `offer`
// and `rejected` are outcomes; `withdrawn` is a self-exit. Equivalently, these
// are exactly the stages whose display lane is 'offer' or 'rejected' (the test
// asserts this invariant against toDisplayStage).
export const TERMINAL_STAGES: ApplicationStage[] = ['offer', 'rejected', 'withdrawn'];

// Is this stage terminal (closed — no further reminders)? Accepts a raw
// string so callers holding a DB-joined `stage: string` (the reminder webhook
// and daily cron sweeper) can use it without a cast; unknown values are simply
// non-terminal.
export function isTerminalStage(stage: string): boolean {
  return (TERMINAL_STAGES as readonly string[]).includes(stage);
}

// Forward map: which display lane does a schema stage belong to?
export function toDisplayStage(stage: ApplicationStage): DisplayStage {
  if (stage === 'applied') return 'applied';
  if (stage === 'offer') return 'offer';
  if (stage === 'rejected' || stage === 'withdrawn') return 'rejected';
  return 'interview'; // oa, phone_screen, technical, onsite
}

/**
 * Reverse map for kanban drag→drop: translate a four-lane drop target back
 * into a concrete schema stage, given the row's current stage.
 *
 * Sub-stage is preserved where it carries information the lane cannot:
 *   - "interview" keeps the existing interview sub-stage (oa / phone_screen /
 *     technical / onsite); otherwise it defaults to 'phone_screen'.
 *   - "rejected" keeps 'withdrawn' (a distinct terminal state) rather than
 *     overwriting it with 'rejected'.
 */
export function resolveStageForLane(
  targetLane: DisplayStage,
  currentStage: ApplicationStage
): ApplicationStage {
  if (targetLane === 'applied') return 'applied';
  if (targetLane === 'offer') return 'offer';
  if (targetLane === 'rejected') {
    return currentStage === 'withdrawn' ? 'withdrawn' : 'rejected';
  }
  // targetLane === 'interview'
  return INTERVIEW_STAGES.includes(currentStage) ? currentStage : 'phone_screen';
}
