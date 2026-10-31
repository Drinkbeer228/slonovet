import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ELEPHANTS, LEVEL_LABEL, METRICS } from '../../domain/elephants';
import { healthAlerts } from '../../domain/health';
import { elephantHistory } from '../../domain/monitoring';
import { FREQ_LABEL, courseDay, describeRequest } from '../../domain/shift';
import type { CurrentUser, ElephantName, ElephantPassport, Level, Note } from '../../domain/types';
import { addDays, isoDate, localDay, shortDate } from '../../lib/dates';
import { put, useRows } from '../../lib/store';
import { ElephantFace } from '../../ui/ElephantFace';
import { Icon } from '../../ui/Icon';
import { Button, Card, Field, PhotoThumb, Plate, Section, Segmented, Sheet, inputCls, toast } from '../../ui/kit';
import { NotesList } from '../common/NotesList';
import { VetInbox } from './VetInbox';

const DAYS = 30;
const CELL: Record<string, string> = {
  none: 'bg-edge/40',
  '0': 'bg-teal/55',
  '1': 'bg-amber',
  '2': 'bg-coral',
};
const cellCls = (l: Level | null) => CELL[l === null ? 'none' : String(l)];

/** Кто в паспорте может править: врач, директор, техподдержка. */
const canEditPassport = (u: CurrentUser) => ['vet', 'director', 'admin'].includes(u.role);

