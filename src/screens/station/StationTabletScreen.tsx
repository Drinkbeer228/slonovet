import { useEffect, useMemo, useState } from 'react';
import type { ElephantName } from '../../domain/types';
import {
  BIOLAB_PROGRESS_KEY,
  createBlankRoundReport,
  getActualRoundFacts,
  getFieldInspectionCards,
  hasBiolabRationViolation,
  ROUND_METRICS,
  STATION_ELEPHANTS,
  submitRoundReportToStation,
  type RoundEvaluationResult,
  type RoundMetricKey,
  type RoundReport,
  type RoundValue,
} from '../../domain/stationRound';
import { closeStationTablet } from '../../lib/ers';

export function StationTabletScreen() {
  const [biolabViolation, setBiolabViolation] = useState<boolean>(() => hasBiolabRationViolation());
  const [activeElephant, setActiveElephant] = useState<ElephantName>('Марго');
  const [report, setReport] = useState<RoundReport>(() => createBlankRoundReport());
  const [evaluation, setEvaluation] = useState<RoundEvaluationResult | null>(null);
  const [showFieldNotes, setShowFieldNotes] = useState<boolean>(true);

  useEffect(() => {
    const syncBiolab = () => {
      setBiolabViolation(hasBiolabRationViolation());
    };
    window.addEventListener('storage', syncBiolab);
    window.addEventListener('focus', syncBiolab);
    return () => {
      window.removeEventListener('storage', syncBiolab);
      window.removeEventListener('focus', syncBiolab);
    };
  }, []);

  const actualFacts = useMemo(
    () => getActualRoundFacts({ biolabRationViolation: biolabViolation }),
    [biolabViolation],
  );

  const fieldCards = useMemo(
    () => getFieldInspectionCards(biolabViolation),
    [biolabViolation],
  );

  const currentCard = fieldCards[activeElephant];
  const currentReport = report[activeElephant];

  const setMetricValue = (elephant: ElephantName, key: RoundMetricKey, value: RoundValue) => {
    setReport((prev) => ({
      ...prev,
      [elephant]: {
        ...prev[elephant],
        [key]: value,
      },
    }));
  };

  const handleSubmitReport = () => {
    const { evaluation: res } = submitRoundReportToStation(report, actualFacts);
    setEvaluation(res);
  };

  const handleFillHonestFacts = () => {
    const honest = getActualRoundFacts({ biolabRationViolation: biolabViolation });
    setReport(honest);
    setEvaluation(null);
  };

  const handleResetToAllNorm = () => {
    setReport(createBlankRoundReport());
    setEvaluation(null);
  };

  const toggleBiolabSimulation = () => {
    try {
      if (biolabViolation) {
        localStorage.removeItem(BIOLAB_PROGRESS_KEY);
        setBiolabViolation(false);
      } else {
        localStorage.setItem(
          BIOLAB_PROGRESS_KEY,
          JSON.stringify({
            schema: 'ers.progress/1',
            module: 'biolab',
            updatedAt: new Date().toISOString(),
            items: {
              'ration-audit': {
                kind: 'practice',
                status: 'done',
                at: new Date().toISOString(),
                flags: ['ration-violation'],
              },
            },
          }),
        );
        setBiolabViolation(true);
      }
      setEvaluation(null);
    } catch {
      /* ignore storage errors */
    }
  };

  const initialTarasText = biolabViolation
    ? '«Стажёр, бери полевой планшет и обойди все три вольера: Марго, Претти и Одри. Из Био-лаборатории поступил сигнал о нарушении рациона (ration-violation) — особо проверь кормушку и консистенцию навоза у Одри! Заполни 5 пунктов по каждой слонихе и сдай рапорт. Только без приписок: поставишь "норма" поверх реальной болячки — сразу выпишу замечание!»'
    : '«Стажёр, бери полевой планшет и обойди все три вольера: Марго, Претти и Одри. Сверься с осмотром на месте и заполни рапорт по 5 показателям. Только без приписок ради быстрой сдачи: если где трещина подошвы, сухость складки, недоедание или мало воды — отмечай честно, я лично перепроверю!»';

  return (
    <div
      className="min-h-screen w-full px-3 py-2.5 sm:px-5 sm:py-3"
      style={{
        backgroundColor: '#E8E4DA',
        color: '#2C302E',
        fontFamily: "var(--font-sans, 'Manrope Variable', system-ui, sans-serif)",
      }}
      data-testid="station-tablet"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5">
        {/* Верхняя приборная планка полевого КПК */}
        <header
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2 shadow-sm"
          style={{ backgroundColor: '#F4F1EA', borderColor: '#CFC8B8' }}
        >
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={closeStationTablet}
              data-testid="station-back-btn"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[13px] font-extrabold transition-transform active:scale-95"
              style={{
                backgroundColor: '#E8E4DA',
                borderColor: '#B8B0A0',
                color: '#2C302E',
              }}
            >
              ← На станцию
            </button>
            <div className="flex flex-col">
              <span className="text-[14.5px] font-extrabold tracking-tight" style={{ color: '#2C302E' }}>
                Полевой пост · КПК дежурной смены
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#5A605D' }}>
                Задача B2 · Утренний обход вольеров
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleBiolabSimulation}
              data-testid="biolab-signal-toggle"
              title="Состояние входящего протокола Био-лаборатории (ers_progress_v1:biolab)"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border px-2.5 text-[12px] font-bold transition-transform active:scale-95"
              style={
                biolabViolation
                  ? { backgroundColor: '#F8EBD8', borderColor: '#D6A461', color: '#8A4B08' }
                  : { backgroundColor: '#E8E4DA', borderColor: '#C5BEB0', color: '#5A605D' }
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: biolabViolation ? '#C86D14' : '#6C7570' }}
              />
              {biolabViolation ? 'Био-лаб: ration-violation' : 'Био-лаб: норма рациона'}
            </button>
          </div>
        </header>

        {/* Блок фельдшера Тараса с динамическими репликами */}
        <section
          aria-label="Старший фельдшер Тарас"
          data-testid="taras-block"
          className="rounded-2xl border px-3.5 py-2.5 shadow-sm"
          style={{
            backgroundColor: evaluation
              ? evaluation.accepted
                ? '#E5F0EA'
                : '#F9E5E1'
              : '#F4F1EA',
            borderColor: evaluation
              ? evaluation.accepted
                ? '#8AB89E'
                : '#DC998E'
              : '#CFC8B8',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[14px] font-extrabold"
              style={{
                backgroundColor: '#2C302E',
                borderColor: '#1E2220',
                color: '#F4F1EA',
              }}
            >
              ФТ
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13.5px] font-extrabold" style={{ color: '#2C302E' }}>
                  Фельдшер Тарас · {evaluation ? evaluation.tarasTitle : 'Инструктаж перед обходом'}
                </span>
                {evaluation && (
                  <span
                    data-testid="round-score-badge"
                    className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11.5px] font-extrabold"
                    style={
                      evaluation.accepted
                        ? { backgroundColor: '#2F6B4F', borderColor: '#23523C', color: '#F4F1EA' }
                        : { backgroundColor: '#A63A2B', borderColor: '#7F2B1F', color: '#F4F1EA' }
                    }
                  >
                    Оценка: {evaluation.score} / 10
                    {evaluation.hasMismatch ? ' · report-mismatch' : ' · принято'}
                  </span>
                )}
              </div>
              <p
                data-testid="taras-speech"
                className="m-0 text-[13px] font-semibold leading-snug"
                style={{ color: '#2C302E' }}
              >
                {evaluation ? evaluation.tarasReply : initialTarasText}
              </p>

              {evaluation && evaluation.discrepancies.length > 0 && (
                <div
                  data-testid="discrepancy-list"
                  className="mt-1 flex flex-wrap gap-1.5 pt-0.5"
                >
                  {evaluation.discrepancies.map((d) => (
                    <button
                      key={`${d.elephant}:${d.metric}`}
                      type="button"
                      onClick={() => setActiveElephant(d.elephant)}
                      className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-bold"
                      style={{
                        backgroundColor: '#F4F1EA',
                        borderColor: '#D48A7E',
                        color: '#8C2D20',
                      }}
                    >
                      {d.elephant}: {d.metricLabel} ({d.kind === 'cover-up' ? 'приписка «норма»' : 'ложная тревога'})
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Переключатель карточек трёх слонов: Марго, Претти, Одри */}
        <nav
          aria-label="Карточки слонов на смене"
          className="grid grid-cols-3 gap-2"
        >
          {STATION_ELEPHANTS.map((el) => {
            const isActive = activeElephant === el;
            const elState = report[el];
            const markedIssues = ROUND_METRICS.filter((m) => elState[m.key] === 'issue').length;
            const hasErrorOnEl = evaluation?.discrepancies.some((d) => d.elephant === el) ?? false;

            return (
              <button
                key={el}
                type="button"
                aria-pressed={isActive}
                data-testid={`elephant-tab-${el}`}
                onClick={() => setActiveElephant(el)}
                className="flex flex-col items-start justify-between gap-0.5 rounded-2xl border px-3 py-2 text-left transition-all active:scale-[0.99]"
                style={
                  isActive
                    ? {
                        backgroundColor: '#2C302E',
                        borderColor: '#2C302E',
                        color: '#F4F1EA',
                      }
                    : {
                        backgroundColor: '#F4F1EA',
                        borderColor: hasErrorOnEl ? '#D48A7E' : '#CFC8B8',
                        color: '#2C302E',
                      }
                }
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-[15px] font-extrabold">{el}</span>
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold"
                    style={
                      isActive
                        ? { backgroundColor: '#F4F1EA', color: '#2C302E' }
                        : { backgroundColor: '#E8E4DA', color: '#2C302E' }
                    }
                  >
                    {el[0]}
                  </span>
                </div>
                <span
                  className="text-[11px] font-bold"
                  style={{
                    color: isActive
                      ? '#D5D0C5'
                      : hasErrorOnEl
                        ? '#A63A2B'
                        : markedIssues > 0
                          ? '#8A4B08'
                          : '#5A605D',
                  }}
                >
                  {hasErrorOnEl
                    ? 'Расхождение в рапорте'
                    : markedIssues > 0
                      ? `Отклонений: ${markedIssues}`
                      : 'Все 5 п. — норма'}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Карточка выбранного слона: данные осмотра вольера + 5 пунктов рапорта */}
        <main
          className="flex flex-col gap-2.5 rounded-2xl border p-3.5 shadow-sm"
          style={{ backgroundColor: '#F4F1EA', borderColor: '#CFC8B8' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: '#E0DAD0' }}>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="m-0 text-[18px] font-extrabold tracking-tight" style={{ color: '#2C302E' }}>
                  Карта обхода: {currentCard.name}
                </h1>
                <span
                  className="rounded-lg px-2 py-0.5 text-[11px] font-bold"
                  style={{ backgroundColor: '#E8E4DA', color: '#5A605D' }}
                >
                  {currentCard.enclosure}
                </span>
              </div>
              <span className="text-[12px] font-semibold" style={{ color: '#5A605D' }}>
                {currentCard.tag} · {currentCard.summary}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowFieldNotes((v) => !v)}
                className="rounded-xl border px-2.5 py-1 text-[11.5px] font-bold"
                style={{ backgroundColor: '#E8E4DA', borderColor: '#C5BEB0', color: '#2C302E' }}
              >
                {showFieldNotes ? 'Скрыть данные осмотра' : 'Показать данные осмотра'}
              </button>
              <button
                type="button"
                onClick={handleFillHonestFacts}
                data-testid="fill-actual-facts-btn"
                className="rounded-xl border px-2.5 py-1 text-[11.5px] font-extrabold transition-transform active:scale-95"
                style={{ backgroundColor: '#E1EFE8', borderColor: '#8AB89E', color: '#23523C' }}
              >
                Заполнить по факту осмотра
              </button>
              <button
                type="button"
                onClick={handleResetToAllNorm}
                data-testid="reset-all-norm-btn"
                className="rounded-xl border px-2.5 py-1 text-[11.5px] font-bold transition-transform active:scale-95"
                style={{ backgroundColor: '#E8E4DA', borderColor: '#C5BEB0', color: '#5A605D' }}
              >
                Сбросить в «норму»
              </button>
            </div>
          </div>

          {/* Фактическая сводка осмотра вольера для внимательного стажёра */}
          {showFieldNotes && (
            <div
              className="rounded-xl border px-3 py-2"
              style={{ backgroundColor: '#E8E4DA', borderColor: '#CFC8B8' }}
              data-testid="enclosure-observations"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: '#4A504D' }}>
                  Полевое наблюдение в вольере ({currentCard.name})
                </span>
                {biolabViolation && activeElephant === 'Одри' && (
                  <span
                    className="rounded-md px-2 py-0.5 text-[10.5px] font-extrabold"
                    style={{ backgroundColor: '#F8EBD8', color: '#8A4B08' }}
                  >
                    Протокол Био-лаб: ration-violation
                  </span>
                )}
              </div>
              <ul className="m-0 grid list-none gap-1 p-0 text-[12px] font-semibold sm:grid-cols-2">
                {ROUND_METRICS.map((m) => {
                  const isFactIssue = actualFacts[activeElephant][m.key] === 'issue';
                  return (
                    <li
                      key={m.key}
                      className="flex items-start gap-1.5 rounded-lg px-2 py-1"
                      style={{
                        backgroundColor: isFactIssue ? '#F8EBD8' : '#F4F1EA',
                        color: '#2C302E',
                      }}
                    >
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: isFactIssue ? '#C86D14' : '#2F6B4F' }}
                      />
                      <span>
                        <strong>{m.label}:</strong> {currentCard.observations[m.key]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Чек-лист обхода стажёра по 5 пунктам */}
          <div className="flex flex-col gap-1.5" role="group" aria-label={`Чек-лист обхода: ${activeElephant}`}>
            {ROUND_METRICS.map((m, idx) => {
              const selected = currentReport[m.key];
              const discrepancy = evaluation?.discrepancies.find(
                (d) => d.elephant === activeElephant && d.metric === m.key,
              );

              return (
                <div
                  key={m.key}
                  data-testid={`metric-row-${activeElephant}-${m.key}`}
                  className="grid grid-cols-1 gap-2 rounded-xl border px-3 py-2 sm:grid-cols-[230px_1fr] sm:items-center"
                  style={{
                    backgroundColor: discrepancy ? '#FDF2F0' : '#FAF8F4',
                    borderColor: discrepancy ? '#DC998E' : '#DED8CC',
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-[13.5px] font-extrabold" style={{ color: '#2C302E' }}>
                      {idx + 1}. {m.label}
                    </span>
                    {discrepancy && (
                      <span className="text-[11.5px] font-bold" style={{ color: '#A63A2B' }}>
                        {discrepancy.kind === 'cover-up'
                          ? 'Тарас: здесь по факту отклонение, а у тебя отмечена «норма»!'
                          : 'Тарас: здесь по факту норма, лишнего не приписывай.'}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[120px_1fr]">
                    <button
                      type="button"
                      aria-pressed={selected === 'norm'}
                      data-testid={`btn-${activeElephant}-${m.key}-norm`}
                      onClick={() => setMetricValue(activeElephant, m.key, 'norm')}
                      className="min-h-9 rounded-xl border px-3 py-1 text-center text-[12.5px] font-extrabold transition-all active:scale-95"
                      style={
                        selected === 'norm'
                          ? {
                              backgroundColor: '#2F6B4F',
                              borderColor: '#23523C',
                              color: '#F4F1EA',
                            }
                          : {
                              backgroundColor: '#E8E4DA',
                              borderColor: '#C5BEB0',
                              color: '#4A504D',
                            }
                      }
                    >
                      Норма
                    </button>

                    <button
                      type="button"
                      aria-pressed={selected === 'issue'}
                      data-testid={`btn-${activeElephant}-${m.key}-issue`}
                      onClick={() => setMetricValue(activeElephant, m.key, 'issue')}
                      className="min-h-9 rounded-xl border px-3 py-1 text-center text-[12.5px] font-extrabold leading-tight transition-all active:scale-95"
                      style={
                        selected === 'issue'
                          ? {
                              backgroundColor: '#9A5B13',
                              borderColor: '#7A460B',
                              color: '#F4F1EA',
                            }
                          : {
                              backgroundColor: '#E8E4DA',
                              borderColor: '#C5BEB0',
                              color: '#4A504D',
                            }
                      }
                    >
                      {m.issueLabel}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Нижняя панель сдачи рапорта Тарасу */}
          <div
            className="flex flex-col items-stretch justify-between gap-2.5 border-t pt-2.5 sm:flex-row sm:items-center"
            style={{ borderColor: '#E0DAD0' }}
          >
            <div className="flex flex-col text-[12px] font-semibold" style={{ color: '#5A605D' }}>
              <span>
                Отмечено отклонений по смене:{' '}
                <strong style={{ color: '#2C302E' }}>
                  {STATION_ELEPHANTS.reduce(
                    (acc, el) => acc + ROUND_METRICS.filter((m) => report[el][m.key] === 'issue').length,
                    0,
                  )}{' '}
                  из 15 пунктов
                </strong>
              </span>
              <span>Сводка записывается в журнал станции (ers_progress_v1:slonovet → round-check)</span>
            </div>

            <button
              type="button"
              onClick={handleSubmitReport}
              data-testid="submit-report-btn"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border px-5 text-[14px] font-extrabold shadow-sm transition-transform active:scale-95"
              style={{
                backgroundColor: '#2C302E',
                borderColor: '#1E2220',
                color: '#F4F1EA',
              }}
            >
              Сдать рапорт Тарасу
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
