const CACHE_NAME = 'lux-genpro-v1';

// 3 file Firebase bản cố định 8.10.1 — không bao giờ đổi nên cache cứng
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js',
  'https://www.gstatic.com/firebasejs/8.10.1/firebase-auth.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // Xóa cache phiên bản cũ khi bạn đổi CACHE_NAME (vd: v1 -> v2)
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);

  // 1. Firebase SDK & Google Fonts: Cache-First (lấy ngay từ máy, không chờ mạng)
  if (
    u.hostname === 'www.gstatic.com' ||
    u.hostname === 'fonts.googleapis.com' ||
    u.hostname === 'fonts.gstatic.com'
  ) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // 2. File cùng tên miền (index.html, manifest...): Stale-While-Revalidate
  // Mở tức thì bằng bản đã lưu, đồng thời âm thầm tải bản mới về cho lần mở sau
  if (u.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const net = fetch(e.request, { cache: 'no-cache' })
          .then(async (res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              // Nếu là index.html và nội dung khác bản cũ -> báo trang tự reload
              if (cached && (u.pathname === '/' || u.pathname.endsWith('index.html'))) {
                const [oldTxt, newTxt] = await Promise.all([cached.clone().text(), res.clone().text()]);
                if (oldTxt !== newTxt) {
                  self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage('RELOAD')));
                }
              }
              caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || net;
      })
    );
  }
});
