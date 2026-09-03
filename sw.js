const VERSION = "1.0.1";
const CACHE_PREFIX = "rep-routine-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles.css?v=20260904-2",
  "./js/core.js?v=20260904-2",
  "./js/storage.js?v=20260904-2",
  "./js/workouts.js?v=20260904-2",
  "./js/manager.js?v=20260904-2",
  "./js/timer.js?v=20260904-2",
  "./js/pwa.js?v=20260904-2",
  "./js/app.js?v=20260904-2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (request.mode === "navigate") {
    event.respondWith(caches.match(request).then(cached => cached || caches.match("./index.html")).then(cached => cached || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});

self.addEventListener("message", event => {
  if (event.data?.type !== "PREPARE_UPDATE" || !event.ports[0]) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    if (clients.length > 1) {
      event.ports[0].postMessage({ ok: false, reason: "Close other Rep Routine windows, then try again." });
      return;
    }
    event.ports[0].postMessage({ ok: true });
    return self.skipWaiting();
  }));
});
