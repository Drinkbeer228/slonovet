#!/bin/sh
# Ночная копия СлоноВета на сервере (cron 03:30, /etc/cron.d/slonovet-backup).
# База целиком (люди, пароли, данные) — 14 дней. Фото — одна копия-зеркало: дописываются только новые,
# удалённые в приложении остаются в копии на всякий случай. Лежит на сервере: /opt/slonovet/backup.sh
set -e
D=/opt/slonovet/backups
T=$(date +%F)
docker exec supabase-db pg_dump -U postgres -d postgres --format=custom > $D/db-$T.dump.tmp && mv $D/db-$T.dump.tmp $D/db-$T.dump
ln -sf $D/db-$T.dump $D/db-latest.dump
find $D -name "db-*.dump" -mtime +14 -delete
mkdir -p $D/photos
rsync -a /opt/supabase/volumes/storage/ $D/photos/
chgrp -R deploy $D && chmod 750 $D && chmod 640 $D/*.dump
