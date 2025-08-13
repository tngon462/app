// sw-admin.js
const CACHE_NAME = 'tngon-admin-v1';
const STATIC_ASSETS = [
  './admin.html',
  './admin.webmanifest',
  './sw-admin.js',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-144.png',
  './icons/icon-152.png',
  './icons/icon-192.png',
  './icons/icon-384.png',
  './icons/icon-512.png'
];

// Cài đặt
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

// Kích hoạt
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())))
    ).then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Bỏ qua Firebase (luôn network)
  const isFirebase = /firebaseio\.com|googleapis\.com|gstatic\.com/.test(url.host);
  if (isFirebase) return;

  // Chỉ cache GET
  if (e.request.method !== 'GET') return;

  // Cache-first cho file tĩnh
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Cache lại file tĩnh cùng origin
        if (res.ok && url.origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Fallback nhẹ: nếu request HTML, trả admin.html
        if (e.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./admin.html');
        }
      });
    })
  );
});
