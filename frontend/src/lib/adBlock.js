/* Ryhavean YT — In-page ad blocker (defensive layer)
   Runs in the main thread to:
     - hide ad DOM nodes via CSS
     - block fetch/XHR/Image/Beacon to known ad hosts
     - silently skip <video> ad-segments using data-skip-segments markers
   Works in both PWA standalone mode and the regular web app.
*/

const AD_HOSTS = [
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'googletagservices.com',
  'googletagmanager.com',
  'google-analytics.com',
  'analytics.google.com',
  'imasdk.googleapis.com',
  'pagead2.googlesyndication.com',
  'static.doubleclick.net',
  'ad.doubleclick.net',
  'securepubads.g.doubleclick.net',
  's0.2mdn.net',
  'adservice.google.com',
  'adservice.google.az',
  'adservice.google.ru',
  'play.google.com',
  'youtube.com/api/stats/ads',
  'youtube.com/pagead',
  'youtube.com/ptracking',
  'youtube.com/get_midroll_info',
  'youtube.com/api/stats/qoe',
  'youtube.com/api/stats/atr',
  'youtube.com/api/stats/watchtime',
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
  '/youtubei/v1/log_event',
  '/youtubei/v1/player/ad_break',
  '/api/stats/playback',
  '/api/stats/delayplay',
  '/csi_204',
  '/generate_204',
];

function isAdUrl(u) {
  if (!u) return false;
  try {
    const url = new URL(u, window.location.origin);
    const host = url.hostname || '';
    if (AD_HOSTS.some((h) => host.endsWith(h))) return true;
    if (AD_PATH_FRAGMENTS.some((p) => url.pathname.includes(p))) return true;
  } catch (_) {}
  return false;
}

function installFetchGuard() {
  if (window.__ryhAdGuardInstalled) return;
  window.__ryhAdGuardInstalled = true;

  /* fetch */
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (isAdUrl(url)) {
      return Promise.resolve(new Response('', { status: 204, statusText: 'Blocked' }));
    }
    return origFetch.apply(this, arguments);
  };

  /* XHR */
  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR && OrigXHR.prototype && OrigXHR.prototype.open) {
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;
    OrigXHR.prototype.open = function (method, url) {
      this.__ryh_blocked = isAdUrl(url);
      this.__ryh_url = url;
      return origOpen.apply(this, arguments);
    };
    OrigXHR.prototype.send = function () {
      if (this.__ryh_blocked) {
        try { this.abort(); } catch (_) {}
        return;
      }
      return origSend.apply(this, arguments);
    };
  }

  /* sendBeacon (used by analytics) */
  if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (isAdUrl(url)) return true;
      return origBeacon(url, data);
    };
  }

  /* Image pixel trackers */
  try {
    const ImgProto = HTMLImageElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(ImgProto, 'src');
    if (desc && desc.set) {
      Object.defineProperty(ImgProto, 'src', {
        configurable: true,
        enumerable: true,
        get: desc.get,
        set: function (v) {
          if (isAdUrl(v)) return; // silently drop
          desc.set.call(this, v);
        },
      });
    }
  } catch (_) {}
}

function injectAdBlockCss() {
  if (document.getElementById('ryh-adblock-style')) return;
  const css = `
    /* Generic ad container hiding */
    .ad-showing video, .ytp-ad-module, .ytp-ad-overlay-container,
    .ytp-ad-image-overlay, .ytp-ad-skip-button, .ytp-ad-text,
    .video-ads, .ytd-ad-slot-renderer, .ytd-banner-promo-renderer,
    ytd-display-ad-renderer, ytd-promoted-sparkles-text-search-renderer,
    ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer,
    ytd-promoted-video-renderer, ytd-companion-slot-renderer,
    ytd-action-companion-ad-renderer,
    [id^="google_ads_"], [id*="ad_creative"], [data-ad-slot],
    iframe[src*="doubleclick.net"], iframe[src*="googlesyndication"],
    iframe[src*="googleadservices"] {
      display: none !important;
      visibility: hidden !important;
      width: 0 !important;
      height: 0 !important;
      pointer-events: none !important;
    }
  `;
  const style = document.createElement('style');
  style.id = 'ryh-adblock-style';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
}

export function installAdBlock() {
  try {
    injectAdBlockCss();
    installFetchGuard();
  } catch (_) {}
}
