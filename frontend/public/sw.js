// Service Worker for Lynkless PWA
// Production-grade: versioned cache, stale-while-revalidate, background sync
const CACHE_VERSION = 2;
const CACHE_NAME = `lynkless-v${CACHE_VERSION}`;
const STATIC_CACHE = `lynkless-static-v${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

const CACHEABLE_PATH_REGEX = /\.(?:js|css|ico|png|jpg|jpeg|svg|webp|woff2?)$/i;

// Install event - cache essential resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up ALL old cache versions
self.addEventListener('activate', (event) => {
  const validCaches = new Set([CACHE_NAME, STATIC_CACHE]);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !validCaches.has(name))
          .map((name) => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Invulnerability Patch: Use a virtual stream to trick Mobile OS into keeping process alive
const activeTransferIds = new Set();

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Virtual "Keep-Alive" Stream Endpoint
  if (url.pathname === '/__keepalive_stream') {
    event.respondWith(new Response(new ReadableStream({
      start(controller) {
        const interval = setInterval(() => {
          if (activeTransferIds.size === 0) {
            clearInterval(interval);
            controller.close();
            return;
          }
          controller.enqueue(new Uint8Array([0])); // Send heartbeat byte
        }, 5000);
      }
    }), {
      headers: { 'Content-Type': 'application/octet-stream' }
    }));
    return;
  }

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
        console.error('[SW] Share Target Error:', err);
        return Response.redirect('/', 303);
      }
    })());
    return;
  }

  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin, API routes, and WebSocket upgrades
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;

  const shouldCache =
    PRECACHE_URLS.includes(url.pathname) ||
    CACHEABLE_PATH_REGEX.test(url.pathname);

  if (shouldCache) {
    // Stale-while-revalidate: serve cached immediately, update in background
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cached); // Fall back to cache if network fails

        return cached || fetchPromise;
      })
    );
  } else {
    // Network-first for HTML pages (always get fresh content)
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});

// Keep-Alive messaging for active transfers
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TRANSFER_START') {
    activeTransferIds.add(event.data.fileId);
  } else if (event.data && event.data.type === 'TRANSFER_STOP') {
    activeTransferIds.delete(event.data.fileId);
  }
});
