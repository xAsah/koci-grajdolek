// Service worker: program działa bez internetu (pliki z pamięci podręcznej, w tle pobierane nowsze wersje)
const WERSJA = 'kg-1.1.0';
const PLIKI = [
  './', './index.html', './app.css', './manifest.webmanifest', './lista.html', './lista.css',
  './js/main.js', './js/util.js', './js/fs.js', './js/store.js', './js/model.js', './js/zakupy.js', './js/importer.js', './js/druk.js', './js/lista.js',
  './js/ui/app.js', './js/ui/wspolne.js', './js/ui/plan.js', './js/ui/przepisy.js', './js/ui/produkty.js', './js/ui/zakupy.js', './js/ui/ustawienia.js',
  './vendor/preact-htm.mjs', './vendor/qrcode.mjs',
  './ikony/ikona-192.png', './ikony/ikona-512.png', './ikony/ikona-maskable-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(WERSJA).then((c) => c.addAll(PLIKI.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== WERSJA).map((x) => caches.delete(x)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  ev.respondWith(caches.open(WERSJA).then(async (cache) => {
    const zCache = await cache.match(req, { ignoreSearch: true });
    const zSieci = fetch(req, { cache: 'no-cache' }).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    return zCache || (await zSieci) || new Response('Brak połączenia', { status: 503 });
  }));
});
