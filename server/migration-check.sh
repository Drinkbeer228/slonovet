#!/bin/sh
# Проверка миграции на временной копии базы. Рабочую базу не трогает: поднимает отдельный Postgres без сети,
# заливает ночную копию, накатывает миграцию (дважды: она должна быть повторяемой), прогоняет SQL-проверки и
# удаляет временный контейнер. Как restore-check.sh, но с миграцией.
# На сервере:  /opt/slonovet/migration-check.sh /путь/019_relay_shifts.sql [файл копии]
set -eu
MIG=${1:?Укажите файл миграции}
DUMP=${2:-/opt/slonovet/backups/db-latest.dump}
NAME=slonovet-migration-check
IMAGE=$(docker inspect -f '{{.Config.Image}}' supabase-db)
PW=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
test -s "$MIG" || { echo "Нет файла: $MIG"; exit 1; }
test -s "$DUMP" || { echo "Нет копии: $DUMP"; exit 1; }
echo "Миграция: $MIG; копия: $(readlink -f "$DUMP")"

docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD="$PW" "$IMAGE" >/dev/null
i=0
until docker exec -e PGPASSWORD="$PW" "$NAME" pg_isready -h localhost -U supabase_admin >/dev/null 2>&1; do
  i=$((i + 1)); if [ "$i" -gt 90 ]; then echo "Временная база не поднялась"; exit 1; fi; sleep 2
done
docker cp "$(readlink -f "$DUMP")" "$NAME:/tmp/db.dump"
docker cp "$MIG" "$NAME:/tmp/mig.sql"
docker exec -e PGPASSWORD="$PW" "$NAME" pg_restore -h localhost -U supabase_admin -d postgres --clean --if-exists /tmp/db.dump >/tmp/migration-check-restore.log 2>&1 || true

psql_t() { docker exec -i -e PGPASSWORD="$PW" -e PGOPTIONS='-c client_min_messages=notice' "$NAME" psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }

echo "== до миграции"
psql_t -Atc "select 'смен: ' || count(*) || ', открытых: ' || count(*) filter (where status = 'open' and not deleted) from public.shifts"
psql_t -Atc "select 'применено миграций: ' || count(*) || ', последняя: ' || max(file) from slonovet.migrations"

echo "== накат (как migrate.sh: одна транзакция) и повторный накат"
NAME_F=$(basename "$MIG")
{ cat "$MIG"; printf "\ninsert into slonovet.migrations (file, sha256) values ('%s', 'check') on conflict do nothing;\n" "$NAME_F"; } | psql_t -1 -q -f - && echo "накат 1: ок"
docker exec -e PGPASSWORD="$PW" "$NAME" psql -h localhost -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -1 -q -f /tmp/mig.sql && echo "накат 2 (повторный): ок"

echo "== проверки"
psql_t -q <<'SQL'
begin;
do $$
declare
  ka uuid; kb uuid; kd uuid; km uuid;
  s record; n int;
