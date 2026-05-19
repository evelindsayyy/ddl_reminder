import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

export interface UserPrefs {
  user_id: string;
  email: string;
  reminder_offsets_hours: number[];
  timezone: string;
  semester_end_date: string | null;
  canvas_ics_url: string | null;
  gradescope_sync_token: string | null;
  ics_token: string | null;
}

const PREFS_COLUMNS =
  'user_id, email, reminder_offsets_hours, timezone, semester_end_date, canvas_ics_url, gradescope_sync_token, ics_token';

/**
 * Ensure a `user_prefs` row exists for the given user. Called on first
 * authenticated access; safe to call repeatedly.
 *
 * `ics_token` is generated on first creation so the user always has a
 * stable calendar feed URL once they sign in. For accounts that pre-date
 * the migration, callers should `ensureIcsToken` before exposing the URL.
 */
export async function ensureUserPrefs(
  supabase: SupabaseClient,
  user: { id: string; email: string | undefined }
): Promise<UserPrefs> {
  const existing = await supabase
    .from('user_prefs')
    .select(PREFS_COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle();

  if (existing.data) return existing.data as UserPrefs;

  const email = user.email ?? '';
  const { data, error } = await supabase
    .from('user_prefs')
    .insert({ user_id: user.id, email, ics_token: generateToken() })
    .select(PREFS_COLUMNS)
    .single();

  if (error) throw new Error(`ensureUserPrefs insert failed: ${error.message}`);
  return data as UserPrefs;
}

/**
 * Lazy-generate `ics_token` for users whose row pre-dates migration 0003.
 * Idempotent: returns the existing token if one is set.
 */
export async function ensureIcsToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const existing = await supabase
    .from('user_prefs')
    .select('ics_token')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing.data?.ics_token) return existing.data.ics_token;

  const token = generateToken();
  const { error } = await supabase
    .from('user_prefs')
    .update({ ics_token: token })
    .eq('user_id', userId);
  if (error) throw new Error(`ensureIcsToken update failed: ${error.message}`);
  return token;
}

/**
 * Rotate `ics_token`. Used by Settings "regenerate calendar link".
 * Apple Calendar will keep using the old URL until it polls again, but
 * the old token immediately stops working server-side.
 */
export async function rotateIcsToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const token = generateToken();
  const { error } = await supabase
    .from('user_prefs')
    .update({ ics_token: token })
    .eq('user_id', userId);
  if (error) throw new Error(`rotateIcsToken update failed: ${error.message}`);
  return token;
}

/**
 * Lazy-generate `gradescope_sync_token`. Same pattern as ics_token.
 */
export async function ensureGradescopeSyncToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const existing = await supabase
    .from('user_prefs')
    .select('gradescope_sync_token')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing.data?.gradescope_sync_token) return existing.data.gradescope_sync_token;

  const token = generateToken();
  const { error } = await supabase
    .from('user_prefs')
    .update({ gradescope_sync_token: token })
    .eq('user_id', userId);
  if (error) throw new Error(`ensureGradescopeSyncToken update failed: ${error.message}`);
  return token;
}

export async function rotateGradescopeSyncToken(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const token = generateToken();
  const { error } = await supabase
    .from('user_prefs')
    .update({ gradescope_sync_token: token })
    .eq('user_id', userId);
  if (error) throw new Error(`rotateGradescopeSyncToken update failed: ${error.message}`);
  return token;
}

function generateToken(): string {
  // 32 random bytes → 64 hex chars, ~256 bits of entropy.
  return randomBytes(32).toString('hex');
}
