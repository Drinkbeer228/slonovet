import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';
import { addDays, isoDate, longDate, parseIso } from '../lib/dates';
import { usePhotoUrl } from '../lib/photos';
import { haptics } from '../lib/haptics';

/* ---------- Кнопки ---------- */

type BtnKind = 'primary' | 'light' | 'accent' | 'ghost' | 'danger';

/* Физика: любая кнопка — выпуклая клавиша (блик по верхней фаске, мягкая тень, пружина при тапе). Цвета и свет — из токенов index.css. */
const SHEEN = 'bg-[linear-gradient(to_bottom,var(--color-sheen),transparent_60%)]';
const SHEEN_TEAL = 'bg-[linear-gradient(to_bottom,rgb(255_255_255/var(--sheen-t)),transparent_55%)]';

/** Нажимаемая клавиша: верхний блик, мягкая тень, пружина при тапе. */
export const KEY = `border border-edge-hi bg-surface2 ${SHEEN} shadow-(--shadow-key) transition-transform active:scale-[0.97]`;

const BTN: Record<BtnKind, string> = {
  // основное действие: бирюза с бликом
  primary: `bg-teal ${SHEEN_TEAL} text-teal-ink border-transparent shadow-(--shadow-key)`,
  // «светлая» клавиша теперь графитовая: белые плашки на тёмном слепят
  light: `${KEY} text-ink`,
  // сочный бирюзовый ключ: верхний блик, внутренняя кромка и мягкое свечение цветом темы
  accent: `bg-teal ${SHEEN_TEAL} text-teal-ink border-transparent shadow-(--shadow-glow-teal) active:scale-[0.97]!`,
  ghost: `${KEY} text-ink`,
  // тёмно-коралловое стекло вместо пустой красной рамки
  danger: `border-coral/40 bg-[color-mix(in_srgb,var(--color-coral)_var(--tint),transparent)] ${SHEEN} text-coral-fg shadow-(--shadow-key)`,
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
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border text-ink ${/border-transparent/.test(className) ? 'active:scale-95' : KEY} ${className}`}
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
 * Уровни глубины: flat — как было; glass — полированная плита над фоном; sunken — утопленная «лунка»
 * (мониторинг, контейнеры сегментов, прогресс, поля). Свет и тени — токены index.css, светлая тема переопределяет их там же.
 * Размытие (backdrop-blur) здесь не нужно: за карточками ровный фон, а на слабых телефонах оно тормозит прокрутку.
 */
export const TONE = {
  flat: 'bg-surface',
  glass: 'border border-edge bg-surface/70 shadow-(--shadow-plate)',
  sunken: 'border border-edge bg-well shadow-(--shadow-well)',
};

/** Световой чип для тегов. */
export const CHIP =
  'inline-flex items-center gap-1 rounded-full border border-edge-hi bg-surface2 px-2.5 py-1 text-[12px] font-bold text-ink shadow-[inset_0_1px_0_var(--color-hl)]';

export function Card({
  children,
  className = '',
  tone = 'glass',
}: {
  children: ReactNode;
  className?: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <div className={`rounded-2xl ${TONE[tone]} ${className}`}>
      {children}
    </div>
  );
}

export type Glow = 'teal' | 'amber' | 'coral' | 'sky' | 'violet';

/** Текст и иконка на тонировке цвета: в светлой теме -fg темнее, держит 4.5:1. */
const FG: Record<Glow, string> = { teal: 'text-teal-fg', amber: 'text-amber-fg', coral: 'text-coral-fg', sky: 'text-sky-fg', violet: 'text-violet-fg' };
/** Цвет плиты передаём переменной --pc — одни и те же классы для всех цветов. */
const pc = (glow: Glow) => ({ '--pc': `var(--color-${glow})` }) as CSSProperties;

/**
 * Плита-баннер состояния — «тонированное стекло»: ровная тонировка цветом (без градиента), цветная кромка
 * и подсвеченная верхняя фаска. halo — для тревоги: кромка плотнее, тонировка сильнее, без внешнего свечения.
 * flat — обычное стекло без цвета (карточки задач: тип у них — плашкой, срочное — рамкой).
 */
export function Plate({
  glow,
  halo,
  flat,
  children,
  className = '',
}: {
  glow: Glow;
  halo?: boolean;
  /** без цвета: обычная стеклянная плита */
  flat?: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (flat) return <div className={`relative isolate overflow-hidden rounded-2xl border border-edge bg-surface/70 shadow-(--shadow-plate) ${className}`}>{children}</div>;
  return (
    <div
      style={pc(glow)}
      className={`relative isolate overflow-hidden rounded-2xl border bg-surface/70 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--pc)_45%,transparent),var(--shadow-plate)] ${
        halo ? 'border-[color-mix(in_srgb,var(--pc)_60%,transparent)]' : 'border-[color-mix(in_srgb,var(--pc)_35%,transparent)]'
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 -z-10 ${
          halo ? 'bg-[color-mix(in_srgb,var(--pc)_calc(var(--plate-tint)*1.5),transparent)]' : 'bg-[color-mix(in_srgb,var(--pc)_var(--plate-tint),transparent)]'
        }`}
      />
      {children}
    </div>
  );
}

/** Значок баннера в медальоне: круг 36 px с тонировкой и кромкой цвета состояния, иконка цветом -fg. */
export function GlowIcon({ glow, icon }: { glow: Glow; icon: IconName }) {
  return (
    <span
      aria-hidden="true"
      style={pc(glow)}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color-mix(in_srgb,var(--pc)_35%,transparent)] bg-[color-mix(in_srgb,var(--pc)_var(--tint),transparent)] shadow-[inset_0_1px_0_color-mix(in_srgb,var(--pc)_40%,transparent)] ${FG[glow]}`}
    >
      <Icon name={icon} size={18} />
    </span>
  );
}

