// Route test for app/api/assignments/[id] — the user-session PATCH/DELETE route.
//
// This is the only one of the five routes on the cookie-session seam, so the
// auth gate (`supabase.auth.getUser()` → 401) is tested here. The money-path
// invariants: PATCH scopes its update to the user AND resyncs reminders when
// the due date moves; DELETE cancels QStash reminders BEFORE deleting the rows
// (once the rows cascade away their qstash_message_id is gone) — an ordering
// assertion pins that.
//
// Seams (scout §1e): `@/lib/supabase/server` (cookie client), `@/lib/reminders`,
// `@/lib/prefs`. The real zod schema + recurrence helpers run. Env: `node`.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const supa = vi.hoisted(() => ({ current: null as unknown }));
// A shared ordered log: the reminders mock and the delete builder both append
// to it so the DELETE test can assert cancel-before-delete.
const rem = vi.hoisted(() => ({
  order: [] as string[],
  cancel: vi.fn(),
  schedule: vi.fn(),
}));
const prefs = vi.hoisted(() => ({ ensureUserPrefs: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient: () => supa.current }));
vi.mock('@/lib/reminders', () => ({
  cancelAssignmentReminders: (...a: unknown[]) => {
    rem.order.push('cancel');
    return rem.cancel(...a);
  },
  scheduleAssignmentReminders: (...a: unknown[]) => rem.schedule(...a),
}));
vi.mock('@/lib/prefs', () => ({
  ensureUserPrefs: (...a: unknown[]) => prefs.ensureUserPrefs(...a),
}));

import { PATCH, DELETE } from '@/app/api/assignments/[id]/route';

// --- chainable Supabase (cookie client) fake ---------------------------------
// `.auth.getUser()` gates the route. Query chains: PATCH ends `.single()`;
// DELETE row-lookup ends `.maybeSingle()`, future-occurrence read is awaited
// directly, and the delete chain (marked by `.delete()`) resolves its own
// result. Every `.eq()` is recorded so tests can assert user scoping.
type Result = { data?: unknown; error: unknown; count?: number };

function makeSupabase(cfg: {
  user: unknown;
  single?: Result;
  maybeSingle?: Result;
  awaited?: Result;
  deleteResult?: Result;
}) {
  const eqCalls: Array<[string, unknown]> = [];
  const from = () => {
    let isDelete = false;
    const b = {
      select: () => b,
      update: () => b,
      delete: () => {
        isDelete = true;
        rem.order.push('delete');
        return b;
      },
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val]);
        return b;
      },
      neq: () => b,
      gt: () => b,
      single: () => Promise.resolve(cfg.single ?? { data: null, error: null }),
      maybeSingle: () => Promise.resolve(cfg.maybeSingle ?? { data: null, error: null }),
      then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(
          isDelete ? cfg.deleteResult ?? { error: null, count: 0 } : cfg.awaited ?? { data: [], error: null }
        ).then(res, rej),
    };
    return b;
  };
  return {
    auth: { getUser: async () => ({ data: { user: cfg.user } }) },
    from,
    eqCalls,
  };
}

function makeRequest(url: string, body?: unknown) {
  return {
    nextUrl: new URL(url),
    json: async () => body,
  } as unknown as Parameters<typeof PATCH>[0];
}

const USER = { id: 'user-1', email: 'grace@example.com' };

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  rem.order.length = 0;
  supa.current = null;
});

describe('app/api/assignments/[id]', () => {
  it('PATCH unauthenticated → 401', async () => {
    supa.current = makeSupabase({ user: null });

    const res = await PATCH(
      makeRequest('https://ddl.example.com/api/assignments/a1', { title: 'x' }),
      { params: Promise.resolve({ id: 'a1' }) }
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('PATCH with a dueAt change → user-scoped update + reminder resync', async () => {
    prefs.ensureUserPrefs.mockResolvedValue({ reminder_offsets_hours: [168] });
    rem.schedule.mockResolvedValue(undefined);
    const supabase = makeSupabase({
      user: USER,
      single: {
        data: { id: 'a1', due_at: '2026-08-01T12:00:00.000Z', recurrence_group_id: null },
        error: null,
      },
    });
    supa.current = supabase;

    const res = await PATCH(
      makeRequest('https://ddl.example.com/api/assignments/a1', {
        dueAt: '2026-08-01T12:00:00.000Z',
      }),
      { params: Promise.resolve({ id: 'a1' }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { id: 'a1' } });
    // Update was scoped to the authenticated user.
    expect(supabase.eqCalls).toContainEqual(['user_id', 'user-1']);
    // A moved due date resyncs reminders (not a cancel).
    expect(rem.schedule).toHaveBeenCalledOnce();
    expect(rem.cancel).not.toHaveBeenCalled();
  });

  it('DELETE scope=one → reminders cancelled BEFORE the row delete', async () => {
    rem.cancel.mockResolvedValue(undefined);
    supa.current = makeSupabase({ user: USER, deleteResult: { error: null } });

    const res = await DELETE(
      makeRequest('https://ddl.example.com/api/assignments/a1'),
      { params: Promise.resolve({ id: 'a1' }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(rem.cancel).toHaveBeenCalledWith('user-1', 'a1');
    // The cancel must precede the delete — cascade would otherwise orphan the
    // scheduled QStash message.
    expect(rem.order).toEqual(['cancel', 'delete']);
  });

  it('DELETE scope=series → cancels future occurrences then deletes (smoke)', async () => {
    rem.cancel.mockResolvedValue(undefined);
    supa.current = makeSupabase({
      user: USER,
      // row lookup: this row is part of a series.
      maybeSingle: {
        data: { recurrence_group_id: 'grp-1', due_at: '2026-12-01T12:00:00.000Z' },
        error: null,
      },
      // future-occurrence read → one sibling to cancel.
      awaited: { data: [{ id: 'a2' }], error: null },
      deleteResult: { error: null, count: 1 },
    });

    const res = await DELETE(
      makeRequest('https://ddl.example.com/api/assignments/a1?scope=series'),
      { params: Promise.resolve({ id: 'a1' }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 1 });
    // Future occurrence's reminders cancelled before the batch delete.
    expect(rem.cancel).toHaveBeenCalledWith('user-1', 'a2');
    expect(rem.order).toEqual(['cancel', 'delete']);
  });
});
