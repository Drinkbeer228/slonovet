import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { usePhotoUrl } from '../lib/photos';

/* ---------- Кнопки ---------- */

type BtnKind = 'primary' | 'light' | 'ghost' | 'danger';

const BTN: Record<BtnKind, string> = {
  primary: 'bg-teal text-teal-ink border-transparent',
  light: 'bg-ink text-bg border-transparent',
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
  onClick?: () => void;
  disabled?: boolean;
  big?: boolean;
  full?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
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
      className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line text-ink active:scale-95 ${className}`}
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

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-surface ${className}`}>{children}</div>;
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

export const inputCls =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-faint outline-none focus:border-teal';

/* ---------- Нижняя шторка / диалог ---------- */

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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="animate-sheet flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-line bg-bg md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pb-2 pt-4">
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
  'border-amber bg-amber/15 text-amber font-extrabold',
  'border-coral bg-coral/15 text-coral font-extrabold',
];

export const LEVEL_DOT = ['bg-dot0', 'bg-dot1', 'bg-dot2'];
