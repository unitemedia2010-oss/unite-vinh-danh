const CACHE = 'unite-recognition-live-tv-v8'
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './unite-mark.svg',
  './brand/unite-group-logo.png',
  './brand/unite-group-mark-black.png',
  './recognition/background-red-crystal.png',
  './recognition/background-gold-crystal.png',
  './recognition/background-blue-crystal.png',
  './recognition/badge-ky-lan.png',
  './recognition/badge-phuong-hoang.png',
  './recognition/badge-su-tu.png',
  './recognition/badge-thong-soai.png',
  './recognition/badge-thu-linh.png',
  './recognition/badge-tuong-quan.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(async () => (await caches.match(request)) || caches.match('./index.html')),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && new URL(request.url).origin === self.location.origin) {
            const clone = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
