const CACHE_NAME = "tngon-admin-v3"; // tăng số mỗi lần sửa lớn
const CACHE_ASSETS = [
  "./",
  "./index.html",
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

// Fetch handler
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Luôn fetch bản mới của redirect.html
  if (url.pathname.endsWith("/redirect.html")) {
    e.respondWith(fetch(e.request).catch(() => caches.match("./redirect.html")));
    return;
  }

  // Luôn fetch mới links.json (không cache)
  if (url.pathname.endsWith("/links.json")) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first cho các file khác
  e.respondWith(
    caches.match(e.request).then((res) => {
      return (
        res ||
        fetch(e.request).catch(
          () =>
            new Response("Offline", {
              status: 503,
              statusText: "Offline",
            })
        )
      );
    })
  );
});