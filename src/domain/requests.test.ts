// Задачи на день и час, просрочка и «новое в обсуждении».
import { describe, expect, it } from 'vitest';
import { dutyTodos, onRestDay, overdue, requestTodos, whenLabel } from './shift';
import { boardAttention, boardGroups } from './board';
import { unreadCount, unreadRequests } from '../lib/comments';
import type { RequestComment, RequestMark, Shift, VetRequest } from './types';

const req = (id: string, extra: Partial<VetRequest> = {}): VetRequest => ({
  id, elephant: 'work', text: 'забрать таблетки', frequency: 'once', due_date: null, needs_photo: false, urgent: false,
  author_id: 'vet', author_name: 'Врач', status: 'active', created_at: '2026-10-25T08:00:00Z', updated_at: '', ...extra,
});
const shift = (date: string): Shift =>
  ({ id: `s-${date}`, date, keeper_id: 'k', keeper_name: 'К', status: 'open', safety: {}, state: {}, feeds: {}, quests: {}, hay_bales: 0, note: '', accepted_at: '', handed_at: null, accept_remarks: '', updated_at: '' }) as Shift;
const mark = (request_id: string, shift_id: string): RequestMark => ({ id: `m-${request_id}`, request_id, shift_id, done_by: 'К', done_at: '', note: '', photo_path: null, updated_at: '' });
const ids = (r: VetRequest[], m: RequestMark[], s: Shift) => requestTodos(r, m, s).map((t) => t.req.id);

describe('разовая задача на конкретный день', () => {
  const pills = req('pills', { on_date: '2026-10-26', at_time: '16:00' });

  it('не видна раньше своего дня, видна в свой день', () => {
    expect(ids([pills], [], shift('2026-10-25'))).toEqual([]);
    expect(ids([pills], [], shift('2026-10-26'))).toEqual(['pills']);
  });

  it('не выполнили — остаётся и на следующий день (просрочена), выполнили — пропадает', () => {
    expect(ids([pills], [], shift('2026-10-27'))).toEqual(['pills']);
    expect(ids([pills], [mark('pills', 's-2026-10-26')], shift('2026-10-27'))).toEqual([]);
  });

  it('просрочена: после своего часа без отметки или на следующий день; с отметкой — нет', () => {
    expect(overdue(pills, false, new Date(2026, 9, 26, 15, 59))).toBe(false);
    expect(overdue(pills, false, new Date(2026, 9, 26, 16, 0))).toBe(false); // «к 16:00» — ровно в 16:00 ещё вовремя
    expect(overdue(pills, false, new Date(2026, 9, 26, 16, 1))).toBe(true);
    expect(overdue(pills, false, new Date(2026, 9, 27, 8, 0))).toBe(true);
    expect(overdue(pills, true, new Date(2026, 9, 27, 8, 0))).toBe(false);
    // без часа — просрочена только со следующего дня; регулярная — никогда
    expect(overdue(req('a', { on_date: '2026-10-26' }), false, new Date(2026, 9, 26, 23, 0))).toBe(false);
    expect(overdue(req('b', { frequency: 'shift', on_date: '2026-10-20' }), false, new Date(2026, 9, 26))).toBe(false);
  });

  it('порядок: срочное всегда наверху, дальше по сроку (просроченное — самое раннее), без срока — в конце', () => {
    const list = [
      req('plain'),
      req('late', { on_date: '2026-10-26', at_time: '18:00' }),
      req('early', { on_date: '2026-10-26', at_time: '09:00' }),
      req('yesterday', { on_date: '2026-10-25' }),
      req('hot', { urgent: true }),
      req('hot-tomorrow-course', { urgent: true, frequency: 'shift', due_date: '2026-10-30' }),
    ];
    expect(ids(list, [], shift('2026-10-26'))).toEqual(['hot-tomorrow-course', 'hot', 'yesterday', 'early', 'late', 'plain']);
  });

  it('подпись: «сегодня к 16:00», «27.10»', () => {
    expect(whenLabel(pills, '2026-10-26')).toBe('сегодня к 16:00');
    expect(whenLabel(req('x', { on_date: '2026-10-27' }), '2026-10-26')).toBe('27.10');
    expect(whenLabel(req('y'), '2026-10-26')).toBe('');
  });

  it('старые заявки без дня работают как раньше', () => {
    expect(ids([req('old', { frequency: 'shift', due_date: '2026-10-30' })], [], shift('2026-10-26'))).toEqual(['old']);
  });
});

describe('новое в обсуждении', () => {
  const c = (id: string, request_id: string, author_id: string, created_at: string, deleted = false): RequestComment => ({
    id, request_id, author_id, author_name: author_id, text: '…', created_at, updated_at: '', deleted,
  });
  const comments = [
    c('1', 'r1', 'keeper', '2026-10-26T10:00:00Z'),
    c('2', 'r1', 'vet', '2026-10-26T10:05:00Z'),
    c('3', 'r1', 'keeper', '2026-10-26T10:10:00Z'),
    c('4', 'r2', 'keeper', '2026-10-26T11:00:00Z', true),
  ];

  it('свои и убранные не считаются, прочитанное — тоже', () => {
    expect(unreadCount(comments, 'r1', 'vet', undefined)).toBe(2);
    expect(unreadCount(comments, 'r1', 'vet', '2026-10-26T10:00:00Z')).toBe(1);
    expect(unreadCount(comments, 'r1', 'keeper', undefined)).toBe(1);
    expect(unreadCount(comments, 'r2', 'vet', undefined)).toBe(0);
  });

  it('цифра на разделе — сколько заявок с новым, только среди активных', () => {
    expect(unreadRequests(comments, 'vet', {})).toBe(1);
    expect(unreadRequests(comments, 'vet', { r1: '2026-10-26T10:10:00Z' })).toBe(0);
    expect(unreadRequests(comments, 'vet', {}, new Set(['r2']))).toBe(0);
  });
});

