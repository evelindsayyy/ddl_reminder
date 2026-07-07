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
import { computeReminderFireTimes } from './reminderSchedule';

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
  await cancelRemindersFor(args.userId, 'assignment_id', args.assignmentId);

  const qs = qstash();

  // Now schedule fresh. Timing math lives in a pure, unit-tested helper.
  const planned = computeReminderFireTimes(
    args.dueAtIso,
    args.reminderOffsetsHours,
    Date.now()
  );
  for (const { offsetHours, fireAtMs, fireAtIso } of planned) {
    let messageId: string | null = null;
    if (qs) {
      try {
        const res = await qs.publishJSON({
          url: `${args.appUrl}/api/webhooks/reminder`,
          body: { assignmentId: args.assignmentId, offsetHours },
          notBefore: Math.floor(fireAtMs / 1000),
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
      fire_at: fireAtIso,
      status: 'scheduled',
      qstash_message_id: messageId,
    });
  }
}

export async function cancelAssignmentReminders(
  userId: string,
  assignmentId: string
): Promise<void> {
  return cancelRemindersFor(userId, 'assignment_id', assignmentId);
}

// ---- applications ----
// Same infra as assignments (CLAUDE.md §6): reminders fire relative to the
// application's next_action_at using the user's reminder_offsets_hours, land
// in the same polymorphic `reminders` table (application_id side of the CHECK
// constraint), and are delivered by the same webhook + daily sweeper.

interface ApplicationScheduleArgs {
  userId: string;
  applicationId: string;
  nextActionAtIso: string;
  reminderOffsetsHours: number[];
  appUrl: string;
}

export async function scheduleApplicationReminders(
  args: ApplicationScheduleArgs
): Promise<void> {
  const a = admin();
  if (!a) return;

  // Wipe pre-existing rows (and their QStash messages) first — idempotent,
  // same contract as the assignment scheduler.
  await cancelApplicationReminders(args.userId, args.applicationId);

  const qs = qstash();
  const planned = computeReminderFireTimes(
    args.nextActionAtIso,
    args.reminderOffsetsHours,
    Date.now()
  );
  for (const { offsetHours, fireAtMs, fireAtIso } of planned) {
    let messageId: string | null = null;
    if (qs) {
      try {
        const res = await qs.publishJSON({
          url: `${args.appUrl}/api/webhooks/reminder`,
          body: { applicationId: args.applicationId, offsetHours },
          notBefore: Math.floor(fireAtMs / 1000),
        });
        messageId = res.messageId;
      } catch {
        // fall through; the row stays 'scheduled' with null messageId so the
        // daily sweeper can still send it.
      }
    }
    await a.from('reminders').insert({
      user_id: args.userId,
      application_id: args.applicationId,
      fire_at: fireAtIso,
      status: 'scheduled',
      qstash_message_id: messageId,
    });
  }
}

export async function cancelApplicationReminders(
  userId: string,
  applicationId: string
): Promise<void> {
  return cancelRemindersFor(userId, 'application_id', applicationId);
}

// Shared cancel: delete the QStash messages (best effort), then the rows.
async function cancelRemindersFor(
  userId: string,
  parentColumn: 'assignment_id' | 'application_id',
  parentId: string
): Promise<void> {
  const a = admin();
  if (!a) return;
  const qs = qstash();

  const existing = await a
    .from('reminders')
    .select('id, qstash_message_id, status')
    .eq('user_id', userId)
    .eq(parentColumn, parentId);

  if (qs && existing.data) {
    for (const row of existing.data) {
      if (row.status === 'scheduled' && row.qstash_message_id) {
        try {
          await qs.messages.delete(row.qstash_message_id);
        } catch {
          /* best effort; QStash may have already delivered */
        }
      }
    }
  }
  await a.from('reminders').delete().eq('user_id', userId).eq(parentColumn, parentId);
}
