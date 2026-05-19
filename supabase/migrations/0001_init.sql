-- ============================================================
-- Deadline Tracker: initial schema
-- Supabase Postgres. Uses auth.users from Supabase Auth.
-- ============================================================

-- ---- COURSES ------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,                 -- "STA 240"
  name text,                          -- "Probability for Statistical Inference"
  color text not null default '#6366f1',
  created_at timestamptz not null default now(),
  unique (user_id, code)
);

create index courses_user_idx on public.courses(user_id);

-- ---- ASSIGNMENTS --------------------------------------------
create type assignment_type as enum (
  'homework','lab','exam','essay','project','reading','other'
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  type assignment_type not null default 'homework',
  due_at timestamptz not null,
  estimated_hours numeric(4,1),       -- NULL = no estimate
  actual_hours numeric(4,1),          -- filled in retrospectively
  notes text,
  completed_at timestamptz,           -- NULL = not done
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assignments_user_due_idx
  on public.assignments(user_id, due_at)
  where completed_at is null;         -- partial index: only open items

create index assignments_user_completed_idx
  on public.assignments(user_id, completed_at)
  where completed_at is not null;

-- ---- APPLICATIONS (interview tracker) -----------------------
create type application_stage as enum (
  'applied','oa','phone_screen','technical','onsite','offer','rejected','withdrawn'
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  role text not null,
  stage application_stage not null default 'applied',
  next_action text,                   -- "Send thank-you email"
  next_action_at timestamptz,
  notes text,                         -- interviewer names, prep links
  applied_at date not null default current_date,
  updated_at timestamptz not null default now()
);

create index applications_user_next_idx
  on public.applications(user_id, next_action_at)
  where stage not in ('offer','rejected','withdrawn');

-- ---- REMINDERS ----------------------------------------------
-- Tracks which reminders have been scheduled with QStash,
-- so we can cancel them if the assignment is deleted/completed.
create type reminder_status as enum ('scheduled','sent','cancelled','failed');

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete cascade,
  application_id uuid references public.applications(id) on delete cascade,
  fire_at timestamptz not null,
  qstash_message_id text,             -- returned by QStash on publish
  status reminder_status not null default 'scheduled',
  sent_at timestamptz,
  check (
    (assignment_id is not null and application_id is null) or
    (assignment_id is null and application_id is not null)
  )
);

create index reminders_fire_idx on public.reminders(fire_at)
  where status = 'scheduled';

-- ---- USER PREFS ---------------------------------------------
create table public.user_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  reminder_offsets_hours integer[] not null default '{168, 48, 12}',
  -- default: 1 week, 2 days, 12 hours before
  timezone text not null default 'America/New_York',
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Row-Level Security: every table scoped to auth.uid()
-- ============================================================
alter table public.courses       enable row level security;
alter table public.assignments   enable row level security;
alter table public.applications  enable row level security;
alter table public.reminders     enable row level security;
alter table public.user_prefs    enable row level security;

create policy "own rows" on public.courses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.assignments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rows" on public.reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own row" on public.user_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Trigger: keep updated_at fresh
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger assignments_touch  before update on public.assignments
  for each row execute function public.touch_updated_at();
create trigger applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();
create trigger user_prefs_touch   before update on public.user_prefs
  for each row execute function public.touch_updated_at();
