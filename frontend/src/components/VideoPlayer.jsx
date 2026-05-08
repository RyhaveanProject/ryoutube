import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Rewind, FastForward, PictureInPicture2,
} from "lucide-react";
import { formatDuration } from "../lib/format";

/**
 * VideoPlayer — custom controls over <video>.
 * Features: 10s skip, fullscreen, PiP, autoplay-next callback,
 * progress reporting, mini player on scroll handled by parent.
 */
export default function VideoPlayer({
  src,
  poster,
  startAt = 0,
  onProgress,
  onEnded,
  autoPlay = true,
}) {
  const ref = useRef(null);
  const wrapRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(1);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [fs, setFs] = useState(false);
  const [showCtrl, setShowCtrl] = useState(true);
  const hideTimer = useRef(null);

  // Reset playback state when source changes
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    setTime(0); setDur(0); setBuffered(0); setPlaying(false);
    if (src) {
      v.load();
      if (startAt > 0) v.currentTime = startAt;
      if (autoPlay) v.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => {
      setTime(v.currentTime);
      onProgress && onProgress(v.currentTime, v.duration);
      try {
        if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
      } catch {}
    };
    const onMeta = () => setDur(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => onEnded && onEnded();
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnd);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnd);
    };
  }, [onProgress, onEnded]);

  const toggle = useCallback(() => {
    const v = ref.current; if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }, []);

  const seekBy = useCallback((delta) => {
    const v = ref.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + delta));
  }, []);

  const seekTo = (val) => {
    const v = ref.current; if (!v) return;
    v.currentTime = (val / 100) * (v.duration || 0);
  };

  const toggleMute = () => {
    const v = ref.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
  };

  const setVolume = (val) => {
    const v = ref.current; if (!v) return;
    v.volume = val; setVol(val);
    if (val > 0 && v.muted) { v.muted = false; setMuted(false); }
  };

  const toggleFs = async () => {
    const wrap = wrapRef.current; if (!wrap) return;
    if (!document.fullscreenElement) {
      await wrap.requestFullscreen?.();
      setFs(true);
    } else {
      await document.exitFullscreen?.();
      setFs(false);
    }
  };

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePip = async () => {
    const v = ref.current; if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture?.();
    } catch {}
  };

  const showControls = () => {
    setShowCtrl(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => { if (playing) setShowCtrl(false); }, 2500);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
      else if (e.key === "ArrowLeft" || e.key === "j") seekBy(-10);
      else if (e.key === "ArrowRight" || e.key === "l") seekBy(10);
      else if (e.key === "f") toggleFs();
      else if (e.key === "m") toggleMute();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line
  }, [toggle, seekBy]);

  const pct = dur ? (time / dur) * 100 : 0;
  const bufPct = dur ? (buffered / dur) * 100 : 0;

  return (
    <div
      ref={wrapRef}
      className="relative w-full bg-black aspect-video group select-none"
      onMouseMove={showControls}
      onMouseLeave={() => playing && setShowCtrl(false)}
      onClick={toggle}
      data-testid="video-player"
    >
      <video
        ref={ref}
        src={src}
        poster={poster}
        playsInline
        className="absolute inset-0 w-full h-full"
        crossOrigin="anonymous"
      />

      {!src && (
        <div className="absolute inset-0 grid place-items-center text-neutral-400">
          Loading…
        </div>
      )}

      {/* Controls overlay */}
      <div
        className={`absolute inset-x-0 bottom-0 px-3 pb-2 pt-10 bg-gradient-to-t from-black/80 to-transparent transition-opacity ${showCtrl ? "opacity-100" : "opacity-0"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress */}
        <div className="relative h-1 bg-white/20 rounded-full mb-2 cursor-pointer"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seekTo(((e.clientX - r.left) / r.width) * 100);
          }}
          data-testid="player-progress-bar"
        >
          <div className="absolute left-0 top-0 h-full bg-white/30 rounded-full" style={{ width: `${bufPct}%` }} />
          <div className="absolute left-0 top-0 h-full bg-red-600 rounded-full" style={{ width: `${pct}%` }} />
        </div>

        <div className="flex items-center gap-2 text-white">
          <button onClick={toggle} className="p-2 hover:bg-white/15 rounded-full" data-testid="player-play-btn" aria-label="Play/Pause">
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button onClick={() => seekBy(-10)} className="p-2 hover:bg-white/15 rounded-full" data-testid="player-back10-btn" aria-label="Back 10 seconds">
            <Rewind className="w-5 h-5" />
          </button>
          <button onClick={() => seekBy(10)} className="p-2 hover:bg-white/15 rounded-full" data-testid="player-fwd10-btn" aria-label="Forward 10 seconds">
            <FastForward className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 group/volume">
            <button onClick={toggleMute} className="p-2 hover:bg-white/15 rounded-full" data-testid="player-mute-btn" aria-label="Mute">
              {muted || vol === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range" min="0" max="1" step="0.05"
              value={muted ? 0 : vol}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-0 group-hover/volume:w-20 transition-all duration-200 accent-white"
              data-testid="player-volume-slider"
            />
          </div>

          <div className="text-[12px] text-white/85 ml-1">
            {formatDuration(time)} / {formatDuration(dur)}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button onClick={togglePip} className="p-2 hover:bg-white/15 rounded-full" data-testid="player-pip-btn" aria-label="Picture in picture">
              <PictureInPicture2 className="w-5 h-5" />
            </button>
            <button onClick={toggleFs} className="p-2 hover:bg-white/15 rounded-full" data-testid="player-fs-btn" aria-label="Fullscreen">
              {fs ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
