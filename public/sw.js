// Network-first: có mạng thì luôn lấy bản mới (deploy lên là thấy ngay),
// mất mạng thì trả bản đã cache để app vẫn mở được. /api/* không cache.
const CACHE = 'pk-v1';
const CORE = [
  '/', '/index.html', '/style.css', '/app.js', '/logic.js', '/icons.js', '/manifest.webmanifest',
  '/images/pieces-sprite.png', '/images/animals-sprite.png',
  '/sound/sound1.mp3', '/sound/sound2.mp3', '/sound/sound4.mp3', '/sound/sound5.mp3',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r ?? caches.match('/index.html'))),
  );
});
