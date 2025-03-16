const CACHE_NAME = 'pong-pwa-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json',
  '/icon.png',
  '/icon-512.png'
];

// Install event - cache assets
self.addEventListener('install', event => {
  // Skip waiting to update service worker immediately
  self.skipWaiting();
});

// Activate event - clean up old caches and claim clients
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - bypass cache, always go to network
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        // Only fallback for navigation requests
        if (event.request.mode === 'navigate') {
          return new Response('Offline - Cache disabled for testing', {
            headers: { 'Content-Type': 'text/plain' }
          });
        }
        return null;
      })
  );
}); 