// Route test for app/api/cron/daily — the once-per-day sweeper/import/digest job.
//
// The security branches (secret unset → 500, wrong bearer → 401) exercise the
// REAL constant-time compare (node:crypto stays unmocked). The happy path
// proves all four phases run and, critically, that the reminder backfill runs
// AFTER the Canvas sync — the same-run scheduling guarantee (rows Canvas
// inserts this run get their reminders scheduled the same run).
//
// Seams (scout §1b): `@supabase/supabase-js`, `@/lib/email`, `@/lib/canvas`,
// `@/lib/reminders`. Environment: default `node`.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const supa = vi.hoisted(() => ({ current: null as unknown }));
const canvas = vi.hoisted(() => ({ syncCanvasForUser: vi.fn() }));
const reminders = vi.hoisted(() => ({ scheduleAssignmentReminders: vi.fn() }));
const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => supa.current }));
vi.mock('@/lib/canvas', () => ({
  syncCanvasForUser: (...a: unknown[]) => canvas.syncCanvasForUser(...a),
}));
vi.mock('@/lib/reminders', () => ({
  scheduleAssignmentReminders: (...a: unknown[]) => reminders.scheduleAssignmentReminders(...a),
}));
vi.mock('@/lib/email', () => ({
  sendEmail: (...a: unknown[]) => email.sendEmail(...a),
  reminderEmailFor: () => ({ subject: 's', text: 't', html: 'h' }),
  applicationReminderEmailFor: () => ({ subject: 's', text: 't', html: 'h' }),
  digestEmailFor: () => ({ subject: 's', text: 't', html: 'h' }),
}));

import { POST } from '@/app/api/cron/daily/route';

// --- chainable Supabase admin fake -------------------------------------------
// Every query resolves per-table. `user_prefs` is queried three times with
// different selects (canvas url / offsets / digest email) — one combined row
// serves all three since each read only touches the fields it needs. The
// digest's per-user items query terminates at `.order()`, which resolves empty
// so the digest phase makes no email calls.
type Result = { data: unknown; error: unknown };

const FUTURE_ISO = '2026-12-01T12:00:00.000Z';

function thenable(result: Result) {
  return {
    then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(res, rej),
  };
}

function makeAdmin(rows: Record<string, Result>) {
  const from = (table: string) => {
    const result = rows[table] ?? { data: [], error: null };
    const b = {
      select: () => b,
      eq: () => b,
      is: () => b,
      not: () => b,
      gt: () => b,
      gte: () => b,
      lt: () => b,
      lte: () => b,
      in: () => b,
      update: () => b,
      // Digest reads today's items and ends at `.order()` — resolve empty.
      order: () => thenable({ data: [], error: null }),
      then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej),
    };
    return b;
  };
  return { from };
}

function makeRequest(authz: string | null) {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? authz : null) },
  } as unknown as Parameters<typeof POST>[0];
}

const SECRET = 'super-secret-cron-value';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ddl.example.com');
  supa.current = null;
});

describe('POST /api/cron/daily', () => {
  it('returns 500 when CRON_SECRET is unset', async () => {
    // No CRON_SECRET stubbed.
    const res = await POST(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'cron_secret_unset' });
  });

  it('returns 401 on a wrong bearer token', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    const res = await POST(makeRequest('Bearer wrong-token'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('runs all four phases on the correct bearer, backfill after canvas sync', async () => {
    vi.stubEnv('CRON_SECRET', SECRET);
    canvas.syncCanvasForUser.mockResolvedValue({ imported: 0 });
    reminders.scheduleAssignmentReminders.mockResolvedValue(undefined);
    email.sendEmail.mockResolvedValue({ ok: true, skipped: true });
    supa.current = makeAdmin({
      // Sweeper (scheduled + due) and backfill existing-reminders lookup: empty.
      reminders: { data: [], error: null },
      // Backfill open-future assignments: one row with no reminders yet.
      assignments: { data: [{ id: 'a1', user_id: 'u1', due_at: FUTURE_ISO }], error: null },
      // Serves canvas (canvas_ics_url), backfill (offsets), digest (email/tz).
      user_prefs: {
        data: [
          {
            user_id: 'u1',
            canvas_ics_url: 'https://canvas.example.edu/feed.ics',
            reminder_offsets_hours: [168],
            email: 'grace@example.com',
            timezone: 'America/New_York',
          },
        ],
        error: null,
      },
    });

    const res = await POST(makeRequest(`Bearer ${SECRET}`));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    // All four phases present in the response envelope.
    expect(body).toHaveProperty('sweeper');
    expect(body).toHaveProperty('canvas');
    expect(body).toHaveProperty('backfill');
    expect(body).toHaveProperty('digest');

    // Canvas + backfill both fired their side effects...
    expect(canvas.syncCanvasForUser).toHaveBeenCalledOnce();
    expect(reminders.scheduleAssignmentReminders).toHaveBeenCalledOnce();
    // ...and backfill's scheduling ran strictly AFTER the canvas sync.
    expect(reminders.scheduleAssignmentReminders.mock.invocationCallOrder[0]).toBeGreaterThan(
      canvas.syncCanvasForUser.mock.invocationCallOrder[0]
    );
  });
});