/** «По слонам»: у врача — «Новое с прошлого визита», ниже три слонихи, у каждой полоса за 30 дней. Тап — шторка слонихи. */
export function ElephantsView({ user, onDay }: { user: CurrentUser; onDay: (d: string) => void }) {
  const shifts = useRows('shifts');
  const { alarms, procedures } = healthAlerts(shifts);
  const [open, setOpen] = useState<ElephantName | null>(null);
  const [q, setQ] = useState('');
  const notes = useRows('notes');
  const found = q.trim().length >= 2 ? searchNotes(notes, q) : [];
  return (
    <div className="flex flex-col gap-4">
      {(user.role === 'vet' || user.role === 'director' || user.role === 'admin') && <VetInbox user={user} />}
      {ELEPHANTS.map((el) => {
        const alarm = alarms.find((a) => a.el === el);
        const proc = procedures.find((a) => a.el === el);
        const days = elephantHistory(shifts, el, DAYS);
        const worst = days.map((d) => {
          const v = Object.values(d.levels).filter((x): x is Level => x !== null);
          return v.length ? (Math.max(...v) as Level) : null;
        });
        return (
          <button key={el} type="button" onClick={() => setOpen(el)} className="text-left">
            <Plate glow={alarm ? 'coral' : proc ? 'amber' : 'teal'} halo={Boolean(alarm)} className="flex flex-col gap-3 p-4">
              <span className="flex items-center gap-3">
                <ElephantFace name={el} size={48} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[19px] font-extrabold">{el}</span>
                  <span className={`text-[14px] font-bold ${alarm ? 'text-coral-fg' : proc ? 'text-amber-fg' : 'text-teal-fg'}`}>
                    {alarm ? `Тревога: ${alarm.text}` : proc ? `В процедурах, день ${proc.day}: ${proc.text}` : 'Норма'}
                  </span>
                </span>
                <Icon name="next" size={20} className="text-muted" />
              </span>
              <span className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` }} aria-label={`${el}: ${DAYS} дней`}>
                {worst.map((l, i) => (
                  <span key={i} className={`h-3 rounded-[3px] ${cellCls(l)}`} />
                ))}
              </span>
              <span className="flex justify-between text-[12px] font-semibold text-muted">
                <span>{shortDate(addDays(isoDate(), -DAYS + 1))}</span>
                <span>сегодня</span>
              </span>
            </Plate>
          </button>
        );
      })}

      <Section title="Поиск по записям">
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="нога, понос, Марго…" aria-label="Поиск по записям" />
        {q.trim().length >= 2 && (found.length ? <NotesList notes={found.slice(0, 30)} showDate /> : <Card className="px-4 py-3 text-[15px] text-muted">Ничего не нашлось</Card>)}
      </Section>

      <ElephantSheet el={open} user={user} onClose={() => setOpen(null)} onDay={(d) => (setOpen(null), onDay(d))} />
    </div>
  );
}

/** Поиск по тексту записи, имени слонихи и автору — без учёта регистра и «ё». */
export function searchNotes(notes: Note[], q: string): Note[] {
  const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
  const words = norm(q).split(/\s+/).filter(Boolean);
  return notes
    .filter((n) => !n.deleted)
    .filter((n) => {
      const hay = norm(`${n.text} ${n.elephant} ${n.author_name}`);
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

type Mode = 'all' | 'off';

/** Шторка слонихи: паспорт, 30 дней по каждому признаку, курсы, записи и фото. */
function ElephantSheet({ el, user, onClose, onDay }: { el: ElephantName | null; user: CurrentUser; onClose: () => void; onDay: (d: string) => void }) {
  const shifts = useRows('shifts');
  const notes = useRows('notes');
  const requests = useRows('requests');
  const passport = useRows('elephant_passports').find((p) => p.id === el && !p.deleted);
  const [mode, setMode] = useState<Mode>('all');
  const [editing, setEditing] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  if (!el) return <Sheet open={false} onClose={onClose} title="" children={null} />;
  const days = elephantHistory(shifts, el, DAYS);
  const rows = METRICS.filter((m) => mode === 'all' || days.some((d) => (d.levels[m.key] ?? 0) > 0));
  const mine = notes.filter((n) => !n.deleted && n.elephant === el).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const shown = mode === 'all' ? mine : mine.filter((n) => n.for_vet || n.metric || n.kind !== 'observation');
  const photos = mine.filter((n) => n.photo_path);
  const today = isoDate();
  const courses = requests.filter((r) => r.status === 'active' && (r.elephant === el || r.elephant === 'all') && r.frequency !== 'once' && (!r.due_date || r.due_date >= today));
  return (
    <Sheet open onClose={onClose} title={el}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <ElephantFace name={el} size={72} />
          <PassportShort p={passport} />
        </div>
        <div className="flex gap-2">
          {canEditPassport(user) && (
            <Button icon="edit" onClick={() => setEditing(true)}>
              Паспорт
            </Button>
          )}
          <Button icon="share" onClick={() => setReport(printReport(el, { passport, days, courses, notes: mine }))}>
            Выписка для врача
          </Button>
        </div>

        <Segmented label="Что показывать" value={mode} onChange={setMode} options={[{ value: 'all', label: 'Всё' }, { value: 'off', label: 'Только отклонения' }]} />

        <Section title={`${DAYS} дней`}>
          <Card tone="sunken" className="flex flex-col gap-1.5 p-3">
            {rows.length === 0 && <span className="text-[14px] font-semibold text-muted">За {DAYS} дней отклонений не было</span>}
            {rows.map((m) => (
              <div key={m.key} className="grid grid-cols-[56px_1fr] items-center gap-2">
                <span className="text-[12px] font-bold text-ink2">{m.label}</span>
                <span className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` }}>
                  {days.map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => onDay(d.date)}
                      aria-label={`${shortDate(d.date)}, ${m.label}: ${d.levels[m.key] === null ? 'нет отметки' : LEVEL_LABEL[d.levels[m.key]!]}`}
                      className={`h-5 rounded-[3px] ${cellCls(d.levels[m.key])}`}
                    />
                  ))}
                </span>
              </div>
            ))}
            <span className="mt-1 flex gap-3 text-[12px] font-semibold text-muted">
              <Legend cls={CELL['0']} t="норма" /> <Legend cls={CELL['1']} t="внимание" /> <Legend cls={CELL['2']} t="плохо" /> <Legend cls={CELL.none} t="нет смены" />
            </span>
          </Card>
        </Section>

        <Section title="Идёт лечение" aside={courses.length ? String(courses.length) : undefined}>
          {courses.length === 0 ? (
            <Card className="px-4 py-3 text-[15px] text-muted">Лечения нет</Card>
          ) : (
            courses.map((r) => {
              const cd = courseDay(r, today);
              return (
                <Card key={r.id} className="flex flex-col gap-1 p-3.5">
                  <span className="text-[15px] font-bold leading-snug">{r.text}</span>
                  <span className="text-[13px] font-semibold text-muted">
                    {[r.route, r.dose, FREQ_LABEL[r.frequency], cd ? (cd.total ? `день ${cd.day} из ${cd.total}` : `день ${cd.day}`) : ''].filter(Boolean).join(' · ')}
                  </span>
                </Card>
              );
            })
          )}
        </Section>

        {photos.length > 0 && (
          <Section title="Фото" aside={String(photos.length)}>
            <div className="grid grid-cols-4 gap-2">
              {photos.slice(0, 24).map((n) => (
                <span key={n.id} className="flex flex-col items-center gap-1">
                  <PhotoThumb path={n.photo_path} size={76} />
                  <span className="text-[11px] font-semibold text-muted">{shortDate(localDay(n.created_at))}</span>
                </span>
              ))}
            </div>
          </Section>
        )}

        <Section title="Записи" aside={shown.length ? String(shown.length) : undefined}>
          {shown.length ? <NotesList notes={shown.slice(0, 40)} showElephant={false} showDate /> : <Card className="px-4 py-3 text-[15px] text-muted">Записей нет</Card>}
        </Section>
      </div>
      <ReportView html={report} onClose={() => setReport(null)} />
      <PassportSheet open={editing} el={el} passport={passport} user={user} onClose={() => setEditing(false)} />
    </Sheet>
  );
}

