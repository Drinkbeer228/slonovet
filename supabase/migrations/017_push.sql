-- Push-уведомления: подписки телефонов, защита от повторов и триггеры, которые зовут функцию notify.
-- Срочное назначение — киперам; «плохо» у слонихи — врачу и директору; просьба купить — закупщикам.
-- Секрет для вызова функции кладётся отдельно (не в миграции): insert into slonovet.settings values ('notify_secret', '…').
-- Можно выполнять повторно.

-- подписка телефона: один адрес push — один человек (кто вошёл последним на этом телефоне)
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
-- политик нет: из приложения таблицу не видно, пишут только функции ниже

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void language sql security definer set search_path = public as $$
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  select p_endpoint, auth.uid(), p_p256dh, p_auth where public.my_role() is not null
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
revoke execute on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- служебное: настройки (секрет вызова notify) и что уже отправлено — схема закрыта от приложения
create schema if not exists slonovet;
revoke all on schema slonovet from public;
create table if not exists slonovet.settings (key text primary key, value text not null);
create table if not exists slonovet.push_sent (key text primary key, at timestamptz not null default now());

-- позвать функцию notify (внутри сервера, без выхода наружу); нет секрета — молча ничего
create or replace function slonovet.notify(payload jsonb)
returns void language plpgsql security definer set search_path = public, slonovet as $$
declare secret text := (select value from slonovet.settings where key = 'notify_secret');
begin
  if secret is null then return; end if;
  -- уведомление не важнее данных: сорвался вызов — запись всё равно сохраняется
  begin
    perform net.http_post(
      url := 'http://functions:9000/notify',
      body := payload,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret)
    );
  exception when others then
    raise warning 'push: %', sqlerrm;
  end;
end $$;
revoke execute on function slonovet.notify(jsonb) from public, anon, authenticated;

-- срочное назначение
create or replace function slonovet.on_request_insert()
returns trigger language plpgsql security definer set search_path = public, slonovet as $$
begin
  if new.urgent and new.status = 'active' and not new.deleted then
    perform slonovet.notify(jsonb_build_object('type', 'urgent', 'id', new.id, 'elephant', new.elephant, 'text', new.text, 'author_id', new.author_id));
  end if;
  return new;
end $$;
drop trigger if exists push_urgent on public.requests;
create trigger push_urgent after insert on public.requests for each row execute function slonovet.on_request_insert();

-- «плохо» у слонихи: только что появилось (не было до этой правки)
create or replace function slonovet.on_shift_change()
returns trigger language plpgsql security definer set search_path = public, slonovet as $$
declare r record;
begin
  for r in
    select e.key as elephant, m.key as metric
    from jsonb_each(coalesce(new.state, '{}'::jsonb)) e, jsonb_each(case when jsonb_typeof(e.value) = 'object' then e.value else '{}'::jsonb end) m
    where m.value ->> 'level' = '2'
      and (tg_op = 'INSERT' or coalesce(old.state -> e.key -> m.key ->> 'level', '') <> '2')
  loop
    perform slonovet.notify(jsonb_build_object('type', 'bad', 'shift_id', new.id, 'elephant', r.elephant, 'metric', r.metric, 'keeper_name', new.keeper_name, 'author_id', new.keeper_id));
  end loop;
  return new;
end $$;
drop trigger if exists push_bad on public.shifts;
create trigger push_bad after insert or update of state on public.shifts for each row execute function slonovet.on_shift_change();

-- просьба купить
create or replace function slonovet.on_purchase_insert()
returns trigger language plpgsql security definer set search_path = public, slonovet as $$
begin
  if new.status = 'new' and not new.deleted then
    perform slonovet.notify(jsonb_build_object('type', 'purchase', 'id', new.id, 'title', new.title, 'amount', new.amount, 'urgent', new.urgent, 'author_id', new.author_id));
  end if;
  return new;
end $$;
drop trigger if exists push_purchase on public.purchases;
create trigger push_purchase after insert on public.purchases for each row execute function slonovet.on_purchase_insert();

-- функция notify отмечает «уже отправлено» (true — впервые); старше 30 дней забываем. Только сервер (service_role)
create or replace function public.push_mark_sent(p_key text)
returns boolean language plpgsql security definer set search_path = public, slonovet as $$
declare inserted boolean;
begin
  delete from slonovet.push_sent where at < now() - interval '30 days';
  insert into slonovet.push_sent (key) values (p_key) on conflict (key) do nothing returning true into inserted;
  return coalesce(inserted, false);
end $$;
revoke execute on function public.push_mark_sent(text) from public, anon, authenticated;
grant execute on function public.push_mark_sent(text) to service_role;
