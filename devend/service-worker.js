const CACHE_NAME = "agroscan-developer-public-v1";
const CORE_ASSETS = ["/offline.html", "/agrodev-pwa.svg", "/private-desk/claim.png", "/private-desk/title.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("agroscan-developer-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.includes("private-desk/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  if (!CORE_ASSETS.includes(url.pathname)) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
