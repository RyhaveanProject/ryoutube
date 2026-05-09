import React, { useEffect, useRef, useState } from "react";
import { Loader2, ArrowDown } from "lucide-react";

/**
 * PullToRefresh — native-feeling "drag down to reload" gesture.
 *
 * Wraps any scrollable area; only triggers when the user starts a touch
 * at scrollTop === 0 and pulls downward. The actual refresh is delegated
 * to the parent via the `onRefresh` callback (must return a Promise).
 *
 * Works on iOS Safari, Android Chrome, and standalone PWA. Desktop is
 * a passive no-op (touch events never fire on a mouse).
 */
const THRESHOLD = 64;        // pixels needed to trigger refresh
const MAX_PULL = 120;        // visual cap

export default function PullToRefresh({ onRefresh, children }) {
  const wrapRef = useRef(null);
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onStart = (e) => {
      // Only when the page is scrolled to the very top
      if (window.scrollY > 0 || refreshing) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onMove = (e) => {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      // Slow down pull beyond threshold (iOS-like rubber band)
      const eased = Math.min(MAX_PULL, dy * 0.55);
      setPull(eased);
    };

    const onEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      const triggered = pull >= THRESHOLD;
      if (triggered) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try { await onRefresh?.(); } catch {}
        setRefreshing(false);
      }
      setPull(0);
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [pull, refreshing, onRefresh]);

  return (
    <div ref={wrapRef} className="relative" data-testid="ptr-wrap">
      {/* Indicator */}
      <div
        className="absolute left-0 right-0 top-0 grid place-items-center pointer-events-none"
        style={{
          height: `${pull}px`,
          opacity: pull > 8 ? 1 : 0,
          transition: refreshing ? "height .25s ease" : "none",
        }}
        data-testid="ptr-indicator"
      >
        {refreshing ? (
          <Loader2 className="w-5 h-5 animate-spin text-white" />
        ) : (
          <ArrowDown
            className="w-5 h-5 text-white"
            style={{
              transform: `rotate(${Math.min(180, (pull / THRESHOLD) * 180)}deg)`,
              transition: "transform .15s ease",
            }}
          />
        )}
      </div>
      <div
        style={{
          transform: `translate3d(0, ${pull}px, 0)`,
          transition: pulling.current ? "none" : "transform .25s ease",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
