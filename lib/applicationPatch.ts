import { isTerminalStage } from '@/lib/applicationStage';
import type { ApplicationStage, UpdateApplicationInput } from '@/lib/schemas';

// Patch for a stage change. updateApplication only (re)schedules reminders when
// nextActionAt is present in the payload — so a terminal→active move must carry
// the existing next_action_at or the previously-cancelled reminders stay dead.
export function buildStageChangePatch(
  current: { stage: ApplicationStage; next_action_at: string | null },
  nextStage: ApplicationStage
): UpdateApplicationInput {
  const patch: UpdateApplicationInput = { stage: nextStage };
  const reactivating = isTerminalStage(current.stage) && !isTerminalStage(nextStage);
  if (reactivating && current.next_action_at) {
    // PostgREST serializes timestamptz with an offset (…+00:00), which
    // updateApplicationSchema's z.string().datetime() rejects (Z-only). Normalize
    // to a Z-suffixed ISO instant so the reschedule patch validates against real data.
    patch.nextActionAt = new Date(current.next_action_at).toISOString();
  }
  return patch;
}
