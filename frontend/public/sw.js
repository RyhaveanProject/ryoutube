/* Ryhavean YT — Service Worker
   - PWA shell cache
   - Ad/tracker request blocking (works for the PWA + web app)
*/
const CACHE = 'ryh-yt-shell-v2';
const SHELL = ['/', '/index.html', '/manifest.json'];

/* ---------- Ad / tracker block-list ---------- */
/* These are the hosts and path fragments YouTube + Google use for ads,
   tracking and click telemetry. Blocking them at the SW layer means the
   browser never even fires the requests for the page or the embedded
   iframes/PWA — completely ad-free, no extension required. */
const AD_HOSTS = [
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'googletagservices.com',
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'pagead2.googlesyndication.com',
  'static.doubleclick.net',
  'imasdk.googleapis.com',
  'play.google.com/log',
  'youtube.com/api/stats/ads',
  'youtube.com/pagead',
  'youtube.com/ptracking',
  'youtube.com/get_midroll_info',
  'youtube.com/api/stats/qoe',
  'youtube.com/api/stats/atr',
  'youtube.com/api/stats/watchtime',
  'youtubei/v1/log_event',
  'ad.doubleclick.net',
];

const AD_PATH_FRAGMENTS = [
  '/pagead/',
  '/ads?',
  '/ads/',
  '/ad_status',
  '/ad_data',
  '/get_midroll_',
  '/ptracking',
  '/api/stats/ads',
  '/api/stats/qoe',
  '/api/stats/atr',
  '/api/stats/watchtime',
  '/log_event',
  '/youtubei/v1/player/ad_break',
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

  /* 1. Hard-block any ad/tracker request */
  if (isAdRequest(url)) {
    e.respondWith(new Response('', { status: 204, statusText: 'Blocked by Ryhavean Ad Block' }));
    return;
  }

  /* 2. Don't touch our API or media streams (range requests must pass through) */
  if (url.pathname.includes('/api/') || req.destination === 'video' || req.destination === 'audio') {
    return;
  }
  if (req.method !== 'GET') return;

  /* 3. Stale-while-revalidate for app shell */
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
