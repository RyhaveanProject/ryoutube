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
 * Public shell — renders the Layout for ALL users (guest or signed-in).
 * Per user request, the app no longer forces a login wall: the general
 * feed is browsable without an account. Login still works for users who
 * want personalised history/likes/admin.
 */
function PublicShell({ children }) {
  const { ready, deviceBlocked } = useAuth();
  if (!ready) return <FullPageLoader />;
  if (deviceBlocked) return <Navigate to="/blocked" replace />;
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
