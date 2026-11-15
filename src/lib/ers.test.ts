import { describe, expect, it } from 'vitest';
import {
  ERS_MODULE,
  ERS_PROGRESS_KEY,
  getErsProgress,
  getErsState,
  handleStationMessage,
  isFromStation,
  persistCanonicalStatuses,
  postToStation,
  recordErsProgress,
  resetErsProgress,
} from './ers';

describe('research-station L2 & L4 integration (ers.ts)', () => {
  it('writes and updates anonymized L4 progress under ers_progress_v1:slonovet', () => {
    resetErsProgress();
    const res1 = recordErsProgress('shift-2026-05-01', 'shift', 'done');
    expect(res1.schema).toBe('ers.progress/1');
    expect(res1.module).toBe(ERS_MODULE);
    expect(res1.items['shift-2026-05-01']?.kind).toBe('shift');
    expect(res1.items['shift-2026-05-01']?.status).toBe('done');

    const raw = localStorage.getItem(ERS_PROGRESS_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.schema).toBe('ers.progress/1');
    expect(parsed.module).toBe('slonovet');
    expect(parsed.updatedAt).toBeTruthy();
    expect(parsed.items['shift-2026-05-01'].kind).toBe('shift');
    expect(parsed.items['shift-2026-05-01'].status).toBe('done');

    recordErsProgress('vet-check-demo-r1', 'shift', 'done');
    const current = getErsProgress();
    expect(current.items['shift-2026-05-01']).toBeTruthy();
    expect(current.items['vet-check-demo-r1']).toBeTruthy();
  });

  it('handles incoming L2 station messages (init, pause, resume, reducedMotion)', () => {
    const handledInit = handleStationMessage({ ers: 1, type: 'init', reducedMotion: true });
    expect(handledInit).toBe(true);
    expect(getErsState().reducedMotion).toBe(true);

    const handledPause = handleStationMessage({ ers: 1, type: 'pause' });
    expect(handledPause).toBe(true);
    expect(getErsState().paused).toBe(true);

    const handledResume = handleStationMessage({ ers: 1, type: 'resume', settings: { reducedMotion: false } });
    expect(handledResume).toBe(true);
    expect(getErsState().paused).toBe(false);
    expect(getErsState().reducedMotion).toBe(false);
  });

  it('hears only the station: its origin and its window (CONTRACT.md §4)', () => {
    const parent = window.parent;
    const data = { ers: 1, type: 'pause' };
    // Not embedded (parent is the page itself): nothing is a station message.
    expect(isFromStation({ origin: 'https://drinkbeer228.github.io', source: parent, data } as MessageEvent)).toBe(false);
  });

  it('posts nothing when not embedded, so it never talks to itself or to a stranger', () => {
    const sent: unknown[] = [];
    const orig = window.postMessage;
    window.postMessage = ((m: unknown) => sent.push(m)) as typeof window.postMessage;
    try {
      postToStation({ type: 'ready' });
    } finally {
      window.postMessage = orig;
    }
    expect(sent).toEqual([]);
  });

  it('reads an old `in_progress` item as the contract’s `started`', () => {
    localStorage.setItem(ERS_PROGRESS_KEY, JSON.stringify({ schema: 'ers.progress/1', module: 'slonovet', updatedAt: '2026-11-14T10:00:00.000Z', items: { 'shift-1': { kind: 'shift', status: 'in_progress', at: '2026-11-14T10:00:00.000Z' } } }));
    expect(getErsProgress().items['shift-1']?.status).toBe('started');
    // …and the shared key is rewritten for the station, which reads storage directly.
    expect(persistCanonicalStatuses()).toBe(true);
    expect(JSON.parse(localStorage.getItem(ERS_PROGRESS_KEY)!).items['shift-1'].status).toBe('started');
    expect(persistCanonicalStatuses()).toBe(false);
    resetErsProgress();
  });
});
