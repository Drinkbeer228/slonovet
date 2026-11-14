import { describe, expect, it } from 'vitest';
import {
  ERS_MODULE,
  ERS_PROGRESS_KEY,
  getErsProgress,
  getErsState,
  handleStationMessage,
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
});
