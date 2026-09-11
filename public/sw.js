// Brat Olympics service worker.
//
// This app cannot work offline: every screen reads the database, and proof
// upload needs the network. So the worker exists to make the app installable
// and to serve immutable static assets fast — nothing else.
//
// It deliberately caches NO HTML and NO RSC payloads. An earlier version did,
// which is how a submitted objective kept rendering as "Not submitted": a
// client-side router navigation is not `mode: 'navigate'`, it is a plain fetch
// of `/?_rsc=...`, so it fell through to the cache-first branch and was cached
// permanently. A stale week is worse than an honest network error.
const CACHE = 'brat-v34';

// Content-addressed or genuinely static, and identical for every player.
const SHELL = [
  '/manifest.webmanifest',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

/** The only things safe to serve from a shared, long-lived cache. Everything
 *  else is per-player, per-week, or both. */
function isCacheableAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico'
  );
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (!isCacheableAsset(url)) return; // straight to the network, uncached

  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ||
      fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      }),
    ),
  );
});
