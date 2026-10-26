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
// Плюс проверяем обновления при каждом возвращении в приложение — его днями держат открытым.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
