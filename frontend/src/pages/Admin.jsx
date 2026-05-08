import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, Trash2, RotateCcw, Power, Loader2, TrendingUp, Search, Shield } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card } from "../components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { toast, Toaster } from "sonner";

export default function Admin() {
  const { user } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (user && user.role !== "admin") nav("/", { replace: true });
  }, [user, nav]);

  if (!user || user.role !== "admin") return null;

  return (
    <div className="px-3 sm:px-6 py-6 max-w-6xl">
      <Toaster theme="dark" richColors position="top-center" />
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-red-500/20 grid place-items-center">
          <Shield className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          <p className="text-sm text-neutral-400">Manage users & trends</p>
        </div>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-neutral-900">
          <TabsTrigger value="users" data-testid="admin-tab-users">Users</TabsTrigger>
          <TabsTrigger value="trends" data-testid="admin-tab-trends">Trend manipulation</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-6"><UsersTab /></TabsContent>
        <TabsContent value="trends" className="mt-6"><TrendsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/admin/users"); setUsers(data.users || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/admin/users", form);
      toast.success("User created");
      setOpen(false);
      setForm({ email: "", password: "", name: "" });
      load();
    } catch (e2) {
      toast.error(e2?.response?.data?.detail || "Failed to create");
    } finally { setCreating(false); }
  };

  const action = async (u, op) => {
    try {
      if (op === "delete") {
        if (!window.confirm(`Delete ${u.email}?`)) return;
        await api.delete(`/admin/users/${u.id}`);
      } else if (op === "reset") {
        await api.patch(`/admin/users/${u.id}`, { reset_device: true });
      } else if (op === "toggle") {
        await api.patch(`/admin/users/${u.id}`, { active: !u.active });
      }
      toast.success("Updated");
      load();
    } catch { toast.error("Failed"); }
  };

  return (
    <Card className="bg-neutral-900 border-neutral-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-neutral-400">{users.length} users</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-red-600 hover:bg-red-700" data-testid="admin-create-user-btn">
              <UserPlus className="w-4 h-4 mr-2" /> Create user
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-neutral-900 border-neutral-800 text-white">
            <DialogHeader><DialogTitle>Create new user</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div>
                <Label className="text-neutral-300 text-xs">Email</Label>
                <Input
                  required type="email" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="ryh-input ryh-allow-copy bg-neutral-800 border-neutral-700 text-white mt-1"
                  data-testid="admin-create-email"
                />
              </div>
              <div>
                <Label className="text-neutral-300 text-xs">Password</Label>
                <Input
                  required type="text" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="ryh-input ryh-allow-copy bg-neutral-800 border-neutral-700 text-white mt-1"
                  data-testid="admin-create-password"
                />
              </div>
              <div>
                <Label className="text-neutral-300 text-xs">Name (optional)</Label>
                <Input
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="ryh-input ryh-allow-copy bg-neutral-800 border-neutral-700 text-white mt-1"
                  data-testid="admin-create-name"
                />
              </div>
              <Button disabled={creating} className="w-full bg-red-600 hover:bg-red-700" data-testid="admin-create-submit">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="py-12 text-center text-neutral-500"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-400 border-b border-neutral-800">
              <tr>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Device</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-neutral-800/50 text-white" data-testid={`admin-user-row-${u.email}`}>
                  <td className="py-2 pr-4">{u.email}</td>
                  <td className="py-2 pr-4 text-neutral-400">{u.name || "—"}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === "admin" ? "bg-red-500/20 text-red-400" : "bg-neutral-700 text-neutral-300"}`}>{u.role}</span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs ${u.active ? "text-emerald-400" : "text-neutral-500"}`}>{u.active ? "Active" : "Disabled"}</span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-neutral-500">{u.device_id ? u.device_id.slice(0, 10) + "…" : "—"}</td>
                  <td className="py-2 pr-4">
                    {u.role !== "admin" && (
                      <div className="flex gap-1">
                        <button onClick={() => action(u, "reset")} className="p-1.5 hover:bg-neutral-700 rounded" title="Reset device" data-testid={`admin-reset-${u.email}`}>
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button onClick={() => action(u, "toggle")} className="p-1.5 hover:bg-neutral-700 rounded" title="Toggle active" data-testid={`admin-toggle-${u.email}`}>
                          <Power className="w-4 h-4" />
                        </button>
                        <button onClick={() => action(u, "delete")} className="p-1.5 hover:bg-red-600 rounded" title="Delete" data-testid={`admin-delete-${u.email}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TrendsTab() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [boosted, setBoosted] = useState([]);

  const loadBoosted = () => api.get("/admin/trends/boosted").then((r) => setBoosted(r.data.boosts || []));
  useEffect(() => { loadBoosted(); }, []);

  const search = async (e) => {
    e?.preventDefault?.();
    if (!q.trim()) return;
    const { data } = await api.get("/search", { params: { q, limit: 12 } });
    setResults(data.results || []);
  };
  const boost = async (v, amount = 100) => {
    await api.post("/admin/trends/boost", { video_id: v.id, boost: amount });
    toast.success(`Boosted "${v.title.slice(0, 30)}"`);
    loadBoosted();
  };

  return (
    <Card className="bg-neutral-900 border-neutral-800 p-4">
      <form onSubmit={search} className="flex gap-2 mb-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search video to boost"
          className="ryh-input ryh-allow-copy bg-neutral-800 border-neutral-700 text-white" data-testid="admin-trend-search" />
        <Button className="bg-red-600 hover:bg-red-700" data-testid="admin-trend-search-btn"><Search className="w-4 h-4" /></Button>
      </form>

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-neutral-400 mb-2">Search results</h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
            {results.map((v) => (
              <div key={v.id} className="flex gap-3 items-center bg-neutral-800/60 rounded-lg p-2">
                <img src={v.thumbnail} alt="" className="w-24 aspect-video object-cover rounded" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white line-clamp-2">{v.title}</div>
                  <div className="text-xs text-neutral-400 truncate">{v.channel}</div>
                </div>
                <Button size="sm" onClick={() => boost(v)} className="bg-emerald-600 hover:bg-emerald-700" data-testid={`admin-boost-${v.id}`}>
                  <TrendingUp className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-400 mb-2">Currently boosted</h3>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
            {boosted.length === 0 ? <div className="text-sm text-neutral-500">No boosts yet</div> :
              boosted.map((b) => (
                <div key={b.video_id} className="flex justify-between items-center bg-neutral-800/60 rounded-lg p-2">
                  <div className="text-sm text-white truncate flex-1 pr-2">{b.video_id}</div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">+{b.boost}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
