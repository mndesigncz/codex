// Service worker: notifikace a offline skořápka.
//
// Dřív tu byly jen notifikace — žádný `fetch`. Když tabletu za barem spadla
// wifi a stránka se obnovila (nebo ho někdo zamkl a odemkl), obsluha uviděla
// chybovou stránku prohlížeče: „No internet · ERR_INTERNET_DISCONNECTED".
// U aplikace, jejíž pravidlo zní „když vypadne wifi, aplikace nelže", je to
// jediné místo, kde za sebe nemluví vůbec.
//
// Co se tu NEDĚLÁ a proč: necachují se odpovědi API. Zastaralý stav skladu
// nebo rozvrhu je horší než poctivá chyba — obsluha by podle něj objednávala
// zboží, které už došlo. Offline se tedy neukazuje stará aplikace, jen
// vysvětlení, co se stalo.

const PREDPONA = 'managero-skorapka-';
const CACHE = PREDPONA + 'v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.add(new Request(OFFLINE, { cache: 'reload' })))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Jen vlastní staré verze. Cache jsou sdílené přes celý původ, takže
      // „smaž všechno cizí" by vzalo i offline cache hostovského menu,
      // které má vlastní worker — a menu na iPadu před podnikem by po
      // výpadku přestalo fungovat kvůli změně v aplikaci.
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith(PREDPONA) && k !== CACHE).map((k) => caches.delete(k)),
      ))
      // Bez `claim` by se worker ujal až při další návštěvě — tedy přesně
      // ne při tom obnovení, kvůli kterému tu je.
      .then(() => self.clients.claim())
      .catch(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Jen otevření stránky. Obrázky, skripty ani API se sem nepletou.
  if (req.method !== 'GET' || req.mode !== 'navigate') return;
  event.respondWith(
    fetch(req).catch(() => caches.match(OFFLINE).then((r) => r || Response.error())),
  );
});

// ---- Notifikace ----
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Managero', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Managero';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    data: { link: data.link || '/' },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(link);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    }),
  );
});
