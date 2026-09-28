// Network-first: có mạng thì luôn lấy bản mới (deploy lên là thấy ngay),
// mất mạng thì trả bản đã cache để app vẫn mở được. /api/* không cache.
const CACHE = 'games-v23';
const CORE = [
  '/', '/index.html', '/me.js', '/icons.js', '/panel.js', '/panel.css', '/invite.js', '/toast.js', '/nozoom.js', '/bfcache.js', '/i18n.js', '/names.js', '/vendor/qrcode.mjs', '/manifest.webmanifest', '/pwa-192.png',
  '/logos/hub.svg', '/logos/pikachu.svg', '/logos/dao-vang.svg', '/logos/do-min.svg', '/logos/bau-cua.svg', '/logos/co-caro.svg', '/logos/noi-4.svg', '/logos/ban-tau.svg',
  '/nokia/nokia.css', '/nokia/room.js', '/nokia/lcd.js',
  '/o-an-quan/', '/o-an-quan/index.html', '/o-an-quan/style.css', '/o-an-quan/game.js', '/o-an-quan/logic.js', '/logos/o-an-quan.svg',
  '/co-caro/', '/co-caro/index.html', '/co-caro/style.css', '/co-caro/game.js', '/co-caro/logic.js',
  '/noi-4/', '/noi-4/index.html', '/noi-4/style.css', '/noi-4/game.js', '/noi-4/logic.js',
  '/ban-tau/', '/ban-tau/index.html', '/ban-tau/style.css', '/ban-tau/game.js', '/ban-tau/logic.js',
  '/bau-cua/', '/bau-cua/index.html', '/bau-cua/style.css', '/bau-cua/game.js', '/bau-cua/logic.js',
  '/do-min/', '/do-min/index.html', '/do-min/style.css', '/do-min/game.js', '/do-min/logic.js',
  '/do-min/skins/face/smileface.svg', '/do-min/skins/xp/cellup.svg', '/do-min/skins/xp/celldown.svg',
  '/pikachu/', '/pikachu/index.html', '/pikachu/style.css', '/pikachu/app.js', '/pikachu/logic.js',
  '/pikachu/images/pieces-sprite.png', '/pikachu/images/animals-sprite.png',
  '/pikachu/sound/sound1.mp3', '/pikachu/sound/sound2.mp3', '/pikachu/sound/sound4.mp3', '/pikachu/sound/sound5.mp3',
  '/dao-vang/', '/dao-vang/index.html', '/dao-vang/style.css', '/dao-vang/game.js', '/dao-vang/logic.js',
  '/dao-vang/assets/atlas.png', '/dao-vang/assets/atlas.json',
  '/dao-vang/assets/bg1.jpg', '/dao-vang/assets/bg2.jpg', '/dao-vang/assets/bg3.jpg', '/dao-vang/assets/bg4.jpg',
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
