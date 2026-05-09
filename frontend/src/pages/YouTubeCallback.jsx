import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "../lib/api";

/**
 * Handles the redirect back from Google after the user grants consent.
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

    const back = () => {
      let to = "/";
      try { to = localStorage.getItem("ryh_yt_return") || "/"; } catch {}
      try { localStorage.removeItem("ryh_yt_return"); } catch {}
      nav(to, { replace: true });
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
        await api.post("/youtube/auth/exchange", { code, state });
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