begin
  select id into ka from public.profiles where role = 'keeper' and active limit 1;
  select id into kb from public.profiles where id <> ka and active order by role = 'keeper' desc limit 1;
  if ka is null or kb is null then raise exception 'FAIL: в копии нет двух активных профилей'; end if;

  -- 1. колонки, триггер, политика
  perform 1 from information_schema.columns where table_name = 'shifts' and column_name in ('handover_to', 'closed_by', 'close_reason') having count(*) = 3;
  if not found then raise exception 'FAIL: нет новых колонок'; end if;
  perform 1 from pg_trigger where tgname = 'shifts_relay' and not tgisinternal;
  if not found then raise exception 'FAIL: нет триггера shifts_relay'; end if;
  perform 1 from pg_policies where tablename = 'shifts' and policyname = 'write_own';
  if not found then raise exception 'FAIL: нет политики write_own'; end if;
  raise notice 'ok: колонки, триггер и политика на месте';

  -- 2. принятие без сдачи: смена Б закрывает открытую смену А как takeover
  perform public.apply_shift_patch('T-A', jsonb_build_object('date', '2030-01-01', 'keeper_id', ka, 'keeper_name', 'А', 'status', 'open', 'accepted_at', '2030-01-01T08:00:00Z'), '[]');
  perform public.apply_shift_patch('T-B', jsonb_build_object('date', '2030-01-01', 'keeper_id', kb, 'keeper_name', 'Б', 'status', 'open', 'accepted_at', '2030-01-01T20:00:00Z', 'accepted_from', 'T-A'), '[]');
  select status, close_reason, closed_by into s from public.shifts where id = 'T-A';
  if s.status <> 'handed' or s.close_reason <> 'takeover' or s.closed_by <> kb then raise exception 'FAIL takeover: % % %', s.status, s.close_reason, s.closed_by; end if;
  raise notice 'ok: принятие без сдачи закрыло прежнюю смену (takeover)';

  -- 3. новые сутки у того же человека: rollover
  perform public.apply_shift_patch('T-C', jsonb_build_object('date', '2030-01-02', 'keeper_id', kb, 'keeper_name', 'Б', 'status', 'open', 'accepted_at', '2030-01-02T08:00:00Z', 'accepted_from', 'T-B'), '[]');
  select close_reason into s from public.shifts where id = 'T-B';
  if s.close_reason <> 'rollover' then raise exception 'FAIL rollover: %', s.close_reason; end if;
  raise notice 'ok: новые сутки закрыли прежнюю как rollover';

  -- 4. опоздавшая старая смена приходит уже закрытой и никому не отказывают
  perform public.apply_shift_patch('T-D', jsonb_build_object('date', '2030-01-01', 'keeper_id', ka, 'keeper_name', 'А', 'status', 'open', 'accepted_at', '2030-01-01T12:00:00Z'), '[]');
  select status, close_reason into s from public.shifts where id = 'T-D';
  if s.status <> 'handed' or s.close_reason <> 'superseded' then raise exception 'FAIL superseded: % %', s.status, s.close_reason; end if;
  select count(*) into n from public.shifts where status = 'open' and not deleted;
  if n <> 1 then raise exception 'FAIL: открытых смен после проверок %, а должна быть одна', n; end if;
  raise notice 'ok: опоздавшая смена закрыта superseded, открытая смена одна';

  -- 5. патч поля handover_to доходит (старый вызов без новых полей тоже работал выше)
  perform public.apply_shift_patch('T-C', null, '[{"path":["handover_to"],"value":"00000000-0000-0000-0000-000000000001"}]');
  select handover_to::text into s from public.shifts where id = 'T-C';
  if s.handover_to is distinct from '00000000-0000-0000-0000-000000000001' then raise exception 'FAIL: handover_to не записался'; end if;
  raise notice 'ok: патч новых полей работает';

  -- 6. права: директор и администратор пишут только свою смену
  select id into kd from public.profiles where role = 'director' and active limit 1;
  select id into km from public.profiles where role = 'manager' and active limit 1;
  for s in select x.uid, x.who from (values (kd, 'директор'), (km, 'администратор')) as x(uid, who) loop
    if s.uid is null then raise notice 'пропуск: в копии нет роли «%»', s.who; continue; end if;
    perform set_config('request.jwt.claim.sub', s.uid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', s.uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.apply_shift_patch('T-R-' || s.who, jsonb_build_object('date', '2030-01-05', 'keeper_id', s.uid, 'keeper_name', 'X', 'status', 'open', 'accepted_at', '2030-01-05T08:00:00Z'), '[]');
      raise notice 'ok: % записал свою смену', s.who;
    exception when others then
      execute 'reset role';
      raise exception 'FAIL: % не смог записать свою смену: %', s.who, sqlerrm;
    end;
    begin
      perform public.apply_shift_patch('T-X-' || s.who, jsonb_build_object('date', '2030-01-06', 'keeper_id', ka, 'keeper_name', 'чужая', 'status', 'open', 'accepted_at', '2030-01-06T08:00:00Z'), '[]');
      execute 'reset role';
      raise exception 'FAIL: % записал смену за другого', s.who;
    exception when insufficient_privilege then
      raise notice 'ok: % не может писать чужую смену', s.who;
    end;
    execute 'reset role';
  end loop;
end $$;
rollback;
SQL
echo "ВСЁ ПРОШЛО: миграцию можно применять на рабочей базе"
