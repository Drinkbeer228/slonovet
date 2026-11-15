import { useSyncExternalStore } from 'react';

export const ERS_MODULE = 'slonovet';
export const ERS_PROGRESS_KEY = 'ers_progress_v1:slonovet';
export const ERS_TITLE = 'СлоноВет — Полевой пост';
/** The station's origin (research-station: docs/station/CONTRACT.md §4): messages go only there, and come only from there. */
export const STATION_ORIGIN = 'https://drinkbeer228.github.io';

export type ErsProgressKind = 'shift' | 'inspection' | 'checklist';

export interface ErsProgressItem {
  kind: string;
  /** As in CONTRACT.md §2: `started` or `done` (the station skips any other status). */
  status: 'done' | 'started';
  at: string;
  score?: number;
  flags?: string[];
}

export interface ErsProgressPayload {
  schema: 'ers.progress/1';
  module: 'slonovet';
  updatedAt: string;
  items: Record<string, ErsProgressItem>;
}

interface ErsState {
  embedded: boolean;
  stationMode: boolean;
  paused: boolean;
  reducedMotion: boolean;
}

const listeners = new Set<() => void>();

export function detectStationMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const hash = window.location.hash || '';
    if (hash === '#/station' || hash.startsWith('#/station?') || hash.startsWith('#/station/') || hash === '#station') {
      return true;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'station';
  } catch {
    return false;
  }
}

function detectInitialEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('embedded') === '1' || params.get('embedded') === 'true';
  } catch {
    return false;
  }
}

function detectInitialReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reducedMotion') === '1' || params.get('reducedMotion') === 'true') return true;
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

let state: ErsState = {
  embedded: detectInitialEmbedded(),
  stationMode: detectStationMode(),
  paused: false,
  reducedMotion: detectInitialReducedMotion(),
};

let bridgeInitialized = false;

function emit() {
  listeners.forEach((l) => l());
}

export function applyReducedMotionAttr(enabled: boolean) {
  if (typeof document === 'undefined' || !document.documentElement?.dataset) return;
  if (enabled) {
    document.documentElement.dataset.reducedMotion = 'true';
  } else {
    delete document.documentElement.dataset.reducedMotion;
  }
}

export function isEmbedded(): boolean {
  return state.embedded;
}

export function isStationMode(): boolean {
  return detectStationMode() || state.stationMode;
}

export function useStationMode(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      if (typeof window === 'undefined') return () => listeners.delete(l);
      const onRoute = () => {
        const next = detectStationMode();
        if (state.stationMode !== next) {
          state = { ...state, stationMode: next };
        }
        l();
      };
      window.addEventListener('hashchange', onRoute);
      window.addEventListener('popstate', onRoute);
      return () => {
        listeners.delete(l);
        window.removeEventListener('hashchange', onRoute);
        window.removeEventListener('popstate', onRoute);
      };
    },
    () => detectStationMode(),
  );
}

export function getErsState(): ErsState {
  return state;
}

export function useErsState(): ErsState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Post an L2 protocol message to the station — only when embedded in it, and only to its origin. */
export function postToStation(payload: Record<string, unknown>) {
  if (typeof window === 'undefined' || !state.embedded) return;
  if (!window.parent || window.parent === window) return;
  try {
    window.parent.postMessage({ ers: 1, module: ERS_MODULE, ...payload }, STATION_ORIGIN);
  } catch {
    /* ignore cross-origin or sandbox restrictions */
  }
}

/** Whether a message event comes from the station that embeds this page (its origin and its window). */
export function isFromStation(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.parent || window.parent === window) return false; // not embedded: no station to hear
  if (event.origin !== STATION_ORIGIN || event.source !== window.parent) return false;
  const d = event.data as { ers?: unknown } | null;
  return Boolean(d && typeof d === 'object' && d.ers === 1);
}

/** Send L2 close-request to parent station */
export function requestStationClose() {
  postToStation({ type: 'close-request' });
}

/**
 * Send close request from the Field Post game tablet (`#/station` or `?mode=station`):
 * sends `postMessage({ type: 'ers:close-request' }, location.origin)` to `window.parent`
 * (and also notifies L2 station bridge if embedded).
 */
export function closeStationTablet() {
  if (typeof window === 'undefined') return;
  const origin = window.location?.origin && window.location.origin !== 'null' ? window.location.origin : '*';
  try {
    if (window.parent) {
      window.parent.postMessage({ type: 'ers:close-request' }, origin);
    }
  } catch {
    try {
      window.parent?.postMessage({ type: 'ers:close-request' }, '*');
    } catch {
      /* ignore */
    }
  }
  requestStationClose();
}

/** Handle incoming postMessage payload from research-station (exported for direct unit testing) */
export function handleStationMessage(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  const type = msg.type;
  if (type !== 'init' && type !== 'pause' && type !== 'resume') return false;

  let changed = false;

  if (typeof msg.reducedMotion === 'boolean') {
    if (state.reducedMotion !== msg.reducedMotion) {
      state = { ...state, reducedMotion: msg.reducedMotion };
      changed = true;
    }
    applyReducedMotionAttr(msg.reducedMotion);
  } else if (
    msg.settings &&
    typeof msg.settings === 'object' &&
    typeof (msg.settings as Record<string, unknown>).reducedMotion === 'boolean'
  ) {
    const rm = Boolean((msg.settings as Record<string, unknown>).reducedMotion);
    if (state.reducedMotion !== rm) {
      state = { ...state, reducedMotion: rm };
      changed = true;
    }
    applyReducedMotionAttr(rm);
  }

  if (type === 'init') {
    if (!state.embedded && detectInitialEmbedded()) {
      state = { ...state, embedded: true };
      changed = true;
    }
    postToStation({ type: 'title', title: ERS_TITLE });
  } else if (type === 'pause') {
    if (!state.paused) {
      state = { ...state, paused: true };
      changed = true;
    }
  } else if (type === 'resume') {
    if (state.paused) {
      state = { ...state, paused: false };
      changed = true;
    }
  }

  if (changed) emit();
  return true;
}

