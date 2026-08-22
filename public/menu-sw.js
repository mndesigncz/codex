/* Service worker jen pro venkovní menu (/menu-akce.html).
   Aplikace má vlastní /sw.js na push notifikace — tenhle je zaregistrovaný
   s užším rozsahem, takže si nelezou do zelí.

   Strategie: nejdřív síť, teprve při jejím selhání cache. Menu se během akce
   mění, takže obnovení stránky musí spolehlivě přinést novou verzi. Cache je
   tu pro případ, že venku vypadne wifi — ne pro rychlost. */

const CACHE = 'pangea-menu-v1';
const STRANKA = '/menu-akce.html';
const ASSETS = [STRANKA, '/menu.webmanifest', '/menu-icon-180.png', '/menu-icon-192.png', '/menu-icon-512.png'];
const TIMEOUT = 3500;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function zeSite(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT);
    fetch(request).then((res) => { clearTimeout(timer); resolve(res); },
                        (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    zeSite(req)
      .then((res) => {
        if (res && res.ok) {
          const kopie = res.clone();
          caches.open(CACHE).then((c) => c.put(req, kopie)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match(STRANKA))),
  );
});
