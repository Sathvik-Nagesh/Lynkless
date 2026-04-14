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
  // Handle Web Share Target POST requests
  if (event.request.method === 'POST' && event.request.url.endsWith('/share-target')) {
    event.respondWith((async () => {
      try {
        const formData = await event.request.formData();
        const files = formData.getAll('files');
        
        // Open IndexedDB to store files
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open('LynklessShareDB', 1);
          req.onupgradeneeded = (e) => e.target.result.createObjectStore('shared_files');
          req.onsuccess = (e) => resolve(e.target.result);
          req.onerror = () => reject(req.error);
        });

        await new Promise((resolve, reject) => {
          const tx = db.transaction('shared_files', 'readwrite');
          tx.objectStore('shared_files').put(files, 'pending_share');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject();
        });

        // Redirect back to the app with a query param
        return Response.redirect('/?shared=true', 303);
      } catch (err) {
        console.error('Share Target Error:', err);
        return Response.redirect('/', 303);
      }
    })());
    return;
  }

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

// Invulnerability Patch: Keep-Alive messaging
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'KEEPALIVE_PING') {
    // Acknowledge ping to reset internal idle timers
    event.ports[0]?.postMessage({ type: 'KEEPALIVE_ACK', timestamp: Date.now() });
  }
});

// Periodic noise to keep the worker from being collected
setInterval(() => {
  self.clients.matchAll().then(clients => {
    if (clients.length > 0) {
      // Just a heartbeat
    }
  });
}, 30000);
