const CACHE_NAME = 'pitchplease-v4';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/reset.css',
  './css/tokens.css',
  './css/layout.css',
  './css/tuner.css',
  './css/graph.css',
  './css/game.css',
  './js/app.js',
  './js/audio/mic.js',
  './js/audio/detector.js',
  './js/audio/note-math.js',
  './js/audio/pitch-buffer.js',
  './js/audio/song-engine.js',
  './js/views/tuner-view.js',
  './js/views/graph-view.js',
  './js/views/library-view.js',
  './js/views/game-view.js',
  './js/components/needle.js',
  './js/components/note-display.js',
  './js/components/frequency-display.js',
  './js/components/pitch-graph.js',
  './js/components/game-canvas.js',
  './js/utils/constants.js',
  './js/utils/dom.js',
  './js/utils/event-bus.js',
  './js/utils/scales.js',
  './js/utils/song-data.js',
  './js/utils/exercise-generator.js',
  './js/utils/store.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

const CDN_HOSTS = ['esm.sh'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('SW: failed to cache some assets:', err);
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CDN requests: network-first, fall back to cache
  if (CDN_HOSTS.some(host => url.hostname.includes(host))) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Local assets: cache-first, fall back to network
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
