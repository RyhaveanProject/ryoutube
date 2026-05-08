import React, { useEffect } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { installCopyGuard } from "./lib/copyGuard";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import DeviceBlocked from "./pages/DeviceBlocked";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Watch from "./pages/Watch";
import Library from "./pages/Library";
import Admin from "./pages/Admin";
import { HistoryPage, LikedPage, WatchLaterPage } from "./pages/Lists";
import { Loader2 } from "lucide-react";

function ProtectedShell({ children }) {
  const { user, ready, deviceBlocked } = useAuth();
  const loc = useLocation();
  if (!ready) return <FullPageLoader />;
  if (deviceBlocked) return <Navigate to="/blocked" replace />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Layout>{children}</Layout>;
}

function FullPageLoader() {
  return (
    <div className="min-h-screen grid place-items-center bg-black">
      <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
    </div>
  );
}

function GuardedAdmin() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  return <Admin />;
}

function App() {
  useEffect(() => {
    installCopyGuard();
  }, []);

  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/blocked" element={<DeviceBlocked />} />
            <Route path="/" element={<ProtectedShell><Home /></ProtectedShell>} />
            <Route path="/search" element={<ProtectedShell><Search /></ProtectedShell>} />
            <Route path="/watch/:id" element={<ProtectedShell><Watch /></ProtectedShell>} />
            <Route path="/library" element={<ProtectedShell><Library /></ProtectedShell>} />
            <Route path="/history" element={<ProtectedShell><HistoryPage /></ProtectedShell>} />
            <Route path="/liked" element={<ProtectedShell><LikedPage /></ProtectedShell>} />
            <Route path="/watch-later" element={<ProtectedShell><WatchLaterPage /></ProtectedShell>} />
            <Route path="/admin" element={<ProtectedShell><GuardedAdmin /></ProtectedShell>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
