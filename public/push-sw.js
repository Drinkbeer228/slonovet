// Push-уведомления СлоноВета: подключается в service worker (vite.config.ts → workbox.importScripts).
self.addEventListener('push', (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'СлоноВет', {
      body: d.body || '',
      tag: d.tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: d.url || '/' },
    }),
  );
});

// нажали на уведомление — открыть приложение на нужном разделе (или показать уже открытое)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          if ('navigate' in c) c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
