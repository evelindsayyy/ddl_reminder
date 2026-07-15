-- ============================================================
-- Deadline Tracker: DB-backed rate limiting for the public
-- Gradescope bookmarklet sync endpoint.
--
-- No Redis is provisioned (QStash creds don't unlock @upstash/ratelimit),
-- so the fixed-window limiter lives in Postgres: one row per user holding
-- the current window's start and request count.
--
-- Accessed ONLY by the service-role client from the sync route (which has
-- already resolved token -> user_id). RLS is enabled with NO policies, so
-- anon/authenticated clients get zero access; the service role bypasses RLS.
-- ============================================================

create table public.sync_rate_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  count int not null
);

alter table public.sync_rate_limits enable row level security;
-- Intentionally no policies: only the service-role key (bypasses RLS) touches this.
