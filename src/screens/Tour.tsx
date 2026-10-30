import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { INTRO, INTRO_VERSION, SECTION_VERSION, sectionTour, type TourStep, type TourTab } from '../domain/tour';
import type { CurrentUser } from '../domain/types';
import { logEvent } from '../lib/log';
import { Button, toast } from '../ui/kit';
import type { Tab } from './Shell';

/* ---------- кто что уже видел (на этом телефоне) и запуск заново из Справки ----------
 * Сами по себе показываются один раз — знакомство при первом входе с телефона.
 * Рассказы о разделах — только по кнопке в Справке. */

type TourKey = 'intro' | TourTab;

const key = (userId: string, k: TourKey) => (k === 'intro' ? `slonovet_tour_${userId}` : `slonovet_tour_${k}_${userId}`);
const versionOf = (k: TourKey) => (k === 'intro' ? INTRO_VERSION : SECTION_VERSION);

function seen(userId: string, k: TourKey): boolean {
  try {
    return Number(localStorage.getItem(key(userId, k)) ?? 0) >= versionOf(k);
  } catch {
    return true; // без хранилища не мучаем человека подсказками при каждом входе
  }
}

function markSeen(userId: string, k: TourKey) {
  try {
    localStorage.setItem(key(userId, k), String(versionOf(k)));
    localStorage.removeItem(`slonovet_tour_later_${userId}`); // от прошлой версии подсказок
  } catch {
    /* не запомнится — не беда */
  }
}

let replay: { key: TourKey; n: number } = { key: 'intro', n: 0 };
const listeners = new Set<() => void>();
/** Показать подсказки ещё раз: знакомство (меню) или рассказ о разделе (Справка). */
export function startTour(k: TourKey = 'intro') {
  replay = { key: k, n: replay.n + 1 };
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

/** Шаг можно показать: подсвечивать нечего — подсказка посередине; есть что — оно на экране. */
const present = (st: TourStep) => !st.target || !!findVisible(st.target);

interface Active {
  key: TourKey;
  steps: TourStep[];
  /** шаги уже сверены с экраном (те, чьего места нет, выкинуты) */
  ready: boolean;
}

/** preview — админ в «Посмотреть как»: подсказки роли только по кнопке из Справки, «видел» не запоминаем. */
export function Tour({ user, tab, onTab, preview = false }: { user: CurrentUser; tab: Tab; onTab: (t: Tab) => void; preview?: boolean }) {
  const replayed = useReplay();
  // уже обработанные повторы: после смены роли («Посмотреть как») Tour создаётся заново и не должен заново показывать старое
  const handled = useRef(replayed.n);
  const [active, setActive] = useState<Active | null>(() =>
    preview || seen(user.id, 'intro') ? null : { key: 'intro', steps: INTRO[user.role], ready: false },
  );
  const [pos, setPos] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const begin = (k: TourKey, steps: TourStep[]) => {
    setPos(0);
    setRect(null);
    setActive({ key: k, steps, ready: false });
  };

  // повтор из меню или Справки
  useEffect(() => {
    if (!replayed.n || replayed.n === handled.current) return;
    handled.current = replayed.n;
    if (replayed.key === 'intro') return begin('intro', INTRO[user.role]);
    const t = sectionTour(replayed.key, user.role);
    if (!t) return;
    if (tab !== replayed.key) onTab(replayed.key);
    // рассказ о дежурстве без открытого дежурства не о чем: покажем сам, когда примешь
    window.setTimeout(() => {
      if (t.when && !findVisible(t.when)) toast('Покажу, когда дежурство будет открыто');
      else begin(replayed.key, t.steps);
    }, 300);
  }, [replayed]); // eslint-disable-line react-hooks/exhaustive-deps

  // перед показом отсеиваем шаги, чьего места нет на экране (иначе «2 из 9» → «7 из 9»)
  useEffect(() => {
    if (!active || active.ready) return;
    const need = active.steps.find((st) => st.tab)?.tab;
    if (need && need !== tab) {
      onTab(need);
      return;
    }
    const t = window.setTimeout(() => {
      const keep = active.steps.filter((st) => (st.tab && st.tab !== tab) || present(st));
      setPos(0);
      if (keep.length) setActive({ ...active, steps: keep, ready: true });
      else finish(false);
    }, 300);
    return () => window.clearTimeout(t);
  }, [active, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // показали — значит увидел: закрыл приложение посреди подсказок — заново не покажем
  useEffect(() => {
    if (active?.ready && !preview) markSeen(user.id, active.key);
  }, [active?.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = active?.ready ? active.steps : null;
  const step = steps?.[pos];

  function finish(skipped: boolean) {
    if (!active) return;
    if (!preview) {
      logEvent('tour.done', { role: user.role, tour: active.key, step: pos + 1, of: active.steps.length, skipped });
      markSeen(user.id, active.key);
    }
    setActive(null);
    setRect(null);
  }
  const next = () => {
    if (!steps) return;
    let k = pos + 1;
    while (k < steps.length && !(steps[k].tab && steps[k].tab !== tab) && !present(steps[k])) k++; // место пропало — дальше
    if (k < steps.length) setPos(k);
    else finish(false);
  };

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
      } else if (tries++ < 5) timer = window.setTimeout(look, 100);
      else next(); // подсвечивать нечего
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

  if (!step || !steps) return null;
  // ждём, пока найдётся, что подсветить — не мигаем подсказкой посередине
  if (step.target && !rect) return null;

  const last = pos === steps.length - 1;
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
        <div className="animate-sheet flex w-full max-w-sm flex-col gap-3 rounded-3xl border border-edge-hi bg-bg/85 bg-[linear-gradient(to_bottom,var(--color-hl-soft),transparent_70px)] p-4 shadow-(--shadow-plate) backdrop-blur-xl">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[17px] font-extrabold">{step.title}</span>
            {steps.length > 1 && (
              <span className="text-[12px] font-bold text-muted">
                {pos + 1} из {steps.length}
              </span>
            )}
          </div>
          <p className="m-0 text-[15px] leading-snug text-ink2">{step.text}</p>
          <div className="flex gap-2">
            {!last && (
              <Button full onClick={() => finish(true)}>
                Пропустить
              </Button>
            )}
            <Button kind="accent" full onClick={next}>
              {last ? 'Понятно' : 'Дальше'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
