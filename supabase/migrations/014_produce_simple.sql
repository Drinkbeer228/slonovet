-- Овощи и фрукты — как крупы: учёт в кг (плюс мешки/ящики), без сеток и вёдер. Можно выполнять повторно.
update public.stock_items set pick_unit = null, kg_per_garets = null where category = 'veg';
update public.diets set meals = (
  select jsonb_agg(case when m->>'time' = '19:00' then jsonb_set(m, '{prep}', '"мыть, крупная нарезка"') else m end order by o)
  from jsonb_array_elements(meals) with ordinality t(m, o)
);
