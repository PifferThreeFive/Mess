/* PIFFER Mess app: keeps the app's own files on the phone so it opens fast.
   Bookings always come live from the server; nothing about bookings is stored here. */
const CACHE = 'piffer-mess-v5';
const SHELL = ['./', 'index.html', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.png', 'badge-96.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // server calls always go to the network
  if (new URL(req.url).origin !== self.location.origin) return;  // fonts and Google: browser handles them
  // Newest version first (so updates show straight away); saved copy when there is no signal.
  // no-cache: always ask GitHub whether the file changed, so an update shows the next time the app is opened
  e.respondWith(fetch(req, { cache: 'no-cache' }).then(function (res) {
    var copy = res.clone();
    caches.open(CACHE).then(function (c) { c.put(req, copy); });
    return res;
  }).catch(function () {
    return caches.match(req).then(function (r) { return r || caches.match('index.html'); });
  }));
});

/* Phone notifications. The push itself carries no text: the phone asks the server what is new for the
   officer signed in on it, shows that, and puts the unread count on the app icon. */
self.window = self;
try { importScripts('config.js'); } catch (e) {}
function apiUrl() { return String(self.PIFFER_API || ''); }
function signedIn() {
  return caches.open('piffer-auth').then(function (c) { return c.match('./__token'); }).then(function (r) { return r ? r.text() : ''; }).catch(function () { return ''; });
}
self.addEventListener('push', function (e) {
  e.waitUntil(signedIn().then(function (t) {
    if (!t || !/^https?:/.test(apiUrl())) return null;
    return fetch(apiUrl(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: 'apiNoteSummary', args: [t] }), redirect: 'follow' })
      .then(function (r) { return r.json(); }).then(function (r) { return r && r.ok ? r.data : null; }).catch(function () { return null; });
  }).then(function (d) {
    var n = d ? d.unread : 0, latest = d && d.latest;
    try { if (self.navigator.setAppBadge) { if (n) self.navigator.setAppBadge(n); else self.navigator.clearAppBadge(); } } catch (x) {}
    return self.registration.showNotification(n > 1 ? 'PIFFER Mess · ' + n + ' new' : 'PIFFER Mess', {
      body: latest ? latest.text : 'You have a new update. Tap to open the app.',
      tag: 'piffer-mess', renotify: true, icon: 'icon-192.png', badge: 'badge-96.png',
      data: { view: latest ? latest.view : 'board' },
    }).then(function () {
      return self.clients.matchAll({ type: 'window' }).then(function (list) { list.forEach(function (c) { c.postMessage({ refresh: true }); }); });
    });
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var view = (e.notification.data && e.notification.data.view) || 'board';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) { list[i].postMessage({ go: view, refresh: true }); return list[i].focus(); }
    }
    return self.clients.openWindow('./#v=' + view);
  }));
});
