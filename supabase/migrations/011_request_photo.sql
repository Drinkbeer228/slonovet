-- Задачи и назначения: автор может сразу приложить фото (машина сена, неубранный проход). Можно выполнять повторно.
alter table public.requests add column if not exists photo_path text;
