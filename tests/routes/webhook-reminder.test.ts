// Route test for POST app/api/webhooks/reminder — the QStash delivery webhook.
//
// This is a security-sensitive money path: a forged request here would send
// real email via the service role. So the tests pin the fail-closed contract
// (missing signature → rejected; Receiver.verify throwing → rejected) and prove
// the dev bypass never activates in production. The happy path proves the
// reminders row is marked sent and the email send actually fires.
//
// Seams (scout §1a): `@upstash/qstash` (Receiver), `@supabase/supabase-js`
// (service-role client), `@/lib/email`. The pure helpers (reminderFireAtIso,
// firstRow, isTerminalStage) run REAL. Environment: default `node`.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- hoisted mock state ------------------------------------------------------
// Holders the hoisted vi.mock factories close over; each test assigns them.
const qstash = vi.hoisted(() => ({ verify: vi.fn() }));
const supa = vi.hoisted(() => ({ current: null as unknown }));
const email = vi.hoisted(() => ({ sendEmail: vi.fn() }));

vi.mock('@upstash/qstash', () => ({
  // The handler does `new Receiver({...})` then `receiver.verify(...)`.
  Receiver: class {
    verify(args: unknown) {
      return qstash.verify(args);
    }
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supa.current,
}));

vi.mock('@/lib/email', () => ({
  sendEmail: (...a: unknown[]) => email.sendEmail(...a),
  reminderEmailFor: () => ({ subject: 's', text: 't', html: 'h' }),
  applicationReminderEmailFor: () => ({ subject: 's', text: 't', html: 'h' }),
}));

import { POST } from '@/app/api/webhooks/reminder/route';

// --- chainable Supabase admin fake -------------------------------------------
// `.maybeSingle()` resolves the fetched assignment; the reminders `.update()`
// chain is awaited directly, so the builder is thenable. Every `.update()`
// payload is captured so tests can assert the row was marked 'sent'.
type Result = { data: unknown; error: unknown };

function makeAdmin(rows: Record<string, Result>) {
  const updates: Array<{ table: string; payload: unknown }> = [];
  const from = (table: string) => {
    const result = rows[table] ?? { data: null, error: null };
    const b = {
      select: () => b,
      update: (payload: unknown) => {
        updates.push({ table, payload });
        return b;
      },
      eq: () => b,
      lte: () => b,
      maybeSingle: () => Promise.resolve(result),
      then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(res, rej),
    };
    return b;
  };
  return { from, updates };
}

// Minimal NextRequest stand-in: the handler reads `.text()`, the
// `upstash-signature` header, and `.url`.
function makeRequest(body: string, headers: Record<string, string> = {}) {
  return {
    text: async () => body,
    url: 'https://ddl.example.com/api/webhooks/reminder',
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as Parameters<typeof POST>[0];
}

const ASSIGNMENT_ROW: Result = {
  data: {
    id: 'a1',
    user_id: 'user-1',
    title: 'HW5',
    due_at: '2026-04-28T23:59:00.000Z',
    completed_at: null,
    type: 'homework',
    courses: { code: 'STA 240' },
    user_prefs: { email: 'grace@example.com', timezone: 'America/New_York' },
  },
  error: null,
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ddl.example.com');
  supa.current = null;
});

describe('POST /api/webhooks/reminder', () => {
  it('rejects when the signature header is missing (401 invalid_signature)', async () => {
    // Signing keys are present, so we fall through to the header check.
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'cur');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'nxt');

    const res = await POST(makeRequest(JSON.stringify({ assignmentId: 'a1' })));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
    // Never even constructed the Receiver — bailed on the missing header.
    expect(qstash.verify).not.toHaveBeenCalled();
  });

  it('fails closed when Receiver.verify throws (401)', async () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'cur');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'nxt');
    qstash.verify.mockRejectedValue(new Error('SignatureError'));

    const res = await POST(
      makeRequest(JSON.stringify({ assignmentId: 'a1' }), {
        'upstash-signature': 'v0=forged',
      })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
    expect(qstash.verify).toHaveBeenCalledOnce();
    // A rejected signature must never touch the mailer.
    expect(email.sendEmail).not.toHaveBeenCalled();
  });

  it('marks the reminder sent and sends the email on a valid signature', async () => {
    vi.stubEnv('QSTASH_CURRENT_SIGNING_KEY', 'cur');
    vi.stubEnv('QSTASH_NEXT_SIGNING_KEY', 'nxt');
    qstash.verify.mockResolvedValue(undefined);
    email.sendEmail.mockResolvedValue({ ok: true });
    const admin = makeAdmin({ assignments: ASSIGNMENT_ROW, reminders: { data: null, error: null } });
    supa.current = admin;

    const res = await POST(
      makeRequest(JSON.stringify({ assignmentId: 'a1', offsetHours: 12 }), {
        'upstash-signature': 'v0=valid',
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Email actually dispatched to the recipient from user_prefs.
    expect(email.sendEmail).toHaveBeenCalledOnce();
    expect(email.sendEmail.mock.calls[0][0]).toMatchObject({ to: 'grace@example.com' });
    // The reminders row was flipped to 'sent'.
    const reminderUpdate = admin.updates.find((u) => u.table === 'reminders');
    expect(reminderUpdate?.payload).toMatchObject({ status: 'sent' });
  });

  it('HONORS the dev bypass in non-prod (INSECURE=1, no signature → accepted, mark-sent runs)', async () => {
    // Bypass flag on + non-production + NO signing keys + NO signature header.
    // verifySignature short-circuits to `true`, so the handler proceeds all the
    // way through delivery: the email fires and the reminders row flips 'sent'.
    vi.stubEnv('INSECURE_REMINDER_WEBHOOK', '1');
    vi.stubEnv('NODE_ENV', 'development');
    qstash.verify.mockResolvedValue(undefined);
    email.sendEmail.mockResolvedValue({ ok: true });
    const admin = makeAdmin({ assignments: ASSIGNMENT_ROW, reminders: { data: null, error: null } });
    supa.current = admin;

    const res = await POST(
      makeRequest(JSON.stringify({ assignmentId: 'a1', offsetHours: 12 }))
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // The bypass never constructs a Receiver — it returns before any verify.
    expect(qstash.verify).not.toHaveBeenCalled();
    // Delivery actually happened despite the missing signature.
    expect(email.sendEmail).toHaveBeenCalledOnce();
    expect(email.sendEmail.mock.calls[0][0]).toMatchObject({ to: 'grace@example.com' });
    const reminderUpdate = admin.updates.find((u) => u.table === 'reminders');
    expect(reminderUpdate?.payload).toMatchObject({ status: 'sent' });
  });

  it('does NOT honor the dev bypass when NODE_ENV=production', async () => {
    // Bypass flag on, but production must ignore it. No signing keys, no
    // signature → verifySignature falls through to `return false` → 401.
    vi.stubEnv('INSECURE_REMINDER_WEBHOOK', '1');
    vi.stubEnv('NODE_ENV', 'production');

    const res = await POST(makeRequest(JSON.stringify({ assignmentId: 'a1' })));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'invalid_signature' });
    expect(email.sendEmail).not.toHaveBeenCalled();
  });
});
