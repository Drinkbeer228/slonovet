-- Закупки: когда обещали привезти (необязательно). Отмечает тот, кто заказал. Можно выполнять повторно.
alter table public.purchases add column if not exists delivery_date date;
