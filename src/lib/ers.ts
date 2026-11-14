import { useSyncExternalStore } from 'react';

export const ERS_MODULE = 'slonovet';
export const ERS_PROGRESS_KEY = 'ers_progress_v1:slonovet';
export const ERS_TITLE = 'СлоноВет — Полевой пост';

export type ErsProgressKind = 'shift' | 'inspection' | 'checklist';

export interface ErsProgressItem {
  kind: string;
  status: 'done' | 'in_progress';
  at: string;
}

export interface ErsProgressPayload {
  schema: 'ers.progress/1';
  module: 'slonovet';
  updatedAt: string;
  items: Record<string, ErsProgressItem>;
}

interface ErsState {
  embedded: boolean;
  paused: boolean;
  reducedMotion: boolean;
}

const listeners = new Set<() => void>();

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

/** Post an L2 protocol message to parent station frame */
export function postToStation(payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    const msg = { ers: 1, module: ERS_MODULE, ...payload };
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    } else {
      window.postMessage(msg, '*');
    }
  } catch {
    /* ignore cross-origin or sandbox restrictions */
  }
}

/** Send L2 close-request to parent station */
export function requestStationClose() {
  postToStation({ type: 'close-request' });
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
  if (embeddedNow !== state.embedded) {
    state = { ...state, embedded: embeddedNow };
    emit();
  }
  applyReducedMotionAttr(state.reducedMotion);

  if (!bridgeInitialized) {
    bridgeInitialized = true;
    window.addEventListener('message', (event: MessageEvent) => {
      handleStationMessage(event.data);
    });
  }

  postToStation({ type: 'ready' });
  postToStation({ type: 'title', title: ERS_TITLE });
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
      return {
        schema: 'ers.progress/1',
        module: ERS_MODULE,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now,
        items: { ...parsed.items },
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
export function recordErsProgress(itemId: string, kind = 'shift', status: 'done' | 'in_progress' = 'done'): ErsProgressPayload {
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
