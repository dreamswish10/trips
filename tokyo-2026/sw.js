// 東京行程 PWA 的 Service Worker：讓網頁在沒網路時也能打開。
// 改了網頁或這個檔案的快取清單時，把 VERSION 加 1，手機才會換成新版。
const VERSION = 'v1';
const SHELL = 'tokyo2026-shell-' + VERSION;
const TILES = 'tokyo2026-tiles';
const FONTS = 'tokyo2026-fonts';
const MAX_TILES = 300;

const SHELL_FILES = [
  './',
  'index.html',
  'manifest.json',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('tokyo2026-shell-') && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;            // 行前準備勾選(POST)直接送出，不經過快取
  const url = new URL(req.url);

  // 網頁本身：先抓網路上的新版(最多等 4 秒)，抓不到就用手機裡的
  if (url.origin === self.location.origin && (req.mode === 'navigate' || url.pathname.endsWith('/index.html'))) {
    event.respondWith(networkFirst(req));
    return;
  }
  // 同網站的其他檔案(Leaflet、圖示)：先用手機裡的，同時在背景更新
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  // 地圖底圖：看過的區域存起來，離線時還看得到
  if (url.hostname === 'tile.openstreetmap.org') {
    event.respondWith(cacheFirst(req, TILES, MAX_TILES));
    return;
  }
  // 字型
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONTS));
    return;
  }
  // 試算表資料不經過這裡：網頁自己會把最後一次讀到的資料存在手機上
});

function networkFirst(req) {
  return new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(req, {ignoreSearch: true})
      .then(r => r || caches.match('index.html'))
      .then(r => { if (!done) { done = true; resolve(r || Response.error()); } });
    const timer = setTimeout(fallback, 4000);
    fetch(req).then(res => {
      clearTimeout(timer);
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put('index.html', copy));
      }
      if (!done) { done = true; resolve(res); }
    }).catch(() => { clearTimeout(timer); fallback(); });
  });
}

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then(cache => cache.match(req).then(hit => {
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
}

function cacheFirst(req, cacheName, max) {
  return caches.open(cacheName).then(cache => cache.match(req).then(hit => {
    if (hit) return hit;
    return fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        cache.put(req, res.clone()).then(() => trim(cache, max));
      }
      return res;
    });
  }));
}

function trim(cache, max) {
  cache.keys().then(keys => {
    if (keys.length > max) Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
  });
}
