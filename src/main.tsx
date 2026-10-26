import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initTheme } from './lib/theme';
import { captureErrors } from './lib/log';
import { registerSW } from 'virtual:pwa-register';

initTheme();
captureErrors();

// новая версия сайта: скачалась — сразу включаем (страница перезагрузится, отметки уже сохранены в телефоне).
// Плюс проверяем обновления при возвращении в приложение — его днями держат открытым; не чаще раза в минуту.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    let checked = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - checked < 60_000) return;
      checked = Date.now();
      reg.update().catch(() => undefined);
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
