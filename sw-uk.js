/* AgriInsights — PWA service worker
 * Strategy:
 *   - HTML / navigation  -> network-first, revalidated (304 when unchanged); the cached copy
 *                           after 3 s on a stalled line or when offline (-400)
 *   - Supabase / cross-origin -> network-only, NEVER cached (data + auth must be live)
 *   - same-origin static -> stale-while-revalidate (instant load, refreshed in background)
 *   - old caches purged on activate (keyed by APP_VERSION)
 *
 *   - -413: only the app page (index-uk.html, any ?query) writes or reads the shell entry; the scope's own folder and
 *     index.html lead to the app (offline: their own copy, else the shell); every other page (privacy.html ...) has its own
 *     cache entry and never falls back to the app
 * DEPLOY: bump APP_VERSION on every release so clients drop the old cache and
 * pick up new shell assets. Paths are relative to the SW scope, so this works
 * unchanged on both the TEST (/AgriInsightsTEST/) and LIVE (/AgriInsights/) repos.
 */
'use strict';

var APP_VERSION = 'uk-2026-10-28-424';
var CACHE = 'agriinsights-uk-' + APP_VERSION;

/* App shell precached on install. The ?v=-suffixed JS is intentionally left to
 * runtime caching so the existing ?v= cache-busting keeps working untouched. */
