// sw-admin.js
const CACHE_NAME = 'tngon-qr-v1';
const CORE_ASSETS = [
  './',
  './redirect.html',
  './assets/js/redirect.js',
  './admin.webmanifest',
  './links.json'
];

// Install: cache core
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clear old cache
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch handler
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Cache-first cho core assets
  if (CORE_ASSETS.some((path) => req.url.includes(path.replace('./','')))) {
    e.respondWith(
      caches.match(req).then((res) => res || fetch(req))
    );
  } else {
    // Network-first fallback to cache
    e.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
  }
});