function Legend({ cls, t }: { cls: string; t: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${cls}`} />
      {t}
    </span>
  );
}

const PASSPORT_FIELDS: { key: keyof Omit<ElephantPassport, 'id' | 'updated_at' | 'deleted' | 'birth_year' | 'updated_by_name'>; label: string; hint: string }[] = [
  { key: 'character', label: 'Характер и место в иерархии', hint: 'спокойная, главная в группе…' },
  { key: 'norm', label: 'Своя норма', hint: 'пьёт и мочится больше остальных — это её норма' },
  { key: 'legs', label: 'Ноги и подошвы', hint: 'хронические трещины, стачивание…' },
  { key: 'allergies', label: 'Аллергии, непереносимость', hint: 'на что реагирует' },
  { key: 'forbidden', label: 'Что категорически нельзя', hint: 'препараты, корма' },
  { key: 'weight', label: 'Примерный вес', hint: 'справочно: 3,5–4,5 т' },
];

/** Паспорт коротко: год рождения, своя норма, ноги, что нельзя — то, что новый врач читает первым. */
function PassportShort({ p }: { p: ElephantPassport | undefined }) {
  if (!p) return <span className="text-[14px] font-semibold text-muted">Паспорт ещё не заполнен</span>;
  const age = p.birth_year ? new Date().getFullYear() - p.birth_year : null;
  return (
    <span className="flex min-w-0 flex-col gap-1 text-[14px] font-semibold leading-snug">
      {p.birth_year && (
        <span>
          {p.birth_year} г. р.{age ? ` · ${age} лет` : ''}
          {p.weight ? ` · ≈ ${p.weight}` : ''}
        </span>
      )}
      {p.norm && <span className="text-ink2">Норма: {p.norm}</span>}
      {p.forbidden && <span className="font-bold text-coral-fg">Нельзя: {p.forbidden}</span>}
    </span>
  );
}

function PassportSheet({ open, el, passport, user, onClose }: { open: boolean; el: ElephantName; passport?: ElephantPassport; user: CurrentUser; onClose: () => void }) {
  const empty = { birth_year: null, weight: '', character: '', norm: '', legs: '', allergies: '', forbidden: '' };
  const [v, setV] = useState({ ...empty, ...passport });
  useEffect(() => {
    if (open) setV({ ...empty, ...passport });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Паспорт: ${el}`}
      footer={
        <Button
          kind="primary"
          big
          full
          onClick={async () => {
            await put('elephant_passports', {
              id: el,
              birth_year: v.birth_year ? Number(v.birth_year) : null,
              weight: v.weight.trim(),
              character: v.character.trim(),
              norm: v.norm.trim(),
              legs: v.legs.trim(),
              allergies: v.allergies.trim(),
              forbidden: v.forbidden.trim(),
              updated_by_name: user.full_name,
            });
            toast('Паспорт сохранён');
            onClose();
          }}
        >
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Год рождения">
          <input className={inputCls} inputMode="numeric" value={v.birth_year ?? ''} onChange={(e) => setV({ ...v, birth_year: (e.target.value.replace(/\D/g, '').slice(0, 4) || null) as unknown as number | null })} />
        </Field>
        {PASSPORT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <textarea rows={f.key === 'weight' ? 1 : 2} className={`${inputCls} resize-none`} value={v[f.key]} placeholder={f.hint} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
          </Field>
        ))}
      </div>
    </Sheet>
  );
}

