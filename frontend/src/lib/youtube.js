import { useEffect, useState, useCallback } from "react";
import { api } from "./api";

// State key in localStorage so the dropdown updates without re-login
const KEY = "ryh_yt_status";

export function useYouTube() {
  const [status, setStatus] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/youtube/auth/status");
      setStatus(data);
      localStorage.setItem(KEY, JSON.stringify(data));
      return data;
    } catch {
      setStatus(null);
      localStorage.removeItem(KEY);
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/youtube/auth/url");
      // Persist intended return URL so the callback page can route back
      try { localStorage.setItem("ryh_yt_return", window.location.pathname + window.location.search); } catch {}
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
      localStorage.removeItem(KEY);
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
