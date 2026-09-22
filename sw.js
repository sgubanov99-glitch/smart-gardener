// sw.js — service worker (ревизия 2.175)
// 2.175: управляемые обновления: при выходе новой версии SW НЕ перехватывает управление сразу —
//        приложение показывает «Доступна новая версия» и обновляется по SKIP_WAITING;
//        первая установка активируется сразу (пока нет controller)
// 2.167: precache разделён на критичный (ждём) и фоновый (стикеры/PNG)
const CACHE = 'sg-cache-v2175';

const CRITICAL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/main.js',
  './src/core/calendar.js',
  './src/core/phaseMachine.js',
  './src/core/compatibility.js',
  './src/core/planting.js',
  './src/core/weather.js',
  './src/core/planner.js',
  './src/core/shade.js',
  './src/core/exportPoster.js',
  './src/core/exportPrint.js',
  './src/core/history.js',
  './src/core/reminders.js',
  './src/core/changelog.js',
  './src/domain/scheme.js',
  './src/domain/plant.js',
  './src/storage/storage.js',
  './src/bot/bot.js',
  './src/ui/schemeView.js',
  './src/ui/calendarView.js',
  './src/ui/plantsView.js',
  './src/ui/chatView.js',
  './src/ui/homeView.js',
  './src/ui/isoView.js',
  './src/ui/analyticsView.js',
  './src/ui/tsypa.js',
  './src/ui/tutorialView.js',
  './src/ui/guestbookView.js',
  './src/ui/ux.js',
  './src/ui/icons.js',
  './data/plants.json',
  './data/phases.json',
  './data/planting.json',
  './data/tutorial.json',
  './data/compat.json',
  './data/compatibility.json',
  './assets/logo.svg',
  './assets/logo-mono.svg',
  './assets/chick.svg',
  './assets/chick_full.svg',
  './assets/boy.svg',
  './assets/icons.svg',
  './assets/smart-gardener.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png'
];

const NON_CRITICAL = [
  './stickers/chick.png',
  './stickers/watering.png',
  './stickers/apples.png',
  './stickers/seedlings.png',
  './stickers/boy.png',
  './stickers/cat.png',
  './gb.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CRITICAL.map(u => cache.add(u)));
    // первая установка (пока нет активного SW) — активируем сразу;
    // при обновлении ждём подтверждения от приложения (SKIP_WAITING)
    if (!self.registration.active) await self.skipWaiting();
    Promise.allSettled(NON_CRITICAL.map(u => cache.add(u)));
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage('SW_ACTIVATED'));
  })());
});

// команда от приложения: занять управление сразу после подтверждения обновления
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Навигация: сеть → фолбэк на закэшированный index.html
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', net.clone());
        return net;
      } catch (err) {
        const cached = (await caches.match('./index.html')) || (await caches.match('./'));
        if (cached) return cached;
        return new Response('Офлайн: страница ещё не закэширована. Откройте приложение один раз при сети.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  const isFont = /(^|\.)fonts\.googleapis\.com$/.test(url.hostname) || /(^|\.)fonts\.gstatic\.com$/.test(url.hostname);

  // Same-origin и шрифты: stale-while-revalidate
  if (url.origin === self.location.origin || isFont) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const refresh = fetch(req).then(net => {
        if (net && net.ok) cache.put(req, net.clone());
        return net;
      }).catch(() => cached);
      return cached || refresh;
    })());
    return;
  }

  // Внешние API: network-first с фолбэком на кэш
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const net = await fetch(req);
      if (net && net.ok) cache.put(req, net.clone());
      return net;
    } catch (err) {
      const cached = await cache.match(req);
      if (cached) return cached;
      throw err;
    }
  })());
});