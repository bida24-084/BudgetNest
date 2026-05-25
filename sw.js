// ============================================================
//  sw.js — BudgetNest Service Worker  v4
//
//  STRATEGY:
//    HTML files  → Network first (always fetch latest version)
//    JS/CSS/etc  → Cache first   (fast load)
//
//  IMPORTANT: Bump the version string below every time you
//  deploy changes. This forces all browsers to clear the old
//  cache and fetch fresh files.
// ============================================================
const CACHE = 'budgetnest-v4';

self.addEventListener('install', e => {
  // Pre-cache nothing on install — let pages cache themselves on first visit
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', e => {
  // Delete every old cache version
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/');

  if (isHTML) {
    // Network first for all HTML — users always see the latest version
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request)) // offline fallback only
    );
  } else {
    // Cache first for JS, CSS, fonts
    e.respondWith(
      caches.match(e.request).then(cached => {
        const net = fetch(e.request).then(res => {
          if (res && res.status === 200 && res.type === 'basic') {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
  }
});
