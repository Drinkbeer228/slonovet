import { describe, expect, it } from 'vitest';
import {
  BIOLAB_PROGRESS_KEY,
  createBlankRoundReport,
  evaluateRoundReport,
  getActualRoundFacts,
  hasBiolabRationViolation,
  submitRoundReportToStation,
} from './stationRound';
import { ERS_PROGRESS_KEY, resetErsProgress } from '../lib/ers';

describe('Полевой пост — чек-лист обхода стажёра и сверка с фактами (stationRound.ts)', () => {
  it('учитывает входящий протокол из Био-лаборатории ers_progress_v1:biolab (флаг ration-violation)', () => {
    localStorage.removeItem(BIOLAB_PROGRESS_KEY);
    expect(hasBiolabRationViolation()).toBe(false);

    const baseFacts = getActualRoundFacts();
    expect(baseFacts.Марго.water).toBe('issue');
    expect(baseFacts.Претти.feet).toBe('issue');
    expect(baseFacts.Претти.skin).toBe('issue');
    expect(baseFacts.Одри.appetite).toBe('issue');
    expect(baseFacts.Одри.digestion).toBe('norm');

    // Записываем протокол из Био-лаборатории с флагом ration-violation
    localStorage.setItem(
      BIOLAB_PROGRESS_KEY,
      JSON.stringify({
        schema: 'ers.progress/1',
        module: 'biolab',
        updatedAt: '2026-11-15T08:00:00.000Z',
        items: {
          'ration-audit': {
            kind: 'practice',
            status: 'done',
            flags: ['ration-violation'],
          },
        },
      }),
    );

    expect(hasBiolabRationViolation()).toBe(true);
    const biolabFacts = getActualRoundFacts();
    expect(biolabFacts.Одри.appetite).toBe('issue');
    expect(biolabFacts.Одри.digestion).toBe('issue');
    localStorage.removeItem(BIOLAB_PROGRESS_KEY);
  });

  it('ловит стажёра на приписке (отмечено «норма» там, где по факту проблема) и пишет флаг report-mismatch в ers_progress_v1:slonovet', () => {
    resetErsProgress();
    localStorage.removeItem(BIOLAB_PROGRESS_KEY);

    // Стажёр оставил везде «норма» ради быстрой сдачи
    const lazyReport = createBlankRoundReport();
    const { evaluation, progress } = submitRoundReportToStation(lazyReport);

    expect(evaluation.accepted).toBe(false);
    expect(evaluation.hasCoverUp).toBe(true);
    expect(evaluation.hasMismatch).toBe(true);
    expect(evaluation.flags).toEqual(['report-mismatch']);
    expect(evaluation.score).toBeLessThan(10);
    expect(evaluation.tarasReply).toContain('приписку');

    const roundCheck = progress.items['round-check'];
    expect(roundCheck).toBeTruthy();
    expect(roundCheck?.kind).toBe('practice');
    expect(roundCheck?.status).toBe('done');
    expect(roundCheck?.score).toBe(evaluation.score);
    expect(roundCheck?.flags).toEqual(['report-mismatch']);

    const raw = JSON.parse(localStorage.getItem(ERS_PROGRESS_KEY)!);
    expect(raw.schema).toBe('ers.progress/1');
    expect(raw.module).toBe('slonovet');
    expect(raw.items['round-check'].kind).toBe('practice');
    expect(raw.items['round-check'].status).toBe('done');
    expect(raw.items['round-check'].flags).toEqual(['report-mismatch']);
  });

  it('принимает смену без замечаний при честном заполнении всех пунктов по фактам (без флага report-mismatch)', () => {
    resetErsProgress();
    localStorage.setItem(
      BIOLAB_PROGRESS_KEY,
      JSON.stringify({
        schema: 'ers.progress/1',
        module: 'biolab',
        updatedAt: '2026-11-15T08:00:00.000Z',
        items: {
          'ration-audit': { kind: 'practice', status: 'done', flags: ['ration-violation'] },
        },
      }),
    );

    const honestReport = getActualRoundFacts();
    const { evaluation, progress } = submitRoundReportToStation(honestReport);

    expect(evaluation.accepted).toBe(true);
    expect(evaluation.hasCoverUp).toBe(false);
    expect(evaluation.hasMismatch).toBe(false);
    expect(evaluation.score).toBe(10);
    expect(evaluation.flags).toEqual([]);
    expect(evaluation.tarasReply).toContain('Принимаю смену без замечаний');

    const roundCheck = progress.items['round-check'];
    expect(roundCheck).toBeTruthy();
    expect(roundCheck?.kind).toBe('practice');
    expect(roundCheck?.status).toBe('done');
    expect(roundCheck?.score).toBe(10);
    expect(roundCheck?.flags).toBeUndefined();

    // Если при активном ration-violation стажёр утаил проблему с ЖКТ/навозом у Одри — Тарас ловит приписку
    const missedDigestion = getActualRoundFacts();
    missedDigestion.Одри.digestion = 'norm';
    const checkMissed = evaluateRoundReport(missedDigestion);
    expect(checkMissed.hasCoverUp).toBe(true);
    expect(checkMissed.flags).toEqual(['report-mismatch']);

    localStorage.removeItem(BIOLAB_PROGRESS_KEY);
  });
});
