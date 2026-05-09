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
 * `position: fixed` and continuously aligned to a "slot" element that
 * lives inside the Watch page. When the user navigates away (Home,
 * Search, Library, History, …) or drags the player down, the slot
 * disappears and the iframe smoothly transitions into a small floating
 * mini-player anchored to the bottom-left corner — exactly like
 * YouTube's behavior. Audio playback is never interrupted, because the
 * iframe element is never re-parented or unmounted.
 */

const PlayerCtx = createContext(null);
export const usePlayer = () => useContext(PlayerCtx);

export function PlayerProvider({ children }) {
  const [video, setVideo] = useState(null); // { id, title, channel, thumbnail, embed_url }
  const [slotEl, setSlotEl] = useState(null); // ref el to the inline slot on Watch page
  const [minimized, setMinimized] = useState(false); // user dragged down
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

  // Whenever the user navigates back to the watch page of the current
  // video, drop minimized state so it occupies the inline slot again.
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

/** Slot the Watch page renders; the global iframe will be positioned to it. */
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
      {/* When the player is minimized but we're on the watch page,
         show a clear "tap to restore" placeholder. */}
      {video && minimized && (
        <RestoreOverlay videoId={video.id} />
      )}
    </div>
  );
}

function RestoreOverlay({ videoId }) {
  const { setMinimized } = usePlayer();
  return (
    <button
      onClick={() => setMinimized(false)}
      className="w-full h-full grid place-items-center text-neutral-300 bg-neutral-900 hover:bg-neutral-800"
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
  const [dragOffset, setDragOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onWatchPage = !!video && loc.pathname === `/watch/${video.id}`;
  // Show as inline (on top of the slot) only when we're on the watch
  // page AND the user hasn't dragged it down to mini.
  const inline = onWatchPage && !minimized && !!slotEl;
  // Avoid a mini-player flash during the brief moment between
  // PlayerProvider getting `video` and Watch's <PlayerSlot/> mounting.
  const hideForMount = onWatchPage && !minimized && !slotEl;

  // Continuously align the host element to the slot rectangle.
  useEffect(() => {
    if (!video) return;
    let raf = 0;
    const tick = () => {
      const host = hostRef.current;
      if (host) {
        if (inline && slotEl) {
          const r = slotEl.getBoundingClientRect();
          host.style.left = `${r.left}px`;
          host.style.top = `${r.top + dragOffset}px`;
          host.style.width = `${r.width}px`;
          host.style.height = `${r.height}px`;
          host.style.borderRadius = "0px";
          host.style.boxShadow = "none";
          host.style.opacity = dragOffset > 0
            ? `${Math.max(0.4, 1 - dragOffset / 400)}` : "1";
        } else {
          // YouTube-style mini player: thin bar at the bottom of the
          // screen with a small 16:9 thumbnail on the left and the
          // title/controls on the right. Sits ABOVE the mobile bottom
          // nav (h-14 = 56px) and the desktop has it bottom-right.
          const isMobile = window.innerWidth < 768;
          if (isMobile) {
            // Full-width bar above bottom nav, like YouTube mobile
            const barH = 64;          // total height of the mini bar
            const bottomNavH = 56;    // h-14
            host.style.left = `0px`;
            host.style.top = `${window.innerHeight - barH - bottomNavH}px`;
            host.style.width = `${window.innerWidth}px`;
            host.style.height = `${barH}px`;
            host.style.borderRadius = "0px";
            host.style.boxShadow = "0 -6px 20px rgba(0,0,0,.6)";
          } else {
            // Desktop: small floating bottom-right card
            const w = 320;
            const videoH = Math.round(w * 9 / 16); // 180
            const captionH = 40;
            host.style.left = `${window.innerWidth - w - 16}px`;
            host.style.top = `${window.innerHeight - videoH - captionH - 16}px`;
            host.style.width = `${w}px`;
            host.style.height = `${videoH + captionH}px`;
            host.style.borderRadius = "12px";
            host.style.boxShadow = "0 12px 40px rgba(0,0,0,.6)";
          }
          host.style.opacity = "1";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [video, inline, slotEl, dragOffset]);

  // Build the embed URL once per video. mute=1 + autoplay=1 ensures
  // the video starts immediately without YouTube's "click to play"
  // poster screen. We unmute via postMessage as soon as it is ready.
  const embedSrc = useMemo(() => {
    if (!video) return "";
    const base = video.embed_url
      || `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1&iv_load_policy=3&fs=1&playsinline=1&disablekb=0`;
    const sep = base.includes("?") ? "&" : "?";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}${sep}enablejsapi=1&mute=1&autoplay=1&origin=${encodeURIComponent(origin)}`;
  }, [video]);

  // postMessage bridge: handshake → unmute → track play state
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
        // Force playback immediately so the user never sees YouTube's
        // "click to play" poster, then unmute right after autoplay
        // kicks in (browsers require a muted autoplay first).
        try {
          iframe.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*"
          );
        } catch {}
        setTimeout(() => { send("unMute"); send("setVolume", [100]); send("playVideo"); }, 250);
      }
      if (d.event === "infoDelivery" && d.info) {
        if (d.info.playerState === 1) setPlaying(true);
        if (d.info.playerState === 2) setPlaying(false);
      }
    };
    window.addEventListener("message", onMsg);
    const handshake = setInterval(listening, 400);
    setTimeout(() => clearInterval(handshake), 4000);
    return () => {
      window.removeEventListener("message", onMsg);
      clearInterval(handshake);
    };
  }, [video, setPlaying]);

  const sendCmd = useCallback((func, args = []) => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func, args }), "*"
      );
    } catch {}
  }, []);

  // Drag-down to minimize (only on watch page when inline)
  useEffect(() => {
    if (!inline) { setDragOffset(0); return; }
    const host = hostRef.current;
    if (!host) return;
    const onStart = (e) => {
      const t = e.target;
      // Don't intercept clicks on the iframe controls themselves —
      // dragging only kicks in when started on our own overlay handle.
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

  // Stable layout: iframe is always at the same DOM position so it
  // never gets remounted when switching between inline / mini modes.
  // We just reposition it absolutely inside the host.
  const iframeStyle = inline
    ? { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", border: 0, display: "block" }
    : isMobile
    ? { position: "absolute", left: 0, top: 0, width: 110, height: "100%", border: 0, display: "block" }
    : { position: "absolute", left: 0, top: 0, width: "100%", height: "calc(100% - 40px)", border: 0, display: "block" };

  return (
    <div
      ref={hostRef}
      className={`ryh-player-host ${!inline && isMobile ? "ryh-mini-mobile" : ""}`}
      style={{
        position: "fixed",
        zIndex: 60,
        background: !inline && isMobile ? "#212121" : "#000",
        overflow: "hidden",
        transition: "border-radius .2s, box-shadow .2s, opacity .15s",
        visibility: hideForMount ? "hidden" : "visible",
      }}
      data-testid="player-host"
    >
      {/* THE iframe — always in the same DOM slot so React never remounts it. */}
      <iframe
        ref={iframeRef}
        src={embedSrc}
        title={video.title || "Player"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="no-referrer-when-downgrade"
        loading="eager"
        frameBorder="0"
        style={iframeStyle}
      />

      {/* INLINE: brand-cover (top-left only) + drag handle */}
      {inline && (
        <>
          <div className="ryh-yt-cover ryh-yt-cover-tl" />
          <div
            data-drag-handle="1"
            className="absolute top-0 left-0 right-0 h-12"
            style={{ cursor: "grab", zIndex: 5 }}
          />
        </>
      )}

      {/* MINI MOBILE: title + play/close to the right of the small video */}
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
            className="px-3 h-full grid place-items-center text-white hover:bg-white/10 shrink-0"
            data-testid="mini-player-play-btn"
            aria-label="Play/Pause"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={close}
            className="px-3 h-full grid place-items-center text-white hover:bg-white/10 shrink-0"
            data-testid="mini-player-close-btn"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* MINI DESKTOP: caption row at the bottom */}
      {!inline && !isMobile && (
        <div
          className="absolute left-0 right-0 bottom-0 flex items-center gap-1 px-2 bg-neutral-900 border-t border-white/10"
          style={{ height: 40 }}
          data-testid="mini-player-bar"
        >
          <button
            onClick={() => { playing ? sendCmd("pauseVideo") : sendCmd("playVideo"); }}
            className="p-1.5 rounded-full hover:bg-white/10 text-white shrink-0"
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
            className="p-1.5 rounded-full hover:bg-white/10 text-white shrink-0"
            data-testid="mini-player-expand-btn"
            aria-label="Expand"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={close}
            className="p-1.5 rounded-full hover:bg-white/10 text-white shrink-0"
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
