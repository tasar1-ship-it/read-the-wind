/* Read the Wind: offline shell. ES5 only. build.py writes CACHE: the build number
   plus a fingerprint of every file, so a changed file always gives a new cache. */
var CACHE = 'read-the-wind-build7-18bb91bb';
var ASSETS = ['./', 'index.html', 'about.html', 'ch2.html', 'ch3.html', 'glossary.html', 'sources.html',
              'marks.html', 'app.css', 'app.js', 'data.js', 'manifest.webmanifest',
              'icon-180.png', 'icon-192.png', 'icon-512.png'];

function fill() {
  /* straight from the server, not from the browser's own short-term cache,
     so a new build never stores an older file */
  return caches.open(CACHE).then(function (c) {
    return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  });
}

self.addEventListener('install', function (e) {
  e.waitUntil(fill().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  /* Every book and app on tasar1-ship-it.github.io shares one cache store, so
     only this book's own old caches are removed, never another app's. */
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      if (k.indexOf('read-the-wind-') === 0 && k !== CACHE) return caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  /* Another app on this site may have removed this cache when it updated
     (older service workers there delete every cache but their own). When a
     page is opened online, put the whole book back. */
  if (e.request.mode === 'navigate') {
    e.waitUntil(caches.match('app.js', { cacheName: CACHE }).then(function (hit) { return hit ? null : fill(); })
      .catch(function () { /* offline: try again next time */ }));
  }
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () { return caches.match('index.html'); });
  }));
});
