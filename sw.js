const CACHE_NAME = 'pitchplease-v41';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // CSS
  './css/reset.css',
  './css/tokens.css',
  './css/layout.css',
  './css/graph.css',
  './css/tuner.css',
  './css/bends.css',
  './css/drone.css',
  // JS — app entry
  './js/app.js',
  // JS — audio
  './js/audio/mic.js',
  './js/audio/detector.js',
  './js/audio/note-math.js',
  './js/audio/synth.js',
  './js/audio/drone-synth.js',
  './js/audio/scale-player.js',
  // JS — views
  './js/views/graph-view.js',
  './js/views/tuner-view.js',
  './js/views/bends-view.js',
  './js/views/drone-sheet.js',
  './js/views/settings-drawer.js',
  // JS — components
  './js/components/pitch-graph.js',
  './js/components/pitch-strip.js',
  './js/components/chord-dial.js',
  // JS — utils
  './js/utils/constants.js',
  './js/utils/dom.js',
  './js/utils/event-bus.js',
  './js/utils/scales.js',
  './js/utils/store.js',
  './js/utils/settings.js',
  './js/utils/harmonica.js',
  './js/utils/instruments.js',
  './js/utils/theme-colors.js',
  // Assets
  './assets/fonts/DepartureMono-Regular.woff2',
  './assets/samples/piano.json',
  './assets/samples/epiano.json',
  './assets/samples/guitar.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-192-maskable.png',
  './assets/icons/icon-512-maskable.png',
  './assets/icons/apple-touch-icon.png',
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
