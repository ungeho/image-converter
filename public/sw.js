const CACHE_NAME = "image-converter-v2";
const APP_SHELL_FILES = ["/manifest.webmanifest", "/icon.svg"];

function isLocalhost() {
  return self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";
}

async function clearAppCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith("image-converter-")).map((key) => caches.delete(key)));
}

self.addEventListener("install", (event) => {
  if (isLocalhost()) {
    self.skipWaiting();
    return;
  }

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await clearAppCaches();

    if (isLocalhost()) {
      const registration = await self.registration.unregister();
      if (registration) {
        const clients = await self.clients.matchAll({ type: "window" });
        clients.forEach((client) => client.navigate(client.url));
      }
      return;
    }

    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (isLocalhost()) return;
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  const isDocument = event.request.mode === "navigate" || event.request.destination === "document";
  if (isDocument) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response.ok) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    }),
  );
});
