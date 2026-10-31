const CACHE_NAME = "agroscan-public-v1";
const CORE_ASSETS = ["/offline.html", "/agroscan-pwa.svg", "/img/agroscan-icon.png", "/css.files/index.css"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("agroscan-public-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/profile") || url.pathname.startsWith("/chat") || url.pathname.startsWith("/analytics") || url.pathname.startsWith("/home")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }
  const publicAsset = CORE_ASSETS.includes(url.pathname) || url.pathname.startsWith("/img/") || url.pathname.startsWith("/css.files/");
  if (!publicAsset) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  })));
});
