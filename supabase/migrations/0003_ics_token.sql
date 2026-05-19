-- ============================================================
-- Deadline Tracker: outbound calendar feed token
-- Adds the per-user token used to authenticate the public
-- /api/ics/[token] endpoint. Apple Calendar can't send cookies,
-- so the URL secret IS the auth.
-- ============================================================

alter table public.user_prefs
  add column ics_token text unique;

create index user_prefs_ics_token_idx on public.user_prefs (ics_token)
  where ics_token is not null;
