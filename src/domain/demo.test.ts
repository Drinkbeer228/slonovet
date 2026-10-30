import { describe, expect, it } from 'vitest';
import { sampleShift } from './demo';
import { shiftFlags } from './shift';

describe('образец смены для пустого журнала', () => {
  it('сданная смена вчера → сегодня, с двумя отметками «внимание» и заметкой', () => {
    const s = sampleShift('2026-11-01');
    expect(s.id).toBe('sample');
    expect(s.date).toBe('2026-10-31');
    expect(s.status).toBe('handed');
    expect(s.checked_at).toBeTruthy();
    expect(shiftFlags(s).map((f) => `${f.elephant}:${f.metric}:${f.level}`)).toEqual(['Марго:water:1', 'Одри:food:1']);
    expect(s.note).not.toBe('');
  });
});
