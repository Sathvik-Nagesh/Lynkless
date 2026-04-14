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
        console.error('Share Target Error:', err);
        return Response.redirect('/', 303);
      }
    })());
    return;
  }

  // Only cache GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin and specific protocols
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return;


  const shouldCache =
    urlsToCache.includes(url.pathname) ||
    CACHEABLE_PATH_REGEX.test(url.pathname);

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (shouldCache && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// Invulnerability Patch: Keep-Alive messaging
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TRANSFER_START') {
    activeTransferIds.add(event.data.fileId);
  } else if (event.data && event.data.type === 'TRANSFER_STOP') {
    activeTransferIds.delete(event.data.fileId);
  }
});
