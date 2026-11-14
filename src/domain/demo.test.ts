import { describe, expect, it } from 'vitest';
import { sampleShift, seedDemo } from './demo';
import { currentShift, shiftFlags } from './shift';
import { getRows, initStore, wipeAll } from '../lib/store';

describe('образец смены и учебный демо-режим', () => {
  it('сданная смена вчера → сегодня, с двумя отметками «внимание» и заметкой', () => {
    const s = sampleShift('2026-11-01');
    expect(s.id).toBe('sample');
    expect(s.date).toBe('2026-10-31');
    expect(s.status).toBe('handed');
    expect(s.checked_at).toBeTruthy();
    expect(shiftFlags(s).map((f) => `${f.elephant}:${f.metric}:${f.level}`)).toEqual(['Марго:water:1', 'Одри:food:1']);
    expect(s.note).not.toBe('');
  });

  it('seedDemo наполняет обезличенные учебные данные и открытую смену на сегодня', async () => {
    await initStore();
    await wipeAll();
    await seedDemo();

    const profiles = getRows('profiles');
    expect(profiles.map((p) => p.full_name)).toEqual([
      'Кипер Поста №1',
      'Кипер Поста №2',
      'Ветврач станции',
      'Координатор поста',
    ]);

    const shifts = getRows('shifts');
    expect(shifts.length).toBe(15); // 14 прошедших + 1 открытая на сегодня
    const open = currentShift(shifts);
    expect(open).toBeTruthy();
    expect(open?.status).toBe('open');
    expect(open?.keeper_name).toBe('Кипер Поста №1');

    const passports = getRows('elephant_passports');
    expect(passports.map((p) => p.id).sort()).toEqual(['Марго', 'Одри', 'Претти']);
  });
});
