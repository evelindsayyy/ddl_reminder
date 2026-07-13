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
    patch.nextActionAt = current.next_action_at;
  }
  return patch;
}
