// DOHA Accessories - Service Worker
// Offline mode + Push Notifications
const CACHE = 'doha-v1';
const OFFLINE_KEY = 'doha-offline-queue';

// ── Install & Cache ───────────────────────────────
self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

// ── Push Notifications ────────────────────────────
self.addEventListener('push', function(e) {
  if (!e.data) return;
  let data = {};
  try { data = e.data.json(); } catch(err) { data = { title: 'DOHA', body: e.data.text() }; }

  e.waitUntil(
    self.registration.showNotification(data.title || 'DOHA Accessories', {
      body: data.body || '',
      icon: '/shitjet-app/icon-192.png',
      badge: '/shitjet-app/icon-192.png',
      vibrate: [200, 100, 200],
      data: data,
      actions: data.actions || []
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/shitjet-app/');
    })
  );
});

// ── Offline Queue Messages ────────────────────────
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'SYNC_NOW') {
    e.waitUntil(syncOfflineData());
  }
});

// ── Background Sync ───────────────────────────────
self.addEventListener('sync', function(e) {
  if (e.tag === 'doha-sync') {
    e.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  // Signal to main thread to sync
  const allClients = await clients.matchAll({ type: 'window' });
  allClients.forEach(function(client) {
    client.postMessage({ type: 'DO_SYNC' });
  });
}
