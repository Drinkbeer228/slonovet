#!/bin/sh
# Ночная копия СлоноВета на сервере (cron 03:30, см. server/slonovet.cron).
# База целиком (люди, пароли, данные) — 14 дней, журнал действий — 180 дней. Фото — одна копия-зеркало: дописываются только новые,
# удалённые в приложении остаются в копии на всякий случай. Лежит на сервере: /opt/slonovet/backup.sh
# Забирает копию раз в неделю GitHub (backup.yml) отдельным ключом пользователя slonovet-backup — только чтение этой папки.
set -e
D=/opt/slonovet/backups
T=$(date +%F)
docker exec supabase-db pg_dump -U postgres -d postgres --format=custom > $D/db-$T.dump.tmp && mv $D/db-$T.dump.tmp $D/db-$T.dump
# db-latest — жёсткая ссылка, а не символьная: ключ с rrsync по символьным ссылкам не ходит
ln -f $D/db-$T.dump $D/db-latest.dump
find $D -name "db-*.dump" -mtime +14 -delete
# журнал действий (что нажимают, где падает) храним полгода — дальше он только растёт
docker exec supabase-db psql -U postgres -d postgres -qc "delete from public.events where created_at < now() - interval '180 days'"

mkdir -p $D/photos
rsync -a /opt/supabase/volumes/storage/ $D/photos/
chgrp -R slonovet-backup $D && chmod 750 $D && chmod 640 $D/*.dump
