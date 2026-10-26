#!/bin/sh
# Миграции базы на сервере: что применено и накатить недостающие. Запускать из папки проекта.
#   ./server/migrate.sh            показать: применена / ждёт / изменена после применения
#   ./server/migrate.sh apply      свежая копия базы, затем недостающие миграции по порядку
#   ./server/migrate.sh baseline   один раз, на базе, где всё уже применено руками: записать текущие файлы в учёт
# Учёт — таблица slonovet.migrations (файл, sha256, когда). Миграция и её запись в учёт — одна транзакция:
# упала на середине — не применилось ничего. Миграции пишем повторяемыми и только добавляющими.
# Свой адрес и ключ: SLONOVET_SSH="ssh -i ~/.ssh/ключ root@адрес" ./server/migrate.sh
# Другой контейнер базы (проверка на временной копии): SLONOVET_DB=имя — копию рабочей базы тогда не делаем.
set -eu
cd "$(dirname "$0")/.."
SSH=${SLONOVET_SSH:-"ssh -i $HOME/.ssh/slonovet_beget -o ConnectTimeout=15 root@159.194.208.29"}
DB=${SLONOVET_DB:-supabase-db}
DIR=supabase/migrations
CMD=${1:-status}

psql_remote() { $SSH "docker exec -i -e PGOPTIONS='-c client_min_messages=warning' $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq $*"; }

psql_remote <<'SQL'
create schema if not exists slonovet;
revoke all on schema slonovet from public;
create table if not exists slonovet.migrations (
  file text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now()
);
SQL

APPLIED=$(echo "select file || ' ' || sha256 from slonovet.migrations order by file;" | psql_remote)
PENDING=""
for f in "$DIR"/*.sql; do
  name=$(basename "$f")
  case $name in *"'"* | *" "*) echo "Плохое имя файла: $name"; exit 1 ;; esac
  sum=$(sha256sum "$f" | cut -d' ' -f1)
  rec=$(printf '%s\n' "$APPLIED" | awk -v n="$name" '$1 == n { print $2 }')
  if [ -z "$rec" ]; then
    state="ждёт"
    PENDING="$PENDING $f"
  elif [ "$rec" = "$sum" ]; then
    state="применена"
  else
    state="ИЗМЕНЕНА после применения — новую правку оформить новым файлом"
  fi
  if [ "$CMD" = status ]; then printf '%-30s %s\n' "$name" "$state"; fi
done
# записи в учёте, у которых больше нет файла
printf '%s\n' "$APPLIED" | while read -r name _; do
  if [ -n "$name" ] && [ ! -f "$DIR/$name" ]; then echo "$name — в учёте есть, файла в проекте нет"; fi
done

case $CMD in
  status)
    if [ -z "$PENDING" ]; then
      echo "Всё применено."
    else
      echo "Ждут применения:$(for f in $PENDING; do printf ' %s' "$(basename "$f")"; done). Применить: ./server/migrate.sh apply"
    fi
    ;;
  apply)
    if [ -z "$PENDING" ]; then echo "Всё применено."; exit 0; fi
    if [ "$DB" = supabase-db ]; then
      echo "Свежая копия базы перед миграцией…"
      $SSH /opt/slonovet/backup.sh
    fi
    for f in $PENDING; do
      name=$(basename "$f")
      sum=$(sha256sum "$f" | cut -d' ' -f1)
      echo "→ $name"
      { cat "$f"; printf "\ninsert into slonovet.migrations (file, sha256) values ('%s', '%s');\n" "$name" "$sum"; } | psql_remote -1 -f -
    done
    echo "Готово."
    ;;
  baseline)
    n=$(echo "select count(*) from slonovet.migrations;" | psql_remote)
    if [ "$n" != 0 ]; then echo "Учёт уже ведётся ($n записей) — baseline только для первого раза."; exit 1; fi
    {
      echo "begin;"
      for f in "$DIR"/*.sql; do
        printf "insert into slonovet.migrations (file, sha256) values ('%s', '%s');\n" "$(basename "$f")" "$(sha256sum "$f" | cut -d' ' -f1)"
      done
      echo "commit;"
    } | psql_remote
    echo "Записаны как применённые: $(ls "$DIR"/*.sql | wc -l) файлов."
    ;;
  *)
    echo "Команды: status (по умолчанию), apply, baseline"
    exit 1
    ;;
esac
