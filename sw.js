// Minimal app-shell service worker for installability + offline UI.
const CACHE = 'tasting-journey-v1';
const SHELL = [
  '/tasting-journey/',
  '/tasting-journey/index.html',
  '/tasting-journey/manifest.webmanifest',
  '/tasting-journey/icon.svg',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Never cache cross-origin API calls (Open Food Facts, image search, maps).
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;
  // Network-first for navigations, cache-first for static assets.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return r;
        })
        .catch(() => caches.match('/tasting-journey/index.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return (
        cached ||
        fetch(e.request).then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return r;
        })
      );
    })
  );
});
