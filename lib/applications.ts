'use server';

// Server actions for applications. Lives outside `app/api/` so we don't
// touch existing API routes (per HANDOFF.md "Don't touch: app/api/**").
// Same auth + RLS guarantees apply since we use the SSR Supabase client.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  createApplicationSchema,
  updateApplicationSchema,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from '@/lib/schemas';
import {
  isTerminalStage,
  resolveStageForLane,
  shouldScheduleOnCreate,
  type DisplayStage,
} from '@/lib/applicationStage';
import { ensureUserPrefs } from '@/lib/prefs';
import {
  cancelApplicationReminders,
  scheduleApplicationReminders,
} from '@/lib/reminders';

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export async function createApplication(input: CreateApplicationInput): Promise<ActionResult<string>> {
  const parsed = createApplicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: user.id,
      company: parsed.data.company.trim(),
      role: parsed.data.role.trim(),
      stage: parsed.data.stage ?? 'applied',
      next_action: parsed.data.nextAction ?? null,
      next_action_at: parsed.data.nextActionAt ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  // Schedule next-action reminders (same infra as assignments, CLAUDE.md §6).
  // Skip when the created stage is already terminal, so a row created directly
  // in offer/rejected/withdrawn never arms reminders the update/move paths
  // would have suppressed (reminder symmetry).
  if (shouldScheduleOnCreate(parsed.data.stage ?? 'applied', parsed.data.nextActionAt)) {
    const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });
    void scheduleApplicationReminders({
      userId: user.id,
      applicationId: data.id,
      // shouldScheduleOnCreate guarantees a truthy next-action timestamp here.
      nextActionAtIso: parsed.data.nextActionAt!,
      reminderOffsetsHours: prefs.reminder_offsets_hours,
      appUrl: appUrl(),
    });
  }

  revalidatePath('/applications');
  revalidatePath('/');
  return { ok: true, data: data.id };
}

export async function updateApplication(
  id: string,
  input: UpdateApplicationInput
): Promise<ActionResult> {
  const parsed = updateApplicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const patch: Record<string, unknown> = {};
  if (parsed.data.company !== undefined) patch.company = parsed.data.company.trim();
  if (parsed.data.role !== undefined) patch.role = parsed.data.role.trim();
  if (parsed.data.stage !== undefined) patch.stage = parsed.data.stage;
  if (parsed.data.nextAction !== undefined) patch.next_action = parsed.data.nextAction;
  if (parsed.data.nextActionAt !== undefined) patch.next_action_at = parsed.data.nextActionAt;
  if (parsed.data.notes !== undefined) patch.notes = parsed.data.notes;

  const { data: updated, error } = await supabase
    .from('applications')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('stage, next_action_at')
    .single();

  if (error) return { ok: false, error: error.message };

  // Keep reminders in sync with the row we just wrote:
  //  - terminal stage or cleared next action → cancel outstanding reminders;
  //  - next_action_at set/changed → reschedule (idempotent full re-plan).
  if (isTerminalStage(updated.stage) || updated.next_action_at === null) {
    void cancelApplicationReminders(user.id, id);
  } else if (parsed.data.nextActionAt !== undefined && updated.next_action_at) {
    const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });
    void scheduleApplicationReminders({
      userId: user.id,
      applicationId: id,
      nextActionAtIso: updated.next_action_at,
      reminderOffsetsHours: prefs.reminder_offsets_hours,
      appUrl: appUrl(),
    });
  }

  revalidatePath('/applications');
  revalidatePath('/');
  return { ok: true };
}

/**
 * Kanban drag→drop helper. Translates a four-column display stage drop
 * back into the eight-stage schema, preserving sub-stage within "interview"
 * if the row was already in that lane.
 */
export async function moveApplicationToLane(
  id: string,
  targetLane: DisplayStage
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  // Read current stage so we can preserve interview sub-stage if applicable;
  // next_action_at lets us re-arm reminders when a card leaves a terminal lane.
  const { data: current, error: readErr } = await supabase
    .from('applications')
    .select('stage, next_action_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!current) return { ok: false, error: 'not_found' };

  const nextStage = resolveStageForLane(targetLane, current.stage);
  if (nextStage === current.stage) return { ok: true };

  const { error } = await supabase
    .from('applications')
    .update({ stage: nextStage })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };

  // Dragging into a terminal lane retires any pending next-action reminders;
  // dragging OUT of a terminal lane (e.g. rejected → interviewing) re-arms them
  // if the row still carries a next action, mirroring updateApplication's
  // reschedule branch. Normalize the PostgREST timestamp (+00:00) to clean ISO
  // Z so downstream QStash/fire-time math sees the same shape the zod path emits.
  if (isTerminalStage(nextStage)) {
    void cancelApplicationReminders(user.id, id);
  } else if (isTerminalStage(current.stage) && current.next_action_at) {
    const prefs = await ensureUserPrefs(supabase, { id: user.id, email: user.email });
    void scheduleApplicationReminders({
      userId: user.id,
      applicationId: id,
      nextActionAtIso: new Date(current.next_action_at).toISOString(),
      reminderOffsetsHours: prefs.reminder_offsets_hours,
      appUrl: appUrl(),
    });
  }

  revalidatePath('/applications');
  revalidatePath('/');
  return { ok: true };
}

export async function deleteApplication(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  // Cancel BEFORE deleting: reminders.application_id is ON DELETE CASCADE,
  // so after the delete the rows (and their qstash_message_id) are gone and
  // the scheduled QStash messages would fire uselessly later.
  await cancelApplicationReminders(user.id, id);

  const { error } = await supabase
    .from('applications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/applications');
  revalidatePath('/');
  return { ok: true };
}
