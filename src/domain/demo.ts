import { getRows, seedRows } from '../lib/store';
import { addDays, isoDate } from '../lib/dates';
import { ELEPHANTS, METRICS } from './elephants';
import { SEED_DIETS, SEED_STOCK_ITEMS } from './seed';
import { FEED_TIMES } from './shift';
import { feedUsage } from './stock';
import type { ElephantName, Level, MetricKey, Note, Profile, RequestMark, Shift, StockMove, VetRequest } from './types';

/** Демо-данные: 14 прошедших смен, заявки, склад. Только для режима без сервера. */
export async function seedDemo() {
  if (getRows('shifts').length || getRows('stock_items').length) return;
  const today = isoDate();
  const ts = (date: string, time = '09:00') => new Date(`${date}T${time}:00`).toISOString();
  const now = new Date().toISOString();

  const profiles: Profile[] = [
    { id: 'demo-keeper', login: 'sokolov', full_name: 'Соколов', role: 'keeper', active: true, updated_at: now },
    { id: 'demo-keeper2', login: 'orlov', full_name: 'Орлов', role: 'keeper', active: true, updated_at: now },
    { id: 'demo-vet', login: 'vet', full_name: 'Иванова', role: 'vet', active: true, updated_at: now },
    { id: 'demo-admin', login: 'admin', full_name: 'Администратор', role: 'admin', active: true, updated_at: now },
  ];

  const flags: [ElephantName, MetricKey, number, Level, string][] = [
    ['Марго', 'water', -3, 1, 'пьёт мало'],
    ['Марго', 'water', -2, 1, 'пьёт мало'],
    ['Марго', 'water', -1, 1, 'пьёт мало'],
    ['Марго', 'urine', -11, 1, 'песок / осадок'],
    ['Марго', 'urine', -5, 1, 'песок / осадок'],
    ['Марго', 'urine', -2, 1, 'песок / осадок'],
    ['Марго', 'food', -2, 1, 'не доела'],
    ['Претти', 'sleep', -12, 1, 'беспокойно'],
    ['Претти', 'behavior', -7, 1, 'качается'],
    ['Одри', 'food', -3, 1, 'не доела'],
    ['Одри', 'food', -1, 1, 'не доела'],
  ];

  const shifts: Shift[] = [];
  const moves: StockMove[] = [];
  for (let i = 14; i >= 1; i--) {
    const date = addDays(today, -i);
    const keeper = i % 2 ? profiles[1] : profiles[0];
    const state: Shift['state'] = {};
    for (const el of ELEPHANTS) {
      state[el] = {};
      for (const m of METRICS) {
        if (i === 1 && el === 'Марго' && m.key === 'feces') continue; // не отмечено
        const f = flags.find((x) => x[0] === el && x[1] === m.key && x[2] === -i);
        state[el]![m.key] = f ? { level: f[3], symptoms: [f[4]] } : { level: 0 };
      }
    }
    const feeds: Shift['feeds'] = {};
    for (const t of FEED_TIMES) {
      feeds[t] = { done: true, at: ts(date, t), eaten: { Претти: 'all', Марго: 'all', Одри: 'all' } };
    }
    if (i === 1) feeds['13:00'].eaten!.Одри = 'half';
    if (i === 2) feeds['17:00'].eaten!.Марго = 'half';
    shifts.push({
      id: date,
      date,
      keeper_id: keeper.id,
      keeper_name: keeper.full_name,
      status: 'handed',
      safety: { fence: true, locks: true, items: true, elephants: true, water: true, hay: true, tools: true },
      state,
      feeds,
      quests: {
        urine: {
          Претти: { ok: 4 + (i % 3), miss: i % 4 === 0 ? 1 : 0 },
          Марго: { ok: 5 + (i % 2), miss: i % 5 === 0 ? 1 : 0 },
          Одри: { ok: 2 + (i % 2), miss: 1 },
        },
        branches: { amount: i % 5 === 0 ? 1 : 2, kinds: [i % 2 ? 'Ива' : 'Ольха'] },
        // моют перед шоу — обычно в пятницу
        wash: new Date(`${date}T12:00:00`).getDay() === 5 ? { at: '10:30' } : undefined,
        feces: { Претти: 5 + (i % 3), Марго: 4 + (i % 2), Одри: i === 2 ? 1 : 5 },
        cleaning: { bags: 1, out: i % 3 === 0 ? 3 : 0 },
      },
      hay_bales: 9,
      note:
        i === 1
          ? 'Марго мало пьёт третий день — проверь бак и подогрей воду. Одри не доела дневную кашу.'
          : i === 3
            ? 'Ночь спокойная. Ветки ива, 30 кг.'
            : '',
      accepted_at: ts(date, '08:00'),
      handed_at: ts(addDays(date, 1), '08:00'),
      checked_at: ts(addDays(date, 1), '08:00'),
      // вчерашняя смена ждёт передачи: в примере сдающий диктует 2580
      handover_code: i === 1 ? '2580' : null,
      accepted_from: i < 14 ? addDays(date, -1) : null,
      accept_remarks: i === 4 ? 'Мокрая подстилка у Одри. Вещи у ограждения' : '',
      updated_at: now,
    });
    moves.push({
      id: `hay:${date}`,
      item_id: 'hay',
      delta: -9,
      reason: 'hay',
      shift_id: date,
      author_name: keeper.full_name,
      created_at: ts(date, '20:00'),
      updated_at: now,
    });
    moves.push({
      id: `bags:${date}`,
      item_id: 'bags',
      delta: -1,
      reason: 'feed',
      shift_id: date,
      author_name: keeper.full_name,
      created_at: ts(date, '21:00'),
      updated_at: now,
    });
    // корм по рациону и овощи по весу — как при настоящих отметках кипера
    for (const t of FEED_TIMES) {
      for (const [item, qty] of feedUsage(SEED_DIETS, t, SEED_STOCK_ITEMS)) {
        moves.push({
          id: `feed:${date}:${t}:${item}`,
          item_id: item,
          delta: -qty,
          reason: 'feed',
          shift_id: date,
          author_name: keeper.full_name,
          created_at: ts(date, t),
          updated_at: now,
        });
      }
    }
    const vegKg = 40 + (i % 4) * 2;
    feeds['19:00'].kg = vegKg;
    moves.push({
      id: `veg:${date}:19:00`,
      item_id: 'veg',
      delta: -vegKg,
      reason: 'feed',
      shift_id: date,
      author_name: keeper.full_name,
      created_at: ts(date, '19:00'),
      updated_at: now,
    });
  }

  // приход 15 дней назад = остаток на сегодня + всё, что выдали за 14 смен
  const start = addDays(today, -15);
  const used = new Map<string, number>();
  for (const m of moves) used.set(m.item_id, (used.get(m.item_id) ?? 0) - m.delta);
  const left: [string, number][] = [
    ['hay', 34],
    ['veg', 140],
    ['formamax', 75],
    ['optiform', 40],
    ['monograss', 7],
    ['hercules', 50],
    ['bran', 30],
    ['oats', 45],
    ['corn', 20],
    ['seeds', 9],
    ['bags', 16],
  ];
  for (const [item, rest] of left) {
    const qty = Math.round((rest + (used.get(item) ?? 0)) * 10) / 10;
    moves.push({
      id: `in:${item}:${start}`,
      item_id: item,
      delta: qty,
      reason: 'in',
      shift_id: null,
      author_name: 'Соколов',
      created_at: ts(start, '10:00'),
      updated_at: now,
    });
  }

  const requests: VetRequest[] = [
    {
      id: 'demo-r1',
      elephant: 'Марго',
      text: 'Смотреть осадок в моче. Песок или взвесь — сфотографировать.',
      frequency: 'shift',
      due_date: addDays(today, 6),
      needs_photo: true,
      urgent: false,
      author_id: 'demo-vet',
      author_name: 'Иванова',
      status: 'active',
      created_at: ts(addDays(today, -5), '10:00'),
      updated_at: now,
    },
    {
      id: 'demo-r2',
      elephant: 'Одри',
      text: 'Сколько съела каши Mono Grass в 13:00?',
      frequency: 'once',
      due_date: today,
      needs_photo: false,
      urgent: true,
      options: ['всё', 'половину', 'отказ'],
      author_id: 'demo-vet',
      author_name: 'Иванова',
      status: 'active',
      created_at: ts(addDays(today, -1), '18:00'),
      updated_at: now,
    },
    {
      id: 'demo-r3',
      elephant: 'Претти',
      text: 'Обработать левую височную железу.',
      frequency: 'once',
      due_date: addDays(today, -4),
      needs_photo: false,
      urgent: false,
      author_id: 'demo-vet',
      author_name: 'Иванова',
      status: 'closed',
      created_at: ts(addDays(today, -6), '10:00'),
      updated_at: now,
    },
  ];

  const marks: RequestMark[] = [-5, -4, -3, -2].map((d) => ({
    id: `demo-m${d}`,
    request_id: 'demo-r1',
    shift_id: addDays(today, d),
    done_by: d % 2 ? 'Орлов' : 'Соколов',
    done_at: ts(addDays(today, d), '12:00'),
    note: d === -2 ? 'немного песка' : '',
    photo_path: null,
    updated_at: now,
  }));
  marks.push({
    id: 'demo-m-r3',
    request_id: 'demo-r3',
    shift_id: addDays(today, -4),
    done_by: 'Соколов',
    done_at: ts(addDays(today, -4), '11:00'),
    note: '',
    photo_path: null,
    updated_at: now,
  });

  const notes: Note[] = [
    {
      id: 'demo-n1',
      shift_id: addDays(today, -1),
      elephant: 'Марго',
      kind: 'observation',
      metric: 'water',
      text: 'К воде подходила два раза за утро, выпила мало.',
      photo_path: null,
      author_name: 'Орлов',
      created_at: ts(addDays(today, -1), '11:20'),
      updated_at: now,
    },
    {
      id: 'demo-n2',
      shift_id: addDays(today, -2),
      elephant: 'Марго',
      kind: 'observation',
      metric: 'urine',
      text: 'В моче немного песка.',
      photo_path: null,
      author_name: 'Соколов',
      created_at: ts(addDays(today, -2), '14:05'),
      updated_at: now,
    },
    {
      id: 'demo-n3',
      shift_id: addDays(today, -4),
      elephant: 'Претти',
      kind: 'procedure',
      metric: null,
      text: 'Обработка левой височной железы, хлоргексидин.',
      photo_path: null,
      author_name: 'Соколов',
      created_at: ts(addDays(today, -4), '11:00'),
      updated_at: now,
    },
  ];

  await seedRows('profiles', profiles);
  await seedRows('stock_items', SEED_STOCK_ITEMS);
  await seedRows('diets', SEED_DIETS);
  await seedRows('shifts', shifts);
  await seedRows('stock_moves', moves);
  await seedRows('requests', requests);
  await seedRows('request_marks', marks);
  await seedRows('notes', notes);

}
