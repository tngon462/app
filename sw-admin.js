const CACHE_NAME = "tngon-admin-v4";
const CACHE_ASSETS = [
  "./",
  "./admin.html",
  "./redirect.html",
  "./index.html",
  "./links.json",
  "./assets/js/firebase.js",
  "./assets/js/redirect-core.js",
  "./assets/js/blackout.js",
  "./assets/js/device-bind.js",
  "./icons/icon-192.png",
  "./icons/icon-72.png",
  "./icons/icon-512.png",
  "./redirect.webmanifest",
  "./admin.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CACHE_ASSETS).then(() => self.skipWaiting()))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => (name !== CACHE_NAME ? caches.delete(name) : Promise.resolve())))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const path = url.pathname;

  // Không cache Firebase / API
  if (path.includes("firebasedatabase.app") || path.includes("gstatic.com")) {
    e.respondWith(fetch(e.request));
    return;
  }

  // links.json: Network-first, fallback cache
  if (path.endsWith("/links.json")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request).then((r) => r || new Response('{"links":{}}', { headers: { "Content-Type": "application/json" } })))
    );
    return;
  }

  // HTML: Network-first, fallback cache khi mất mạng
  if (path.endsWith(".html") || path === "/" || path.endsWith("/")) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match("./redirect.html")))
    );
    return;
  }

  // Static assets: Cache-first, fallback network
  e.respondWith(
    caches.match(e.request).then((res) =>
      res ||
      fetch(e.request).then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return resp;
      }).catch(() =>
        new Response("<h1>Đang offline</h1><p>Vui lòng kiểm tra kết nối mạng.</p>", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      )
    )
  );
});
