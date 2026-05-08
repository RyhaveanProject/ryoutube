import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAuthHeaders } from "./api";
import { getDeviceId } from "./device";

const AuthCtx = createContext(null);

const TOKEN_KEY = "ryh_token";
const USER_KEY = "ryh_user";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch { return null; }
  });
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAuthHeaders({ token, deviceId: getDeviceId() });
  }, [token]);

  const verify = useCallback(async () => {
    if (!token) { setReady(true); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      localStorage.setItem(USER_KEY, JSON.stringify(data));
    } catch {
      // handled by interceptors
    } finally {
      setReady(true);
    }
  }, [token]);

  useEffect(() => {
    verify();
    const onMismatch = () => setDeviceBlocked(true);
    const onUnauth = () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setToken(null); setUser(null);
    };
    window.addEventListener("ryh:device-mismatch", onMismatch);
    window.addEventListener("ryh:unauthorized", onUnauth);
    return () => {
      window.removeEventListener("ryh:device-mismatch", onMismatch);
      window.removeEventListener("ryh:unauthorized", onUnauth);
    };
  }, [verify]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", {
      email, password, device_id: getDeviceId(),
    });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setDeviceBlocked(false);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null); setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, token, ready, deviceBlocked, login, logout, setDeviceBlocked }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

