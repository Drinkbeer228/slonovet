import { describe, expect, it } from 'vitest';
import {
  BIOLAB_PROGRESS_KEY,
  createBlankRoundReport,
  evaluateRoundReport,
  getActiveElephantsFromLocation,
  getActualRoundFacts,
  hasBiolabRationViolation,
  parseActiveElephants,
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

  it('парсит состав стада в Манеже из query-параметра elephants (по умолчанию все три)', () => {
    expect(parseActiveElephants(undefined)).toEqual(['Марго', 'Претти', 'Одри']);
    expect(parseActiveElephants('')).toEqual(['Марго', 'Претти', 'Одри']);
    expect(parseActiveElephants('margo')).toEqual(['Марго']);
    expect(parseActiveElephants('margo,pretty')).toEqual(['Марго', 'Претти']);
    expect(parseActiveElephants('pretty,margo,odri')).toEqual(['Марго', 'Претти', 'Одри']);

    expect(getActiveElephantsFromLocation('', '#/station?elephants=margo')).toEqual(['Марго']);
    expect(getActiveElephantsFromLocation('?mode=station&elephants=margo,pretty', '')).toEqual(['Марго', 'Претти']);
    expect(getActiveElephantsFromLocation('?mode=station', '#/station')).toEqual(['Марго', 'Претти', 'Одри']);
  });

  it('I этап (elephants=margo): сверяет только Марго и игнорирует ration-violation без Одри', () => {
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

    const activeElephants = parseActiveElephants('margo');

    // Даже при активном ration-violation для Одри без её присутствия в Манеже факт ЖКТ не активируется
    const stage1Facts = getActualRoundFacts({ activeElephants });
    expect(stage1Facts.Одри.digestion).toBe('norm');

    // Стажёр честно заполнил только Марго (Претти и Одри оставлены в blank)
    const report = createBlankRoundReport();
    report.Марго.water = 'issue';

    const { evaluation, progress } = submitRoundReportToStation(report, undefined, { activeElephants });
    expect(evaluation.accepted).toBe(true);
    expect(evaluation.score).toBe(10);
    expect(evaluation.flags).toEqual([]);
    expect(evaluation.activeElephants).toEqual(['Марго']);
    expect(evaluation.tarasReply).toContain('Марго');
    expect(evaluation.tarasReply).not.toContain('Претти');
    expect(evaluation.tarasReply).not.toContain('Одри');
    expect(progress.items['round-check']?.flags).toBeUndefined();
    expect(progress.items['round-check']?.score).toBe(10);

    // Если стажёр поставил у Марго «норма» на водопое — Тарас ловит приписку и пишет report-mismatch
    const lazyStage1 = createBlankRoundReport();
    const { evaluation: lazyEval, progress: lazyProgress } = submitRoundReportToStation(lazyStage1, undefined, {
      activeElephants,
    });
    expect(lazyEval.accepted).toBe(false);
    expect(lazyEval.hasCoverUp).toBe(true);
    expect(lazyEval.flags).toEqual(['report-mismatch']);
    expect(lazyEval.discrepancies).toHaveLength(1);
    expect(lazyEval.discrepancies[0]?.elephant).toBe('Марго');
    expect(lazyProgress.items['round-check']?.flags).toEqual(['report-mismatch']);

    localStorage.removeItem(BIOLAB_PROGRESS_KEY);
  });

  it('II этап (elephants=margo,pretty): сверяет Марго и Претти, оставляя Одри вне проверки и игнорируя ration-violation', () => {
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

    const activeElephants = parseActiveElephants('margo,pretty');

    // Заполняем честно только Марго и Претти (Одри не в Манеже и оставлена в исходном виде)
    const report = createBlankRoundReport();
    report.Марго.water = 'issue';
    report.Претти.feet = 'issue';
    report.Претти.skin = 'issue';

    const { evaluation, progress } = submitRoundReportToStation(report, undefined, { activeElephants });
    expect(evaluation.accepted).toBe(true);
    expect(evaluation.score).toBe(10);
    expect(evaluation.flags).toEqual([]);
    expect(evaluation.activeElephants).toEqual(['Марго', 'Претти']);
    expect(evaluation.tarasReply).toContain('Марго');
    expect(evaluation.tarasReply).toContain('Претти');
    expect(evaluation.tarasReply).not.toContain('Одри');
    expect(progress.items['round-check']?.flags).toBeUndefined();

    // Утаили трещину стопы у Претти -> замечание и report-mismatch (при этом Одри всё равно не проверяется)
    const missedPrettyFeet = createBlankRoundReport();
    missedPrettyFeet.Марго.water = 'issue';
    missedPrettyFeet.Претти.skin = 'issue';

    const check = submitRoundReportToStation(missedPrettyFeet, undefined, { activeElephants });
    expect(check.evaluation.accepted).toBe(false);
    expect(check.evaluation.hasCoverUp).toBe(true);
    expect(check.evaluation.discrepancies.map((d) => `${d.elephant}:${d.metric}`)).toEqual(['Претти:feet']);
    expect(check.progress.items['round-check']?.flags).toEqual(['report-mismatch']);

    localStorage.removeItem(BIOLAB_PROGRESS_KEY);
  });
});
