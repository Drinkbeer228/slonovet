-- Журнал действий: что люди делают в приложении и где оно падает — чтобы улучшать.
-- Пишет каждый только от своего имени; читают админ и директор. SQL Editor → Run, можно повторно.
create table if not exists public.events (
  id text primary key,
  user_id uuid not null,
  user_name text not null default '',
  role text not null default '',
  action text not null,           -- screen.open, shift.accept, feed.toggle, request.mark, error…
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_action_idx on public.events (action);

alter table public.events enable row level security;

drop policy if exists "insert own" on public.events;
create policy "insert own" on public.events for insert to authenticated
  with check (user_id = auth.uid() and public.my_role() is not null);

drop policy if exists "read admin" on public.events;
create policy "read admin" on public.events for select to authenticated
  using (public.my_role() in ('admin', 'director'));
