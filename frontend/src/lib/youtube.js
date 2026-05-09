import { useEffect, useState, useCallback } from "react";
import { api } from "./api";

// State key in localStorage so the dropdown updates without re-login
const KEY = "ryh_yt_status";

/**
 * PWA detection. Google's OAuth screen actively rejects "embedded
 * browsers" (display-mode: standalone is treated as an in-app
 * webview on Android and Chrome PWA). To make the YouTube login
 * work identically on the normal web app and on the installed PWA
 * we open the auth URL in the system browser via `_blank` whenever
 * we detect a standalone display, and fall back to `_self`
 * (full-page redirect) on a regular browser tab.
 */
function isPwaStandalone() {
  try {
    if (typeof window === "undefined") return false;
    const mq = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone = !!window.navigator && window.navigator.standalone === true;
    return !!(mq || iosStandalone);
  } catch { return false; }
}

export function useYouTube() {
  // We DELIBERATELY do NOT seed state from localStorage on first render.
  // Previously the dropdown / Home banner kept showing the *previous*
  // user's YouTube name until the network call completed — that's the
  // "saytda əvvəl ki Youtube hesabımın adı yazır" bug. Now we always
  // ask the backend whose token we currently hold.
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/youtube/auth/status");
      setStatus(data);
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
      return data;
    } catch {
      setStatus(null);
      try { localStorage.removeItem(KEY); } catch {}
      return null;
    }
  }, []);

  useEffect(() => {
    refresh();
    const onRefresh = () => { setStatus(null); refresh(); };
    window.addEventListener("ryh:yt-refresh", onRefresh);
    // When the standalone PWA becomes visible again after the user
    // completed Google OAuth in an external Chrome tab, re-pull the
    // status so the UI updates without a manual reload.
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("ryh:yt-refresh", onRefresh);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/youtube/auth/url");
      try { localStorage.setItem("ryh_yt_return", window.location.pathname + window.location.search); } catch {}
      if (isPwaStandalone()) {
        // Open Google's OAuth UI in the SYSTEM BROWSER. Standalone
        // PWAs are treated as in-app webviews by Google and the
        // login is rejected with "disallowed_useragent". Opening
        // _blank breaks out of the PWA shell into Safari / Chrome
        // where login completes; the existing /youtube/callback
        // route handles the bounce-back.
        const w = window.open(data.url, "_blank", "noopener,noreferrer");
        // Some PWAs block window.open silently — fall back to
        // location replace so the user is never stranded.
        if (!w) window.location.href = data.url;
        // Reset loading after a beat so the button is usable on
        // return; refresh() in onVis will pick up the new status.
        setTimeout(() => setLoading(false), 1500);
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      setLoading(false);
      throw e;
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    try {
      await api.post("/youtube/auth/disconnect");
      try { localStorage.removeItem(KEY); } catch {}
      setStatus({ connected: false, configured: status?.configured ?? true });
    } finally {
      setLoading(false);
    }
  }, [status]);

  return {
    status,
    loading,
    connected: !!status?.connected,
    configured: status?.configured !== false,
    google: status?.google,
    channel: status?.channel,
    connect, disconnect, refresh,
  };
}
