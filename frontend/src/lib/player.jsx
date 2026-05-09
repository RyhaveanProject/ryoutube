import React, {
  createContext, useCallback, useContext, useEffect, useMemo,
  useRef, useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, Maximize2, Play, Pause, SkipBack, SkipForward } from "lucide-react";

/**
 * Global YouTube-style player.
 *
 * One iframe is mounted ONCE at the App root. It is positioned with
 * `position: fixed` and continuously aligned to a "slot" element on the
 * Watch page. When minimized it collapses into a fixed mini-player
 * anchored above the bottom nav (NOT swipeable horizontally — matches
 * real YouTube mobile behaviour).
 */

const PlayerCtx = createContext(null);
export const usePlayer = () => useContext(PlayerCtx);

export function PlayerProvider({ children }) {
  const [video, setVideo] = useState(null);
  const [slotEl, setSlotEl] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [playing, setPlaying] = useState(true);
  // Up-next queue (recommendations) — populated by the Watch page so we
  // can auto-advance when a video ends and so the prev/next buttons in
  // the player work like real YouTube.
  const [queue, setQueue] = useState([]);
  const loc = useLocation();
  const nav = useNavigate();

  const open = useCallback((meta) => {
    if (!meta || !meta.id) return;
    setMinimized(false);
    setVideo((v) => (v && v.id === meta.id ? { ...v, ...meta } : meta));
  }, []);
  const close = useCallback(() => { setVideo(null); setMinimized(false); setQueue([]); }, []);
  const minimize = useCallback(() => setMinimized(true), []);
  const expand = useCallback(() => {
    if (video) { setMinimized(false); nav(`/watch/${video.id}`); }
  }, [video, nav]);

  // Up-next / queue API.
  const setUpNext = useCallback((list) => {
    setQueue(Array.isArray(list) ? list : []);
  }, []);

  const goNext = useCallback(() => {
    const next = queue && queue[0];
    if (!next || !next.id) return false;
    nav(`/watch/${next.id}`);
    return true;
  }, [queue, nav]);

  const goPrev = useCallback(() => {
    // Use browser history — works for both Watch→Watch transitions and
    // Watch→prev-page transitions.
    try { nav(-1); } catch {}
  }, [nav]);

  useEffect(() => {
    if (!video) return;
    if (loc.pathname === `/watch/${video.id}`) setMinimized(false);
  }, [loc.pathname, video]);

  const ctx = useMemo(() => ({
    video, open, close, minimize, expand,
    minimized, setMinimized,
    slotEl, setSlotEl,
    playing, setPlaying,
    queue, setUpNext, goNext, goPrev,
  }), [video, open, close, minimize, expand, minimized, slotEl, playing, queue, setUpNext, goNext, goPrev]);

  return (
    <PlayerCtx.Provider value={ctx}>
      {children}
      <PlayerHost />
    </PlayerCtx.Provider>
  );
}

export function PlayerSlot() {
  const { setSlotEl, video, minimized } = usePlayer();
  const ref = useRef(null);
  useEffect(() => {
    setSlotEl(ref.current);
    return () => setSlotEl((cur) => (cur === ref.current ? null : cur));
  }, [setSlotEl]);
  return (
    <div
      ref={ref}
      className="ryh-player-slot"
      data-testid="player-inline-slot"
      style={{ aspectRatio: "16 / 9", width: "100%", background: "#000" }}
    >
      {video && minimized && <RestoreOverlay />}
    </div>
  );
}

function RestoreOverlay() {
  const { setMinimized } = usePlayer();
  return (
    <button
      onClick={() => setMinimized(false)}
      className="w-full h-full grid place-items-center text-neutral-300 bg-neutral-900 hover:bg-neutral-800 ryh-fade-in"
      data-testid="player-restore-btn"
    >
      <span className="flex items-center gap-2 text-sm">
        <Maximize2 className="w-4 h-4" /> Restore player
      </span>
    </button>
  );
}

