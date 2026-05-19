// Resend wrapper. Soft-degrades if RESEND_API_KEY isn't set so that
// the rest of the app keeps working in environments where outbound
// email isn't configured (e.g. local dev without an account).

import { Resend } from 'resend';

interface SendArgs {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
  skipped?: boolean;
}

let cached: Resend | null = null;

function client(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const resend = client();
  const from = process.env.FROM_EMAIL;
  if (!resend || !from) {
    // Don't throw — let callers (cron, webhook) continue and just skip.
    return { ok: true, skipped: true, error: 'no_resend_config' };
  }
  try {
    const res = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html,
    });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, id: res.data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'send_failed' };
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY) && Boolean(process.env.FROM_EMAIL);
}

// ---- compose helpers ----

export function reminderEmailFor(args: {
  appUrl: string;
  title: string;
  courseCode: string | null;
  dueAtIso: string;
  timezone: string;
  hoursUntilDue: number;
}): { subject: string; text: string; html: string } {
  const fmt = new Date(args.dueAtIso).toLocaleString('en-US', {
    timeZone: args.timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const tag = args.courseCode ? `[${args.courseCode}] ` : '';
  const lead =
    args.hoursUntilDue >= 24
      ? `due in ${Math.round(args.hoursUntilDue / 24)} days`
      : `due in ${Math.round(args.hoursUntilDue)} hours`;
  const subject = `${tag}${args.title} — ${lead}`;
  const text = `${tag}${args.title}\n${lead} (${fmt})\n\nOpen: ${args.appUrl}/assignments\n`;
  const html = `<p style="font-family:system-ui"><strong>${escapeHtml(tag)}${escapeHtml(args.title)}</strong></p><p style="font-family:system-ui">${escapeHtml(lead)} (${escapeHtml(fmt)})</p><p><a href="${args.appUrl}/assignments">Open in Deadline Tracker</a></p>`;
  return { subject, text, html };
}

export function digestEmailFor(args: {
  appUrl: string;
  todayLabel: string;
  todayItems: { title: string; courseCode: string | null; dueAtIso: string }[];
  timezone: string;
}): { subject: string; text: string; html: string } {
  const lines = args.todayItems.map((i) => {
    const fmt = new Date(i.dueAtIso).toLocaleString('en-US', {
      timeZone: args.timezone,
      hour: 'numeric',
      minute: '2-digit',
    });
    const tag = i.courseCode ? `[${i.courseCode}] ` : '';
    return `· ${tag}${i.title} — ${fmt}`;
  });
  const subject = `Today: ${args.todayItems.length} item${args.todayItems.length === 1 ? '' : 's'} — ${args.todayLabel}`;
  const text = `Here's what's on your plate today:\n\n${lines.join('\n')}\n\nOpen: ${args.appUrl}/\n`;
  const itemsHtml = args.todayItems
    .map((i) => {
      const fmt = new Date(i.dueAtIso).toLocaleString('en-US', {
        timeZone: args.timezone,
        hour: 'numeric',
        minute: '2-digit',
      });
      const tag = i.courseCode ? `[${escapeHtml(i.courseCode)}] ` : '';
      return `<li>${tag}${escapeHtml(i.title)} — ${escapeHtml(fmt)}</li>`;
    })
    .join('');
  const html = `<p style="font-family:system-ui"><strong>${escapeHtml(args.todayLabel)} — today's plate</strong></p><ul style="font-family:system-ui">${itemsHtml}</ul><p><a href="${args.appUrl}/">Open in Deadline Tracker</a></p>`;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
