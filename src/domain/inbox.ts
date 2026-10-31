import { METRIC_LABEL } from './elephants';
import { isFailedMark, markAnswer, shiftFlags } from './shift';
import type { Note, RequestMark, Shift, VetRequest } from './types';

export interface InboxItem {
  id: string;
  at: string;
  tone: 'bad' | 'warn' | 'info';
  text: string;
  sub: string;
  note?: Note;
}

/**
 * «Новое с прошлого визита» у врача: записи с флажком «Показать врачу», ЧП, клетки «плохо», назначения
 * «не дал» и «частично». since — когда врач последний раз нажал «Прочитано».
 */
export function vetInbox(d: { notes: Note[]; shifts: Shift[]; marks: RequestMark[]; requests: VetRequest[] }, since: string): InboxItem[] {
  const out: InboxItem[] = [];
  for (const n of d.notes) {
    if (n.deleted || n.created_at <= since || !(n.for_vet || n.kind === 'incident')) continue;
    out.push({
      id: `n:${n.id}`,
      at: n.created_at,
      tone: n.kind === 'incident' ? 'warn' : 'info',
      text: `${n.elephant === 'none' ? 'ЧП' : n.elephant}: ${n.text || 'фото'}`,
      sub: n.author_name,
      note: n,
    });
  }
  for (const s of d.shifts) {
    if (s.deleted || s.updated_at <= since) continue;
    for (const f of shiftFlags(s).filter((x) => x.level === 2)) {
      out.push({
        id: `c:${s.id}:${f.elephant}:${f.metric}`,
        at: s.updated_at,
        tone: 'bad',
        text: `${f.elephant}: ${METRIC_LABEL[f.metric].toLowerCase()} — плохо${f.symptoms.length ? ` (${f.symptoms.join(', ')})` : ''}`,
        sub: s.keeper_name,
      });
    }
  }
  const byId = new Map(d.requests.map((r) => [r.id, r]));
  for (const m of d.marks) {
    const r = byId.get(m.request_id);
    if (!r || m.deleted || m.done_at <= since || r.elephant === 'work') continue;
    const answer = markAnswer(m, r);
    if (!isFailedMark(m, r) && answer !== 'частично') continue;
    out.push({
      id: `m:${m.id}`,
      at: m.done_at,
      tone: isFailedMark(m, r) ? 'warn' : 'info',
      text: `${r.elephant === 'all' ? 'Всем' : r.elephant}: ${r.text} — ${m.note}`,
      sub: m.done_by,
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}
