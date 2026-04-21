import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { confirmAction } from "../lib/notifications";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  maxProjects: number;
  creditsPicDrift: number;
  creditsPicDriftPlus: number;
  creditsImageFX: number;
  creditsVideoFX1: number;
  creditsVideoFX2: number;
  creditsVideoFX3: number;
}

interface Config {
  name: string;
  falApiKey: string;
  kieApiKey: string;
  openaiApiKey: string;
  pricing: any;
}

interface CreditRequest {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
}

export default function TenantDashboard() {
  const { user: adminUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"team" | "pricing" | "integrations">("team");
  const [users, setUsers] = useState<User[]>([]);
  const [creditRequests, setCreditRequests] = useState<CreditRequest[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    role: "USER",
    maxProjects: 3
  });

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const toInt = (value: string, fallback = 0) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.round(n));
  };

  const toSignedInt = (value: string, fallback = 0) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.round(n);
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "team") return;
    const interval = setInterval(async () => {
      try {
        const requestsRes = await apiEndpoints.tenantGetRequests();
        if (requestsRes.data.success) {
          setCreditRequests(requestsRes.data.requests || []);
        }
      } catch {
        // Silent polling failure
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === "team") {
        const [teamRes, requestsRes] = await Promise.all([
          apiEndpoints.tenantGetTeam(),
          apiEndpoints.tenantGetRequests(),
        ]);
        if (teamRes.data.success) setUsers(teamRes.data.users);
        if (requestsRes.data.success) setCreditRequests(requestsRes.data.requests || []);
      } else {
        const res = await apiEndpoints.tenantGetConfig();
        if (res.data.success) setConfig(res.data.config);
      }
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await apiEndpoints.tenantAddUser(newUser);
      setMsg("User added to team.");
      setShowAddUserModal(false);
      fetchData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setActionLoading(true);
    try {
      await apiEndpoints.tenantUpdateConfig(config);
      setMsg("Configuration saved.");
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateUserCredits = async (userId: string, pool: string, amount: string) => {
    try {
      await apiEndpoints.tenantUpdateUser(userId, {
        addCredits: toSignedInt(amount),
        creditType: pool
      });
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleResolveCreditRequest = async (requestId: string) => {
    try {
      await apiEndpoints.tenantResolveRequest(requestId);
      setMsg("Credit request resolved.");
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading && !users.length && !config) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <LoadingSpinner size="lg" variant="neon" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 p-6 sm:p-10 font-sans">
      <div className="max-w-[1400px] mx-auto pb-24">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-8 border-b border-gray-800 pb-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h1 className="text-2xl font-bold text-white tracking-tight uppercase">
                Agency <span className="text-brand-accent">Management</span>
              </h1>

            </div>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
              {adminUser?.organizationName || "Your Organization"} — Admin Panel
            </p>
          </div>

          <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800 gap-1">
            <button
              onClick={() => navigate("/app")}
              className="px-6 py-2 rounded-md text-[10px] font-black uppercase tracking-widest text-brand-accent hover:bg-brand-accent/10 transition-all border border-brand-accent/20 mr-2"
            >
              Back to App
            </button>
            {["team", "pricing", "integrations"].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${activeTab === tab ? "bg-gray-800 text-brand-accent" : "text-gray-400 hover:text-white"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {msg && (
          <div className="mb-8 p-4 rounded-lg bg-brand-accent/5 border border-brand-accent/20 text-brand-accent text-[10px] font-bold uppercase tracking-widest flex justify-between items-center">
            {msg}
            <button onClick={() => setMsg("")} className="text-lg">×</button>
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === "team" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
              <div className="p-5 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Pending Render Requests</h2>
                <span className="text-[10px] font-bold text-brand-accent uppercase tracking-widest">
                  {creditRequests.length} Pending
                </span>
              </div>
              {creditRequests.length === 0 ? (
                <div className="p-6 text-xs text-gray-500 italic">No pending render requests.</div>
              ) : (
                <table className="w-full text-left min-w-[700px]">
                  <thead className="bg-gray-950/50 text-[9px] uppercase tracking-widest text-gray-500 font-bold">
                    <tr>
                      <th className="p-5">Requester</th>
                      <th className="p-5">Email</th>
                      <th className="p-5">Submitted</th>
                      <th className="p-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {creditRequests.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-800/20 transition-colors">
                        <td className="p-5 text-sm text-white">{r.user?.name || r.name || "Unknown User"}</td>
                        <td className="p-5 text-xs text-gray-400 font-mono">{r.user?.email || r.email}</td>
                        <td className="p-5 text-xs text-gray-500">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="p-5 text-right">
                          <button
                            onClick={() => handleResolveCreditRequest(r.id)}
                            className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-brand-accent hover:bg-cyan-300 text-gray-950 transition-all"
                          >
                            Mark Resolved
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex justify-between items-center">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Team Members</h2>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="bg-brand-accent hover:bg-cyan-300 text-gray-950 px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                Add Member
              </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto shadow-xl">
              <table className="w-full text-left min-w-[1000px]">
                <thead className="bg-gray-950/50 text-[9px] uppercase tracking-widest text-gray-500 font-bold">
                  <tr>
                    <th className="p-5">User</th>
                    <th className="p-5 text-center">Role</th>
                    <th className="p-5 text-center">PicDrift / +</th>
                    <th className="p-5 text-center">PicFX</th>
                    <th className="p-5 text-center">VidFX 1 / 2 / 3</th>
                    <th className="p-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-800/20 transition-colors group">
                      <td className="p-5">
                        <div className="font-bold text-white text-sm">{u.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{u.email}</div>
                      </td>
                      <td className="p-5 text-center">
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                          {u.role}
                        </span>
                      </td>
                      <td className="p-5 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-500">Std:</span>
                            <input type="number" step="1" min="0" className="w-12 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsPicDrift} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsPicDrift", (toInt(e.target.value, u.creditsPicDrift) - u.creditsPicDrift).toString())} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-gray-500">Plus:</span>
                            <input type="number" step="1" min="0" className="w-12 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsPicDriftPlus} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsPicDriftPlus", (toInt(e.target.value, u.creditsPicDriftPlus) - u.creditsPicDriftPlus).toString())} />
                          </div>
                        </div>
                      </td>
                      <td className="p-5 text-center">
                        <input type="number" step="1" min="0" className="w-16 bg-gray-950 border border-gray-800 rounded p-1 text-center text-xs" defaultValue={u.creditsImageFX} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsImageFX", (toInt(e.target.value, u.creditsImageFX) - u.creditsImageFX).toString())} />
                      </td>
                      <td className="p-5 text-center">
                        <div className="flex gap-1 justify-center">
                          <input type="number" step="1" min="0" title="VidFX 1" className="w-10 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsVideoFX1} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsVideoFX1", (toInt(e.target.value, u.creditsVideoFX1) - u.creditsVideoFX1).toString())} />
                          <input type="number" step="1" min="0" title="VidFX 2" className="w-10 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsVideoFX2} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsVideoFX2", (toInt(e.target.value, u.creditsVideoFX2) - u.creditsVideoFX2).toString())} />
                          <input type="number" step="1" min="0" title="VidFX 3" className="w-10 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsVideoFX3} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsVideoFX3", (toInt(e.target.value, u.creditsVideoFX3) - u.creditsVideoFX3).toString())} />
                        </div>
                      </td>
                      <td className="p-5 text-right">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingUser(u)} className="text-cyan-400 hover:text-cyan-300 text-[9px] font-bold uppercase tracking-widest bg-cyan-400/10 px-3 py-1 rounded">Manage</button>
                          <button
                            className="text-red-500/50 hover:text-red-400 text-[9px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all"
                            onClick={async () => {
                              if (await confirmAction("Remove user?", { confirmLabel: "Remove" })) {
                                apiEndpoints.tenantDeleteUser(u.id).then(fetchData);
                              }
                            }}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* PRICING TAB */}
        {activeTab === "pricing" && config && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-brand-accent/5 border border-brand-accent/20 p-6 rounded-xl">
              <h3 className="text-brand-accent font-bold uppercase text-[10px] tracking-[0.2em] mb-2">Cost Configuration</h3>
              <p className="text-xs text-gray-500 italic">Set how many credits each generation type deducts from your users' balance.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 pb-2 border-b border-gray-800">PicDrift Credits</h4>
                <div className="space-y-4">
                  {["pricePicDrift_5s", "pricePicDrift_10s", "pricePicDrift_Plus_5s", "pricePicDrift_Plus_10s"].map(key => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400 uppercase font-bold">{key.replace('price', '').replace(/_/g, ' ')}</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                        value={config.pricing[key]}
                        onChange={(e) => setConfig({ ...config, pricing: { ...config.pricing, [key]: toInt(e.target.value, config.pricing[key]) } })}
                        onBlur={() => handleUpdateConfig()}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 pb-2 border-b border-gray-800">Pic FX & Editor</h4>
                <div className="space-y-4">
                  {["pricePicFX_Standard", "pricePicFX_Carousel", "pricePicFX_Batch", "priceEditor_Pro", "priceEditor_Enhance", "priceEditor_Convert", "priceAsset_DriftPath"].map(key => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400 uppercase font-bold truncate max-w-[100px]" title={key}>{key.replace('price', '').replace(/_/g, ' ')}</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                        value={config.pricing[key]}
                        onChange={(e) => setConfig({ ...config, pricing: { ...config.pricing, [key]: toInt(e.target.value, config.pricing[key]) } })}
                        onBlur={() => handleUpdateConfig()}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 pb-2 border-b border-gray-800">Video FX</h4>
                <div className="space-y-4">
                  {["priceVideoFX1_10s", "priceVideoFX1_15s", "priceVideoFX2_4s", "priceVideoFX2_8s", "priceVideoFX2_12s", "priceVideoFX3_4s", "priceVideoFX3_6s", "priceVideoFX3_8s"].map(key => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400 uppercase font-bold">{key.replace('price', '').replace(/_/g, ' ')}</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                        value={config.pricing[key]}
                        onChange={(e) => setConfig({ ...config, pricing: { ...config.pricing, [key]: toInt(e.target.value, config.pricing[key]) } })}
                        onBlur={() => handleUpdateConfig()}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* INTEGRATIONS TAB */}
        {activeTab === "integrations" && config && (
          <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-tight">Organization Profile</h2>
              <form onSubmit={handleUpdateConfig} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Agency Name</label>
                  <input
                    type="text"
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white focus:border-brand-accent outline-none"
                    value={config.name}
                    onChange={e => setConfig({ ...config, name: e.target.value })}
                  />
                </div>
                <div className="border-t border-gray-800 pt-6 mt-6">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">API Credentials</h3>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Fal AI Key</label>
                      <input
                        type="password"
                        className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white focus:border-brand-accent outline-none font-mono"
                        value={config.falApiKey}
                        onChange={e => setConfig({ ...config, falApiKey: e.target.value })}
                      />
                    </div>
                    {adminUser?.view !== "PICDRIFT" && (
                      <>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kling/KIE AI Key</label>
                          <input
                            type="password"
                            className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white focus:border-brand-accent outline-none font-mono"
                            value={config.kieApiKey}
                            onChange={e => setConfig({ ...config, kieApiKey: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">OpenAI Key</label>
                          <input
                            type="password"
                            className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white focus:border-brand-accent outline-none font-mono"
                            value={config.openaiApiKey}
                            onChange={e => setConfig({ ...config, openaiApiKey: e.target.value })}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full py-4 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-xl font-bold uppercase text-[11px] tracking-widest transition-all shadow-lg"
                >
                  {actionLoading ? <LoadingSpinner size="sm" color="text-gray-950" /> : "Save Configuration"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: MANAGE USER (TENANT) */}
      {editingUser && (
        <div className="fixed inset-0 bg-gray-950/90 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-8 border-b border-gray-800">
              <h3 className="text-xl font-bold text-white uppercase tracking-tight">Manage Team Member</h3>
              <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">{editingUser.email}</p>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">User Role</label>
                  <select
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                    defaultValue={editingUser.role}
                    onChange={e => apiEndpoints.tenantUpdateUser(editingUser.id, { role: e.target.value }).then(fetchData)}
                  >
                    <option value="USER">Standard User</option>
                    <option value="MANAGER">Manager</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Project Limit</label>
                  <input
                    type="number"
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                    defaultValue={editingUser.maxProjects}
                    onBlur={e => apiEndpoints.tenantUpdateUser(editingUser.id, { maxProjects: parseInt(e.target.value) }).then(fetchData)}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-800">
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-4 tracking-widest">Credit Top-ups handled via table view.</p>
                <button onClick={() => setEditingUser(null)} className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-bold uppercase text-xs tracking-widest transition-all">
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD USER */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-gray-950/90 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-lg font-bold text-white uppercase tracking-tight">New Team Member</h3>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <input
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                placeholder="Email Address"
                type="email"
                required
                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
              />
              <input
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                placeholder="Full Name"
                required
                onChange={e => setNewUser({ ...newUser, name: e.target.value })}
              />
              <input
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                placeholder="Password"
                type="password"
                required
                onChange={e => setNewUser({ ...newUser, password: e.target.value })}
              />
              <select
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300"
                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="USER">Standard User</option>
                <option value="MANAGER">Team Manager</option>
              </select>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddUserModal(false)} className="flex-1 py-3 text-xs font-bold uppercase text-gray-500">Cancel</button>
                <button type="submit" disabled={actionLoading} className="flex-1 py-3 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-lg font-bold uppercase text-xs tracking-widest">
                  Deploy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
