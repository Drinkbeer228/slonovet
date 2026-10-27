import { isStandalone } from './install';

/**
 * Диагностика запуска — работает и до входа: короткая отметка уходит запросом на /diag и остаётся
 * в журнале запросов сервера (nginx). По ней видно, на каком шаге телефон застрял или упал.
 * Ничего личного: событие, короткий текст ошибки, версия, открыто ли с иконки.
 */
let sent = 0;

export function diag(event: string, detail = '') {
  if (sent++ >= 20) return; // не засоряем журнал, если что-то сыплется в цикле
  try {
    const q = new URLSearchParams({ e: event, d: detail.slice(0, 300), b: __BUILD__, s: isStandalone() ? '1' : '0' });
    const url = `/diag?${q}`;
    if (!navigator.sendBeacon?.(url)) fetch(url, { method: 'POST', keepalive: true }).catch(() => undefined);
  } catch {
    /* диагностика не должна ничего ломать */
  }
}
