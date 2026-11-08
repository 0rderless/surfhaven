// Network-first service worker: always fetch fresh when online, fall back to cache offline.
const CACHE = 'surfhaven-v2';
const FILES = ['./', './index.html', './game.js', './manifest.webmanifest',
  './lib/three.module.min.js', './lib/GLTFLoader.js', './lib/BufferGeometryUtils.js', './lib/RoundedBoxGeometry.js',
  './lib/RoomEnvironment.js', './lib/SkeletonUtils.js',
  './models/casual_male.glb', './models/casual_female.glb', './models/suit_male.glb', './models/suit_female.glb',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
