import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { TOUR_VERSION, TOURS } from '../domain/tour';
import type { CurrentUser } from '../domain/types';
import { logEvent } from '../lib/log';
import { Button } from '../ui/kit';
import type { Tab } from './Shell';

/* ---------- кто уже видел подсказки (на этом телефоне) и запуск заново из Справки ---------- */

const key = (userId: string) => `slonovet_tour_${userId}`;

function seenVersion(userId: string): number {
  try {
    return Number(localStorage.getItem(key(userId)) ?? 0);
  } catch {
    return TOUR_VERSION; // без хранилища не мучаем человека подсказками при каждом входе
  }
}

function markSeen(userId: string) {
  try {
    localStorage.setItem(key(userId), String(TOUR_VERSION));
  } catch {
    /* не запомнится — не беда */
  }
}

let replay = 0;
const listeners = new Set<() => void>();
/** Показать подсказки ещё раз (кнопка в Справке). */
export function startTour() {
  replay++;
  listeners.forEach((l) => l());
}
function useReplay() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => replay,
  );
}

/* ---------- сами подсказки ---------- */

/** Видимый элемент по селектору (на телефоне кнопки разделов внизу, на компьютере — вверху). */
function findVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Рамка подсветки: высокий блок (кормление, состояние) — только его верх, чтобы осталось место для подсказки. */
function frame(el: HTMLElement): DOMRect {
  const r = el.getBoundingClientRect();
  const maxH = window.innerHeight * 0.42;
  return r.height > maxH ? new DOMRect(r.left, r.top, r.width, maxH) : r;
}

/** Подвести элемент в зону видимости: высокий — к верху (под шапку), маленький — в середину. */
function bringIntoView(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  if (r.height > window.innerHeight * 0.42) {
    window.scrollBy({ top: r.top - 130, behavior: 'instant' as ScrollBehavior });
  } else {
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
  }
}

export function Tour({ user, tab, onTab }: { user: CurrentUser; tab: Tab; onTab: (t: Tab) => void }) {
  const steps = TOURS[user.role];
  const replayed = useReplay();
  const [open, setOpen] = useState(() => seenVersion(user.id) < TOUR_VERSION);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (replayed) {
      setI(0);
      setOpen(true);
    }
  }, [replayed]);

  const step = open ? steps[i] : undefined;

  // открыть нужный раздел и найти, что подсветить (раздел появляется не сразу — ждём немного)
  useLayoutEffect(() => {
    if (!step) return;
    if (step.tab && step.tab !== tab) {
      onTab(step.tab);
      return;
    }
    setRect(null);
    if (!step.target) return;
    let tries = 0;
    let timer = 0;
    const look = () => {
      const el = findVisible(step.target!);
      if (el) {
        bringIntoView(el);
        setRect(frame(el));
      } else if (tries++ < 10) timer = window.setTimeout(look, 100);
    };
    look();
    const onMove = () => {
      const el = findVisible(step.target!);
      if (el) setRect(frame(el));
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [step, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step) return null;

  const finish = (skipped: boolean) => {
    logEvent('tour.done', { role: user.role, step: i + 1, of: steps.length, skipped });
    markSeen(user.id);
    setOpen(false);
  };
  const last = i === steps.length - 1;
  const pad = 6;
  // карточка — с той стороны экрана, где не подсвечено
  const cardOnTop = rect ? rect.top + rect.height / 2 > window.innerHeight / 2 : false;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={`Подсказка: ${step.title}`}>
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-2xl ring-2 ring-teal transition-all duration-200"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/60" />
      )}
      <div
        className={`fixed inset-x-0 flex justify-center px-4 ${cardOnTop ? 'top-[max(16px,env(safe-area-inset-top))]' : 'bottom-[max(24px,env(safe-area-inset-bottom))]'} ${
          rect ? '' : 'top-1/2 bottom-auto -translate-y-1/2'
        }`}
      >
        <div className="animate-sheet flex w-full max-w-sm flex-col gap-3 rounded-3xl border border-line bg-bg p-4 shadow-xl">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[17px] font-extrabold">{step.title}</span>
            <span className="text-[12px] font-bold text-muted">
              {i + 1} из {steps.length}
            </span>
          </div>
          <p className="m-0 text-[15px] leading-snug text-ink2">{step.text}</p>
          <div className="flex gap-2">
            {!last && (
              <Button full onClick={() => finish(true)}>
                Пропустить
              </Button>
            )}
            <Button kind="primary" full onClick={() => (last ? finish(false) : setI(i + 1))}>
              {last ? 'Понятно' : 'Дальше'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
