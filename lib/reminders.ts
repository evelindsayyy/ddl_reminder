// QStash-backed reminder scheduling.
// Per CLAUDE.md §6:
//   - On assignment create/update: cancel any existing scheduled reminders,
//     compute fire_at = due_at - offset_hours, publish via QStash with
//     `notBefore`. Save the returned messageId in the `reminders` row.
//   - On assignment delete/complete: cancel.
//
// If QSTASH_TOKEN isn't set (local dev, or before user signs up),
// schedule/cancel become no-ops so the rest of the app keeps working.

import { Client as QstashClient } from '@upstash/qstash';
import { createClient as createAdmin } from '@supabase/supabase-js';

interface ScheduleArgs {
  userId: string;
  assignmentId: string;
  dueAtIso: string;
  reminderOffsetsHours: number[];
  appUrl: string;
}

let cached: QstashClient | null = null;
function qstash(): QstashClient | null {
  if (cached) return cached;
  const token = process.env.QSTASH_TOKEN;
  if (!token) return null;
  cached = new QstashClient({ token });
  return cached;
}

export function isQstashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN);
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdmin(url, key);
}

/**
 * Cancel any reminders previously scheduled for this assignment, then
 * compute and schedule fresh ones based on its current due_at.
 *
 * Idempotent — safe to call after every PATCH.
 */
export async function scheduleAssignmentReminders(args: ScheduleArgs): Promise<void> {
  const a = admin();
  if (!a) return; // service-role missing; nothing we can do server-side

  // Always wipe pre-existing reminders rows for this assignment, regardless
  // of whether QStash is configured — the rows track *intent*, and the
  // daily sweeper relies on them.
  const existing = await a
    .from('reminders')
    .select('id, qstash_message_id, status')
    .eq('user_id', args.userId)
    .eq('assignment_id', args.assignmentId);

  const qs = qstash();
  if (!existing.error && existing.data && qs) {
    for (const row of existing.data) {
      if (row.status === 'scheduled' && row.qstash_message_id) {
        try {
          await qs.messages.delete(row.qstash_message_id);
        } catch {
          // best effort; QStash may have already delivered
        }
      }
    }
  }
  await a
    .from('reminders')
    .delete()
    .eq('user_id', args.userId)
    .eq('assignment_id', args.assignmentId);

  // Now schedule fresh.
  const due = new Date(args.dueAtIso).getTime();
  const now = Date.now();
  for (const offset of args.reminderOffsetsHours) {
    const fireAt = due - offset * 60 * 60 * 1000;
    if (fireAt <= now) continue; // skip past offsets

    let messageId: string | null = null;
    if (qs) {
      try {
        const res = await qs.publishJSON({
          url: `${args.appUrl}/api/webhooks/reminder`,
          body: { assignmentId: args.assignmentId, offsetHours: offset },
          notBefore: Math.floor(fireAt / 1000),
        });
        messageId = res.messageId;
      } catch {
        // fall through; row gets stored as scheduled with null messageId so
        // the daily sweeper can still send it.
      }
    }
    await a.from('reminders').insert({
      user_id: args.userId,
      assignment_id: args.assignmentId,
      fire_at: new Date(fireAt).toISOString(),
      status: 'scheduled',
      qstash_message_id: messageId,
    });
  }
}

export async function cancelAssignmentReminders(
  userId: string,
  assignmentId: string
): Promise<void> {
  const a = admin();
  if (!a) return;
  const qs = qstash();

  const existing = await a
    .from('reminders')
    .select('id, qstash_message_id, status')
    .eq('user_id', userId)
    .eq('assignment_id', assignmentId);

  if (qs && existing.data) {
    for (const row of existing.data) {
      if (row.status === 'scheduled' && row.qstash_message_id) {
        try {
          await qs.messages.delete(row.qstash_message_id);
        } catch {
          /* best effort */
        }
      }
    }
  }
  await a
    .from('reminders')
    .delete()
    .eq('user_id', userId)
    .eq('assignment_id', assignmentId);
}
