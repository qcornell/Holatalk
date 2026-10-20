-- Plans: one row per App Store subscription (renewals and plan changes keep the same row), with its
-- current billing period. start-live writes it after checking Apple's signature; minutes reset
-- each period.
create table if not exists public.hola_accounts (
  user_id       text        primary key,          -- 'apple-<originalTransactionId>'
  product_id    text        not null,
  period_start  timestamptz not null,
  period_end    timestamptz not null,
  plan_minutes  integer     not null check (plan_minutes >= 0),
  trial         boolean     not null default false,
  environment   text        not null default '',
  device_id     text        not null default '',
  updated_at    timestamptz not null default now()
);

alter table public.hola_accounts enable row level security;
revoke all on public.hola_accounts from anon, authenticated;

-- Seconds of Ana an account used in a window. A call counts in the period it started.
create or replace function public.hola_seconds_used(p_user text, p_from timestamptz, p_to timestamptz)
returns bigint
language sql
stable
as $$
  select coalesce(sum(seconds), 0)::bigint
  from public.hola_usage
  where user_id = p_user and created_at >= p_from and created_at < p_to
$$;

revoke all on function public.hola_seconds_used(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.hola_seconds_used(text, timestamptz, timestamptz) to service_role;
