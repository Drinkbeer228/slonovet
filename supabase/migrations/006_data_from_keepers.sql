-- Данные со слов слоноводов (25.10.2026): каша запаривается за ~час, состав и порция овощей, вес совка.
-- SQL Editor → Run. Повторный запуск ничего не испортит.
update public.diets set meals = replace(replace(meals::text,
  'запарить за 20 мин', 'запарить за 60 мин'),
  'Тыква, капуста, морковь, свёкла, картофель, сельдерей — по сезону',
  'Картофель 20 кг, морковь 20 кг, свёкла 20 кг + сезонное 10–15 кг (тыква, кабачки, капуста, перец, баклажаны, яблоки)')::jsonb;

-- совок (гарец) = 2 кг овса, остальное зерно — по плотности; овощи — порция ~75 кг на слониху
update public.stock_items set kg_per_garets = case id
  when 'oats' then 2 when 'hercules' then 1.5 when 'bran' then 1.1 when 'corn' then 3.2 when 'seeds' then 1.9 when 'veg' then 75 end
where id in ('oats', 'hercules', 'bran', 'corn', 'seeds', 'veg');