function PlayerHost() {
  const {
    video, slotEl, minimized, setMinimized, close, expand, playing, setPlaying,
    queue, goNext, goPrev,
  } = usePlayer();
  const loc = useLocation();
  const hostRef = useRef(null);
  const iframeRef = useRef(null);
  const dragRef = useRef({ startY: 0, dragging: false, dy: 0 });
  // Cached last-applied geometry, used to skip redundant style writes
  // (eliminates visible jitter when scrolling the recommendations rail).
  const lastGeomRef = useRef({ left: -1, top: -1, width: -1, height: -1, radius: "", shadow: "", opacity: "" });
  const [dragOffset, setDragOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  const onWatchPage = !!video && loc.pathname === `/watch/${video.id}`;
  const inline = onWatchPage && !minimized && !!slotEl;
  const hideForMount = onWatchPage && !minimized && !slotEl;

  // Continuously align host element. We DIFF-GATE every style write
  // (only touch the DOM when the value actually changed) to eliminate
  // visible jitter when the user scrolls the Up-next list.
  //
  // CRITICAL: when in MINI mode (not inline), we DO NOT run an rAF loop.
  // Previously the host was repositioned every frame relative to the
  // bottom-nav rect, which made the mini-player visibly stutter ("dona
  // dona hərəkət edir") whenever the user scrolled the search results.
  // Now we set its position ONCE in the layout effect and let CSS
  // (position: fixed, bottom: nav-height) keep it perfectly stable.
  // The rAF loop is reserved for INLINE mode where we still need to
  // follow the desktop slot rect.
  useEffect(() => {
    if (!video) return;
    const apply = (left, top, width, height, radius, shadow, opacity, useBottom) => {
      const host = hostRef.current;
      if (!host) return;
      const last = lastGeomRef.current;
      if (useBottom) {
        // Mini-mobile: pin to BOTTOM via CSS so iOS rubber-band /
        // address-bar collapse can't desync our `top` value.
        if (host.style.top !== "auto") host.style.top = "auto";
        const b = `${useBottom}px`;
        if (host.style.bottom !== b) host.style.bottom = b;
        last.top = -1; // invalidate top tracking for next time
      } else {
        if (host.style.bottom !== "auto") host.style.bottom = "auto";
        if (Math.abs(top - last.top) > 0.5) { host.style.top = `${top}px`; last.top = top; }
      }
      if (Math.abs(left - last.left) > 0.5) { host.style.left = `${left}px`; last.left = left; }
      if (Math.abs(width - last.width) > 0.5) { host.style.width = `${width}px`; last.width = width; }
      if (Math.abs(height - last.height) > 0.5) { host.style.height = `${height}px`; last.height = height; }
      if (radius !== last.radius) { host.style.borderRadius = radius; last.radius = radius; }
      if (shadow !== last.shadow) { host.style.boxShadow = shadow; last.shadow = shadow; }
      if (opacity !== last.opacity) { host.style.opacity = opacity; last.opacity = opacity; }
    };
    const HEADER_H = 56;

    // Mini mode: position ONCE, no rAF. Stays perfectly stable while
    // the user scrolls. Re-evaluated on resize / orientation change
    // (see listener below).
    if (!inline) {
      const navEl = document.querySelector('[data-testid="mobile-bottom-nav"]');
      const navH = navEl ? navEl.getBoundingClientRect().height : 56;
      if (isMobile) {
        const barH = 64;
        apply(0, 0, window.innerWidth, barH,
              "0px", "0 -6px 20px rgba(0,0,0,.6)", "1", navH);
      } else {
        const w = 320;
        const videoH = Math.round(w * 9 / 16);
        const captionH = 40;
        apply(
          window.innerWidth - w - 16,
          window.innerHeight - videoH - captionH - 16,
          w, videoH + captionH,
          "12px", "0 12px 40px rgba(0,0,0,.6)", "1",
          0  // 0 means: don't use bottom anchor on desktop
        );
        // Restore top anchoring for desktop mini.
        if (hostRef.current) {
          hostRef.current.style.bottom = "auto";
          hostRef.current.style.top = `${window.innerHeight - videoH - captionH - 16}px`;
        }
      }
      return; // No rAF in mini mode.
    }

    // Inline mode: keep rAF so we follow the slot precisely on desktop
    // (and respect drag-offset on both platforms).
    let raf = 0;
    const tick = () => {
      if (isMobile) {
        const w = window.innerWidth;
        const h = Math.round(w * 9 / 16);
        apply(0, HEADER_H + dragOffset, w, h,
          "0px", "none",
          dragOffset > 0 ? `${Math.max(0.4, 1 - dragOffset / 400)}` : "1",
          0);
      } else if (slotEl) {
        const r = slotEl.getBoundingClientRect();
        apply(
          r.left, r.top + dragOffset, r.width, r.height,
          "0px", "none",
          dragOffset > 0 ? `${Math.max(0.4, 1 - dragOffset / 400)}` : "1",
          0
        );
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [video, inline, slotEl, dragOffset, isMobile]);

  // Build embed URL — branding hidden + autoplay forced. We strip any
  // pre-existing autoplay/mute/playsinline params from the backend's
  // embed_url so OUR forced values always win (this is what fixes the
  // "video doesn't start until I click the YouTube logo" complaint).
  const embedSrc = useMemo(() => {
    if (!video) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    let baseRaw = video.embed_url
      || `https://www.youtube-nocookie.com/embed/${video.id}`;
    // Drop existing query — we'll rebuild a clean one.
    const qIdx = baseRaw.indexOf("?");
    const path = qIdx >= 0 ? baseRaw.slice(0, qIdx) : baseRaw;
    const incoming = qIdx >= 0 ? new URLSearchParams(baseRaw.slice(qIdx + 1)) : new URLSearchParams();
    // Force autoplay-critical params last so they always override.
    const forced = {
      autoplay: "1",
      mute: "1",
      playsinline: "1",
      rel: "0",
      modestbranding: "1",
      iv_load_policy: "3",
      fs: "1",
      controls: "1",
      showinfo: "0",
      enablejsapi: "1",
      origin,
    };
    Object.entries(forced).forEach(([k, v]) => incoming.set(k, v));
    return `${path}?${incoming.toString()}`;
  }, [video]);

  // postMessage bridge: handshake → autoplay → unmute → state tracking.
  // playerState 0 = ended → auto-advance to next video in queue.
  useEffect(() => {
    if (!video) return;
    const iframe = iframeRef.current;
    if (!iframe) return;
    const send = (func, args = []) => {
      try {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func, args }), "*"
        );
      } catch {}
    };
    const listening = () => {
      try {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*"
        );
      } catch {}
    };
    const onMsg = (e) => {
      if (typeof e.data !== "string") return;
      let d; try { d = JSON.parse(e.data); } catch { return; }
      if (d.event === "onReady" || d.event === "initialDelivery") {
        send("playVideo");
        setTimeout(() => { send("unMute"); send("setVolume", [100]); send("playVideo"); }, 250);
      }
      if (d.event === "infoDelivery" && d.info) {
        if (d.info.playerState === 1) setPlaying(true);
        if (d.info.playerState === 2) setPlaying(false);
        if (d.info.playerState === 0) {
          // ENDED → auto-advance to the next Up-next entry.
          goNext();
        }
      }
    };
    window.addEventListener("message", onMsg);
    const handshake = setInterval(listening, 400);
    const stopHandshake = setTimeout(() => clearInterval(handshake), 4000);
    return () => {
      window.removeEventListener("message", onMsg);
      clearInterval(handshake);
      clearTimeout(stopHandshake);
    };
  }, [video, setPlaying, goNext]);

  const sendCmd = useCallback((func, args = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func, args }), "*"
      );
    } catch {}
  }, []);

  // Drag-down to minimize when inline (Watch page).
  useEffect(() => {
    if (!inline) { setDragOffset(0); return; }
    const host = hostRef.current;
    if (!host) return;
    const onStart = (e) => {
      const t = e.target;
      if (!(t && t.getAttribute && t.getAttribute("data-drag-handle"))) return;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      dragRef.current = { startY: y, dragging: true, dy: 0 };
    };
    const onMove = (e) => {
      if (!dragRef.current.dragging) return;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const dy = Math.max(0, y - dragRef.current.startY);
      dragRef.current.dy = dy;
      setDragOffset(dy);
    };
    const onEnd = () => {
      if (!dragRef.current.dragging) return;
      const dy = dragRef.current.dy;
      dragRef.current.dragging = false;
      if (dy > 120) setMinimized(true);
      setDragOffset(0);
    };
    host.addEventListener("mousedown", onStart);
    host.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchend", onEnd);
    return () => {
      host.removeEventListener("mousedown", onStart);
      host.removeEventListener("touchstart", onStart);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchend", onEnd);
    };
  }, [inline, setMinimized]);

  if (!video) return null;

  const iframeStyle = inline
    ? { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", border: 0, display: "block" }
    : isMobile
    ? { position: "absolute", left: 0, top: 0, width: 110, height: "100%", border: 0, display: "block" }
    : { position: "absolute", left: 0, top: 0, width: "100%", height: "calc(100% - 40px)", border: 0, display: "block" };

  // Sandbox: must allow popups + forms so YouTube's age-gate / consent
  // / cookie-banner flows can complete inside the iframe. Without those
  // flags some embeds refuse to start playback and just stay on a black
  // poster (this was the "video açıldıqda qara ekranda qalır" report).
  // We KEEP the sandbox so clicks on YouTube's "Watch on YouTube" pill
  // open in a new tab instead of replacing our SPA — that requires
  // allow-popups + allow-popups-to-escape-sandbox.
  const SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox allow-forms";

  const hasNext = !!(queue && queue[0]);

  return (
    <div
      ref={hostRef}
      className={`ryh-player-host ${!inline ? "ryh-mini-enter" : ""} ${!inline && isMobile ? "ryh-mini-mobile" : ""}`}
      style={{
        position: "fixed",
        zIndex: 60,
        background: !inline && isMobile ? "#212121" : "#000",
        overflow: "hidden",
        transition: "border-radius .25s ease, box-shadow .25s ease, opacity .15s ease",
        visibility: hideForMount ? "hidden" : "visible",
      }}
      data-testid="player-host"
    >
      <iframe
        // key forces React to remount the iframe whenever the video
        // changes. Without this, some browsers (notably iOS Safari)
        // refuse to honour autoplay on subsequent src swaps inside an
        // already-loaded iframe — which is what made the YouTube
        // splash + play-button overlay appear instead of immediate
        // playback.
        key={video.id}
        ref={iframeRef}
        src={embedSrc}
        title={video.title || "Player"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        loading="eager"
        frameBorder="0"
        sandbox={SANDBOX}
        style={iframeStyle}
      />

      {/* INLINE: drag handle + prev/next overlay.
          The drag area is invisible at the very top of the player so
          tapping to drag-down still works. The prev/next buttons are
          rendered AS SIBLINGS inside the same overlay strip and sit
          above the iframe so they can be clicked. */}
      {inline && (
        <>
          <div
            data-drag-handle="1"
            className="absolute top-0 left-0 right-0 h-12"
            style={{ cursor: "grab", zIndex: 5 }}
          />
          <div
            className="absolute top-2 right-2 flex items-center gap-1"
            style={{ zIndex: 6 }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="px-2 py-1.5 rounded-full bg-black/55 hover:bg-black/75 text-white backdrop-blur-sm active:scale-90 transition-transform"
              data-testid="player-prev-video-btn"
              aria-label="Previous video"
              title="Previous video"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              disabled={!hasNext}
              className={`px-2 py-1.5 rounded-full text-white backdrop-blur-sm active:scale-90 transition-transform ${hasNext ? "bg-black/55 hover:bg-black/75" : "bg-black/30 opacity-50 cursor-not-allowed"}`}
              data-testid="player-next-video-btn"
              aria-label="Next video"
              title="Next video"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {/* MINI MOBILE: bar with title + prev/play/next/close. Tapping
          the title expands; horizontal swipe is intentionally
          disabled. */}
      {!inline && isMobile && (
        <div
          className="absolute top-0 right-0 bottom-0 flex items-center"
          style={{ left: 110 }}
          data-testid="mini-player-bar"
        >
          <button
            onClick={expand}
            className="flex-1 min-w-0 text-left px-3 self-center"
            title={video.title}
            data-testid="mini-player-title"
          >
            <div className="text-white text-[13px] font-medium truncate leading-tight">
              {video.title || "Now playing"}
            </div>
            <div className="text-[11px] text-neutral-400 truncate mt-0.5">
              {video.channel || ""}
            </div>
          </button>
          <button
            onClick={goPrev}
            className="px-2 h-full grid place-items-center text-white hover:bg-white/10 active:scale-90 transition-transform shrink-0"
            data-testid="mini-player-prev-btn"
            aria-label="Previous video"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={() => { playing ? sendCmd("pauseVideo") : sendCmd("playVideo"); }}
            className="px-2 h-full grid place-items-center text-white hover:bg-white/10 active:scale-90 transition-transform shrink-0"
            data-testid="mini-player-play-btn"
            aria-label="Play/Pause"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={goNext}
            disabled={!hasNext}
            className={`px-2 h-full grid place-items-center hover:bg-white/10 active:scale-90 transition-transform shrink-0 ${hasNext ? "text-white" : "text-white/35"}`}
            data-testid="mini-player-next-btn"
            aria-label="Next video"
          >
            <SkipForward className="w-5 h-5" />
          </button>
          <button
            onClick={close}
            className="px-3 h-full grid place-items-center text-white hover:bg-white/10 active:scale-90 transition-transform shrink-0"
            data-testid="mini-player-close-btn"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* MINI DESKTOP: floating card caption */}
      {!inline && !isMobile && (
        <div
          className="absolute left-0 right-0 bottom-0 flex items-center gap-1 px-2 bg-neutral-900 border-t border-white/10"
          style={{ height: 40 }}
          data-testid="mini-player-bar"
        >
          <button
            onClick={goPrev}
            className="p-1.5 rounded-full hover:bg-white/10 text-white shrink-0 active:scale-90 transition-transform"
            data-testid="mini-player-prev-btn"
            aria-label="Previous video"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={() => { playing ? sendCmd("pauseVideo") : sendCmd("playVideo"); }}
            className="p-1.5 rounded-full hover:bg-white/10 text-white shrink-0 active:scale-90 transition-transform"
            data-testid="mini-player-play-btn"
            aria-label="Play/Pause"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={goNext}
            disabled={!hasNext}
            className={`p-1.5 rounded-full shrink-0 active:scale-90 transition-transform ${hasNext ? "hover:bg-white/10 text-white" : "text-white/35"}`}
            data-testid="mini-player-next-btn"
            aria-label="Next video"
          >
            <SkipForward className="w-4 h-4" />
          </button>
          <button
            onClick={expand}
            className="flex-1 min-w-0 text-left text-white text-[12.5px] truncate"
            title={video.title}
            data-testid="mini-player-title"
          >
            {video.title || "Now playing"}
          </button>
          <button
            onClick={expand}
            className="p-1.5 rounded-full hover:bg-white/10 text-white shrink-0 active:scale-90 transition-transform"
            data-testid="mini-player-expand-btn"
            aria-label="Expand"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={close}
            className="p-1.5 rounded-full hover:bg-white/10 text-white shrink-0 active:scale-90 transition-transform"
            data-testid="mini-player-close-btn"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
