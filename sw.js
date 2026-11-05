const CACHE_NAME = 'cardio-30-v1';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './src/main.js',
  './src/app.js',
  './src/engine.js',
  './src/generator.js',
  './src/sound.js',
  './src/storage.js',
  './src/ui.js',
  './src/wake-lock.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      const urlsToCache = PRECACHE_ASSETS.map((asset) => {
        try {
          return new URL(asset, self.location.href).href;
        } catch {
          return asset;
        }
      });
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        return networkResponse;
      });
    })
  );
});
