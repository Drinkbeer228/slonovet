// Для старых версий страницы, которые ещё подключают этот файл: включить новую версию и перезагрузиться.
if ('serviceWorker' in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloaded) {
      reloaded = true;
      location.reload();
    }
  });
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => reg.update());
}
