-- Овощи и фрукты по-настоящему: каждая позиция отдельно, хранится мешками/ящиками (sack_kg),
-- в работу берётся сетками/вёдрами (pick_unit, вес — kg_per_garets). Плюс внеплановая выдача и брак.
-- Можно выполнять повторно.
alter table public.stock_items add column if not exists pick_unit text;

-- движения: «вне рациона» (манеж, репетиция, шоу) и «брак» (гниль при переборке); повод — в note
alter table public.stock_moves add column if not exists note text not null default '';
alter table public.stock_moves drop constraint if exists stock_moves_reason_check;
alter table public.stock_moves add constraint stock_moves_reason_check check (reason in ('in', 'feed', 'hay', 'fix', 'extra', 'waste'));

insert into public.stock_items (id, name, category, kind, unit, sack_kg, kg_per_garets, pick_unit, low_days, sort) values
  ('potato', 'Картофель', 'veg', 'sack', 'мешок', 40, 20, 'сетка', 3, 20),
  ('carrot', 'Морковь', 'veg', 'sack', 'мешок', 40, 20, 'сетка', 3, 21),
  ('beet', 'Свёкла', 'veg', 'sack', 'мешок', 40, 20, 'сетка', 3, 22),
  ('cabbage', 'Капуста', 'veg', 'sack', 'сетка', 30, 20, 'сетка', 3, 23),
  ('apple', 'Яблоки', 'veg', 'sack', 'ящик', 20, 10, 'ведро', 3, 24),
  ('banana', 'Бананы', 'veg', 'sack', 'ящик', 18, 6, 'гроздь', 3, 25)
on conflict (id) do nothing;

-- общая позиция «Овощи» больше не нужна (движений по ней не было)
update public.stock_items set deleted = true where id = 'veg' and not exists (select 1 from public.stock_moves where item_id = 'veg' and not deleted);

-- вечернее кормление: картофель, морковь, свёкла по 20 кг каждой слонихе — списываются сами, как каши
update public.diets set meals = (
  select jsonb_agg(
    case when m->>'time' = '19:00' then jsonb_set(m, '{items}', jsonb_build_array(
      jsonb_build_object('item', 'potato', 'name', 'Картофель', 'qty', 20, 'unit', 'кг'),
      jsonb_build_object('item', 'carrot', 'name', 'Морковь', 'qty', 20, 'unit', 'кг'),
      jsonb_build_object('item', 'beet', 'name', 'Свёкла', 'qty', 20, 'unit', 'кг'),
      jsonb_build_object('item', null, 'name', 'Сезонное 10–15 кг: тыква, кабачки, капуста, перец, баклажаны, яблоки', 'qty', null, 'unit', 'кг')
    )) else m end order by ord)
  from jsonb_array_elements(meals) with ordinality as t(m, ord)
)
where exists (select 1 from jsonb_array_elements(meals) m where m->>'time' = '19:00' and m->'items' @> '[{"item": "veg"}]');
