/// <reference lib="webworker" />
// Service worker of the rich view, built to /sw.js. It only keeps the interface
// available offline: data is saved by the page in IndexedDB, never here.
// This file must not import anything so it builds as a single classic script.
declare const self: ServiceWorkerGlobalScope;

// Replaced at build time by vite.config.ts with the emitted files and their hash.
const PRECACHE = JSON.parse('__INFOTRANSPORT_PRECACHE__') as string[];
const VERSION = '__INFOTRANSPORT_VERSION__';
const PREFIX = 'infotransport-';
const CACHE = `${PREFIX}${VERSION}`;
const SHELL = '/index.html';
/** Paths that are always left to the network: data, e-ink view, tools. */
const NETWORK_ONLY = /^\/(?:api|minimal|mcp|metrics|health)(?:[/.?]|$)/;
const PAGES = new Set(['/', '/admin']);
/** A navigation slower than this falls back to the saved interface. */
const NAVIGATION_TIMEOUT_MS = 5000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      // Navigations go to the network first, so a new version can take over at once.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function page(request: Request): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    const response = await fetch(request, { signal: controller.signal });
    // A proxy error page means the application itself is unreachable.
    if (response.status < 500) return response;
  } catch {
    // Offline or too slow: use the saved interface.
  } finally {
    clearTimeout(timer);
  }
  return (await caches.match(SHELL, { cacheName: CACHE })) ?? Response.error();
}

async function asset(request: Request): Promise<Response> {
  return (await caches.match(request, { cacheName: CACHE })) ?? fetch(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NETWORK_ONLY.test(url.pathname)) return;
  if (request.mode === 'navigate') {
    if (PAGES.has(url.pathname)) event.respondWith(page(request));
    return;
  }
  event.respondWith(asset(request));
});
