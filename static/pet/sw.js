// Service worker: network-first (so updates show up immediately), with a cache
// fallback so the app still opens offline once it has been loaded.
const CACHE = 'pocket-pet-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()),
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    // 'no-cache' revalidates with the server every time (a cheap 304 when nothing changed), so the browser's
    // HTTP cache can never hand back an old copy of the game's modules or models after an update.
    fetch(req, {cache: 'no-cache'})
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