/** Initialize L2 station bridge: announce ready + title and listen for init/pause/resume */
export function initErsBridge() {
  if (typeof window === 'undefined') return;
  const embeddedNow = detectInitialEmbedded();
  const stationNow = detectStationMode();
  if (embeddedNow !== state.embedded || stationNow !== state.stationMode) {
    state = { ...state, embedded: embeddedNow, stationMode: stationNow };
    emit();
  }
  applyReducedMotionAttr(state.reducedMotion);

  if (!bridgeInitialized) {
    bridgeInitialized = true;
    window.addEventListener('message', (event: MessageEvent) => {
      if (isFromStation(event)) handleStationMessage(event.data);
    });
  }

  persistCanonicalStatuses();
  postToStation({ type: 'ready' });
  postToStation({ type: 'title', title: ERS_TITLE });
}

/** Rewrites a summary that still holds the old `in_progress` status, so the station (which reads the shared key) sees `started`. */
export function persistCanonicalStatuses(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(ERS_PROGRESS_KEY);
    if (!raw || !raw.includes('"in_progress"')) return false;
    localStorage.setItem(ERS_PROGRESS_KEY, JSON.stringify(getErsProgress()));
    return true;
  } catch {
    return false;
  }
}

/** Read current L4 progress object from localStorage */
export function getErsProgress(): ErsProgressPayload {
  const now = new Date().toISOString();
  const fallback: ErsProgressPayload = {
    schema: 'ers.progress/1',
    module: ERS_MODULE,
    updatedAt: now,
    items: {},
  };
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(ERS_PROGRESS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ErsProgressPayload>;
    if (parsed && parsed.schema === 'ers.progress/1' && parsed.module === ERS_MODULE && parsed.items && typeof parsed.items === 'object') {
      // An older build wrote `in_progress`; the contract (and the station) knows only `started`.
      const items: Record<string, ErsProgressItem> = {};
      for (const [id, it] of Object.entries(parsed.items as Record<string, ErsProgressItem | { status: string }>)) {
        const item = it as ErsProgressItem;
        items[id] = (it as { status: string }).status === 'in_progress' ? { ...item, status: 'started' } : item;
      }
      return {
        schema: 'ers.progress/1',
        module: ERS_MODULE,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now,
        items,
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Record anonymized L4 progress entry into localStorage['ers_progress_v1:slonovet'].
 * Never stores clinical details, elephant names, or personal notes — only scenario/shift ID, kind, status, and timestamp.
 */
export function recordErsProgress(itemId: string, kind = 'shift', status: 'done' | 'started' = 'done'): ErsProgressPayload {
  const safeId = itemId.replace(/[^a-zA-Z0-9_:-]/g, '-').slice(0, 64) || 'shift-current';
  const now = new Date().toISOString();
  const current = getErsProgress();
  const next: ErsProgressPayload = {
    schema: 'ers.progress/1',
    module: ERS_MODULE,
    updatedAt: now,
    items: {
      ...current.items,
      [safeId]: {
        kind,
        status,
        at: now,
      },
    },
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ERS_PROGRESS_KEY, JSON.stringify(next));
    }
  } catch {
    /* ignore quota errors */
  }
  emit();
  return next;
}

/**
 * Record Field Post trainee round-check result (Task B2) into localStorage['ers_progress_v1:slonovet']:
 * items['round-check'] = { kind: 'practice', status: 'done', score: 0..10, at: ISO, flags: ['report-mismatch'] (if cover-up detected) }
 */
export function recordRoundCheckProgress(score: number, hasReportMismatch: boolean): ErsProgressPayload {
  const now = new Date().toISOString();
  const current = getErsProgress();
  const boundedScore = Math.max(0, Math.min(10, Math.round(score)));
  const roundItem: ErsProgressItem = {
    kind: 'practice',
    status: 'done',
    score: boundedScore,
    at: now,
    ...(hasReportMismatch ? { flags: ['report-mismatch'] } : {}),
  };
  const next: ErsProgressPayload = {
    schema: 'ers.progress/1',
    module: ERS_MODULE,
    updatedAt: now,
    items: {
      ...current.items,
      'round-check': roundItem,
    },
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ERS_PROGRESS_KEY, JSON.stringify(next));
    }
  } catch {
    /* ignore quota errors */
  }
  emit();
  return next;
}

/** Ensure initial demo progress entry exists so ers_progress_v1:slonovet is valid on first inspection */
export function ensureDemoErsProgress(shiftId: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(ERS_PROGRESS_KEY);
    if (!raw) {
      recordErsProgress(`shift-${shiftId}`, 'shift', 'done');
    }
  } catch {
    /* ignore */
  }
}

/** Reset L4 progress when demo data is reset, re-seeding baseline shift item */
export function resetErsProgress(baselineShiftId?: string) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(ERS_PROGRESS_KEY);
    }
  } catch {
    /* ignore */
  }
  if (baselineShiftId) {
    recordErsProgress(`shift-${baselineShiftId}`, 'shift', 'done');
  } else {
    emit();
  }
}
