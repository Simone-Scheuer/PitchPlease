const CACHE_NAME = 'pitchplease-v11';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  // CSS
  './css/reset.css',
  './css/tokens.css',
  './css/layout.css',
  './css/tuner.css',
  './css/graph.css',
  './css/game.css',
  './css/session.css',
  './css/practice.css',
  './css/journal.css',
  './css/drone.css',
  // JS — app entry
  './js/app.js',
  // JS — audio
  './js/audio/mic.js',
  './js/audio/detector.js',
  './js/audio/note-math.js',
  './js/audio/pitch-buffer.js',
  './js/audio/song-engine.js',
  './js/audio/synth.js',
  // JS — views
  './js/views/tuner-view.js',
  './js/views/graph-view.js',
  './js/views/library-view.js',
  './js/views/game-view.js',
  './js/views/practice-view.js',
  './js/views/session-view.js',
  './js/views/journal-view.js',
  './js/views/drone-view.js',
  // JS — components
  './js/components/needle.js',
  './js/components/note-display.js',
  './js/components/frequency-display.js',
  './js/components/pitch-graph.js',
  './js/components/game-canvas.js',
  // JS — core
  './js/core/exercise-schema.js',
  './js/core/exercise-runtime.js',
  './js/core/session-runner.js',
  './js/core/session-templates.js',
  './js/core/measurements.js',
  // JS — core evaluators
  './js/core/evaluators/target-accuracy.js',
  './js/core/evaluators/stability.js',
  './js/core/evaluators/phrase-match.js',
  './js/core/evaluators/bend-accuracy.js',
  // JS — renderers
  './js/renderers/renderer-base.js',
  './js/renderers/scroll-targets.js',
  './js/renderers/seismograph.js',
  './js/renderers/flash-card.js',
  './js/renderers/overlay-comparison.js',
  './js/renderers/bend-meter.js',
  './js/renderers/pitch-trace.js',
  './js/renderers/pitch-trail.js',
  // JS — utils
  './js/utils/constants.js',
  './js/utils/dom.js',
  './js/utils/event-bus.js',
  './js/utils/scales.js',
  './js/utils/song-data.js',
  './js/utils/exercise-generator.js',
  './js/utils/store.js',
  './js/utils/harmonica.js',
  // JS — profile
  './js/profile/profile.js',
  './js/profile/history.js',
  './js/profile/skill-model.js',
  // JS — generation
  './js/generation/session-generator.js',
  './js/generation/difficulty.js',
  // Assets
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