var PRECACHE = [
  './index-uk.html',
  './js/app-0-c32aeac9ca.js',   /* dist build: inline script 0 */
  './js/app-1-cef096c828.js',   /* dist build: inline script 1 */
  './js/app-2-1b95b6b246.js',   /* dist build: inline script 2 */
  './manifest-uk.webmanifest',
  './fonts.css',
  './vendor/chart.umd.js',
  './vendor/supabase.js',
  './data/uk-ppp.json',
  './data/uk-eamu.json',
  /* './Logo.png' was here — an SA-build filename that has never existed in this folder.
     cache.addAll() rejects the whole batch if any one entry 404s, so this single dead
     path could take the entire app-shell precache down with it. */
  './vendor/jspdf.umd.min.js?v=218',
  './img/hero-farmland-uk.webp?v=uk400',   /* -400: same picture, 126 KB WebP (was a 328 KB JPEG) */
  './img/logomark.png?v=225',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png',
  './fonts/plus-jakarta-sans-400.woff2',
  './fonts/plus-jakarta-sans-500.woff2',
  './fonts/plus-jakarta-sans-600.woff2',
  './fonts/plus-jakarta-sans-700.woff2',
  './fonts/plus-jakarta-sans-800.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Resilient precache: one missing asset must not abort the whole install.
      return Promise.allSettled(PRECACHE.map(function (u) { return c.add(u); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        // Scoped to the UK namespace so this SW can never purge the SA app's caches.
        if (k.indexOf('agriinsights-uk-') === 0 && k !== CACHE) return caches.delete(k);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Build an HTML request that always asks the server whether the page has changed.
   GitHub Pages serves index-uk.html with cache-control: max-age=600, so a plain fetch()
   inside a network-first handler can be answered from the HTTP cache and a fresh deploy
   goes unseen for ten minutes. -400 (B9, D4): cache:'no-cache' instead of 'reload'.
   Both always go to the server, but 'reload' sends no If-None-Match, so every load
   downloaded the whole 1.85 MB page again even when nothing had changed (10.4 s warm on
   a slow line). 'no-cache' revalidates: an unchanged page is a 304 with no body and the
   browser's own copy is used; a new deploy is a 200 and is seen on the first load.
   Falls back to the original request if the Request constructor rejects the option. */
function _freshHTML(req){
  try { return new Request(req, {cache: 'no-cache'}); }
  catch (e) {
    try { return new Request(req.url, {cache: 'no-cache', credentials: 'same-origin'}); }
    catch (e2) { return req; }
  }
}

/* -400 (B9, D4): a line that stalls must not leave the farmer looking at a blank page.
   If the server has not answered the page request in HTML_TIMEOUT_MS and this device has
   a copy, the copy is shown; the request carries on, refills the cache for next time and,
   when the page it brings is not the one shown, tells that page so it can offer a quiet
   "New version ready · Reload" bar (index-uk.html swShowUpdateNotice). Never reloads. */
var HTML_TIMEOUT_MS = 3000;
function _sameBody(a, b){
  if (!a || !b) return Promise.resolve(false);
  return Promise.all([a.clone().text(), b.clone().text()]).then(function (t) { return t[0] === t[1]; }).catch(function () { return false; });
}
/* -411 (B11F item 3): the page asks which version this worker is; and the "newer page" message carries the
   newer page's own release (its <meta name="ai-build">), so the page shows the bar only when it differs. */
self.addEventListener('message', function (e) {
  if (!e.data || e.data.type !== 'ai-version?') return;
  var m = { type: 'ai-version', v: APP_VERSION };
  if (e.ports && e.ports[0]) e.ports[0].postMessage(m); else if (e.source) e.source.postMessage(m);
});
function _buildOf(res){
  return res.clone().text().then(function (t) { var m = String(t).match(/<meta name="ai-build" content="([^"]+)"/); return m ? m[1] : null; }).catch(function () { return null; });
}
function _tellNewer(clientId, build){
  if (!clientId) return;
  var tries = 0;
  (function send(){
    self.clients.get(clientId).then(function (c) {
      if (c) { c.postMessage({ type: 'ai-new-version', build: build || null }); return; }
      if (++tries < 10) setTimeout(send, 1000);
    }).catch(function () {});
  })();
}
/* -413 (UK -413): which page is this, resolved against this worker's scope (never a raw string): the app page itself
   (index-uk.html, with any ?query such as ?demo=1), an entry that leads to it (the scope's own folder, index.html - on the
   live site a redirect to index-uk.html), or any other page. Only the app page is the shell. */
function _scopeURL(){ var base = (self.location && (self.location.href || (self.location.origin + '/'))) || 'http://localhost/';
  try { return new URL((self.registration && self.registration.scope) || './', base); } catch (e) { return new URL('./', base); } }
function _pageKind(url){ var sc = _scopeURL(); if (url.origin !== sc.origin) return 'other';
  if (url.pathname === sc.pathname + 'index-uk.html') return 'app';
  if (url.pathname === sc.pathname || url.pathname === sc.pathname + 'index.html') return 'entry';
  return 'other'; }
/* any page but the app: its own URL is its cache key (the query kept; a #hash is never sent) */
function _ownKey(url){ return url.origin + url.pathname + url.search; }
/* network-first under its own key; offline (or slower than HTML_TIMEOUT_MS with a copy) its own copy; never the shell -
   except an entry to the app with no copy of its own, which gets the app (it leads there anyway) */
function _pageResponse(e, url, kind){
  var key = _ownKey(url), net = fetch(_freshHTML(e.request));
  e.waitUntil(net.then(function (res) {
    if (!res || !res.ok || res.type !== 'basic') return;
    var cp = res.clone(); return caches.open(CACHE).then(function (c) { return c.put(key, cp); });
  }).catch(function () {}));
  var fallback = function () { return caches.match(key).then(function (m) { return m || (kind === 'entry' ? caches.match('./index-uk.html') : null); }); };
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () { caches.match(key).then(function (m) { if (done || !m) return; done = true; resolve(m); }); }, HTML_TIMEOUT_MS);
    net.then(function (res) { if (done) return; done = true; clearTimeout(timer); resolve(res); },
             function () { if (done) return; clearTimeout(timer); fallback().then(function (m) { if (done) return; done = true; resolve(m || Response.error()); }); });
  });
}
function _htmlResponse(e){
  var req = e.request;
  return caches.match('./index-uk.html').then(function (cached) {
    var settled = false, servedCached = false;
    var net = fetch(_freshHTML(req)).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { return c.put('./index-uk.html', copy); }).catch(function () {});
        /* The cached copy was shown because the line was slow: say so if this one differs. */
        if (servedCached) _sameBody(res, cached).then(function (same) { if (!same) _buildOf(res).then(function (b) { _tellNewer(e.resultingClientId || e.clientId, b); }); });
      }
      return res;
    });
    if (!cached) return net.catch(function () { return caches.match('./index-uk.html'); });
    return new Promise(function (resolve) {
      /* hand the page a copy: the cached response itself is kept for the comparison above */
      var timer = setTimeout(function () { if (!settled) { settled = true; servedCached = true; resolve(cached.clone()); } }, HTML_TIMEOUT_MS);
      net.then(function (res) {
        if (settled) return; settled = true; clearTimeout(timer); resolve(res);
      }, function () {
        if (settled) return; settled = true; clearTimeout(timer); resolve(cached);
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;            // never intercept writes (POST/PATCH/DELETE)

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 1) Supabase API + any cross-origin request: do not touch — always live network.
  if (url.origin !== self.location.origin || url.hostname.indexOf('supabase') !== -1) {
    return;
  }

  var isHTML = req.mode === 'navigate' ||
               (req.headers.get('accept') || '').indexOf('text/html') !== -1;

  // 2) HTML / navigation of the app page itself: network-first so a normal reload always gets the latest
  //    deploy when online; fall back to the cached shell when offline. Only this path writes the shell (-413).
  //    Any other page (privacy.html, the scope's folder, index.html, a later page) goes by its own URL (-413).
  if (isHTML) {
    var kind = _pageKind(url);
    e.respondWith(kind === 'app' ? _htmlResponse(e) : _pageResponse(e, url, kind));
    return;
  }

  // 3) Same-origin static (vendor, fonts, css, versioned JS, images):
  //    stale-while-revalidate.
  e.respondWith(
    caches.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
