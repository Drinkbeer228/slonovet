import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { diag } from './lib/diag';
import './index.css';
import { initTheme } from './lib/theme';
import { captureErrors } from './lib/log';
import { registerSW } from 'virtual:pwa-register';

// ошибки ловит встроенный скрипт в index.html (с самого начала, ещё до загрузки модулей); здесь — «приложение загрузилось»
diag('boot');
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

/** Упало при показе — не чёрный экран, а понятное сообщение и кнопка перезапуска (и отметка в диагностике). */
class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    diag('crash', `${error.message} | ${(error.stack ?? '').split('\n').slice(0, 2).join(' ')}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="m-0 text-[17px] font-bold">Что-то пошло не так</p>
        <p className="m-0 text-[14px] text-muted">Записи на телефоне не пропали. Нажмите «Перезапустить»; если не помогает — напишите администратору.</p>
        <p className="m-0 max-w-full break-words font-mono text-[12px] text-faint">{this.state.error.message}</p>
        <button type="button" onClick={() => location.reload()} className="h-12 rounded-2xl bg-teal px-6 text-[16px] font-extrabold text-bg">
          Перезапустить
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
);
