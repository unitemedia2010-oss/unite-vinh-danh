const CACHE = 'unite-recognition-live-tv-v11'
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon-32.png',
  './favicon-48.png',
  './apple-touch-icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './brand/unite-group-logo.png',
  './brand/unite-group-mark-black.png',
  './brand/intro-ultra-v1-poster.webp',
]

const INTRO_VIDEO_NAMES = new Set([
  'intro-ultra-v1.mp4',
  'intro.mp4',
])

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

const isIntroVideo = (request) => {
  const url = new URL(request.url)
  const fileName = url.pathname.split('/').pop()
  return url.origin === self.location.origin && INTRO_VIDEO_NAMES.has(fileName)
}

const parseRange = (rangeHeader, size) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
  if (!match) return null

  const [, startText, endText] = match
  let start
  let end

  if (!startText && endText) {
    const suffixLength = Number(endText)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
    start = Math.max(0, size - suffixLength)
    end = size - 1
  } else {
    start = Number(startText)
    end = endText ? Number(endText) : size - 1
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) {
    return null
  }

  return { start, end: Math.min(end, size - 1) }
}

const getCachedIntroVideo = async (request) => {
  const cache = await caches.open(CACHE)
  const cacheKey = new Request(request.url, { credentials: 'same-origin' })
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const response = await fetch(cacheKey)
  if (response.ok && response.status === 200) {
    await cache.put(cacheKey, response.clone())
  }
  return response
}

const respondWithIntroVideo = async (request) => {
  const response = await getCachedIntroVideo(request)
  const rangeHeader = request.headers.get('range')
  if (!rangeHeader || !response.ok) return response

  const bytes = await response.clone().arrayBuffer()
  const range = parseRange(rangeHeader, bytes.byteLength)
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${bytes.byteLength}` },
    })
  }

  const chunk = bytes.slice(range.start, range.end + 1)
  const headers = new Headers(response.headers)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Content-Length', String(chunk.byteLength))
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${bytes.byteLength}`)
  headers.delete('Content-Encoding')

  return new Response(chunk, { status: 206, headers })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  if (isIntroVideo(request)) {
    event.respondWith(respondWithIntroVideo(request))
    return
  }

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
          if (response.ok && response.status === 200 && new URL(request.url).origin === self.location.origin) {
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
