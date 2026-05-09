import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import axios from "axios";

/**
 * Handles the redirect back from Google after the user grants consent.
 *
 * IMPORTANT: This route is PUBLIC (not wrapped in <ProtectedBare>).
 * Reason: when returning from an external OAuth redirect, the AuthProvider
 * is still running its initial /auth/me verification. If we sit behind a
 * guard, users get bounced to /login the moment that verification has
 * even a brief hiccup (slow network, transient 401, etc.) — exactly the
 * "logs in fine then sends me back to the login page" bug we are fixing.
 *
 * To stay self-sufficient, this component:
 *   1. Reads the bearer token directly from localStorage (NOT from React
 *      context) so it doesn't depend on AuthProvider being "ready".
 *   2. Talks to the API with its own axios instance, so the global
 *      response interceptor (which clears the session on any 401) cannot
 *      log the user out as a side-effect of a YouTube-only error.
 *
 * Two flows are supported, depending on where GOOGLE_REDIRECT_URI points:
 *
 *   A) Redirect URI -> FRONTEND/youtube/callback?code=...&state=...
 *      The frontend calls POST /api/youtube/auth/exchange with the code.
 *
 *   B) Redirect URI -> BACKEND/youtube/callback?code=...&state=...
 *      The backend exchanges the code server-side, then redirects the
 *      browser back here with ?yt=ok or ?yt=err&msg=... so we can refresh
 *      the YT status and bounce the user back to where they came from.
 */
export default function YouTubeCallback() {
  const nav = useNavigate();
  const [phase, setPhase] = useState("working"); // working | done | error
  const [msg, setMsg] = useState("Connecting your YouTube account…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const err = params.get("error");
    const yt = params.get("yt");           // server-side flow flag (ok / err)
    const ytMsg = params.get("msg");

    // Snapshot the auth tokens from localStorage so we don't depend on
    // React context which may not be ready immediately after redirect.
    const lsToken = (() => {
      try { return localStorage.getItem("ryh_token"); } catch { return null; }
    })();
    const lsDeviceId = (() => {
      try { return localStorage.getItem("ryh_device_id"); } catch { return null; }
    })();
    const lsUser = (() => {
      try { return JSON.parse(localStorage.getItem("ryh_user") || "null"); }
      catch { return null; }
    })();

    const back = () => {
      let to = "/";
      try { to = localStorage.getItem("ryh_yt_return") || "/"; } catch {}
      try { localStorage.removeItem("ryh_yt_return"); } catch {}
      // If the user genuinely has no session at all, only THEN send them
      // to /login. Otherwise stay inside the app — this is the core of
      // the post-OAuth-redirects-to-login fix.
      if (!lsToken || !lsUser) {
        nav("/login", { replace: true });
      } else {
        nav(to, { replace: true });
      }
    };

    // ---- Flow B: backend already finished the exchange ----
    if (yt === "ok") {
      try { localStorage.removeItem("ryh_yt_status"); } catch {}
      setPhase("done"); setMsg("YouTube connected. Redirecting…");
      setTimeout(back, 700);
      return;
    }
    if (yt === "err") {
      setPhase("error"); setMsg(ytMsg || "Could not connect to YouTube.");
      setTimeout(back, 2400);
      return;
    }

    // ---- Flow A: frontend exchanges the code ----
    if (err) {
      setPhase("error"); setMsg(`Google rejected the request: ${err}`);
      setTimeout(back, 2200);
      return;
    }
    if (!code) {
      setPhase("error"); setMsg("Missing authorization code.");
      setTimeout(back, 2000);
      return;
    }

    (async () => {
      try {
        // Use a LOCAL axios instance so the global 401 interceptor in
        // ../lib/api.js can't accidentally wipe the user's session if
        // the YouTube exchange itself returns 401 for any reason.
        const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
        const headers = {};
        if (lsToken) headers["Authorization"] = `Bearer ${lsToken}`;
        if (lsDeviceId) headers["X-Device-Id"] = lsDeviceId;
        await axios.post(
          `${BACKEND_URL}/api/youtube/auth/exchange`,
          { code, state },
          { headers, timeout: 20000 }
        );
        try { localStorage.removeItem("ryh_yt_status"); } catch {}
        setPhase("done"); setMsg("YouTube connected. Redirecting…");
        setTimeout(back, 700);
      } catch (e) {
        const detail = e?.response?.data?.detail || "Connection failed";
        setPhase("error"); setMsg(detail);
        setTimeout(back, 2400);
      }
    })();
  }, [nav]);

  return (
    <div className="min-h-screen grid place-items-center bg-black text-white px-4">
      <div className="ryh-glass rounded-2xl border border-white/10 px-8 py-7 max-w-md w-full text-center">
        {phase === "working" && (
          <>
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-red-500" />
            <h2 className="text-xl font-semibold mt-4" data-testid="yt-cb-title">Linking YouTube</h2>
          </>
        )}
        {phase === "done" && (
          <>
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
            <h2 className="text-xl font-semibold mt-4" data-testid="yt-cb-title">Connected</h2>
          </>
        )}
        {phase === "error" && (
          <>
            <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
            <h2 className="text-xl font-semibold mt-4" data-testid="yt-cb-title">Could not connect</h2>
          </>
        )}
        <p className="text-sm text-neutral-400 mt-2" data-testid="yt-cb-message">{msg}</p>
      </div>
    </div>
  );
}
