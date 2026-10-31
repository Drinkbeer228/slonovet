import { describe, expect, it } from 'vitest';
import { vetInbox } from './inbox';
import type { Note, RequestMark, Shift, VetRequest } from './types';

const note = (id: string, extra: Partial<Note> = {}): Note => ({ id, shift_id: 's', elephant: 'Марго', kind: 'observation', metric: null, text: id, photo_path: null, author_name: 'Орлов', created_at: '2026-10-31T10:00:00Z', updated_at: '', ...extra });
const req: VetRequest = { id: 'r', elephant: 'Марго', text: 'мазь', frequency: 'twice', due_date: null, needs_photo: false, urgent: false, options: ['дал', 'частично', 'не дал'], author_id: null, author_name: 'Врач', status: 'active', created_at: '', updated_at: '' };
const mark = (id: string, note: string, at = '11:00'): RequestMark => ({ id, request_id: 'r', shift_id: 's', done_by: 'Орлов', done_at: `2026-10-31T${at}:00Z`, note, photo_path: null, updated_at: '' });

describe('«Новое» у врача', () => {
  it('флажок «Показать врачу», ЧП, «плохо», «не дал» и «частично» — да; обычная запись, «дал» и старое — нет', () => {
    const shift = { id: 's', date: '2026-10-31', keeper_name: 'Орлов', status: 'open', state: { Одри: { food: { level: 2, symptoms: ['отказ'] } } }, updated_at: '2026-10-31T12:00:00Z' } as unknown as Shift;
    const items = vetInbox(
      {
        notes: [note('видно ногу', { for_vet: true }), note('просто'), note('свет', { elephant: 'none', kind: 'incident', created_at: '2026-10-31T09:00:00Z' }), note('старое', { for_vet: true, created_at: '2026-10-20T00:00:00Z' })],
        shifts: [shift],
        marks: [mark('a', 'дал'), mark('b', 'не дал — выплюнула', '11:30'), mark('c', 'частично — выдернула ногу')],
        requests: [req],
      },
      '2026-10-30T00:00:00Z',
    );
    expect(items.map((i) => i.text)).toEqual([
      'Одри: еда — плохо (отказ)',
      'Марго: мазь — не дал — выплюнула',
      'Марго: мазь — частично — выдернула ногу',
      'Марго: видно ногу',
      'ЧП · Общее: свет',
    ]);
  });
});
