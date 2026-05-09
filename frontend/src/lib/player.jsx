import React, {
  createContext, useCallback, useContext, useEffect, useMemo,
  useRef, useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, Maximize2, Play, Pause } from "lucide-react";

/**
 * Global YouTube-style player.
 *
 * One iframe is mounted ONCE at the App root. It is positioned with
 * `position: fixed` and continuously aligned to a "slot" element on the
 * Watch page. When minimized it collapses into a fixed mini-player
 * anchored above the bottom nav (NOT swipeable horizontally — matches
 * real YouTube mobile behaviour).
 *
 *  - Internal nav only: the iframe is sandboxed (`allow-scripts
 *    allow-same-origin allow-presentation`) which strips popup +
 *    top-navigation capabilities. Clicks on YouTube's "Watch on
 *    YouTube" pill or the YT logo simply do nothing — no navigation
 *    leaks to youtube.com.
 *  - Because of the sandbox the visible black brand-cover gradients
 *    are no longer needed, so they were removed (fixes the "black
 *    stains over the title and the YT logo" complaint).
 *  - Position updates are diff-gated to eliminate visible jitter when
 *    the user scrolls the recommendations rail with a video open.
 *  - Autoplay forced via mute=1 + autoplay=1 + postMessage("playVideo");
 *    we unmute right after playback actually starts.
 */

const PlayerCtx = createContext(null);
export const usePlayer = () => useContext(PlayerCtx);

export function PlayerProvider({ children }) {
  const [video, setVideo] = useState(null);
  const [slotEl, setSlotEl] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [playing, setPlaying] = useState(true);
  const loc = useLocation();
  const nav = useNavigate();

  const open = useCallback((meta) => {
    if (!meta || !meta.id) return;
    setMinimized(false);
    setVideo((v) => (v && v.id === meta.id ? { ...v, ...meta } : meta));
  }, []);
  const close = useCallback(() => { setVideo(null); setMinimized(false); }, []);
  const minimize = useCallback(() => setMinimized(true), []);
  const expand = useCallback(() => {
    if (video) { setMinimized(false); nav(`/watch/${video.id}`); }
  }, [video, nav]);

  useEffect(() => {
    if (!video) return;
    if (loc.pathname === `/watch/${video.id}`) setMinimized(false);
  }, [loc.pathname, video]);

  const ctx = useMemo(() => ({
    video, open, close, minimize, expand,
    minimized, setMinimized,
    slotEl, setSlotEl,
    playing, setPlaying,
  }), [video, open, close, minimize, expand, minimized, slotEl, playing]);

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
  const { video, slotEl, minimized, setMinimized, close, expand, playing, setPlaying } = usePlayer();
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

  // Continuously align host element to slot rect (RAF loop) — but ONLY
  // write to the DOM when geometry actually changed. This is what
  // stabilises the player while the user scrolls vertically through
  // the Up-next list.
  useEffect(() => {
    if (!video) return;
    let raf = 0;
    const apply = (left, top, width, height, radius, shadow, opacity) => {
      const host = hostRef.current;
      if (!host) return;
      const last = lastGeomRef.current;
      if (Math.abs(left - last.left) > 0.5) { host.style.left = `${left}px`; last.left = left; }
      if (Math.abs(top - last.top) > 0.5) { host.style.top = `${top}px`; last.top = top; }
      if (Math.abs(width - last.width) > 0.5) { host.style.width = `${width}px`; last.width = width; }
      if (Math.abs(height - last.height) > 0.5) { host.style.height = `${height}px`; last.height = height; }
      if (radius !== last.radius) { host.style.borderRadius = radius; last.radius = radius; }
      if (shadow !== last.shadow) { host.style.boxShadow = shadow; last.shadow = shadow; }
      if (opacity !== last.opacity) { host.style.opacity = opacity; last.opacity = opacity; }
    };
    const tick = () => {
      if (inline && slotEl) {
        const r = slotEl.getBoundingClientRect();
        apply(
          r.left, r.top + dragOffset, r.width, r.height,
          "0px", "none",
          dragOffset > 0 ? `${Math.max(0.4, 1 - dragOffset / 400)}` : "1"
        );
      } else if (isMobile) {
        // Real-YouTube-style mini bar pinned above bottom nav.
        const barH = 64;
        const bottomNavH = 56;
        apply(
          0, window.innerHeight - barH - bottomNavH,
          window.innerWidth, barH,
          "0px", "0 -6px 20px rgba(0,0,0,.6)", "1"
        );
      } else {
        const w = 320;
        const videoH = Math.round(w * 9 / 16);
        const captionH = 40;
        apply(
          window.innerWidth - w - 16,
          window.innerHeight - videoH - captionH - 16,
          w, videoH + captionH,
          "12px", "0 12px 40px rgba(0,0,0,.6)", "1"
        );
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [video, inline, slotEl, dragOffset, isMobile]);

  // Build embed URL — branding hidden + autoplay forced.
  const embedSrc = useMemo(() => {
    if (!video) return "";
    const base = video.embed_url
      || `https://www.youtube-nocookie.com/embed/${video.id}`
        + `?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3`
        + `&fs=1&playsinline=1&disablekb=0&controls=1&showinfo=0&color=white`;
    const sep = base.includes("?") ? "&" : "?";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}${sep}enablejsapi=1&mute=1&autoplay=1&origin=${encodeURIComponent(origin)}`;
  }, [video]);

  // postMessage bridge: handshake → autoplay → unmute → state tracking
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
  }, [video, setPlaying]);

  const sendCmd = useCallback((func, args = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func, args }), "*"
      );
    } catch {}
  }, []);

  // Drag-down to minimize when inline (Watch page). NOTE: horizontal
  // swipe-to-dismiss on the mini player has been removed — it was
  // making the mini player feel non-YouTube-like.
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

  // Sandbox: no allow-popups, no allow-top-navigation → clicks on
  // YouTube's "Watch on YouTube" pill or the watermark cannot navigate
  // away from our app and cannot open a new tab. The postMessage
  // bridge still works because allow-scripts + allow-same-origin are
  // granted.
  const SANDBOX = "allow-scripts allow-same-origin allow-presentation";

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

      {/* INLINE: drag handle only — no visible black covers anymore. */}
      {inline && (
        <div
          data-drag-handle="1"
          className="absolute top-0 left-0 right-0 h-12"
          style={{ cursor: "grab", zIndex: 5 }}
        />
      )}

      {/* MINI MOBILE: bar with title + play/close. Tapping the title
          expands; horizontal swipe is intentionally disabled. */}
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
            onClick={() => { playing ? sendCmd("pauseVideo") : sendCmd("playVideo"); }}
            className="px-3 h-full grid place-items-center text-white hover:bg-white/10 active:scale-90 transition-transform shrink-0"
            data-testid="mini-player-play-btn"
            aria-label="Play/Pause"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
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
            onClick={() => { playing ? sendCmd("pauseVideo") : sendCmd("playVideo"); }}
            className="p-1.5 rounded-full hover:bg-white/10 text-white shrink-0 active:scale-90 transition-transform"
            data-testid="mini-player-play-btn"
            aria-label="Play/Pause"
          >
            {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
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
