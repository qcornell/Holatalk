-- Minutes used per rep in Teammate mode. One row per live session.
create table if not exists public.hola_usage (
  id          bigint generated always as identity primary key,
  user_id     text        not null,
  room        text        not null default '',
  seconds     integer     not null check (seconds >= 0),
  model       text        not null default '',
  lead_saved  boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists hola_usage_user_month on public.hola_usage (user_id, created_at);

-- Only the server (service role) writes here; reps never touch this table directly.
alter table public.hola_usage enable row level security;

-- Minutes used this calendar month, for the minutes-left meter.
create or replace view public.hola_minutes_this_month as
select user_id, ceil(sum(seconds) / 60.0)::int as minutes
from public.hola_usage
where created_at >= date_trunc('month', now())
group by user_id;

-- Reps never read usage directly; the app gets minutes through a server function.
revoke all on public.hola_minutes_this_month from anon, authenticated;
