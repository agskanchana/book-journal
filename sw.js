const CACHE_NAME = 'book-journal-v1.0.0';
const OFFLINE_URL = '/offline.html';

// Files to cache for offline functionality
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/pwa.js',
  '/offline.html',
  '/manifest.json',
  // Onsen UI files
  'https://unpkg.com/onsenui/css/onsenui.css',
  'https://unpkg.com/onsenui/css/onsen-css-components.min.css',
  'https://unpkg.com/onsenui/js/onsenui.min.js',
  // External libraries
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache.map(url => new Request(url, {
          cache: 'reload'
        })));
      })
      .catch((error) => {
        console.error('[SW] Failed to cache:', error);
      })
  );

  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }

        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        if (event.request.destination === 'document') {
          return caches.match(OFFLINE_URL);
        }
      })
  );
});

// Handle background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-books') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncOfflineData());
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  const options = {
    body: event.data ? event.data.text() : 'New reading progress available!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    }
  };

  event.waitUntil(
    self.registration.showNotification('📚 Book Journal', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});

// Sync offline data when back online
async function syncOfflineData() {
  try {
    console.log('[SW] Syncing offline data...');
    // Implementation would sync with server
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});