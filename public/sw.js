// =============================================================================
// Smart Queue Service Worker — PWA & Cache Management
// =============================================================================

const CACHE_NAME = "smart-queue-v1.1";
const STATIC_ASSETS = ["/", "/manifest.webmanifest", "/favicon.ico"];

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("📦 [ServiceWorker] Pre-caching static assets");
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("🧹 [ServiceWorker] Cleaning old cache:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Cache strategy for Supabase Storage images
  if (url.hostname.includes("supabase.co") && url.pathname.includes("/storage/v1/object/public/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          return (
            response ||
            fetch(event.request).then((networkResponse) => {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            })
          );
        });
      })
    );
    return;
  }

  // Network-first for everything else
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
