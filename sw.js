const CACHE_NAME = 'word-ninja-shell-v34';
const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/storage.js',
  './js/scheduler.js',
  './js/spelling.js',
  './js/audio.js',
  './js/haptics.js',
  './js/keyboard.js',
  './js/arcade.js',
  './js/rewards.js',
  './js/mascot.js',
  './assets/app-icon.svg',
  './assets/app-icon.png',
  './assets/app-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('word-ninja-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const requestUrl = new URL(request.url);
  if (!requestUrl.href.startsWith(self.registration.scope)) return;
  if (request.mode === 'navigate') {
    // Serve the cached shell so HTML and scripts always come from the same version.
    event.respondWith(caches.match('./index.html').then(cached => cached || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});