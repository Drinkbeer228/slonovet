import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { addDays, isoDate, longDate, parseIso } from '../lib/dates';
import { usePhotoUrl } from '../lib/photos';
import { haptics } from '../lib/haptics';

/* ---------- Кнопки ---------- */

type BtnKind = 'primary' | 'light' | 'accent' | 'ghost' | 'danger';

const BTN: Record<BtnKind, string> = {
  primary: 'bg-teal text-teal-ink border-transparent',
  light: 'bg-ink text-bg border-transparent',
  // сочный бирюзовый ключ: верхний блик, внутренняя кромка и мягкое свечение цветом темы
  accent:
    'bg-teal bg-[linear-gradient(to_bottom,rgba(255,255,255,0.25),rgba(255,255,255,0)_60%)] text-teal-ink border-transparent shadow-[0_6px_22px_-4px_color-mix(in_srgb,var(--color-teal)_60%,transparent),inset_0_1px_0_rgba(255,255,255,0.35)] active:scale-[0.97]!',
  ghost: 'bg-transparent text-ink border-line',
  danger: 'bg-transparent text-coral border-coral/50',
};

export function Button({
  kind = 'ghost',
  icon,
  children,
  onClick,
  disabled,
  big,
  full,
  type = 'button',
  className = '',
}: {
  kind?: BtnKind;
  icon?: IconName;
  children?: ReactNode;
  onClick?: () => unknown;
  disabled?: boolean;
  big?: boolean;
  full?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  // пока действие кнопки сохраняется — второе нажатие не проходит (иначе двойной тап = двойной приход)
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const click = () => {
    if (busy.current) return;
    const r: unknown = onClick?.();
    if (r instanceof Promise) {
      busy.current = true;
      setPending(true);
      const done = () => {
        busy.current = false;
        setPending(false);
      };
      r.then(done, (e: unknown) => {
        done();
        throw e;
      });
    }
  };
  return (
    <button
      type={type}
      onClick={click}
      disabled={disabled || pending}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border font-extrabold transition active:scale-[.98] disabled:opacity-40 ${
        big ? 'h-14 px-5 text-[17px] rounded-2xl' : 'h-11 px-4 text-[15px]'
      } ${full ? 'w-full' : ''} ${BTN[kind]} ${className}`}
    >
      {icon && <Icon name={icon} size={big ? 20 : 18} stroke={2.4} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, onClick, className = '' }: { icon: IconName; label: string; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border text-ink active:scale-95 ${/(^|\s)border-/.test(className) ? '' : 'border-tick'} ${className}`}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

/* ---------- Блоки ---------- */

export function Section({ title, aside, children, id }: { title: ReactNode; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="flex scroll-mt-20 flex-col gap-2.5" id={id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1">
        <h2 className="m-0 shrink-0 text-[17px] font-extrabold">{title}</h2>
        {aside && <div className="ml-auto min-w-0 text-right text-[13px] font-semibold text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Уровни глубины: flat — как было; glass — полированная плита над фоном; sunken — утопленная панель (мониторинг).
 * В светлой теме белая кромка не видна, поэтому там тонкая тёмная.
 */
export const TONE = {
  flat: 'bg-surface',
  glass:
    'border border-white/[0.08] bg-surface/70 backdrop-blur-md shadow-[0_6px_18px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)] [:root[data-theme=light]_&]:border-black/10 [:root[data-theme=light]_&]:shadow-[0_4px_14px_-6px_rgba(15,27,34,0.2)]',
  sunken:
    'border border-white/[0.04] bg-black/25 shadow-[inset_0_2px_8px_rgba(0,0,0,0.35)] [:root[data-theme=light]_&]:border-black/5 [:root[data-theme=light]_&]:bg-surface2 [:root[data-theme=light]_&]:shadow-[inset_0_2px_6px_rgba(15,27,34,0.12)]',
};

/** Нажимаемая клавиша: верхний блик, мягкая тень, пружина при тапе. */
export const KEY =
  'bg-surface2 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.10),rgba(255,255,255,0)_60%)] border border-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_5px_rgba(0,0,0,0.3)] transition-transform active:scale-[0.97] [:root[data-theme=light]_&]:border-black/10';

/** Световой чип для тегов. */
export const CHIP =
  'inline-flex items-center gap-1 rounded-full border border-white/[0.1] bg-surface2 px-2.5 py-1 text-[12px] font-bold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] [:root[data-theme=light]_&]:border-black/10';

export function Card({
  children,
  className = '',
  tone = 'flat',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  tone?: keyof typeof TONE;
  'data-tour'?: string;
}) {
  return (
    <div className={`rounded-2xl ${TONE[tone]} ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** Подпись под заголовком чужого раздела: смотреть можно, менять — хозяину. */
export function ReadOnlyNote({ who }: { who: string }) {
  return <span className="px-1 text-[13px] font-semibold text-muted">Только просмотр — меняет {who}</span>;
}

/** Метки состояния задачи: СРОЧНО — заливкой, ПРОСРОЧЕНО — контуром, чтобы различались не только словом. */
export function UrgentBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-coral px-2 py-1 text-[12px] font-extrabold leading-none tracking-wide text-teal-ink shadow-[0_0_12px_-2px_color-mix(in_srgb,var(--color-coral)_70%,transparent),inset_0_1px_0_rgba(255,255,255,0.3)]">
      <Icon name="alert" size={12} stroke={3} />
      СРОЧНО
    </span>
  );
}

export function LateBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-coral px-2 py-[3px] text-[12px] font-extrabold leading-none tracking-wide text-coral">
      ПРОСРОЧЕНО
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-surface px-4 py-5 text-center text-[14px] font-semibold text-muted">{children}</div>;
}

/* ---------- Переключатели ---------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  dots,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  dots?: Partial<Record<T, boolean>>;
}) {
  return (
    <div role="group" aria-label={label} className="grid gap-1 rounded-2xl bg-surface p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`h-11 rounded-xl text-[15px] font-extrabold ${on ? 'bg-ink text-bg' : 'text-muted'}`}
          >
            {o.label}
            {dots?.[o.value] && <span className="ml-1.5 inline-block h-[7px] w-[7px] rounded-full bg-dot1 align-middle" />}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ on, children, onClick, tone = 'ink' }: { on: boolean; children: ReactNode; onClick: () => void; tone?: 'ink' | 'amber' }) {
  const active = tone === 'amber' ? 'border-amber bg-amber/15 text-amber' : 'border-ink bg-ink text-bg';
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-11 rounded-xl border px-3.5 text-[14px] font-bold ${on ? active : 'border-line bg-surface text-ink2'}`}
    >
      {children}
    </button>
  );
}

export function Check({ on, label, sub, onChange }: { on: boolean; label: ReactNode; sub?: ReactNode; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[15px] font-bold ${on ? 'text-faint' : ''}`}>{label}</span>
        {sub && <span className="text-[12px] font-semibold text-muted">{sub}</span>}
      </span>
      <Tick on={on} />
    </button>
  );
}

export function Tick({ on }: { on: boolean }) {
  return (
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-teal text-teal-ink' : 'border-2 border-tick text-transparent'}`}>
      <Icon name="check" size={16} stroke={3} />
    </span>
  );
}

export function Stepper({ value, onChange, min = 0, label }: { value: number; onChange: (v: number) => void; min?: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`${label}: меньше`}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="h-11 w-11 rounded-xl border border-line bg-surface2 text-[22px] font-bold"
      >
        −
      </button>
      <span className="w-8 text-center text-[20px] font-extrabold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`${label}: больше`}
        onClick={() => onChange(value + 1)}
        className="h-11 w-11 rounded-xl border border-line bg-surface2 text-[22px] font-bold"
      >
        +
      </button>
    </div>
  );
}

/* ---------- Поля ---------- */

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="px-1 text-[14px] font-bold text-muted">{label}</span>
      {children}
      {hint && <span className="px-1 text-[12px] font-semibold text-muted">{hint}</span>}
    </label>
  );
}

/** Поле для дробных чисел: понимает и запятую, и точку. Сохраняет по выходу из поля или Enter. */
export function DecimalInput({
  value,
  onCommit,
  label,
  placeholder,
  className = '',
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const show = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
  const [text, setText] = useState(show(value));
  useEffect(() => setText(show(value)), [value]);
  const commit = () => {
    const t = text.trim().replace(',', '.');
    const n = t === '' ? null : Number(t);
    if (n !== null && Number.isNaN(n)) {
      setText(show(value));
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`${/(^|\s)w-/.test(className) ? inputCls.replace('w-full ', '') : inputCls} ${className}`}
    />
  );
}

const MONTH_TITLE = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WEEK_HEAD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

/**
 * Свой календарь в шторке — одинаковый на любом телефоне и компьютере
 * (встроенный календарь браузера у всех свой и местами не даёт выбрать число).
 */
export function CalendarSheet({
  open,
  value,
  min,
  max,
  onPick,
  onClose,
  onClear,
}: {
  open: boolean;
  value: string;
  min?: string;
  max?: string;
  onPick: (iso: string) => void;
  onClose: () => void;
  /** если поле необязательное — кнопка «Без даты» */
  onClear?: () => void;
}) {
  const today = isoDate();
  const [month, setMonth] = useState(() => (value || today).slice(0, 7));
  useEffect(() => {
    if (open) setMonth((value || today).slice(0, 7));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopImmediatePropagation(), onClose());
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  if (!open) return null;

  const first = parseIso(`${month}-01`);
  const lead = (first.getDay() + 6) % 7; // с понедельника
  const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  const shift = (n: number) => {
    const d = new Date(first.getFullYear(), first.getMonth() + n, 1);
    setMonth(isoDate(d).slice(0, 7));
  };
  const out = (d: string) => (min && d < min) || (max && d > max);
  const canPrev = !min || `${month}-01` > min;
  const canNext = !max || addDays(`${month}-${String(daysIn).padStart(2, '0')}`, 1) <= max;

  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Выбор даты"
        className="animate-sheet flex w-full max-w-sm flex-col gap-3 rounded-t-3xl border border-line bg-bg p-4 pb-[max(16px,env(safe-area-inset-bottom))] md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <IconButton icon="back" label="Предыдущий месяц" onClick={() => canPrev && shift(-1)} className={canPrev ? '' : 'opacity-30'} />
          <span className="text-[17px] font-extrabold">
            {MONTH_TITLE[first.getMonth()]} {first.getFullYear()}
          </span>
          <IconButton icon="next" label="Следующий месяц" onClick={() => canNext && shift(1)} className={canNext ? '' : 'opacity-30'} />
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEK_HEAD.map((w) => (
            <span key={w} className="py-1 text-[12px] font-bold text-muted">
              {w}
            </span>
          ))}
          {cells.map((d, i) =>
            d ? (
              <button
                key={d}
                type="button"
                disabled={Boolean(out(d))}
                onClick={() => {
                  onPick(d);
                  onClose();
                }}
                className={`h-11 rounded-xl text-[16px] font-bold disabled:text-faint disabled:opacity-40 ${
                  d === value ? 'bg-teal text-teal-ink' : d === today ? 'border border-teal text-ink' : 'text-ink'
                }`}
              >
                {Number(d.slice(8))}
              </button>
            ) : (
              <span key={`e${i}`} />
            ),
          )}
        </div>
        <div className="flex gap-2">
          {!out(today) && (
            <Button
              full
              onClick={() => {
                onPick(today);
                onClose();
              }}
            >
              Сегодня
            </Button>
          )}
          {onClear && (
            <Button
              full
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              Без даты
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Поле даты: по нажатию открывает наш календарь в шторке. */
export function DateInput({
  value,
  onChange,
  min,
  max,
  label,
  clearable,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  label?: string;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={label} onClick={() => setOpen(true)} className={`${inputCls} flex items-center justify-between text-left`}>
        <span className={value ? '' : 'text-faint'}>{value ? longDate(value) : 'не выбрано'}</span>
        <Icon name="calendar" size={18} className="text-teal" />
      </button>
      <CalendarSheet open={open} value={value} min={min} max={max} onPick={onChange} onClose={() => setOpen(false)} onClear={clearable ? () => onChange('') : undefined} />
    </>
  );
}

export const inputCls =
  'w-full rounded-xl border border-tick bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-faint outline-none focus:border-teal';

/* ---------- Нижняя шторка / диалог ---------- */

/** Свайп вниз по шапке шторки: дальше 80 px или резким рывком — закрыть, иначе вернуть на место. */
function useSheetDrag(open: boolean, onClose: () => void) {
  const [dy, setDy] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const start = useRef<{ y: number; t: number; id: number } | null>(null);
  useEffect(() => {
    if (open) {
      setDy(0);
      setLeaving(false);
    }
  }, [open]);
  const end = (y: number) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const d = Math.max(0, y - s.y);
    const speed = d / Math.max(1, performance.now() - s.t);
    if (d > 80 || (d > 20 && speed > 0.6)) {
      haptics.tap();
      setLeaving(true);
      window.setTimeout(onClose, 180);
    } else setDy(0);
  };
  return {
    style:
      dy || leaving
        ? { transform: leaving ? 'translateY(100%)' : `translateY(${dy}px)`, transition: start.current ? 'none' : 'transform 0.18s ease-out' }
        : undefined,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest('button')) return; // крестик и кнопки в шапке нажимаются как обычно
        start.current = { y: e.clientY, t: performance.now(), id: e.pointerId };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current?.id === e.pointerId) setDy(Math.max(0, e.clientY - start.current.y));
      },
      onPointerUp: (e: React.PointerEvent) => end(e.clientY),
      onPointerCancel: () => {
        start.current = null;
        setDy(0);
      },
    },
  };
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  const drag = useSheetDrag(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="animate-sheet flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-line bg-bg md:rounded-3xl"
        style={drag.style}
        onClick={(e) => e.stopPropagation()}
      >
        {/* потянуть шапку вниз — закрыть, как в привычных приложениях */}
        <div className="flex touch-none justify-center pt-2.5 md:hidden" {...drag.handlers}>
          <span className="h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
        </div>
        <div className="flex touch-none items-center gap-3 px-5 pb-2 pt-2 md:pt-4" {...drag.handlers}>
          <h2 className="m-0 flex-1 text-[19px] font-extrabold">{title}</h2>
          <IconButton icon="x" label="Закрыть" onClick={onClose} className="border-transparent" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-5 pt-3">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Подтверждение ---------- */

export function Confirm({
  open,
  title,
  text,
  okLabel,
  danger,
  onOk,
  onClose,
}: {
  open: boolean;
  title: string;
  text?: ReactNode;
  okLabel: string;
  danger?: boolean;
  onOk: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button full onClick={onClose}>
            Отмена
          </Button>
          <Button
            full
            kind={danger ? 'danger' : 'primary'}
            onClick={() => {
              onOk();
              onClose();
            }}
          >
            {okLabel}
          </Button>
        </div>
      }
    >
      {text && <p className="m-0 text-[15px] leading-relaxed text-ink2">{text}</p>}
    </Sheet>
  );
}

/* ---------- Тосты ---------- */

type ToastMsg = { id: number; text: string; kind: 'ok' | 'error' };
let toasts: ToastMsg[] = [];
const toastListeners = new Set<() => void>();
function emitToasts() {
  toastListeners.forEach((l) => l());
}

export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  const id = Date.now() + Math.random();
  toasts = [...toasts, { id, text, kind }];
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitToasts();
  }, 3500);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {list.map((t) => (
        <div
          key={t.id}
          className={`animate-sheet rounded-xl border px-4 py-2.5 text-[14px] font-bold shadow-2xl ${
            t.kind === 'error' ? 'border-coral/60 bg-toast-err text-coral' : 'border-teal/50 bg-toast-ok text-teal'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/* ---------- Фото ---------- */

export function PhotoThumb({ path, size = 64 }: { path: string | null | undefined; size?: number }) {
  const url = usePhotoUrl(path);
  const [big, setBig] = useState(false);
  if (!path) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => url && setBig(true)}
        aria-label="Открыть фото"
        className="shrink-0 overflow-hidden rounded-xl bg-surface2 text-faint"
        style={{ width: size, height: size }}
      >
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <Icon name="camera" className="mx-auto" />}
      </button>
      {big && url && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setBig(false)}>
          <img src={url} alt="Фото" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </>
  );
}

/** Кнопка выбора фото: камера на телефоне, файл на компьютере. */
export function PhotoPick({ onFile, label = 'Фото', compact }: { onFile: (f: File) => void; label?: string; compact?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      {compact ? (
        <IconButton icon="camera" label={label} onClick={() => ref.current?.click()} />
      ) : (
        <Button icon="camera" onClick={() => ref.current?.click()}>
          {label}
        </Button>
      )}
    </>
  );
}

/** Превью ещё не сохранённого файла. */
export function FilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-xl bg-surface2">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      <button type="button" onClick={onRemove} aria-label="Убрать фото" className="absolute right-1 top-1 rounded-lg bg-black/70 p-1 text-ink">
        <Icon name="x" size={14} stroke={2.6} />
      </button>
    </div>
  );
}

/* ---------- Цвета уровней ---------- */

export const LEVEL_CELL = [
  'border-transparent bg-surface2 text-faint font-semibold',
  'border-transparent bg-amber/15 text-amber font-extrabold',
  'border-transparent bg-coral/15 text-coral font-extrabold',
];

export const LEVEL_DOT = ['bg-dot0', 'bg-dot1', 'bg-dot2'];
