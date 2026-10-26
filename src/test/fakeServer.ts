/**
 * Поддельный Supabase для тестов: таблицы в памяти, время изменения ставит «сервер», можно включить отказы.
 * Повторяет то, чем пользуется приложение: select/gt/order/limit, upsert, rpc apply_shift_patch, хранилище фото, вход.
 * Один на все копии приложения в тесте (лежит в globalThis) — так два «телефона» видят один сервер.
 */
import { applyPatches, type Patch } from '../lib/patch';

export type Row = Record<string, unknown> & { id: string };
export interface FakeUser {
  id: string;
  name: string;
  role: string;
}
interface LogEntry {
  kind: 'select' | 'upsert' | 'rpc' | 'storage' | 'events';
  table?: string;
  user: string;
  id?: string;
  ok?: boolean;
  cols?: string;
}

export class FakeServer {
  tables = new Map<string, Map<string, Row>>();
  clock = Date.parse('2026-10-26T07:00:00Z');
  user: FakeUser = { id: 'user-a', name: 'Кипер А', role: 'keeper' };
  log: LogEntry[] = [];
  /** вернуть текст ошибки — сервер откажет, как RLS */
  rls: (table: string, row: Row, user: FakeUser) => string | null = () => null;
  storageFail: (path: string) => string | null = () => null;
  /** все записи получают одно время — как в одной транзакции или при импорте */
  frozenTime: string | null = null;

  reset() {
    this.tables.clear();
    this.log = [];
    this.rls = () => null;
    this.storageFail = () => null;
    this.frozenTime = null;
    this.user = { id: 'user-a', name: 'Кипер А', role: 'keeper' };
  }
  now() {
    if (this.frozenTime) return this.frozenTime;
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }
  t(name: string) {
    let m = this.tables.get(name);
    if (!m) this.tables.set(name, (m = new Map()));
    return m;
  }
  rows(name: string) {
    return [...this.t(name).values()].filter((r) => !r.deleted);
  }
  get(name: string, id: string) {
    return this.t(name).get(id);
  }
  /** записать строку напрямую (как другой телефон); at — время изменения, иначе «сейчас» */
  write<T extends { id: string }>(table: string, row: T, at = this.now()) {
    this.t(table).set(row.id, { ...(structuredClone(row) as Row), updated_at: at });
  }
  upsert(table: string, row: Row) {
    const err = this.rls(table, row, this.user);
    this.log.push({ kind: 'upsert', table, user: this.user.id, id: row.id, ok: !err });
    if (err) return { error: { message: err, code: '42501' } };
    this.write(table, row);
    return { error: null };
  }
  /** сколько полных циклов синхронизации прошло (последний шаг цикла — сверка людей: select id) */
  cycles() {
    return this.log.filter((l) => l.kind === 'select' && l.table === 'profiles' && l.cols === 'id').length;
  }
}

const g = globalThis as unknown as { __fakeServer?: FakeServer };
export const server = (g.__fakeServer ??= new FakeServer());

function query(table: string) {
  const st: { cols: string; gt?: [string, string]; eq?: [string, unknown]; order?: string; limit: number; single: boolean } = {
    cols: '*',
    limit: Infinity,
    single: false,
  };
  const run = () => {
    let rows = [...server.t(table).values()];
    if (st.gt) {
      const [c, v] = st.gt;
      rows = rows.filter((r) => String(r[c]) > v);
    }
    if (st.eq) {
      const [c, v] = st.eq;
      rows = rows.filter((r) => r[c] === v);
    }
    if (st.order) {
      const c = st.order;
      rows.sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0));
    }
    rows = rows.slice(0, st.limit);
    server.log.push({ kind: 'select', table, user: server.user.id, cols: st.cols });
    const out = st.cols === 'id' ? rows.map((r) => ({ id: r.id })) : rows.map((r) => structuredClone(r));
    if (st.single) return { data: out[0] ?? null, error: out[0] ? null : { message: 'not found' } };
    return { data: out, error: null };
  };
  const b = {
    select(c: string) {
      st.cols = c;
      return b;
    },
    gt(c: string, v: string) {
      st.gt = [c, v];
      return b;
    },
    eq(c: string, v: unknown) {
      st.eq = [c, v];
      return b;
    },
    order(c: string) {
      st.order = c;
      return b;
    },
    limit(n: number) {
      st.limit = n;
      return b;
    },
    single() {
      st.single = true;
      return b;
    },
    upsert(row: Row | Row[]) {
      if (Array.isArray(row)) {
        server.log.push({ kind: 'events', table, user: server.user.id });
        return Promise.resolve({ error: null });
      }
      return Promise.resolve(server.upsert(table, row));
    },
    then<T>(res: (v: ReturnType<typeof run>) => T, rej?: (e: unknown) => T) {
      return Promise.resolve(run()).then(res, rej);
    },
  };
  return b;
}

export const fakeClient = {
  from: (table: string) => query(table),
  async rpc(name: string, args: { p_id: string; p_row: Row; p_patches: Patch[] }) {
    if (name !== 'apply_shift_patch') return { data: null, error: { message: 'нет такой функции' } };
    const err = server.rls('shifts', args.p_row, server.user);
    server.log.push({ kind: 'rpc', table: 'shifts', user: server.user.id, id: args.p_id, ok: !err });
    if (err) return { data: null, error: { message: err } };
    const cur = server.get('shifts', args.p_id);
    if (!cur) {
      const defaults = { status: 'open', safety: {}, state: {}, feeds: {}, quests: {}, hay_bales: 0, note: '', accept_remarks: '', deleted: false };
      server.write('shifts', { ...defaults, ...args.p_row });
    } else {
      // как public.apply_shift_patch: патчи вклеиваются в серверную версию
      server.write('shifts', { ...applyPatches(cur, args.p_patches), id: args.p_id });
    }
    return { data: structuredClone(server.get('shifts', args.p_id)), error: null };
  },
  storage: {
    from: () => ({
      async upload(path: string) {
        const err = server.storageFail(path);
        server.log.push({ kind: 'storage', user: server.user.id, id: path, ok: !err });
        return { error: err ? { message: err } : null };
      },
      async createSignedUrl() {
        return { data: null };
      },
    }),
  },
  auth: {
    async getSession() {
      return { data: { session: { user: { id: server.user.id } } } };
    },
    async signInWithPassword({ email }: { email: string }) {
      const login = email.split('@')[0];
      const p = server.rows('profiles').find((x) => x.login === login);
      if (!p) return { data: { user: null }, error: { message: 'Invalid login credentials' } };
      server.user = { id: p.id, name: String(p.full_name), role: String(p.role) };
      return { data: { user: { id: p.id } }, error: null };
    },
    async signOut() {
      return { error: null };
    },
  },
  functions: {
    async invoke() {
      return { data: null, error: null };
    },
  },
};

/** Подождать n циклов синхронизации (или выйти по времени — тогда проверки ниже и покажут, что не так). */
export async function waitCycles(n = 1, timeout = 3000) {
  const start = Date.now();
  const base = server.cycles();
  while (server.cycles() < base + n) {
    if (Date.now() - start > timeout) return false;
    await sleep(10);
  }
  return true;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
