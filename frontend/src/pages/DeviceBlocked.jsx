import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import Logo from "../components/Logo";
import { Button } from "../components/ui/button";
import { useAuth } from "../lib/auth";

export default function DeviceBlocked() {
  const { logout, setDeviceBlocked, user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    document.title = "Device Blocked — Ryhavean YouTube";
  }, []);

  return (
    <div className="min-h-screen grid place-items-center px-4" style={{ background: "radial-gradient(ellipse at top, #2a0a0a 0%, #0a0a0a 60%)" }}>
      <div className="ryh-glass border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center ryh-fade-in" data-testid="device-blocked-card">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 grid place-items-center mb-4">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <Logo size={20} />
        <h1 className="text-xl font-bold text-white mt-4">Device not authorized</h1>
        <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
          Your account is already active on a different device. Each Ryhavean YouTube account is bound to one device for security.
        </p>
        <p className="text-xs text-neutral-500 mt-2">
          Contact admin <span className="text-blue-400">@Ryhavean</span> on Telegram to reset device binding.
        </p>

        <div className="flex flex-col gap-2 mt-6">
          <Button
            onClick={async () => {
              await logout();
              setDeviceBlocked(false);
              nav("/login", { replace: true });
            }}
            className="bg-white text-black hover:bg-neutral-200"
            data-testid="device-blocked-back-btn"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to login
          </Button>
        </div>

        {user?.email && (
          <div className="text-[11px] text-neutral-600 mt-4">Signed in as {user.email}</div>
        )}
      </div>
    </div>
  );
}
