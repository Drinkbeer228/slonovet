import { describe, expect, it } from 'vitest';
import { applyPatches, diff, mergePatches } from './patch';

const shift = () => ({
  id: '2026-10-25',
  note: '',
  hay_bales: 0,
  state: { Марго: { water: { level: 0 } } } as Record<string, Record<string, { level: number; symptoms?: string[] }>>,
  feeds: {} as Record<string, { done: boolean; eaten?: Record<string, string> }>,
  updated_at: 't0',
});

describe('diff', () => {
  it('находит только изменённые листья и пропускает updated_at', () => {
    const a = shift();
    const b = { ...shift(), updated_at: 't1', note: 'привет', state: { Марго: { water: { level: 1, symptoms: ['пьёт мало'] } } } };
    expect(diff(a, b)).toEqual([
      { path: ['note'], value: 'привет' },
      { path: ['state', 'Марго', 'water', 'level'], value: 1 },
      { path: ['state', 'Марго', 'water', 'symptoms'], value: ['пьёт мало'] },
    ]);
  });

  it('удалённый ключ — патч del', () => {
    expect(diff({ a: { x: 1, y: 2 } }, { a: { x: 1 } })).toEqual([{ path: ['a', 'y'], del: true }]);
  });

  it('без изменений — пусто', () => {
    expect(diff(shift(), shift())).toEqual([]);
  });
});

describe('mergePatches', () => {
  it('тот же путь заменяется новым значением, вложенные — тоже', () => {
    const merged = mergePatches(
      [
        { path: ['feeds', '13:00', 'eaten', 'Одри'], value: 'half' },
        { path: ['note'], value: 'a' },
      ],
      [
        { path: ['feeds', '13:00'], value: { done: false } },
        { path: ['note'], value: 'b' },
      ],
    );
    expect(merged).toEqual([
      { path: ['feeds', '13:00'], value: { done: false } },
      { path: ['note'], value: 'b' },
    ]);
  });
});

describe('два телефона правят одну смену', () => {
  it('разные поля: обе отметки сохраняются', () => {
    const server = shift();
    // телефон A (без сети) отмечает воду у Марго, телефон B — кормление в 13:00
    const a = { ...shift(), state: { Марго: { water: { level: 1 } } } };
    const b = { ...shift(), feeds: { '13:00': { done: true, eaten: { Претти: 'all', Марго: 'all', Одри: 'all' } } } };
    const afterB = applyPatches(server, diff(server, b));
    const afterA = applyPatches(afterB, diff(server, a));
    expect(afterA.state.Марго.water.level).toBe(1);
    expect(afterA.feeds['13:00'].done).toBe(true);
  });

  it('одно поле: побеждает последняя правка, остальное не портится', () => {
    const server = { ...shift(), note: 'старое', hay_bales: 3 };
    const a = { ...server, note: 'от A' };
    const b = { ...server, note: 'от B', hay_bales: 5 };
    const result = applyPatches(applyPatches(server, diff(server, a)), diff(server, b));
    expect(result.note).toBe('от B');
    expect(result.hay_bales).toBe(5);
  });

  it('свежая версия с сервера + свои неотправленные патчи', () => {
    const remote = { ...shift(), feeds: { '07:00': { done: true } } };
    const mine = [{ path: ['state', 'Одри', 'food', 'level'], value: 2 }];
    const view = applyPatches(remote, mine);
    expect(view.feeds['07:00'].done).toBe(true);
    expect(view.state.Одри.food.level).toBe(2);
    expect(remote.state.Одри).toBeUndefined(); // исходник не тронут
  });
});
