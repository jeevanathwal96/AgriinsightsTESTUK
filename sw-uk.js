/* AgriInsights — PWA service worker
 * Strategy:
 *   - HTML / navigation  -> network-first (fresh on every online reload; cached fallback offline)
 *   - Supabase / cross-origin -> network-only, NEVER cached (data + auth must be live)
 *   - same-origin static -> stale-while-revalidate (instant load, refreshed in background)
 *   - old caches purged on activate (keyed by APP_VERSION)
 *
 * DEPLOY: bump APP_VERSION on every release so clients drop the old cache and
 * pick up new shell assets. Paths are relative to the SW scope, so this works
 * unchanged on both the TEST (/AgriInsightsTEST/) and LIVE (/AgriInsights/) repos.
 */
'use strict';

var APP_VERSION = 'uk-2026-09-09-300';
var CACHE = 'agriinsights-uk-' + APP_VERSION;

/* App shell precached on install. The ?v=-suffixed JS is intentionally left to
 * runtime caching so the existing ?v= cache-busting keeps working untouched. */
var PRECACHE = [
  './index-uk.html',
  './manifest-uk.webmanifest',
  './fonts.css',
  './vendor/chart.umd.js',
  './vendor/supabase.js',
  /* './Logo.png' was here — an SA-build filename that has never existed in this folder.
     cache.addAll() rejects the whole batch if any one entry 404s, so this single dead
     path could take the entire app-shell precache down with it. */
  './vendor/jspdf.umd.min.js?v=218',
  './img/hero-farmland-uk.jpg?v=uk298',
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

/* Build an HTML request that bypasses the browser's HTTP cache. GitHub Pages serves
   index.html with cache-control: max-age=600, so a plain fetch() inside a network-first
   handler can still be answered from cache and a fresh deploy goes unseen for ten
   minutes. cache:'reload' forces a real trip to the origin. Falls back to the original
   request if the Request constructor rejects the option. */
function _freshHTML(req){
  try { return new Request(req, {cache: 'reload'}); }
  catch (e) {
    try { return new Request(req.url, {cache: 'reload', credentials: 'same-origin'}); }
    catch (e2) { return req; }
  }
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

  // 2) HTML / navigation: network-first so a normal reload always gets the latest
  //    deploy when online; fall back to the cached shell when offline.
  if (isHTML) {
    e.respondWith(
      fetch(_freshHTML(req)).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index-uk.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index-uk.html').then(function (m) {
          return m || caches.match('./index-uk.html');
        });
      })
    );
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
