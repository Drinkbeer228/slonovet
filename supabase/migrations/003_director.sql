-- Роль «директор»: видит всё, ставит назначения и рабочие задачи (в панели смены), смены и склад не правит.
-- Нужно, только если кому-то ставите роль «Директор». SQL Editor → Run, можно повторно.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('keeper', 'vet', 'director', 'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := new.raw_app_meta_data->>'role';
begin
  insert into public.profiles (id, login, full_name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'login', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when r in ('keeper', 'vet', 'director', 'admin') then r else 'keeper' end,
    coalesce(r in ('keeper', 'vet', 'director', 'admin'), false)
  )
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy if exists "write" on public.requests;
create policy "write" on public.requests for all to authenticated
  using (public.my_role() in ('vet', 'director', 'admin'))
  with check (public.my_role() in ('vet', 'director', 'admin'));
