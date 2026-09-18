// sw.js — service worker: офлайн-режим для дачи (ревизия 2.166)
// Стратегии: навигация — network-first с фолбэком на кэш index.html;
// same-origin и шрифты — stale-while-revalidate; внешние API — network-first с фолбэком на кэш
const CACHE = 'sg-cache-v2166';

const PRECACHE = [
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
  './data/plants.json',
  './data/phases.json',
  './data/planting.json',
  './data/tutorial.json',
  './assets/logo.svg',
  './assets/logo-mono.svg',
  './assets/chick.svg',
  './assets/chick_full.svg',
  './assets/icons.svg',
  './stickers/chick.png',
  './stickers/watering.png',
  './stickers/apples.png',
  './stickers/seedlings.png',
  './stickers/boy.png',
  './stickers/cat.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // индивидуально с catch: отсутствующий файл не ломает весь precache
    await Promise.allSettled(PRECACHE.map(u => cache.add(u)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
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

  // Внешние API (погода/геокодинг/метрика): network-first с фолбэком на кэш
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const net = await fetch(req);
      if (net && net.ok) cache.put(req, net.clone());
      return net;
    } catch (err) {
      const cached = await cache.match(req);
      if (cached) return cached;
      throw err; // приложение поймает и покажет штатный тост
    }
  })());
});