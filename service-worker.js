/* ============================================================
   SERVICE-WORKER.JS — offline-first caching for Student Planner PWA
   Version: 2.1.0
   ============================================================ */

const CACHE_VERSION = 'student-planner-v3';

/* Local assets to precache on install */
const PRECACHE_LOCAL = [
  './',
  'index.html',
  'schedule.html',
  'calendar.html',
  'tasks.html',
  'grades.html',
  'attendance.html',
  'notes.html',
  'wallpaper.html',
  'settings.html',
  'syllabus.html',
  'syllabus-view.html',
  'curriculum.html',
  'university.html',
  'manifest.json',
  'css/style.css',
  'js/storage.js',
  'js/app.js',
  'js/dashboard.js',
  'js/schedule.js',
  'js/calendar.js',
  'js/tasks.js',
  'js/grades.js',
  'js/attendance.js',
  'js/notes.js',
  'js/wallpaper.js',
  'js/settings.js',
  'js/syllabus.js',
  'js/curriculum.js',
  'js/university.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'images/qcu-logo.webp',
  'images/qcu-vision-mission.jpeg',
  'images/batasan-campus.jpeg',
  'images/san-bartolome-campus.jpeg',
  'images/san-francisco-campus.jpeg',
  'images/college-of-accountancy.png',
  'images/college-of-business.png',
  'images/college-of-computer-studies.png',
  'images/college-of-education.png',
  'images/college-of-engineering.png',
];

/* External CDN assets — cached on first use (runtime caching) */
const CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
];

/* ---- INSTALL: precache local assets ---- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_LOCAL))
      .catch((err) => console.warn('[SW] Precache partial failure', err))
  );
  self.skipWaiting();
});

/* ---- ACTIVATE: remove stale caches ---- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---- FETCH: cache-first for local, stale-while-revalidate for CDN ---- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isLocal = url.origin === self.location.origin;
  const isCDN = CDN_URLS.some(u => req.url.startsWith(u.split('?')[0])) ||
                url.hostname === 'cdn.jsdelivr.net';

  if (isLocal) {
    /* Cache-first for local assets — fast offline load */
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) {
          /* Revalidate in background */
          fetch(req).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              caches.open(CACHE_VERSION).then((c) => c.put(req, networkRes));
            }
          }).catch(() => {});
          return cached;
        }
        /* Not cached yet — fetch, cache, return */
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
          }
          return networkRes;
        }).catch(() => new Response('Offline', { status: 503 }));
      })
    );
  } else if (isCDN) {
    /* Cache-first for CDN assets — cache on first use for offline */
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, clone));
          }
          return networkRes;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
  }
  /* For all other external requests (images, fonts from other domains), just fetch normally */
});
