import { useEffect, useState } from 'react';
import { logEvent } from '../../lib/log';
import { ELEPHANTS } from '../../domain/elephants';
import { ANSWER_PRESETS, FREQ_LABEL, requestProgress, whoLabel } from '../../domain/shift';
import type { CurrentUser, ElephantName, RequestFrequency, VetRequest } from '../../domain/types';
import { newId, put, useRows } from '../../lib/store';
import { savePhoto } from '../../lib/photos';
import { addDays, isoDate, relDate, shortDate, timeOf } from '../../lib/dates';
import { Button, Card, Check, Chip, Confirm, DateInput, Empty, Field, FilePreview, PhotoPick, PhotoThumb, ReadOnlyNote, Section, Segmented, Sheet, inputCls, toast } from '../../ui/kit';
import { canCloseRequest } from '../../domain/access';
import { PurchasesView } from '../PurchasesView';

const VIEW_KEY = 'slonovet_requests_view';

export function RequestsScreen({ user }: { user: CurrentUser }) {
  const requests = useRows('requests');
  const [creating, setCreating] = useState<ElephantName | 'all' | 'work' | null>(null);
  const [open, setOpen] = useState<VetRequest | null>(null);
  const [buying, setBuying] = useState(false);
  // две вкладки: назначения киперам и закупки; кто не ставит назначений — сразу в закупках
  const [view, setViewState] = useState<'requests' | 'purchases'>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'requests' || v === 'purchases') return v;
    } catch {
      /* без хранилища — по роли */
    }
    return user.role === 'manager' ? 'purchases' : 'requests';
  });
  const setView = (v: 'requests' | 'purchases') => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* не запомнится — не беда */
    }
  };
  const active = requests.filter((r) => r.status === 'active').sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const closed = requests
    .filter((r) => r.status === 'closed')
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, 20);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3 px-1">
          <h1 className="m-0 text-[26px] font-extrabold tracking-tight">Заявки</h1>
          {view === 'requests' ? (
            <Button kind="primary" icon="plus" onClick={() => setCreating('Претти')}>
              Новая
            </Button>
          ) : (
                <Button kind="primary" icon="plus" onClick={() => setBuying(true)}>
                  Купить
                </Button>
              )}
        </div>
      </header>
      <Segmented
        label="Вид заявок"
        value={view}
        onChange={setView}
        options={[
          { value: 'requests', label: 'Назначения' },
          { value: 'purchases', label: 'Закупки' },
        ]}
      />
      {view === 'purchases' ? (
        <PurchasesView user={user} adding={buying} onAddClose={() => setBuying(false)} />
      ) : (
        <>
        <Section title="Активные" aside={active.length ? String(active.length) : undefined}>
          {active.length === 0 ? <Empty>Активных заявок нет</Empty> : <RequestList list={active} onOpen={setOpen} />}
        </Section>
        {closed.length > 0 && (
          <Section title="Закрытые">
            <RequestList list={closed} onOpen={setOpen} />
          </Section>
        )}
        </>
      )}
      <NewRequestSheet initial={creating} user={user} onClose={() => setCreating(null)} />
      <RequestDetail req={open} user={user} onClose={() => setOpen(null)} />
    </div>
  );
}

