const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function isoDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Местная дата (YYYY-MM-DD) момента времени. Не created_at.slice(0, 10): там дата по UTC, и запись в 00:30 по Москве — «вчера». */
export function localDay(ts: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(ts) ? ts : isoDate(new Date(ts));
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** «Сб, 24 октября» */
export function longDate(iso: string): string {
  const d = parseIso(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** «24.10» */
export function shortDate(iso: string): string {
  const d = parseIso(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** «26.10 в 19:30» — точный момент (когда назначили лекарство, важен час) */
export function stampOf(ts: string): string {
  return `${shortDate(localDay(ts))} в ${timeOf(ts)}`;
}

export function timeOf(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function nowTime(): string {
  return timeOf(new Date().toISOString());
}

/** «сегодня», «вчера», «24.10» */
export function relDate(iso: string, today = isoDate()): string {
  if (iso === today) return 'сегодня';
  if (iso === addDays(today, -1)) return 'вчера';
  return shortDate(iso);
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
