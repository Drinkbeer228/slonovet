-- 031: вид врача и назначения 2.0.
-- 1) notes.for_vet — флажок «Показать врачу» на любой записи.
-- 2) note_comments — ответ врача на запись: «Смотрю дальше», «Назначу», «Позвоню» или словами.
-- 3) elephant_passports — паспорт слонихи (год рождения, характер, своя норма, ноги, аллергии, что нельзя, примерный вес).
-- 4) requests: способ (route), доза (dose), история правок (history), частота «утро и вечер» (twice).
-- Выкладка: СНАЧАЛА миграция, потом приложение (иначе новые поля получат 400 и уйдут в карантин).

alter table public.notes add column if not exists for_vet boolean not null default false;

create table if not exists public.note_comments (
  id text primary key,
  note_id text not null references public.notes(id) on delete cascade,
  author_id uuid not null,
  author_name text not null default '',
  kind text not null default 'text' check (kind in ('text', 'seen', 'assign', 'call')),
  text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
drop trigger if exists touch on public.note_comments;
create trigger touch before insert or update on public.note_comments for each row execute function public.touch_updated_at();
create index if not exists note_comments_updated_idx on public.note_comments (updated_at);
create index if not exists note_comments_note_idx on public.note_comments (note_id);
alter table public.note_comments enable row level security;
drop policy if exists "read" on public.note_comments;
create policy "read" on public.note_comments for select to authenticated using (public.my_role() is not null);
drop policy if exists "insert" on public.note_comments;
create policy "insert" on public.note_comments for insert to authenticated
  with check (public.my_role() is not null and author_id = auth.uid());
drop policy if exists "update" on public.note_comments;
create policy "update" on public.note_comments for update to authenticated
  using (public.my_role() is not null and author_id = auth.uid())
  with check (public.my_role() is not null and author_id = auth.uid());

create table if not exists public.elephant_passports (
  id text primary key,                 -- имя слонихи: Претти, Марго, Одри
  birth_year int,
  weight text not null default '',     -- примерный вес, справочно: весов в цирках нет
  character text not null default '',  -- характер и место в иерархии
  norm text not null default '',       -- своя норма («пьёт и мочится больше всех — это её норма»)
  legs text not null default '',       -- проблемные зоны ног и подошв
  allergies text not null default '',  -- аллергии, непереносимость
  forbidden text not null default '',  -- что категорически нельзя
  updated_by_name text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
drop trigger if exists touch on public.elephant_passports;
create trigger touch before insert or update on public.elephant_passports for each row execute function public.touch_updated_at();
create index if not exists elephant_passports_updated_idx on public.elephant_passports (updated_at);
alter table public.elephant_passports enable row level security;
drop policy if exists "read" on public.elephant_passports;
create policy "read" on public.elephant_passports for select to authenticated using (public.my_role() is not null);
drop policy if exists "write" on public.elephant_passports;
create policy "write" on public.elephant_passports for all to authenticated
  using (public.my_role() in ('vet', 'director', 'admin'))
  with check (public.my_role() in ('vet', 'director', 'admin'));

alter table public.requests add column if not exists route text not null default '';
alter table public.requests add column if not exists dose text not null default '';
alter table public.requests add column if not exists history jsonb not null default '[]'::jsonb;
alter table public.requests drop constraint if exists requests_frequency_check;
alter table public.requests add constraint requests_frequency_check check (frequency in ('once', 'shift', 'feeding', 'twice'));
