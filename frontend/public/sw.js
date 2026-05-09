/* Ryhavean YT — Service Worker
   - PWA shell cache (stale-while-revalidate)
   - Ad/tracker request blocking
   - Offline fallback
*/
const CACHE = 'ryh-yt-shell-v3';
const SHELL = ['/', '/index.html', '/manifest.json'];
const OFFLINE_URL = '/index.html';

const AD_HOSTS = [
  'doubleclick.net', 'googleadservices.com', 'googlesyndication.com',
  'googletagservices.com', 'googletagmanager.com', 'google-analytics.com',
  'analytics.google.com', 'pagead2.googlesyndication.com',
  'static.doubleclick.net', 'imasdk.googleapis.com', 'play.google.com/log',
  'youtube.com/api/stats/ads', 'youtube.com/pagead', 'youtube.com/ptracking',
  'youtube.com/get_midroll_info', 'youtube.com/api/stats/qoe',
  'youtube.com/api/stats/atr', 'youtube.com/api/stats/watchtime',
  'youtubei/v1/log_event', 'ad.doubleclick.net',
  'securepubads.g.doubleclick.net', 's0.2mdn.net', 'adservice.google.com',
];

const AD_PATH_FRAGMENTS = [
  '/pagead/', '/ads?', '/ads/', '/ad_status', '/ad_data',
  '/get_midroll_', '/ptracking', '/api/stats/ads', '/api/stats/qoe',
  '/api/stats/atr', '/api/stats/watchtime', '/log_event',
  '/youtubei/v1/player/ad_break', '/youtubei/v1/log_event',
  '/api/stats/playback', '/api/stats/delayplay', '/csi_204',
];

function isAdRequest(url) {
  try {
    const host = url.hostname || '';
    const full = host + url.pathname + (url.search || '');
    if (AD_HOSTS.some((h) => host.endsWith(h) || full.includes(h))) return true;
    if (AD_PATH_FRAGMENTS.some((p) => url.pathname.includes(p))) return true;
  } catch (_) {}
  return false;
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  let url;
  try { url = new URL(req.url); } catch { return; }

  if (isAdRequest(url)) {
    e.respondWith(new Response('', { status: 204, statusText: 'Blocked by Ryhavean Ad Block' }));
    return;
  }

  // Don't cache API calls or media streams (range requests must pass through)
  if (url.pathname.includes('/api/') || req.destination === 'video' || req.destination === 'audio') {
    return;
  }
  if (req.method !== 'GET') return;

  // Navigation requests: try network, fall back to cached shell on failure
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((c) => c || new Response('', { status: 503 }))
      )
    );
    return;
  }

  // Static asset: stale-while-revalidate
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetcher = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetcher;
    })
  );
});
