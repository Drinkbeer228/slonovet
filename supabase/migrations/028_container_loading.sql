-- «Контейнеры» без привязки к фуре: тип, габариты, «едет в туре». Погрузка — отдельно: фуры и сохранённые схемы («тетрис»).
-- Колонки truck / load_order / slot_x / slot_y из 025 остаются в базе, интерфейс их больше не пишет.
-- Только добавление, можно выполнять повторно.
alter table public.containers add column if not exists kind text not null default '';
alter table public.containers add column if not exists length_cm int check (length_cm is null or length_cm > 0);
alter table public.containers add column if not exists width_cm int check (width_cm is null or width_cm > 0);
alter table public.containers add column if not exists height_cm int check (height_cm is null or height_cm > 0);
alter table public.containers add column if not exists in_tour boolean not null default true;

-- Фуры: габариты кузова в см (пресет — еврофура 1360 × 245 × 270)
create table if not exists public.trucks (
  id text primary key,
  name text not null default '',
  length_cm int not null default 1360 check (length_cm > 0),
  width_cm int not null default 245 check (width_cm > 0),
  height_cm int not null default 270 check (height_cm > 0),
  created_by text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Схемы погрузки: очередь контейнеров (от передней стенки к дверям), выключенные и временные ящики
create table if not exists public.load_plans (
  id text primary key,
  name text not null default '',
  truck_id text,
  queue jsonb not null default '[]'::jsonb,
  off jsonb not null default '[]'::jsonb,
  extras jsonb not null default '[]'::jsonb,
  created_by text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

do $$
declare t text;
begin
  foreach t in array array['trucks', 'load_plans'] loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before insert or update on public.%I for each row execute function public.touch_updated_at()', t);
    execute format('create index if not exists %I on public.%I (updated_at)', t || '_updated_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "read" on public.%I', t);
    execute format('create policy "read" on public.%I for select to authenticated using (public.my_role() is not null)', t);
    -- как у описи: правят все, кроме врача
    execute format('drop policy if exists "write" on public.%I', t);
    execute format($p$create policy "write" on public.%I for all to authenticated
      using (public.my_role() in ('keeper', 'director', 'manager', 'admin'))
      with check (public.my_role() in ('keeper', 'director', 'manager', 'admin'))$p$, t);
  end loop;
end $$;
