#!/bin/sh
# Проверка копии: можно ли из неё поднять базу. Рабочую базу не трогает.
# Поднимает временный Postgres того же образа без сети, заливает копию, сравнивает число строк
# в таблицах приложения с рабочей базой и удаляет временный контейнер.
# На сервере: /opt/slonovet/restore-check.sh [файл копии]   (по умолчанию — последняя ночная)
set -eu
DUMP=${1:-/opt/slonovet/backups/db-latest.dump}
NAME=slonovet-restore-check
IMAGE=$(docker inspect -f '{{.Config.Image}}' supabase-db)
PW=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')
TABLES="auth.users public.profiles public.shifts public.requests public.request_marks public.notes public.stock_items public.stock_moves public.diets public.move_items public.purchases public.events storage.objects"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

test -s "$DUMP" || { echo "Нет копии: $DUMP"; exit 1; }
echo "Копия: $(readlink -f "$DUMP"), $(du -h "$(readlink -f "$DUMP")" | cut -f1), от $(date -r "$(readlink -f "$DUMP")" '+%d.%m %H:%M')"

docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD="$PW" "$IMAGE" >/dev/null
# первый запуск образа делает начальную настройку; по TCP база отвечает, только когда она закончена
i=0
until docker exec -e PGPASSWORD="$PW" "$NAME" pg_isready -h localhost -U supabase_admin >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then echo "Временная база не поднялась"; docker logs --tail 30 "$NAME"; exit 1; fi
  sleep 2
done

docker cp "$(readlink -f "$DUMP")" "$NAME:/tmp/db.dump"
# ошибки по служебным расширениям Supabase не мешают данным — считаем и показываем их отдельно
docker exec -e PGPASSWORD="$PW" "$NAME" pg_restore -h localhost -U supabase_admin -d postgres --clean --if-exists /tmp/db.dump > /tmp/restore-check.log 2>&1 || true
ERRORS=$(grep -c '^pg_restore: error' /tmp/restore-check.log || true)

count() { # $1 — контейнер, $2 — пользователь, $3 — таблица
  docker exec -e PGPASSWORD="$PW" "$1" psql -h localhost -U "$2" -d postgres -Atc "select count(*) from $3" 2>/dev/null || echo "нет"
}
count_live() { docker exec supabase-db psql -U postgres -d postgres -Atc "select count(*) from $1" 2>/dev/null || echo "нет"; }

FAIL=0
printf '%-22s %10s %10s\n' "таблица" "в копии" "сейчас"
for t in $TABLES; do
  a=$(count "$NAME" supabase_admin "$t")
  b=$(count_live "$t")
  mark=""
  if [ "$a" = "нет" ]; then mark="  ← не восстановилась"; FAIL=1
  elif [ "$a" != "$b" ]; then mark="  (изменилось после копии)"; fi
  printf '%-22s %10s %10s%s\n' "$t" "$a" "$b" "$mark"
done

# права (RLS) и функции приложения тоже должны вернуться — без них база откроется, но работать не будет
for q in "политики public|select count(*) from pg_policies where schemaname = 'public'" \
         "функции public|select count(*) from pg_proc where pronamespace = 'public'::regnamespace"; do
  label=${q%%|*}
  sql=${q#*|}
  a=$(docker exec -e PGPASSWORD="$PW" "$NAME" psql -h localhost -U supabase_admin -d postgres -Atc "$sql" 2>/dev/null || echo "нет")
  b=$(docker exec supabase-db psql -U postgres -d postgres -Atc "$sql" 2>/dev/null || echo "нет")
  mark=""
  if [ "$a" != "$b" ]; then mark="  ← не совпадает"; FAIL=1; fi
  printf '%-22s %10s %10s%s\n' "$label" "$a" "$b" "$mark"
done

echo "Ошибок восстановления: $ERRORS (подробно: /tmp/restore-check.log)"
if [ "$ERRORS" -gt 0 ]; then grep '^pg_restore: error' /tmp/restore-check.log | cut -c1-160 | sort | uniq -c | sort -rn | head -10; fi
if [ "$FAIL" -ne 0 ]; then echo "ПРОВЕРКА НЕ ПРОЙДЕНА"; exit 1; fi
echo "Копия восстанавливается."
