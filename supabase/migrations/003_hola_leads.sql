-- Sign-ups and callbacks Ana saved, one row per call. The agent (service role) writes them;
-- Ana tells the customer "saved" only after this write succeeds.
create table if not exists public.hola_leads (
  id              uuid        primary key default gen_random_uuid(),
  call_id         text        not null unique,
  user_id         text        not null,
  kind            text        not null check (kind in ('signup', 'callback')),
  name            text        not null default '',
  phone           text        not null default '',
  email           text        not null default '',
  plan            text        not null default '',
  payment         text        not null default '',
  monthly         numeric,
  callback_at     timestamptz,
  decision_maker  text        not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists hola_leads_user on public.hola_leads (user_id, created_at desc);

alter table public.hola_leads enable row level security;

-- A rep can read their own leads in the app; only the server writes.
drop policy if exists "reps read their own leads" on public.hola_leads;
create policy "reps read their own leads" on public.hola_leads
  for select to authenticated using (user_id = auth.uid()::text);

revoke insert, update, delete on public.hola_leads from anon, authenticated;
revoke all on public.hola_leads from anon;

-- Usage: one row per call, updated every minute (the agent upserts on room).
create unique index if not exists hola_usage_room_key on public.hola_usage (room);
