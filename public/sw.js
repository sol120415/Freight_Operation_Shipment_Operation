/* =============================================================================
 * Airship Express Service Worker — offline-first strategy
 *
 * Caching strategies per resource class:
 *   - App shell + static assets (_next/static, icons):  cache-first
 *   - Map tiles (OSM):                                  cache-first w/ cap
 *   - Navigations (HTML):                               network-first,
 *                                                       offline fallback
 *   - Supabase API:                                     network-only (never
 *                                                       cache auth data)
 *
 * Background Sync: tag "outbox-sync" asks the app to flush the IndexedDB
 * outbox when connectivity returns (see src/lib/offline/outbox.ts).
 * ========================================================================== */

const VERSION = "airship-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const TILE_CACHE = `${VERSION}-tiles`;
const MAX_TILES = 500;

const PRECACHE_URLS = [
  "/",
  "/offline",
  "/icons/icon.svg",
  "/icons/airship-icon.png",
  "/icons/airship-pink-mark.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:css|js|woff2?|svg|png|jpg|jpeg|webp|avif)$/.test(url.pathname)
  );
}

function isMapTile(url) {
  return /(?:^|\.)tile\.openstreetmap\.org$/.test(url.hostname);
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await fetchPromise) || Response.error();
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (const key of keys.slice(0, keys.length - maxEntries)) {
    await cache.delete(key);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // A production service worker can remain registered after switching back
  // to `next dev`. Never intercept localhost requests: development chunk
  // names are stable, so cached chunks can hide current source changes.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return;
  }

  // Never intercept Supabase/auth/API traffic — always live.
  if (
    url.hostname.includes("supabase") ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  // Map tiles: cache-first with a size cap (works fully offline once visited).
  if (isMapTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            cache.put(request, response.clone());
            trimCache(TILE_CACHE, MAX_TILES);
          }
          return response;
        } catch {
          return Response.error();
        }
      }),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  // Navigations: network-first with offline fallback page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cachedPage =
            (await caches.match(request)) ||
            (await caches.match("/offline")) ||
            (await caches.match("/"));
          return (
            cachedPage ||
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }),
    );
  }
});

// Background Sync: the page registers sync("outbox-sync") after queueing an
// action; the browser fires this even if the tab is closed. We simply ping
// every open client — the app's ConnectivityGuard owns the actual replay via
// authenticated POSTs (the SW holds no session secrets).
self.addEventListener("sync", (event) => {
  if (event.tag === "outbox-sync") {
    event.waitUntil(
      self.clients
        .matchAll({ includeUncontrolled: true })
        .then((clients) => {
          for (const client of clients) {
            client.postMessage({ type: "flush-outbox" });
          }
        })
    );
  }
});