const FILL: Record<Glow, string> = {
  teal: 'bg-teal shadow-[0_0_10px_color-mix(in_srgb,var(--color-teal)_var(--glow),transparent)]',
  amber: 'bg-amber shadow-[0_0_10px_color-mix(in_srgb,var(--color-amber)_var(--glow),transparent)]',
  coral: 'bg-coral shadow-[0_0_10px_color-mix(in_srgb,var(--color-coral)_var(--glow),transparent)]',
  sky: 'bg-sky shadow-[0_0_10px_color-mix(in_srgb,var(--color-sky)_var(--glow),transparent)]',
  violet: 'bg-violet shadow-[0_0_10px_color-mix(in_srgb,var(--color-violet)_var(--glow),transparent)]',
};

/** Полоска прогресса или уровня: жёсткий желоб и светящаяся заливка. value — доля 0..1. */
export function Meter({ value, tone = 'teal', label, className = '' }: { value: number; tone?: Glow; label?: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`h-2 overflow-hidden rounded-full p-px ${TONE.sunken} ${className}`}
    >
      <div className={`h-full rounded-full bg-[linear-gradient(to_bottom,rgb(255_255_255/0.3),transparent)] ${FILL[tone]}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Светодиодная ячейка: заполненная с бликом и свечением, пустая — утоплена. */
export const PAD = {
  teal: 'bg-teal bg-[linear-gradient(to_bottom,rgb(255_255_255/0.3),transparent_60%)] shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_0_8px_-2px_color-mix(in_srgb,var(--color-teal)_var(--glow),transparent)]',
  amber: 'bg-dot1 bg-[linear-gradient(to_bottom,rgb(255_255_255/0.3),transparent_60%)] shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_0_8px_-2px_color-mix(in_srgb,var(--color-dot1)_var(--glow),transparent)]',
  coral: 'bg-dot2 bg-[linear-gradient(to_bottom,rgb(255_255_255/0.3),transparent_60%)] shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_0_8px_-2px_color-mix(in_srgb,var(--color-dot2)_var(--glow),transparent)]',
  empty: 'bg-well shadow-(--shadow-well)',
};

/** Подпись под заголовком чужого раздела: смотреть можно, менять — хозяину. */
export function ReadOnlyNote({ who }: { who: string }) {
  return <span className="px-1 text-[13px] font-semibold text-muted">Только просмотр — меняет {who}</span>;
}

/** Метки состояния задачи: СРОЧНО — заливкой, ПРОСРОЧЕНО — контуром, чтобы различались не только словом. */
export function UrgentBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-coral px-2 py-1 text-[12px] font-extrabold leading-none tracking-wide text-teal-ink shadow-[0_0_12px_-2px_color-mix(in_srgb,var(--color-coral)_var(--glow),transparent),inset_0_1px_0_rgb(255_255_255/0.3)]">
      <Icon name="alert" size={12} stroke={3} />
      СРОЧНО
    </span>
  );
}

export function LateBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-coral px-2 py-[3px] text-[12px] font-extrabold leading-none tracking-wide text-coral-fg shadow-[0_0_10px_-3px_color-mix(in_srgb,var(--color-coral)_var(--glow),transparent)]">
      ПРОСРОЧЕНО
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className={`rounded-2xl px-4 py-5 text-center text-[14px] font-semibold text-muted ${TONE.sunken}`}>{children}</div>;
}

/* ---------- Переключатели ---------- */

/** Выбранный сегмент светится своим цветом: бирюза — обычный выбор, янтарь и коралл — состояние. */
const SEG_ON: Record<'teal' | 'amber' | 'coral', string> = {
  teal: 'text-teal-fg [text-shadow:0_0_12px_color-mix(in_srgb,var(--color-teal)_var(--glow),transparent)]',
  amber: 'text-amber-fg [text-shadow:0_0_12px_color-mix(in_srgb,var(--color-amber)_var(--glow),transparent)]',
  coral: 'text-coral-fg [text-shadow:0_0_12px_color-mix(in_srgb,var(--color-coral)_var(--glow),transparent)]',
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  dots,
  tones,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  dots?: Partial<Record<T, boolean>>;
  /** цвет выбранного варианта, если он — состояние: «внимание» янтарём, «плохо» кораллом (иначе бирюза) */
  tones?: Partial<Record<T, 'amber' | 'coral'>>;
}) {
  return (
    <div role="group" aria-label={label} className={`grid gap-1 rounded-2xl p-1 ${TONE.sunken}`} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (!on) haptics.tap();
              onChange(o.value);
            }}
            className={`h-11 rounded-xl text-[15px] font-extrabold transition-transform active:scale-[0.97] ${
              on ? `${KEY} ${SEG_ON[tones?.[o.value] ?? 'teal']}` : 'border border-transparent text-muted'
            }`}
          >
            {o.label}
            {dots?.[o.value] && <span className="ml-1.5 inline-block h-[7px] w-[7px] rounded-full bg-dot1 align-middle" />}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ on, children, onClick, tone = 'ink' }: { on: boolean; children: ReactNode; onClick: () => void; tone?: 'ink' | 'amber' | 'coral' }) {
  // выбранный — подсвеченное цветное стекло с чёткой гранью, текст ink (держит контраст в обеих темах); невыбранный — матовый в лунке
  const active =
    tone === 'amber'
      ? 'border-amber/60 bg-[color-mix(in_srgb,var(--color-amber)_var(--tint),transparent)] text-ink shadow-[inset_0_1px_0_var(--color-hl),0_0_16px_-4px_color-mix(in_srgb,var(--color-amber)_var(--glow),transparent)]'
      : tone === 'coral'
        ? 'border-coral/60 bg-[color-mix(in_srgb,var(--color-coral)_var(--tint),transparent)] text-ink shadow-[inset_0_1px_0_var(--color-hl),0_0_16px_-4px_color-mix(in_srgb,var(--color-coral)_var(--glow),transparent)]'
        : 'border-teal/60 bg-[color-mix(in_srgb,var(--color-teal)_var(--tint),transparent)] text-ink shadow-(--shadow-key-on)';
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => {
        haptics.tap();
        onClick();
      }}
      className={`h-11 rounded-xl border px-3.5 text-[14px] font-bold transition-transform active:scale-[0.97] ${on ? active : 'border-edge bg-well text-ink2 shadow-(--shadow-well)'}`}
    >
      {children}
    </button>
  );
}

export function Check({
  on,
  label,
  sub,
  onChange,
  disabled,
}: {
  on: boolean;
  label: ReactNode;
  sub?: ReactNode;
  onChange: (v: boolean) => void;
  /** менять нельзя (не твоя галочка): видно состояние, сама галочка бледная и не нажимается */
  disabled?: boolean;
}) {
  return (
    <button type="button" role="checkbox" aria-checked={on} disabled={disabled} onClick={() => {
        haptics.tap();
        onChange(!on);
      }}
      className="flex w-full items-center gap-3 px-4 py-3 text-left [&:disabled>span:last-child]:opacity-40">
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
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-teal text-teal-ink shadow-(--shadow-key-on)' : 'border-2 border-tick bg-well text-transparent shadow-(--shadow-well)'}`}>
      <Icon name="check" size={16} stroke={3} />
    </span>
  );
}

