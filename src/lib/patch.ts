/**
 * Патчи смены: телефон отправляет не всю строку, а только изменённые листья JSON.
 * Сервер (apply_shift_patch) вклеивает их в свою версию — правки двух телефонов не затирают друг друга.
 */

export interface Patch {
  path: string[];
  /** новое значение листа; при del — ключ удаляется */
  value?: unknown;
  del?: true;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Поля, которые ставит сервер — их не отправляем. */
const SKIP = new Set(['updated_at']);

/** Что поменялось между prev и next — список патчей по листьям (массивы считаем листом). */
export function diff(prev: unknown, next: unknown, base: string[] = []): Patch[] {
  if (isObj(prev) && isObj(next)) {
    const out: Patch[] = [];
    for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      if (base.length === 0 && SKIP.has(k)) continue;
      const path = [...base, k];
      if (!(k in next) || next[k] === undefined) {
        if (k in prev && prev[k] !== undefined) out.push({ path, del: true });
      } else out.push(...diff(prev[k], next[k], path));
    }
    return out;
  }
  if (JSON.stringify(prev) === JSON.stringify(next)) return [];
  return [{ path: base, value: next }];
}

const startsWith = (path: string[], prefix: string[]) => prefix.length <= path.length && prefix.every((p, i) => path[i] === p);

/** Добавить новые патчи к ещё не отправленным: тот же путь и всё, что под ним, заменяется новым. */
export function mergePatches(pending: Patch[], added: Patch[]): Patch[] {
  let out = pending;
  for (const p of added) out = [...out.filter((q) => !startsWith(q.path, p.path)), p];
  return out;
}

/** Наложить патчи на строку (например, на свежую версию с сервера). Исходник не меняется. */
export function applyPatches<T>(row: T, patches: Patch[]): T {
  const out = JSON.parse(JSON.stringify(row)) as Obj;
  for (const p of patches) {
    let node: Obj = out;
    for (const key of p.path.slice(0, -1)) {
      if (!isObj(node[key])) node[key] = {};
      node = node[key] as Obj;
    }
    const last = p.path[p.path.length - 1];
    if (p.del) delete node[last];
    else node[last] = JSON.parse(JSON.stringify(p.value));
  }
  return out as T;
}
