// Route test for GET app/api/ics/[token] — the public calendar feed.
//
// We exercise the REAL handler and the REAL buildIcs (@/lib/ics) — the whole
// point of this test is that a fixture row travels through the handler's row
// mapping into ical-generator and comes out timezone-correct. The ONLY seam we
// stub is the service-role Supabase client (`@supabase/ssr` `createServerClient`,
// per scout §1c): a chainable fake whose terminal calls resolve to fixture rows.
//
// Environment: default `node` (no jsdom) — the handler only touches
// web-standard NextRequest/NextResponse.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mutable client holder the mock factory returns. `vi.hoisted` lets the factory
// (hoisted above imports) reference it; each test assigns `holder.current`.
const holder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => holder.current,
}));

import { GET } from '@/app/api/ics/[token]/route';

// ---- chainable Supabase fake ------------------------------------------------
// The handler uses two terminal shapes: `.maybeSingle()` (user_prefs) returns a
// promise; the assignments/applications chains end at `.order()` and are awaited
// directly (via Promise.all), so the builder is itself thenable.
type QueryResult = { data: unknown; error: unknown };

function makeQuery(result: QueryResult) {
  const q = {
    select: () => q,
    eq: () => q,
    is: () => q,
    not: () => q,
    order: () => q,
    maybeSingle: () => Promise.resolve(result),
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return q;
}

function makeAdmin(results: Record<string, QueryResult>) {
  return {
    from: (table: string) => makeQuery(results[table] ?? { data: null, error: null }),
  };
}

// Minimal NextRequest stand-in — the handler names its first arg `_` and never
// reads it.
const req = {} as unknown as Parameters<typeof GET>[0];

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ddl.example.com');
  holder.current = null;
});

describe('GET /api/ics/[token]', () => {
  it('returns 404 without leaking on an unknown token', async () => {
    // maybeSingle → no row (not an error): the deliberately non-leaky path.
    holder.current = makeAdmin({
      user_prefs: { data: null, error: null },
    });

    const res = await GET(req, { params: { token: 'nope-not-a-real-token' } });
    const body = await res.text();

    expect(res.status).toBe(404);
    expect(body).toBe('not found');
    // No user_id / token echoed back — must not disclose lookup internals.
    expect(body).not.toContain('user');
    expect(body).not.toContain('nope-not-a-real-token');
    expect(res.headers.get('content-type')).not.toBe('text/calendar; charset=utf-8');
  });

  it('returns a timezone-correct calendar for a valid token', async () => {
    holder.current = makeAdmin({
      user_prefs: {
        data: {
          user_id: 'user-1',
          email: 'grace@example.com',
          timezone: 'America/New_York',
          ics_token: 'good-token',
        },
        error: null,
      },
      assignments: {
        data: [
          {
            id: 'a1',
            title: 'HW5',
            type: 'homework',
            due_at: '2026-04-28T23:59:00.000Z',
            completed_at: null,
            notes: 'do the hard one',
            external_url: null,
            courses: { code: 'STA 240' },
          },
        ],
        error: null,
      },
      applications: { data: [], error: null },
    });

    const res = await GET(req, { params: { token: 'good-token' } });
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/calendar; charset=utf-8');

    // REAL buildIcs output — envelope + VEVENT.
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('END:VCALENDAR');
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('UID:assignment-a1');

    // `[CODE] title` summary shape.
    expect(body).toContain('SUMMARY:[STA 240] HW5');

    // Timezone-correct DTSTART: 23:59Z in America/New_York (EDT −4) is 19:59
    // local wall time, minus the 1-hour block start = 18:59.
    expect(body).toContain('DTSTART:20260428T185900');
    expect(body).toContain('DTEND:20260428T195900');
  });
});
