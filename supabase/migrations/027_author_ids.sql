-- Статистика по сотруднику: кто отметил задачу и кто написал запись — по id, а не только по имени
-- (имя меняется: «Андрей» → полное ФИО). Старые строки без id считаются по имени.
-- Только добавление колонок, можно выполнять повторно.
alter table public.request_marks add column if not exists done_by_id text;
alter table public.notes add column if not exists author_id text;
