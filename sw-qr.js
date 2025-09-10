// sw-qr.js
const CACHE_NAME = 'tngon-qr-v1';
const CORE_ASSETS = [
  './',
  './redirect.html',
  './assets/js/redirect.js',
  './app.webmanifest'
  // có thể thêm './links.json' nếu muốn đọc từ cache khi offline
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Network-first cho request động (POS, Firebase...), cache-first cho core
  if (CORE_ASSETS.some((p) => new URL(req.url).pathname.endsWith(p.replace('./','/QR/')))) {
    e.respondWith(
      caches.match(req).then((res) => res || fetch(req))
    );
  } else {
    e.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
  }
});