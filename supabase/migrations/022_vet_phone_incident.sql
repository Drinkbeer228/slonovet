-- Здоровье для врача (этап B1): телефон в профиле (кнопка «Позвонить врачу») и запись «ЧП» не про слониху.
-- Только добавления и расширение проверки: старые приложения работают как раньше.
alter table public.profiles add column if not exists phone text;

alter table public.notes drop constraint if exists notes_kind_check;
alter table public.notes add constraint notes_kind_check
  check (kind in ('observation', 'procedure', 'medication', 'incident'));