export function RequestList({ list, onOpen }: { list: VetRequest[]; onOpen: (r: VetRequest) => void }) {
  const marks = useRows('request_marks');
  const shifts = useRows('shifts');
  return (
    <Card className="divide-y divide-surface2 overflow-hidden">
      {list.map((r) => {
        const p = requestProgress(r, marks, shifts);
        const closed = r.status === 'closed';
        return (
          <button key={r.id} type="button" onClick={() => onOpen(r)} className={`flex w-full flex-col gap-1.5 px-4 py-3 text-left ${closed ? 'opacity-60' : ''}`}>
            <div className="flex justify-between gap-2">
              <span className={`text-[13px] font-extrabold ${closed ? 'text-muted' : 'text-amber'}`}>
                {whoLabel(r.elephant)}
                {r.urgent && !closed && <span className="ml-2 rounded-md bg-coral/15 px-1.5 py-0.5 text-[11px] text-coral">СРОЧНО</span>}
              </span>
              <span className="text-[12px] font-semibold text-muted">
                {closed ? 'закрыта' : `${FREQ_LABEL[r.frequency]}${r.due_date ? ` · до ${shortDate(r.due_date)}` : ''}`}
              </span>
            </div>
            <span className="text-[15px] font-semibold leading-snug">
              {r.text}
              {r.photo_path && <span className="text-[12px] font-bold text-muted"> · фото</span>}
            </span>
            {closed && p.last && (
              <span className="text-[12px] font-semibold text-teal">
                Выполнил: {p.last.done_by}, {relDate(p.last.done_at.slice(0, 10))} {timeOf(p.last.done_at)}
              </span>
            )}
            {!closed && (
              <>
                {r.frequency !== 'once' && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                    <div className="h-full bg-teal" style={{ width: `${Math.round((p.done / p.total) * 100)}%` }} />
                  </div>
                )}
                <span className="text-[12px] font-semibold text-muted">
                  {r.frequency === 'once'
                    ? p.done
                      ? `Выполнил: ${p.last!.done_by}, ${relDate(p.last!.done_at.slice(0, 10))} ${timeOf(p.last!.done_at)}`
                      : 'ждёт отметки кипера'
                    : `${p.done} из ${p.total} ${p.total === 1 ? 'дежурства' : 'дежурств'}${p.last ? ` · последнее ${relDate(p.last.done_at.slice(0, 10))}, ${p.last.done_by}${p.last.photo_path ? ', с фото' : ''}` : ''}`}
                </span>
              </>
            )}
          </button>
        );
      })}
    </Card>
  );
}