describe('вход: что сказать человеку', () => {
  it('неверный пароль — только когда сервер так ответил; обрыв связи — «нет связи»', async () => {
    const { loginErrorText } = await import('../lib/auth');
    expect(loginErrorText({ status: 400, code: 'invalid_credentials' })).toBe('Неверный логин или пароль');
    expect(loginErrorText({ status: 0, name: 'AuthRetryableFetchError' })).toMatch(/^Нет связи/);
    expect(loginErrorText({ name: 'AuthRetryableFetchError' })).toMatch(/^Нет связи/);
    expect(loginErrorText({ status: 503 })).toMatch(/^Нет связи/);
    expect(loginErrorText({ status: 429 })).toMatch(/^Слишком много/);
  });
});

describe('варианты ответа по адресату', () => {
  it('одни универсальные для слонов и «Работы», без «в работе» (отметка закрыла бы разовую задачу)', async () => {
    const { answerPresets, FAILED_ANSWERS } = await import('./shift');
    expect(answerPresets().map((p) => p.label)).toEqual(['Сделано / не получилось', 'Сделано / частично / не вышло']);
    expect(answerPresets().flatMap((p) => p.options)).not.toContain('в работе');
    expect(FAILED_ANSWERS).toContain('не вышло');
  });
});

describe('назначения на «Дежурстве»', () => {
  it('только по слонам: «Работа» остаётся на доске «Задачи», но по-прежнему отмечается из неё', () => {
    const list = [req('hoz'), req('pretty', { elephant: 'Претти' }), req('all', { elephant: 'all' })];
    expect(dutyTodos(list, [], shift('2026-10-26')).map((t) => t.req.id).sort()).toEqual(['all', 'pretty']);
    expect(requestTodos([list[0]], [], shift('2026-10-26'))).toHaveLength(1);
  });
});

describe('этап A: «не получилось», срочное на завтра, задача после полуночи, отсыпной', () => {
  const noted = (request_id: string, shift_id: string, note: string): RequestMark => ({ ...mark(request_id, shift_id), id: `m-${request_id}-${note}`, note });
  const fix = req('fix', { options: ['сделано', 'не получилось'], on_date: '2026-10-26' });

  it('«не получилось» не закрывает разовую задачу: она остаётся в смене и на доске, «сделано» — закрывает', () => {
    const failed = [noted('fix', 's-2026-10-26', 'не получилось — нет ключа')];
    expect(requestTodos([fix], failed, shift('2026-10-26'))[0].done).toBe(false);
    expect(ids([fix], failed, shift('2026-10-27'))).toEqual(['fix']);
    expect(boardGroups([fix], [], failed, 'all', new Date(2026, 9, 27)).today.map((i) => i.kind === 'request' && i.req.id)).toEqual(['fix']);
    const ok = [...failed, noted('fix', 's-2026-10-27', 'сделано')];
    expect(boardGroups([fix], [], ok, 'all', new Date(2026, 9, 27)).closed).toHaveLength(1);
  });

  it('срочное на будущий день видно в смене сразу — как на доске', () => {
    expect(ids([req('u', { urgent: true, on_date: '2026-10-28' })], [], shift('2026-10-26'))).toEqual(['u']);
  });

  it('задача «на сегодня», поставленная после полуночи, видна в смене, принятой вчера', () => {
    const tonight = req('t', { on_date: '2026-10-27' });
    expect(ids([tonight], [], shift('2026-10-26'))).toEqual([]);
    expect(requestTodos([tonight], [], shift('2026-10-26'), '2026-10-27').map((t) => t.req.id)).toEqual(['t']);
  });

  it('доска считает, что требует внимания: просроченное и срочное без отметки, по типам', () => {
    const late = req('late', { on_date: '2026-10-25' });
    const urgentEl = req('ue', { elephant: 'Марго', urgent: true });
    expect(boardAttention([late, urgentEl, fix], [], [], new Date(2026, 9, 26, 12))).toEqual({ elephants: 1, work: 1, purchases: 0 });
  });

  it('отсыпной: после суточной смены 24 часа; после короткой — нет', () => {
    const day = { ...shift('2026-10-26'), keeper_id: 'dima', status: 'handed', accepted_at: '2026-10-26T05:00:00Z', handed_at: '2026-10-27T05:00:00Z' } as Shift;
    const at = (iso: string) => Date.parse(iso);
    expect(onRestDay('dima', [day], at('2026-10-27T12:00:00Z'))).toBe(true);
    expect(onRestDay('dima', [day], at('2026-10-28T06:00:00Z'))).toBe(false);
    expect(onRestDay('dima', [{ ...day, accepted_at: '2026-10-27T01:00:00Z' }], at('2026-10-27T12:00:00Z'))).toBe(false);
    expect(onRestDay('other', [day], at('2026-10-27T12:00:00Z'))).toBe(false);
  });
});