export function Stepper({ value, onChange, min = 0, label }: { value: number; onChange: (v: number) => void; min?: number; label: string }) {
  return (
    <div className={`flex items-center gap-0.5 rounded-2xl p-0.5 ${TONE.sunken}`}>
      <button
        type="button"
        aria-label={`${label}: меньше`}
        onClick={() => {
          haptics.tap();
          onChange(Math.max(min, value - 1));
        }}
        className={`h-11 w-11 rounded-[14px] text-[22px] font-bold ${KEY}`}
      >
        −
      </button>
      <span className="w-8 text-center text-[20px] font-extrabold" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`${label}: больше`}
        onClick={() => {
          haptics.tap();
          onChange(value + 1);
        }}
        className={`h-11 w-11 rounded-[14px] text-[22px] font-bold ${KEY}`}
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
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-scrim md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Выбор даты"
        className="animate-sheet flex w-full max-w-sm flex-col gap-3 rounded-t-3xl border border-b-0 border-edge-hi bg-bg/90 bg-[linear-gradient(to_bottom,var(--color-hl-soft),transparent_90px)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-(--shadow-sheet) backdrop-blur-xl md:rounded-3xl md:border-b"
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
  'w-full rounded-xl border border-tick bg-well px-3.5 py-3 text-[16px] shadow-(--shadow-well) text-ink placeholder:text-faint outline-none focus:border-teal';

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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="animate-sheet flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-b-0 border-edge-hi bg-bg/90 bg-[linear-gradient(to_bottom,var(--color-hl-soft),transparent_90px)] shadow-(--shadow-sheet) backdrop-blur-xl md:rounded-3xl md:border-b"
        style={drag.style}
        onClick={(e) => e.stopPropagation()}
      >
        {/* потянуть шапку вниз — закрыть, как в привычных приложениях */}
        <div className="flex touch-none justify-center pt-2.5 md:hidden" {...drag.handlers}>
          <span className="h-1.5 w-10 rounded-full bg-muted/40" aria-hidden="true" />
        </div>
        <div className="flex touch-none items-center gap-3 px-5 pb-2 pt-2 md:pt-4" {...drag.handlers}>
          <h2 className="m-0 flex-1 text-[19px] font-extrabold">{title}</h2>
          <IconButton icon="x" label="Закрыть" onClick={onClose} className="border-transparent" />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="pb-safe border-t border-edge px-5 pt-3">{footer}</div>}
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

