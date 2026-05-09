import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, Bell, Menu, Home, History, ThumbsUp, Clock, Library, Shield, LogOut, X, Youtube, LinkIcon, Unlink2, Loader2 } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "../lib/auth";
import { useYouTube } from "../lib/youtube";
import { api } from "../lib/api";

const NAV = [
  { to: "/", label: "Home", icon: Home, testid: "nav-home" },
  { to: "/library", label: "Library", icon: Library, testid: "nav-library" },
  { to: "/history", label: "History", icon: History, testid: "nav-history" },
  { to: "/liked", label: "Liked", icon: ThumbsUp, testid: "nav-liked" },
  { to: "/watch-later", label: "Watch Later", icon: Clock, testid: "nav-watch-later" },
];

const BOTTOM_NAV = [
  { to: "/", label: "Home", icon: Home, testid: "bnav-home" },
  { to: "/search", label: "Search", icon: Search, testid: "bnav-search" },
  { to: "/library", label: "Library", icon: Library, testid: "bnav-library" },
  { to: "/history", label: "History", icon: History, testid: "bnav-history" },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const yt = useYouTube();
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const sugTimer = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(loc.search);
    if (loc.pathname === "/search") setQ(params.get("q") || "");
  }, [loc]);

  // Close profile menu on route change
  useEffect(() => { setProfileOpen(false); setSidebarOpen(false); }, [loc.pathname, loc.search]);

  // Lock body scroll when drawer/menu open (mobile)
  useEffect(() => {
    if (sidebarOpen) document.body.classList.add("ryh-lock");
    else document.body.classList.remove("ryh-lock");
    return () => document.body.classList.remove("ryh-lock");
  }, [sidebarOpen]);

  // Close profile menu on outside click / Escape
  useEffect(() => {
    if (!profileOpen) return;
    const onDown = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === "Escape") setProfileOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  useEffect(() => {
    if (sugTimer.current) clearTimeout(sugTimer.current);
    if (!q.trim()) { setSuggestions([]); return; }
    sugTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/suggest", { params: { q } });
        setSuggestions(data.suggestions || []);
      } catch { /* ignore */ }
    }, 200);
    return () => sugTimer.current && clearTimeout(sugTimer.current);
  }, [q]);

  const submit = (e) => {
    e?.preventDefault?.();
    const v = q.trim();
    if (!v) return;
    setShowSug(false);
    nav(`/search?q=${encodeURIComponent(v)}`);
  };

  const isAdmin = user?.role === "admin";

  const handleConnectYT = async () => {
    setProfileOpen(false);
    try { await yt.connect(); } catch { /* ignored */ }
  };
  const handleDisconnectYT = async () => {
    try { await yt.disconnect(); } catch { /* ignored */ }
  };

  return (
    <div className="min-h-screen ryh-no-copy ryh-no-overflow-x" style={{ background: "var(--yt-bg)" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 ryh-glass border-b border-white/5 ryh-header">
        <div className="flex items-center gap-1.5 sm:gap-3 px-2 sm:px-5 h-14">
          <button
            className="p-2 rounded-full hover:bg-white/10 shrink-0"
            onClick={() => setSidebarOpen(true)}
            data-testid="open-sidebar-btn"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link to="/" data-testid="header-logo-link" className="shrink-0">
            <Logo size={22} />
          </Link>

          <form onSubmit={submit} className="flex-1 max-w-2xl mx-auto hidden md:flex items-center">
            <div className="flex-1 relative">
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setShowSug(true); }}
                onFocus={() => setShowSug(true)}
                onBlur={() => setTimeout(() => setShowSug(false), 180)}
                placeholder="Search"
                className="ryh-input ryh-allow-copy w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-l-full px-5 h-10 text-[15px] placeholder:text-neutral-500"
                data-testid="header-search-input"
              />
              {showSug && suggestions.length > 0 && (
                <div className="absolute top-12 left-0 right-0 ryh-glass rounded-xl overflow-hidden border border-white/10 shadow-2xl z-50">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={() => { setQ(s); setShowSug(false); nav(`/search?q=${encodeURIComponent(s)}`); }}
                      className="block w-full text-left px-4 py-2 hover:bg-white/10 text-[14px] text-white"
                      data-testid={`suggestion-${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              className="h-10 px-6 bg-neutral-800 hover:bg-neutral-700 border border-l-0 border-neutral-700 rounded-r-full grid place-items-center"
              data-testid="header-search-btn"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>
          </form>

          {/* Spacer pushes the right cluster to edge on mobile */}
          <div className="flex-1 md:hidden" />

          <button
            className="md:hidden p-2 rounded-full hover:bg-white/10 shrink-0"
            onClick={() => nav("/search")}
            data-testid="mobile-search-btn"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Quick YouTube connect on mobile (visible when not connected) */}
          {!yt.connected && (
            <button
              onClick={handleConnectYT}
              className="md:hidden p-2 rounded-full hover:bg-red-500/15 shrink-0"
              data-testid="mobile-yt-connect-btn"
              aria-label="Connect YouTube"
              title="Connect YouTube"
            >
              {yt.loading ? <Loader2 className="w-5 h-5 animate-spin text-red-500" /> : <Youtube className="w-5 h-5 text-red-500" />}
            </button>
          )}

          <button className="p-2 rounded-full hover:bg-white/10 hidden sm:grid place-items-center shrink-0" data-testid="header-notif-btn" aria-label="Notifications">
            <Bell className="w-5 h-5" />
          </button>

          <div className="relative shrink-0" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-red-700 grid place-items-center text-white font-bold text-sm overflow-hidden focus:outline-none focus:ring-2 focus:ring-red-500/60"
              data-testid="header-profile-btn"
            >
              {yt.connected && yt.google?.picture ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <img src={yt.google.picture} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                (user?.email || "U").charAt(0).toUpperCase()
              )}
            </button>
            {profileOpen && (
            <div
              role="menu"
              className="ryh-profile-menu absolute right-0 top-11 ryh-glass rounded-xl border border-white/10 shadow-2xl p-2 min-w-[260px] max-w-[calc(100vw-1rem)] z-50"
              data-testid="header-profile-menu"
            >
              <div className="px-3 py-2 border-b border-white/10">
                <div className="text-[13px] text-white truncate">{user?.email}</div>
                <div className="text-[11px] text-neutral-400">{user?.role}</div>
              </div>

              {/* YouTube account block — always visible above Sign out */}
              <div className="border-b border-white/10 py-1.5">
                {yt.connected ? (
                  <>
                    <div className="px-3 py-2 flex items-center gap-2.5">
                      {yt.google?.picture ? (
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <img src={yt.google.picture} className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                      ) : (
                        <Youtube className="w-5 h-5 text-red-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] text-white truncate" data-testid="yt-connected-name">
                          {yt.channel?.title || yt.google?.name || yt.google?.email || "YouTube"}
                        </div>
                        <div className="text-[10.5px] text-emerald-400">Connected</div>
                      </div>
                    </div>
                    <button
                      onClick={handleDisconnectYT}
                      disabled={yt.loading}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm w-full text-left text-white"
                      data-testid="yt-disconnect-btn"
                    >
                      {yt.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink2 className="w-4 h-4 text-red-500" />}
                      <span>Disconnect YouTube</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleConnectYT}
                    disabled={yt.loading}
                    className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-red-500/15 rounded-lg text-sm w-full text-left bg-red-500/5 border border-red-500/20"
                    data-testid="yt-connect-btn"
                    title="Connect your YouTube account"
                  >
                    {yt.loading
                      ? <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                      : <Youtube className="w-5 h-5 text-red-500 shrink-0" />}
                    <span className="text-white font-medium">YouTube Login</span>
                    <LinkIcon className="w-3.5 h-3.5 ml-auto text-neutral-300" />
                  </button>
                )}
              </div>

              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm text-white"
                  data-testid="profile-admin-link"
                >
                  <Shield className="w-4 h-4" /> Admin Panel
                </Link>
              )}
              <button
                onClick={async () => { setProfileOpen(false); await logout(); nav("/login"); }}
                className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 rounded-lg text-sm w-full text-left text-white"
                data-testid="profile-logout-btn"
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
            )}
          </div>
        </div>

        {/* Top-left developer credit (desktop only) */}
        <div className="absolute left-2 -bottom-5 text-[10px] text-neutral-500 hidden md:block pointer-events-none select-none">
          Developer @Ryhavean
        </div>
      </header>

      <div className="flex">
        {/* Persistent left sidebar (desktop) */}
        <aside className="hidden lg:block w-60 shrink-0 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto py-3 px-2">
          <SidebarLinks isAdmin={isAdmin} />
        </aside>

        {/* Mobile drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" onClick={() => setSidebarOpen(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <aside
              className="absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] ryh-glass border-r border-white/10 p-3 overflow-y-auto pt-safe pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3 px-2">
                <Logo size={20} />
                <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-full hover:bg-white/10" data-testid="close-sidebar-btn">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <SidebarLinks isAdmin={isAdmin} onClick={() => setSidebarOpen(false)} />

              {/* Drawer YouTube login affordance */}
              {!yt.connected && (
                <button
                  onClick={() => { setSidebarOpen(false); handleConnectYT(); }}
                  className="mt-4 w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-white text-sm"
                  data-testid="drawer-yt-connect-btn"
                >
                  {yt.loading
                    ? <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    : <Youtube className="w-5 h-5 text-red-500" />}
                  <span className="font-medium">YouTube Login</span>
                  <LinkIcon className="w-3.5 h-3.5 ml-auto text-neutral-300" />
                </button>
              )}
            </aside>
          </div>
        )}

        <main className="flex-1 min-w-0 pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 md:hidden ryh-glass border-t border-white/10 pb-safe"
        data-testid="mobile-bottom-nav"
      >
        <div className="flex items-center justify-around h-14">
          {BOTTOM_NAV.map((n) => {
            const active = loc.pathname === n.to || (n.to === "/search" && loc.pathname.startsWith("/search"));
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full ${active ? "text-white" : "text-neutral-400"}`}
                data-testid={n.testid}
              >
                <n.icon className="w-5 h-5" />
                <span className="text-[10px]">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function SidebarLinks({ isAdmin, onClick }) {
  const loc = useLocation();
  return (
    <nav className="space-y-1">
      {NAV.map((n) => {
        const active = loc.pathname === n.to;
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onClick}
            className={`flex items-center gap-4 px-3 py-2.5 rounded-lg text-[14px] ${active ? "bg-white/10 text-white" : "text-neutral-200 hover:bg-white/5"}`}
            data-testid={n.testid}
          >
            <n.icon className="w-5 h-5" /> {n.label}
          </Link>
        );
      })}
      {isAdmin && (
        <Link
          to="/admin"
          onClick={onClick}
          className={`flex items-center gap-4 px-3 py-2.5 rounded-lg text-[14px] ${loc.pathname === "/admin" ? "bg-white/10 text-white" : "text-neutral-200 hover:bg-white/5"}`}
          data-testid="nav-admin"
        >
          <Shield className="w-5 h-5" /> Admin
        </Link>
      )}
    </nav>
  );
}
