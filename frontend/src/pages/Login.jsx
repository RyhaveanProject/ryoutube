import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Send, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "../lib/auth";
import Logo from "../components/Logo";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { toast, Toaster } from "sonner";

const TELEGRAM_URL = "https://t.me/Ryhavean";

export default function Login() {
  const { user, deviceBlocked, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (user && !deviceBlocked) nav("/", { replace: true });
  }, [user, deviceBlocked, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      await login(email, password);
      toast.success("Welcome back");
      nav("/", { replace: true });
    } catch (e2) {
      const detail = e2?.response?.data?.detail || "Login failed";
      if (detail === "DEVICE_MISMATCH") {
        nav("/blocked", { replace: true });
        return;
      }
      setErr(detail);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "radial-gradient(ellipse at top, #1a0a0a 0%, #0a0a0a 60%)" }}>
      <Toaster theme="dark" richColors position="top-center" />
      <Card className="ryh-glass w-full max-w-md p-8 border-white/10 ryh-fade-in" data-testid="login-card">
        <div className="flex flex-col items-center mb-6">
          <Logo size={36} />
          <h1 className="text-2xl font-bold text-white mt-4 tracking-tight">Welcome back</h1>
          <p className="text-sm text-neutral-400 mt-1">Sign in to continue to Ryhavean YouTube</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-neutral-300 text-xs uppercase tracking-wider">Email</Label>
            <Input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email"
              className="ryh-input ryh-allow-copy mt-1.5 h-11 bg-neutral-900 border-neutral-700 text-white"
              placeholder="you@example.com"
              data-testid="login-email-input"
            />
          </div>
          <div>
            <Label className="text-neutral-300 text-xs uppercase tracking-wider">Password</Label>
            <div className="relative mt-1.5">
              <Input
                type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete="current-password"
                className="ryh-input ryh-allow-copy h-11 bg-neutral-900 border-neutral-700 text-white pr-10"
                placeholder="••••••••"
                data-testid="login-password-input"
              />
              <button
                type="button" onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                data-testid="login-toggle-password"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {err && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2" data-testid="login-error">
              <ShieldAlert className="w-4 h-4" /> {err}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-semibold" data-testid="login-submit-btn">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-neutral-500 text-xs">
          <div className="flex-1 h-px bg-white/10" />
          OR
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <a
          href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full h-11 rounded-md border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition"
          data-testid="login-register-telegram-btn"
        >
          <Send className="w-4 h-4" /> Register via Telegram @Ryhavean
        </a>

        <p className="text-[11px] text-neutral-500 mt-5 text-center leading-relaxed">
          Accounts are admin-managed. Contact <span className="text-blue-400">@Ryhavean</span> on Telegram to request access.
        </p>
      </Card>
    </div>
  );
}
