-- Обсуждение внутри заявки: кипер спрашивает врача прямо в карточке, ответ виден всем, кто её открыл.
-- Вместо общего чата — разговор всегда про конкретную задачу.
create table if not exists public.request_comments (
  id text primary key,
  request_id text not null references public.requests(id) on delete cascade,
  author_id uuid not null,
  author_name text not null default '',
  text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

drop trigger if exists touch on public.request_comments;
create trigger touch before insert or update on public.request_comments for each row execute function public.touch_updated_at();
create index if not exists request_comments_updated_idx on public.request_comments (updated_at);
create index if not exists request_comments_request_idx on public.request_comments (request_id);
alter table public.request_comments enable row level security;

drop policy if exists "read" on public.request_comments;
create policy "read" on public.request_comments for select to authenticated using (public.my_role() is not null);

-- писать и править (в том числе убрать) — только свой комментарий
drop policy if exists "insert" on public.request_comments;
create policy "insert" on public.request_comments for insert to authenticated
  with check (public.my_role() is not null and author_id = auth.uid());

drop policy if exists "update" on public.request_comments;
create policy "update" on public.request_comments for update to authenticated
  using (public.my_role() is not null and author_id = auth.uid())
  with check (public.my_role() is not null and author_id = auth.uid());

-- Разовая задача на конкретный день и, если нужно, к часу («купить таблетки 26.10 к 16:00»).
-- due_date остаётся «до какого дня» для регулярных.
alter table public.requests add column if not exists on_date date;
alter table public.requests add column if not exists at_time time;
