const CACHE_NAME = 'slugswap-web-v2';
const APP_SHELL = [
  '/app/',
  '/app/index.html',
  '/app/manifest-v2.json',
  '/app/favicon.ico',
  '/app/apple-touch-icon-v2.png',
  '/app/icon-192-v2.png',
  '/app/icon-512-v2.png',
  '/app/icon-512-maskable-v2.png',
];

function isSameOriginAppAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/app/');
}

function shouldCache(request, url) {
  if (request.method !== 'GET' || !isSameOriginAppAsset(url)) {
    return false;
  }

  if (request.mode === 'navigate') {
    return true;
  }

  return (
    url.pathname.startsWith('/app/_expo/static/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.includes('manifest')
  );
}

async function cacheResponse(request, response) {
  if (!response || !response.ok || response.type === 'opaque') {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ).then(() => self.clients.claim())
    )
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (!shouldCache(request, url)) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => cacheResponse('/app/index.html', response))
        .catch(() => caches.match('/app/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request)
        .then((response) => cacheResponse(request, response))
        .catch(async () => {
          const offlineShell = await caches.match('/app/index.html');
          if (
            request.destination === 'document' ||
            request.headers.get('accept')?.includes('text/html')
          ) {
            return offlineShell ?? Response.error();
          }

          return Response.error();
        });
    })
  );
});
