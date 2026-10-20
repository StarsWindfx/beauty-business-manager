/* Hors-ligne : la coque de l'application est mise en cache ; les données restent dans le navigateur. */
const VERSION = 'bbm-2026-10-21b';
const SHELL = [
  './app.html', './index.html', './support.html', './manifest.webmanifest',
  './css/style.css', './css/landing.css',
  './js/calc.js', './js/common.js', './js/local-api.js', './js/app.js', './js/landing.js',
  './img/satin-960.jpg', './img/satin-960.webp', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png', './icons/icon-maskable-512.png',
  './legal/mentions-legales.html', './legal/cgu.html', './legal/cgv.html', './legal/confidentialite.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== 'bbm-fonts').map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  /* Polices : cache d'abord, puis réseau */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open('bbm-fonts').then(async (c) => {
      const hit = await c.match(e.request); if (hit) return hit;
      try { const res = await fetch(e.request); if (res.ok) c.put(e.request, res.clone()); return res; } catch { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  /* Coque : réseau d'abord (toujours à jour), cache en secours (hors-ligne) */
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    } catch {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      if (e.request.mode === 'navigate') return cache.match('./app.html');
      return Response.error();
    }
  })());
});