function RequestDetail({ req, user, onClose }: { req: VetRequest | null; user: CurrentUser; onClose: () => void }) {
  const marks = useRows('request_marks');
  const [confirm, setConfirm] = useState(false);
  if (!req) return null;
  const mine = marks.filter((m) => m.request_id === req.id).sort((a, b) => (a.done_at < b.done_at ? 1 : -1));
  return (
    <Sheet
      open
      onClose={onClose}
      title={whoLabel(req.elephant)}
      footer={
        canCloseRequest(req, user) && (
          <div className="flex gap-2">
            {req.status === 'active' ? (
              <Button full onClick={() => setConfirm(true)}>
                Закрыть заявку
              </Button>
            ) : (
              <Button
                full
                onClick={async () => {
                  await put('requests', { ...req, status: 'active' });
                  onClose();
                }}
              >
                Вернуть в работу
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[16px] font-medium leading-relaxed">{req.text}</p>
        {req.photo_path && <PhotoThumb path={req.photo_path} size={140} />}
        <span className="text-[13px] font-semibold text-muted">
          {FREQ_LABEL[req.frequency]}
          {req.due_date ? ` · до ${shortDate(req.due_date)}` : ''}
          {req.needs_photo ? ' · с фото' : ''} · {req.author_name}, {relDate(req.created_at.slice(0, 10))}
        </span>
        <Section title="Выполнение" aside={String(mine.length)}>
          {mine.length === 0 ? (
            <Empty>Пока не отмечено</Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {mine.map((m) => (
                <Card key={m.id} className="flex items-center gap-3 p-3">
                  <PhotoThumb path={m.photo_path} size={56} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[12px] font-bold text-muted">
                      {relDate(m.done_at.slice(0, 10))} {timeOf(m.done_at)} · {m.done_by}
                    </span>
                    <span className="text-[15px] font-medium">{m.note || 'выполнено'}</span>
                  </span>
                </Card>
              ))}
            </div>
          )}
        </Section>
      </div>
      <Confirm
        open={confirm}
        title="Закрыть заявку?"
        text="Киперы перестанут её видеть."
        okLabel="Закрыть"
        onOk={async () => {
          await put('requests', { ...req, status: 'closed' });
          toast('Заявка закрыта');
          onClose();
        }}
        onClose={() => setConfirm(false)}
      />
    </Sheet>
  );
}

const FREQS: RequestFrequency[] = ['once', 'shift', 'feeding'];

export function NewRequestSheet({ initial, user, onClose }: { initial: ElephantName | 'all' | 'work' | null; user: CurrentUser; onClose: () => void }) {
  const [who, setWho] = useState<ElephantName | 'all' | 'work'>('Претти');
  const [text, setText] = useState('');
  const [freq, setFreq] = useState<RequestFrequency>('shift');
  const [until, setUntil] = useState(addDays(isoDate(), 3));
  const [photo, setPhoto] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [own, setOwn] = useState('');
  const [authorPhoto, setAuthorPhoto] = useState<File | null>(null);

  useEffect(() => {
    if (initial) {
      setAuthorPhoto(null);
      setWho(initial);
      setText('');
      setFreq('shift');
      setUntil(addDays(isoDate(), 3));
      setPhoto(false);
      setUrgent(false);
      setOptions([]);
      setOwn('');
    }
  }, [initial]);

  return (
    <Sheet
      open={initial !== null}
      onClose={onClose}
      title="Назначение или задача"
      footer={
        <Button
          kind="primary"
          big
          full
          disabled={!text.trim()}
          onClick={async () => {
            logEvent('request.create', { who, text: text.trim().slice(0, 200), options: options.join(' / '), photo, urgent });
            const id = newId();
            const photo_path = authorPhoto ? await savePhoto(authorPhoto, 'requests', id) : null;
            await put('requests', {
              id,
              photo_path,
              elephant: who,
              text: text.trim(),
              frequency: freq,
              due_date: until || null,
              needs_photo: photo,
              urgent,
              options: options.length ? options : null,
              author_id: user.id,
              author_name: user.full_name,
              status: 'active',
              created_at: new Date().toISOString(),
            });
            toast('Заявка отправлена киперам');
            onClose();
          }}
        >
          Отправить киперам
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Кому</span>
          <div className="flex flex-wrap gap-2">
            {[...ELEPHANTS, 'all' as const, 'work' as const].map((e) => (
              <Chip key={e} on={who === e} onClick={() => setWho(e)}>
                {whoLabel(e)}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Что сделать">
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={`${inputCls} resize-none`}
            placeholder={who === 'work' ? 'Например: перебрать сенник, сухие тюки ближе к выходу' : 'Например: давать тёплую воду, два раза за дежурство проверить, сколько выпила'}
          />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Как часто</span>
          <div className="flex flex-wrap gap-2">
            {FREQS.map((f) => (
              <Chip key={f} on={freq === f} onClick={() => setFreq(f)}>
                {FREQ_LABEL[f][0].toUpperCase() + FREQ_LABEL[f].slice(1)}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="px-1 text-[14px] font-bold text-muted">Ответ кипера кнопками</span>
          <div className="flex flex-wrap gap-2">
            <Chip on={options.length === 0} onClick={() => setOptions([])}>
              Просто «выполнено»
            </Chip>
            {ANSWER_PRESETS.map((p) => (
              <Chip key={p.label} on={options.join('|') === p.options.join('|')} onClick={() => setOptions(p.options)}>
                {p.label}
              </Chip>
            ))}
          </div>
          <input
            className={inputCls}
            value={own}
            onChange={(e) => {
              setOwn(e.target.value);
              setOptions(
                e.target.value
                  .split(/[,/]/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              );
            }}
            placeholder="Свои варианты через запятую: мутная, прозрачная, с песком"
          />
          {options.length > 0 && <span className="px-1 text-[13px] font-semibold text-teal">Кипер увидит кнопки: {options.join(' · ')}</span>}
        </div>
        {authorPhoto ? <FilePreview file={authorPhoto} onRemove={() => setAuthorPhoto(null)} /> : <PhotoPick onFile={setAuthorPhoto} label="Приложить фото" />}
        <Field label="До какого числа">
          <DateInput value={until} onChange={setUntil} min={isoDate()} label="До какого числа" />
        </Field>
        <Card className="divide-y divide-surface2 overflow-hidden">
          <Check on={photo} label="Нужно фото в ответ" sub="кипер отметит выполнение с фото" onChange={setPhoto} />
          <Check on={urgent} label="Срочно" sub="наверху экрана у кипера" onChange={setUrgent} />
        </Card>
      </div>
    </Sheet>
  );
}
