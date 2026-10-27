// Кому и что пишем в push-уведомлении. Чистые функции без Deno — их проверяют тесты приложения
// (src/lib/push.test.ts) и сверяют роли с src/domain/access.ts.

export type Payload =
  | { type: 'urgent'; id: string; elephant: string; text: string; author_id?: string | null }
  | { type: 'bad'; shift_id: string; elephant: string; metric: string; keeper_name?: string; author_id?: string | null }
  | { type: 'purchase'; id: string; title: string; amount?: string; urgent?: boolean; author_id?: string | null }
  | { type: 'low'; item_id: string; item_name: string; days?: number | null; author_id?: string | null };

/** Кто получает: срочное — киперы; «плохо» — врач и директор; закупки и «заканчивается» — те, кто заказывает. Системный админ — всё. */
export const ROLES_FOR: Record<Payload['type'], string[]> = {
  urgent: ['keeper', 'admin'],
  bad: ['vet', 'director', 'admin'],
  purchase: ['director', 'manager', 'admin'],
  low: ['director', 'manager', 'admin'],
};

const METRIC: Record<string, string> = { behavior: 'общее', sleep: 'сон', food: 'еда', water: 'вода', urine: 'моча', feces: 'кал', legs: 'ноги' };
const who = (e: string) => (e === 'all' ? 'Всем слонам' : e === 'work' ? 'Работа' : e);
const short = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Активные люди с нужной ролью, кроме того, кто это сделал. */
export function recipients(p: Payload, profiles: { id: string; role: string; active: boolean }[]): string[] {
  return profiles.filter((x) => x.active && ROLES_FOR[p.type].includes(x.role) && x.id !== p.author_id).map((x) => x.id);
}

/** Текст уведомления, раздел для открытия и ключ от повтора (одно и то же событие — одно уведомление). */
export function message(p: Payload, today: string): { title: string; body: string; url: string; tag: string; key: string } {
  switch (p.type) {
    case 'urgent':
      return { title: `Срочно: ${who(p.elephant)}`, body: short(p.text), url: '/?tab=shift', tag: `urgent:${p.id}`, key: `urgent:${p.id}` };
    case 'bad':
      return {
        title: `${p.elephant}: ${METRIC[p.metric] ?? p.metric} — плохо`,
        body: p.keeper_name ? `Отметил ${p.keeper_name}. Подробности — в дежурстве.` : 'Подробности — в дежурстве.',
        url: '/?tab=shift',
        tag: `bad:${p.shift_id}:${p.elephant}`,
        key: `bad:${p.shift_id}:${p.elephant}:${p.metric}`,
      };
    case 'purchase':
      return {
        title: `${p.urgent ? 'Срочно купить' : 'Нужно купить'}: ${short(p.title, 60)}`,
        body: p.amount ? `Сколько: ${short(p.amount, 60)}` : 'Подробности — в закупках.',
        url: '/?tab=stock',
        tag: `purchase:${p.id}`,
        key: `purchase:${p.id}`,
      };
    case 'low':
      return {
        title: `Заканчивается: ${short(p.item_name, 60)}`,
        body: p.days != null && p.days > 0 ? `Хватит примерно на ${Math.max(1, Math.floor(p.days))} дн.` : 'На складе почти ничего не осталось.',
        url: '/?tab=stock',
        tag: `low:${p.item_id}`,
        key: `low:${p.item_id}:${today}`,
      };
  }
}