/** Выписка для нового врача: паспорт, 30 дней, курсы, записи — страница для печати или «Сохранить как PDF». */
function printReport(el: ElephantName, d: { passport?: ElephantPassport; days: ReturnType<typeof elephantHistory>; courses: { text: string; route?: string; dose?: string; frequency: 'once' | 'shift' | 'feeding' | 'twice'; due_date: string | null }[]; notes: Note[] }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const p = d.passport;
  const sym = (l: Level | null) => (l === null ? '' : ['+', '!', '×'][l]);
  const passport = p
    ? [
        p.birth_year ? `Год рождения: ${p.birth_year}` : '',
        p.weight && `Примерный вес: ${p.weight}`,
        p.character && `Характер: ${p.character}`,
        p.norm && `Своя норма: ${p.norm}`,
        p.legs && `Ноги и подошвы: ${p.legs}`,
        p.allergies && `Аллергии: ${p.allergies}`,
        p.forbidden && `<b>Нельзя: ${esc(p.forbidden)}</b>`,
      ]
        .filter(Boolean)
        .map((x) => `<li>${x.startsWith('<b>') ? x : esc(x)}</li>`)
        .join('')
    : '<li>Паспорт не заполнен</li>';
  const head = d.days.map((x) => `<th>${x.date.slice(8)}</th>`).join('');
  const body = METRICS.map((m) => `<tr><td>${m.label}</td>${d.days.map((x) => `<td class="l${x.levels[m.key] ?? 'n'}">${sym(x.levels[m.key])}</td>`).join('')}</tr>`).join('');
  const courses = d.courses.map((c) => `<li>${esc(describeRequest({ ...c, route: c.route ?? '', dose: c.dose ?? '' }))}</li>`).join('') || '<li>Нет</li>';
  const notes = d.notes
    .slice(0, 60)
    .map((n) => `<li>${localDay(n.created_at)} — ${esc(n.text || '(фото)')} <i>(${esc(n.author_name)})</i></li>`)
    .join('');
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Выписка: ${el}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:16px;color:#111}h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:18px 0 6px}table{border-collapse:collapse;font-size:11px}td,th{border:1px solid #ccc;padding:2px 3px;text-align:center}td:first-child{text-align:left;white-space:nowrap}.l1{background:#fde68a}.l2{background:#fca5a5}.l0{background:#d1fae5}.ln{background:#f3f4f6}button{font-size:16px;padding:10px 16px;margin:8px 0}@media print{button{display:none}}</style></head>
<body><h1>${el} — выписка для врача</h1><div>СлоноВет · ${new Date().toLocaleDateString('ru-RU')}</div>
<h2>Паспорт</h2><ul>${passport}</ul><h2>30 дней (+ норма, ! внимание, × плохо)</h2><div style="overflow-x:auto"><table><tr><th></th>${head}</tr>${body}</table></div>
<h2>Идёт лечение</h2><ul>${courses}</ul><h2>Записи</h2><ul>${notes || '<li>Нет</li>'}</ul></body></html>`;
  return html;
}

/**
 * Выписка поверх приложения, в той же странице: новое окно на iPhone с иконки не открывается.
 * «Печать / PDF» — печать самой выписки (на iPhone — «Сохранить в Файлы» как PDF).
 */
function ReportView({ html, onClose }: { html: string | null; onClose: () => void }) {
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);
  if (!html) return null;
  return createPortal(
    <div className="pt-safe fixed inset-0 z-[80] flex flex-col bg-bg">
      <div className="px-safe flex items-center gap-2 py-2">
        <Button kind="accent" icon="share" onClick={() => frame?.contentWindow?.print()}>
          Печать / PDF
        </Button>
        <span className="flex-1" />
        <Button onClick={onClose}>Закрыть</Button>
      </div>
      <iframe ref={setFrame} title="Выписка для врача" srcDoc={html} className="w-full flex-1 bg-white" />
    </div>,
    document.body,
  );
}