/** Всплывашка + виброотклик: «готово» — мягкий двойной, ошибка — настойчивый. */
export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  if (kind === 'ok') haptics.success();
  else haptics.error();
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
          className={`animate-sheet rounded-xl border px-4 py-2.5 text-[14px] font-bold shadow-(--shadow-plate) backdrop-blur-md ${
            t.kind === 'error' ? 'border-coral/60 bg-toast-err text-coral-fg' : 'border-teal/50 bg-toast-ok text-teal-fg'
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
      <button type="button" onClick={onRemove} aria-label="Убрать фото" className="absolute right-0 top-0 flex h-11 w-11 items-start justify-end p-1.5 text-white">
        <span className="rounded-lg bg-black/70 p-1">
        <Icon name="x" size={14} stroke={2.6} />
        </span>
      </button>
    </div>
  );
}

/* ---------- Цвета уровней ---------- */

export const LEVEL_CELL = [
  // норма — матовая клавиша
  `border-edge bg-surface2 ${SHEEN} text-ink2 font-semibold shadow-(--shadow-key)`,
  // внимание и плохо — подсвечены изнутри, с цветным бликом по верхней кромке
  'border-transparent bg-[color-mix(in_srgb,var(--color-amber)_var(--tint),transparent)] text-amber-fg font-extrabold shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-amber)_55%,transparent),inset_0_0_14px_-4px_color-mix(in_srgb,var(--color-amber)_var(--glow),transparent)]',
  'border-transparent bg-[color-mix(in_srgb,var(--color-coral)_var(--tint),transparent)] text-coral-fg font-extrabold shadow-[inset_0_1px_0_color-mix(in_srgb,var(--color-coral)_55%,transparent),inset_0_0_14px_-4px_color-mix(in_srgb,var(--color-coral)_var(--glow),transparent)]',
];

export const LEVEL_DOT = [
  'bg-dot0',
  'bg-dot1 shadow-[0_0_8px_color-mix(in_srgb,var(--color-dot1)_var(--glow),transparent)]',
  'bg-dot2 shadow-[0_0_8px_color-mix(in_srgb,var(--color-dot2)_var(--glow),transparent)]',
];
