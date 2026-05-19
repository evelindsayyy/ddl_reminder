-- ============================================================
-- Deadline Tracker: integrations + recurring
-- Adds Canvas/Gradescope source tracking, recurrence groups,
-- and the semester_end_date + integration columns on user_prefs.
-- Safe to apply on a DB that already has manual data:
-- all new columns are NULLable or have defaults.
-- ============================================================

alter table public.assignments
  add column source text not null default 'manual'
    check (source in ('manual','canvas','gradescope')),
  add column external_id text,
  add column external_url text,
  add column recurrence_group_id uuid;

-- Partial unique index: only imported rows have (source, external_id).
create unique index assignments_source_external_idx
  on public.assignments (user_id, source, external_id)
  where external_id is not null;

-- Partial index for fast "find all in this series" lookups.
create index assignments_recurrence_group_idx
  on public.assignments (recurrence_group_id)
  where recurrence_group_id is not null;

alter table public.user_prefs
  add column semester_end_date date,
  add column canvas_ics_url text,
  add column gradescope_sync_token text unique;
