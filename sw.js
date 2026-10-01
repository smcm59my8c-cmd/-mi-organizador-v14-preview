const CACHE_NAME = 'sandra-organizer-shell-v14';
const APP_URL = './';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([APP_URL])));
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SHOW_LOCAL_NOTIFICATION') {
    const { title, body, tag } = event.data;
    event.waitUntil(self.registration.showNotification(title, {
      body,
      tag,
      icon: new URL('./icons/icon-192.png', self.registration.scope).href,
      badge: new URL('./icons/icon-192.png', self.registration.scope).href,
      data: { url: APP_URL }
    }));
  }
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    data = { title: 'Mi organizador', body: event.data?.text() || 'Tienes un nuevo aviso.' };
  }
  const title = data.title || 'Mi organizador';
  const options = {
    body: data.body || 'Tienes un nuevo aviso.',
    tag: data.tag || 'sandra-organizer',
    renotify: true,
    icon: new URL('./icons/icon-192.png', self.registration.scope).href,
    badge: new URL('./icons/icon-192.png', self.registration.scope).href,
    data: { url: data.url || APP_URL }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || APP_URL;
  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      if ('focus' in client) {
        await client.focus();
        if ('navigate' in client && client.url !== url) await client.navigate(url);
        return;
      }
    }
    if (clients.openWindow) await clients.openWindow(url);
  })());
});
