import { isStandalone } from './install';

/**
 * Диагностика запуска — отправляет маячок на /diag только если явно задан VITE_DIAG_ENABLED=true
 * (например, за прокси-сервером nginx). На статическом хостинге (GitHub Pages / research-station)
 * сетевые запросы к /diag отключены, чтобы не засорять консоль 404-ошибками.
 */
let sent = 0;

export function diag(event: string, detail = '') {
  if (sent++ >= 20) return;
  if (import.meta.env.VITE_DIAG_ENABLED !== 'true') return;
  try {
    const q = new URLSearchParams({ e: event, d: detail.slice(0, 300), b: __BUILD__, s: isStandalone() ? '1' : '0' });
    const url = `/diag?${q}`;
    if (!navigator.sendBeacon?.(url)) fetch(url, { method: 'POST', keepalive: true }).catch(() => undefined);
  } catch {
    /* диагностика не должна ничего ломать */
  }
}
