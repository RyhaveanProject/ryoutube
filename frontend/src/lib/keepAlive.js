/**
 * Keep-alive heartbeat
 * --------------------
 * Free-tier backend hosts (Render, Fly, Railway, …) put a dyno to sleep
 * after ~15 min of inactivity. This module periodically pings the
 * backend's /api/ping endpoint so the server is always warm.
 *
 *  - Runs every 10 minutes while the app/PWA is open.
 *  - Pauses when the document is hidden, resumes on `visibilitychange`.
 *  - Survives Page Visibility / mobile background-throttling by
 *    re-arming itself on visibility change.
 *  - Uses navigator.sendBeacon when leaving the page so the server
 *    receives one last keep-alive without keeping the tab awake.
 */
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const PING_URL = `${BACKEND_URL}/api/ping`;
const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 min

let timerId = null;
let started = false;

async function ping() {
  try {
    await axios.get(PING_URL, { timeout: 8000 });
  } catch {
    /* ignore — next interval will retry */
  }
}

function arm() {
  if (timerId) return;
  timerId = setInterval(ping, PING_INTERVAL_MS);
}

function disarm() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function onVisibility() {
  if (document.visibilityState === "visible") {
    ping();
    arm();
  } else {
    disarm();
  }
}

function onBeforeUnload() {
  if ("sendBeacon" in navigator) {
    try { navigator.sendBeacon(PING_URL); } catch {}
  }
}

export function startKeepAlive() {
  if (started || typeof window === "undefined") return;
  started = true;
  ping();
  arm();
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("beforeunload", onBeforeUnload);
  window.addEventListener("pagehide", onBeforeUnload);
}

export function stopKeepAlive() {
  disarm();
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("beforeunload", onBeforeUnload);
  window.removeEventListener("pagehide", onBeforeUnload);
  started = false;
}
