// Route test for app/api/sync/gradescope — the bookmarklet sync endpoint.
//
// It's a public, CORS-exposed endpoint authed only by a bearer-like sync token,
// so every response (including failures) must carry the gradescope.com CORS
// headers, and the token must scope every write to its owning user. The REAL
// zod schema and color picker run; only the service-role client is stubbed.
//
// Seam (scout §1d): `@supabase/supabase-js`. Environment: default `node`.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const supa = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => supa.current }));

import { OPTIONS, POST } from '@/app/api/sync/gradescope/route';

// --- chainable Supabase admin fake -------------------------------------------
// `.maybeSingle()` resolves token→user and course lookups; the existing-rows
// select and each insert/update are awaited directly (thenable). Insert/update
// payloads are captured so tests can assert user scoping on the write.
type Result = { data: unknown; error: unknown };

function makeAdmin(cfg: {
  maybeSingle?: Record<string, Result>;
  awaited?: Record<string, Result>;
}) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const from = (table: string) => {
    const awaited = cfg.awaited?.[table] ?? { data: [], error: null };
    const single = cfg.maybeSingle?.[table] ?? { data: null, error: null };
    const b = {
      select: () => b,
      eq: () => b,
      insert: (payload: Record<string, unknown>) => {
        inserts.push({ table, payload });
        return b;
      },
      update: (payload: Record<string, unknown>) => {
        updates.push({ table, payload });
        return b;
      },
      single: () => Promise.resolve(single),
      maybeSingle: () => Promise.resolve(single),
      then: (res: (v: Result) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(awaited).then(res, rej),
    };
    return b;
  };
  return { from, inserts, updates };
}

const TOKEN = 'a'.repeat(40); // ≥32 chars → passes the schema length check.

function makeRequest(body: unknown) {
  return {
    json: async () => body,
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  supa.current = null;
});

describe('app/api/sync/gradescope', () => {
  it('OPTIONS → 204 with gradescope CORS preflight headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://www.gradescope.com');
    expect(res.headers.get('vary')).toBe('Origin');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('unknown token → 401 with CORS headers still present', async () => {
    // Token passes the length schema but matches no user row.
    supa.current = makeAdmin({ maybeSingle: { user_prefs: { data: null, error: null } } });

    const res = await POST(
      makeRequest({ token: TOKEN, courseName: 'STA 240', assignments: [] })
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    // Failure responses must not drop CORS or the browser hides the status.
    expect(res.headers.get('access-control-allow-origin')).toBe('https://www.gradescope.com');
    expect(res.headers.get('vary')).toBe('Origin');
  });

  it('happy POST → user-scoped insert, 200 with CORS', async () => {
    const admin = makeAdmin({
      maybeSingle: {
        // token → user; existing course found (skip the insert-with-color path).
        user_prefs: { data: { user_id: 'user-1' }, error: null },
        courses: { data: { id: 'course-1' }, error: null },
      },
      awaited: {
        // No existing gradescope rows → the one assignment is an insert.
        assignments: { data: [], error: null },
      },
    });
    supa.current = admin;

    const res = await POST(
      makeRequest({
        token: TOKEN,
        courseName: 'STA 240',
        assignments: [
          {
            externalId: 'gs-101',
            title: 'Problem Set 3',
            dueAt: '2026-05-01T23:59:00.000Z',
          },
        ],
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inserted: 1, updated: 0, skipped: 0, total: 1 });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://www.gradescope.com');

    // The write was scoped to the token's user.
    const assignmentInsert = admin.inserts.find((i) => i.table === 'assignments');
    expect(assignmentInsert?.payload).toMatchObject({
      user_id: 'user-1',
      external_id: 'gs-101',
      source: 'gradescope',
    });
  });
});
