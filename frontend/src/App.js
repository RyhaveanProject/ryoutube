import React, { useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { PlayerProvider } from "./lib/player";
import { installCopyGuard } from "./lib/copyGuard";
import { installAdBlock } from "./lib/adBlock";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import DeviceBlocked from "./pages/DeviceBlocked";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Watch from "./pages/Watch";
import Library from "./pages/Library";
import Admin from "./pages/Admin";
import { HistoryPage, LikedPage, WatchLaterPage } from "./pages/Lists";
import YouTubeCallback from "./pages/YouTubeCallback";
import { Loader2 } from "lucide-react";

/**
 * Protected shell — every visitor MUST be authenticated.
 * Behaviour:
 *   - If the user is already signed in (token persisted in localStorage),
 *     auth.verify() resolves and we render the Layout — no extra prompt.
 *   - If the user is a guest (no valid token), we redirect to /login.
 *   - The /login, /blocked and /youtube/callback routes stay public so
 *     fresh visitors and OAuth redirects still work.
 */
function PublicShell({ children }) {
  const { ready, deviceBlocked, user } = useAuth();
  const loc = useLocation();
  if (!ready) return <FullPageLoader />;
  if (deviceBlocked) return <Navigate to="/blocked" replace />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <Layout>{children}</Layout>;
}

function FullPageLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-black" data-testid="app-loader">
      <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
    </div>
  );
}

function GuardedAdmin() {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <Admin />;
}

function App() {
  useEffect(() => {
    installCopyGuard();
    installAdBlock();
  }, []);

  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <PlayerProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/blocked" element={<DeviceBlocked />} />
              <Route path="/youtube/callback" element={<YouTubeCallback />} />
              <Route path="/" element={<PublicShell><Home /></PublicShell>} />
              <Route path="/search" element={<PublicShell><Search /></PublicShell>} />
              <Route path="/watch/:id" element={<PublicShell><Watch /></PublicShell>} />
              <Route path="/library" element={<PublicShell><Library /></PublicShell>} />
              <Route path="/history" element={<PublicShell><HistoryPage /></PublicShell>} />
              <Route path="/liked" element={<PublicShell><LikedPage /></PublicShell>} />
              <Route path="/watch-later" element={<PublicShell><WatchLaterPage /></PublicShell>} />
              <Route path="/admin" element={<PublicShell><GuardedAdmin /></PublicShell>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PlayerProvider>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
