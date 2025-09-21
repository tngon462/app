const CACHE_NAME = "tngon-admin-v1";
const CACHE_ASSETS = [
  "./",
  "./index.html",
  "./redirect.html",
  "./assets/js/redirect.js",
  "./assets/js/blackout.js",
  "./icons/icon-192.png",
  "./icons/icon-72.png",
  "./icons/icon-512.png",
  "./redirect.webmanifest",
  "./admin.webmanifest"
];

// Cài đặt service worker
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CACHE_ASSETS);
    })
  );
});

// Kích hoạt và dọn cache cũ
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      )
    )
  );
});

// Fetch
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // ❌ Không cache links.json → luôn lấy mới từ server
  if (url.pathname.endsWith("/links.json")) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache first, fallback network
  e.respondWith(
    caches.match(e.request).then((res) => {
      return (
        res ||
        fetch(e.request).catch(() =>
          new Response("Offline", { status: 503, statusText: "Offline" })
        )
      );
    })
  );
});
