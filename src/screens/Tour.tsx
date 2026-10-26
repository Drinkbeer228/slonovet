import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
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

/** Шаги, отложенные «на потом»: показать, когда их место появится на экране. */
const laterKey = (userId: string) => `slonovet_tour_later_${userId}`;
function readLater(userId: string): number[] {
  try {
    return JSON.parse(localStorage.getItem(laterKey(userId)) ?? '[]') as number[];
  } catch {
    return [];
  }
}
function writeLater(userId: string, list: number[]) {
  try {
    if (list.length) localStorage.setItem(laterKey(userId), JSON.stringify(list));
    else localStorage.removeItem(laterKey(userId));
  } catch {
    /* не запомнится — не беда */
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
  // какие шаги показываем сейчас (по порядку) и на каком мы
  const [queue, setQueue] = useState<number[] | null>(() => (seenVersion(user.id) < TOUR_VERSION ? steps.map((_, k) => k) : null));
  const [pos, setPos] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const deferred = useRef<number[]>([]);
  // перед показом отсеиваем шаги, чьего места нет на этом экране (иначе «2 из 9» → «7 из 9»)
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!queue || ready) return;
    // шаги, которые могут не найтись, проверяем на их разделе (повтор из Справки — сначала уходим туда)
    const tabToCheck = queue.map((k) => steps[k]).find((st) => st.ifMissing && st.tab)?.tab;
    if (tabToCheck && tabToCheck !== tab) {
      onTab(tabToCheck);
      return;
    }
    const t = window.setTimeout(() => {
      const keep = queue.filter((k) => {
        const st = steps[k];
        const here = !st.tab || st.tab === tab;
        if (!(st.ifMissing && st.target && here && !findVisible(st.target))) return true;
        if (st.ifMissing === 'later') deferred.current.push(k);
        return false;
      });
      setPos(0);
      setQueue(keep.length ? keep : null);
      setReady(true);
    }, 250);
    return () => window.clearTimeout(t);
  }, [queue, ready, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (replayed) {
      deferred.current = [];
      setPos(0);
      setReady(false);
      setQueue(steps.map((_, k) => k));
    }
  }, [replayed]); // eslint-disable-line react-hooks/exhaustive-deps

  // отложенные шаги: как только их место появилось (кипер принял первое дежурство) — показываем
  useEffect(() => {
    if (queue) return;
    const later = readLater(user.id);
    if (!later.length) return;
    const check = () => {
      const first = steps[later[0]];
      if (first?.target && findVisible(first.target)) {
        writeLater(user.id, []);
        deferred.current = [];
        setPos(0);
        setReady(true);
        setQueue(later);
      }
    };
    check();
    const t = window.setInterval(check, 1500);
    return () => window.clearInterval(t);
  }, [queue, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = queue ? steps[queue[pos]] : undefined;

  const finish = (skipped: boolean) => {
    logEvent('tour.done', { role: user.role, step: pos + 1, of: queue?.length ?? 0, skipped });
    markSeen(user.id);
    // «Пропустить» — значит не надо и отложенного; дошёл до конца — отложенное покажем, когда появится
    writeLater(user.id, skipped ? [] : deferred.current);
    setQueue(null);
    setReady(false);
  };
  // следующий шаг; те, чьего места нет на этом экране, сразу пропускаем или откладываем — без пауз
  const next = () => {
    if (!queue) return;
    let k = pos + 1;
    while (k < queue.length) {
      const st = steps[queue[k]];
      const here = !st.tab || st.tab === tab;
      if (!(st.ifMissing && st.target && here && !findVisible(st.target))) break;
      if (st.ifMissing === 'later') deferred.current.push(queue[k]);
      k++;
    }
    if (k < queue.length) setPos(k);
    else finish(false);
  };

  // открыть нужный раздел и найти, что подсветить (раздел появляется не сразу — ждём немного)
  useLayoutEffect(() => {
    if (!step || !ready) return;
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
      } else if (tries++ < 5) timer = window.setTimeout(look, 100);
      else if (step.ifMissing) {
        // подсвечивать нечего: пропускаем или откладываем до появления
        if (step.ifMissing === 'later') deferred.current.push(queue![pos]);
        next();
      }
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
  }, [step, tab, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!step || !queue || !ready) return null;
  // ждём, найдётся ли место для шага, который могут пропустить — пока не мигаем пустой подсказкой
  if (step.ifMissing && !rect) return null;

  const last = pos === queue.length - 1;
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
              {pos + 1} из {queue.length}
            </span>
          </div>
          <p className="m-0 text-[15px] leading-snug text-ink2">{step.text}</p>
          <div className="flex gap-2">
            {!last && (
              <Button full onClick={() => finish(true)}>
                Пропустить
              </Button>
            )}
            <Button kind="primary" full onClick={next}>
              {last ? 'Понятно' : 'Дальше'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
