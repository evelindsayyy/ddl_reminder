'use server';

// Server actions for applications. Lives outside `app/api/` so we don't
// touch existing API routes (per HANDOFF.md "Don't touch: app/api/**").
// Same auth + RLS guarantees apply since we use the SSR Supabase client.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  createApplicationSchema,
  updateApplicationSchema,
  type ApplicationStage,
  type CreateApplicationInput,
  type UpdateApplicationInput,
} from '@/lib/schemas';
import type { DisplayStage } from '@/components/applications/ApplicationCard';

interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export async function createApplication(input: CreateApplicationInput): Promise<ActionResult<string>> {
  const parsed = createApplicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  const supabase = createClient();
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

  const supabase = createClient();
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

  const { error } = await supabase
    .from('applications')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  // Read current stage so we can preserve interview sub-stage if applicable.
  const { data: current, error: readErr } = await supabase
    .from('applications')
    .select('stage')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!current) return { ok: false, error: 'not_found' };

  const currentStage = current.stage as ApplicationStage;
  const interviewStages: ApplicationStage[] = ['oa', 'phone_screen', 'technical', 'onsite'];

  let nextStage: ApplicationStage;
  if (targetLane === 'applied') nextStage = 'applied';
  else if (targetLane === 'offer') nextStage = 'offer';
  else if (targetLane === 'rejected')
    nextStage = currentStage === 'withdrawn' ? 'withdrawn' : 'rejected';
  else
    nextStage = interviewStages.includes(currentStage) ? currentStage : 'phone_screen';

  if (nextStage === currentStage) return { ok: true };

  const { error } = await supabase
    .from('applications')
    .update({ stage: nextStage })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/applications');
  revalidatePath('/');
  return { ok: true };
}

export async function deleteApplication(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

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
