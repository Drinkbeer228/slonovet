-- «Контейнеры»: вид делится на тару (kind) и «что внутри» (purpose).
-- Старые виды «Свет/звук», «Реквизит», «Личный багаж» были про содержимое — переносим их в purpose, тару оставляем пустой.
-- Повторяемая: второй прогон ничего не меняет.
alter table public.containers add column if not exists purpose text not null default '';

update public.containers set purpose = kind, kind = '' where kind in ('light_sound', 'props');
update public.containers set purpose = 'personal', kind = '' where kind = 'luggage';
