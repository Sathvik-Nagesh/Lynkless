// Service Worker for Lynkless PWA
const CACHE_NAME = 'lynkless-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
];

const CACHEABLE_PATH_REGEX = /\.(?:js|css|ico|png|jpg|jpeg|svg|webp|woff2?)$/i;

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Only cache GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip WebSocket connections
  if (event.request.url.includes('ws://') || event.request.url.includes('wss://')) {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  const shouldCache =
    urlsToCache.includes(requestUrl.pathname) ||
    CACHEABLE_PATH_REGEX.test(requestUrl.pathname);

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const isValidForCache =
          shouldCache &&
          response.ok &&
          response.type !== 'opaque';

        if (isValidForCache) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Background Sync Event Listener
// This helps prevent iOS/Android from aggressively suspending the background 
// process while a file transfer is actively chunking data.
self.addEventListener('sync', (event) => {
  if (event.tag === 'lynkless-transfer-sync') {
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_KEEPALIVE', timestamp: Date.now() });
        });
      })
    );
  }
});

// Push event for keeping WebSocket alive
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'WAKE_UP' });
      });
    })
  );
});
