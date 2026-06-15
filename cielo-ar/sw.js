/* sw.js — Service worker de Cielo AR.
 * App shell con cache-first (actualización en segundo plano).
 * Datos en vivo (TLEs de Celestrak, API de la ISS) siempre por red.
 */
'use strict';

const CACHE = 'cielo-ar-v5';
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/astro.js',
  './js/stars.js',
  './js/satellites.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js'
];

const LIVE_HOSTS = ['celestrak.org', 'api.wheretheiss.at'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(
        SHELL.map(url => cache.add(new Request(url, { cache: 'no-cache' })))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Datos en tiempo real: solo red (la app cachea TLEs en localStorage por su cuenta)
  if (LIVE_HOSTS.includes(url.hostname)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetched = fetch(event.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
