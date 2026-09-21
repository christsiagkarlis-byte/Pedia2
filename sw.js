const CACHE_NAME = "paizomath-v9";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app/index.html",
  "./studio/index.html",
  "./terms/index.html",
  "./privacy/index.html",
  "./manifest.webmanifest",
  "./paizomath-icon.svg",
  "./paizomath-icon-192.png",
  "./paizomath-icon-512.png",
  "./assets/index-BT5Zs9ye.js",
  "./assets/index-VvnKvMSq.css",
  "./assets/question-banks.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith("paizomath-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function navigationFallback(requestUrl) {
  const scope = self.registration.scope;
  const path = new URL(requestUrl).pathname;
  const file = path.includes("/app/") ? "./app/index.html"
    : path.includes("/studio/") ? "./studio/index.html"
    : path.includes("/terms/") ? "./terms/index.html"
    : path.includes("/privacy/") ? "./privacy/index.html"
    : "./index.html";
  return caches.match(new URL(file, scope));
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => navigationFallback(request.url))
    );
    return;
  }

  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request).then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }))
  );
});
