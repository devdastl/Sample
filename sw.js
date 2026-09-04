const VERSION = "2.0.3";
const CACHE_PREFIX = "rep-routine-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${VERSION}`;

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function cacheVerifiedRelease() {
  const releaseUrl = new URL(`release.json?v=${encodeURIComponent(VERSION)}`, self.registration.scope);
  const releaseResponse = await fetch(releaseUrl, { cache: "no-store" });
  if (!releaseResponse.ok) throw new Error("Release manifest unavailable");
  const release = await releaseResponse.json();
  if (release.version !== VERSION || !Array.isArray(release.assets)) throw new Error("Release manifest mismatch");
  const cache = await caches.open(CACHE_NAME);
  for (const asset of release.assets) {
    const assetUrl = new URL(asset.url, self.registration.scope);
    const response = await fetch(assetUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Asset unavailable: ${asset.url}`);
    const cacheResponse = response.clone();
    const bytes = await response.arrayBuffer();
    const digest = bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
    if (digest !== asset.sha256) throw new Error(`Asset mismatch: ${asset.url}`);
    await cache.put(assetUrl, cacheResponse);
  }
}

self.addEventListener("install", event => {
  event.waitUntil(cacheVerifiedRelease());
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
