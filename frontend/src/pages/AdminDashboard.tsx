import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";

interface User {
  id: string;
  email: string;
  name: string;
  creditSystem: "COMMERCIAL" | "INTERNAL";
  creditsPicDrift: number;
  creditsPicDriftPlus: number;
  creditsImageFX: number;
  creditsVideoFX1: number;
  creditsVideoFX2: number;
  creditsVideoFX3: number;
  role: "USER" | "MANAGER" | "ADMIN";
  view: "VISIONLIGHT" | "PICDRIFT";
  maxProjects: number;
}

interface GlobalSettings {
  pricePicDrift_5s: number;
  pricePicDrift_10s: number;
  pricePicDrift_Plus_5s: number;
  pricePicDrift_Plus_10s: number;
  pricePicFX_Standard: number;
  pricePicFX_Carousel: number;
  pricePicFX_Batch: number;
  priceVideoFX1_10s: number;
  priceVideoFX1_15s: number;
  priceVideoFX2_4s: number;
  priceVideoFX2_8s: number;
  priceVideoFX2_12s: number;
  priceVideoFX3_4s: number;
  priceVideoFX3_6s: number;
  priceVideoFX3_8s: number;
  priceEditor_Pro: number;
  priceEditor_Enhance: number;
  priceEditor_Convert: number;
  priceAsset_DriftPath: number;
}

export default function AdminDashboard() {
  const { user: adminUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"users" | "controls">("users");
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<Partial<User>>({});
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "", view: "VISIONLIGHT", maxProjects: 3 });
  const [customCreditAmount, setCustomCreditAmount] = useState<string>("0");
  const [targetCreditPool, setTargetCreditPool] =
    useState<string>("creditsPicDrift");
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [baseBudgetRate, setBaseBudgetRate] = useState<number>(0.1);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, reqRes, settingsRes] = await Promise.all([
        apiEndpoints.adminGetUsers(),
        apiEndpoints.adminGetRequests(),
        apiEndpoints.adminGetSettings(),
      ]);
      if (usersRes.data.success) setUsers(usersRes.data.users);
      if (reqRes.data.success) setRequests(reqRes.data.requests);
      if (settingsRes.data.success) setSettings(settingsRes.data.settings);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setPendingUpdates({ creditSystem: user.creditSystem, role: user.role, view: user.view, maxProjects: user.maxProjects });
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Delete ${user.email}?`)) return;
    setActionLoading(true);
    try {
      await apiEndpoints.adminDeleteUser(user.id);
      setMsg("✅ User deleted successfully.");
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await apiEndpoints.adminCreateUser(newUser);
      setMsg("✅ User created & synced!");
      setNewUser({ email: "", password: "", name: "", view: "VISIONLIGHT", maxProjects: 3 });
      setShowInviteModal(false);
      fetchData();
    } catch (err: any) {
      setMsg("❌ " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateGlobalSettings = async (
    updated: Partial<GlobalSettings>,
  ) => {
    try {
      const res = await apiEndpoints.adminUpdateSettings(updated);
      if (res.data.success) {
        setSettings(res.data.settings);
        setMsg("✅ Render Reserve Updated.");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleQuickAddCredits = async (
    userId: string,
    type: string,
    amount: string,
  ) => {
    setActionLoading(true);
    try {
      await apiEndpoints.adminUpdateUser(userId, {
        addCredits: parseFloat(amount),
        creditType: type,
      });
      setMsg(`✅ Render Reserve Updated.`);
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!editingUser) return;
    setActionLoading(true);
    try {
      await apiEndpoints.adminUpdateUser(editingUser.id, pendingUpdates);
      setMsg("✅ User profile updated.");
      setEditingUser(null);
      fetchData();
    } finally {
      setActionLoading(false);
    }
  };

  const totalRenderBudget = useMemo(() => {
    const totalCredits = users.reduce(
      (acc, u) =>
        acc +
        (u.creditsPicDrift || 0) +
        (u.creditsPicDriftPlus || 0) +
        (u.creditsImageFX || 0) +
        (u.creditsVideoFX1 || 0) +
        (u.creditsVideoFX2 || 0) +
        (u.creditsVideoFX3 || 0),
      0,
    );
    return (totalCredits * baseBudgetRate).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  }, [users, baseBudgetRate]);

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#0a0c10] text-gray-300 p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto pb-24">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-8 border-b border-white/5 pb-10">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white tracking-tight mb-1">
              Admin <span className="text-indigo-500">Panel</span>
            </h1>
            <p className="text-[11px] text-gray-500 uppercase tracking-[0.2em] font-bold">
              Systems Control — Operator: {adminUser?.email}
            </p>
          </div>

          <div className="flex bg-[#16191e] p-1 rounded-xl border border-white/5 shadow-sm backdrop-blur-sm">
            <button
              onClick={() => navigate("/app")}
              className="px-6 py-2 rounded-xl text-[11px] font-bold text-gray-500 hover:text-white transition-all uppercase tracking-wider"
            >
              App
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`px-6 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${activeTab === "users" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-gray-500 hover:text-white"}`}
            >
              Directory
            </button>
            <button
              onClick={() => setActiveTab("controls")}
              className={`px-6 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${activeTab === "controls" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-gray-500 hover:text-white"}`}
            >
              Inventory
            </button>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <input
                placeholder="Filter entities..."
                className="bg-[#16191e] border border-white/5 rounded-xl px-4 py-2.5 w-full text-xs outline-none focus:border-indigo-500/50 transition-all placeholder-gray-600"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-[11px] uppercase tracking-widest transition-all whitespace-nowrap shadow-lg shadow-indigo-500/20"
            >
              + Provision User
            </button>
          </div>
        </div>

        {msg && (
          <div className="mb-10 p-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 flex justify-between items-center animate-in fade-in slide-in-from-top-4">
            <span className="text-xs font-medium tracking-wide">✅ {msg}</span>
            <button onClick={() => setMsg("")} className="text-emerald-500 hover:text-white text-lg">✕</button>
          </div>
        )}

        {/* REQUESTS */}
        {requests.length > 0 && (
          <div className="mb-12 bg-indigo-500/5 border border-indigo-500/10 rounded-3xl p-8">
            <h2 className="text-[10px] font-black text-indigo-400 mb-6 uppercase tracking-[0.3em]">
              Pending Allocations ({requests.length})
            </h2>
            <div className="grid gap-4">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between bg-[#16191e] p-5 rounded-2xl border border-white/5"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-sm text-white tracking-tight">{req.name}</span>
                    <span className="text-[10px] text-gray-500 font-mono tracking-wider">
                      {req.email}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={() => {
                        setSearchTerm(req.email);
                        setActiveTab("users");
                      }}
                      className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest hover:text-indigo-300"
                    >
                      Locate
                    </button>
                    <button
                      onClick={() =>
                        apiEndpoints.adminResolveRequest(req.id).then(fetchData)
                      }
                      className="bg-white/[0.03] hover:bg-white/[0.08] px-5 py-2 rounded-xl text-[10px] uppercase font-bold text-gray-400 hover:text-white transition-all border border-white/5"
                    >
                      Acknowledge
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB CONTENT: USERS */}
        {activeTab === "users" && (
          <div className="bg-[#0f1115] border border-white/5 rounded-3xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white/[0.02] text-gray-500 text-[9px] uppercase tracking-[0.2em] font-black">
                  <tr>
                    <th className="p-8 border-b border-white/5">Identity</th>
                    <th className="p-8 border-b border-white/5 text-center text-pink-500/80">PD Standard</th>
                    <th className="p-8 border-b border-white/5 text-center text-rose-500/80">PD Plus</th>
                    <th className="p-8 border-b border-white/5 text-center text-violet-500/80">PicFX</th>
                    <th className="p-8 border-b border-white/5 text-center text-blue-500/80">Video FX 1</th>
                    <th className="p-8 border-b border-white/5 text-center text-cyan-500/80">Video FX 2</th>
                    <th className="p-8 border-b border-white/5 text-center text-indigo-500/80">Video FX 3</th>
                    <th className="p-8 border-b border-white/5 text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-32 text-center">
                        <LoadingSpinner size="lg" variant="neon" />
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr
                        key={u.id}
                        className="hover:bg-white/[0.02] transition-colors group"
                      >
                        <td className="p-8">
                          <div className="font-bold text-sm text-white tracking-tight">{u.name}</div>
                          <div className="text-[10px] text-gray-500 mt-1">
                            {u.email}
                          </div>
                          <div
                            className={`mt-2 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full inline-block ${u.creditSystem === "COMMERCIAL" ? "bg-indigo-500/10 text-indigo-400" : "bg-gray-800 text-gray-500"}`}
                          >
                            {u.view === "PICDRIFT" ? "Demo Access" : u.creditSystem}
                          </div>
                        </td>
                        <td className="p-8 text-center">
                          <div className="text-sm font-bold text-pink-400">
                            {(u.creditsPicDrift || 0).toFixed(0)}
                          </div>
                        </td>
                        <td className="p-8 text-center">
                          <div className="text-sm font-bold text-rose-400">
                            {(u.creditsPicDriftPlus || 0).toFixed(0)}
                          </div>
                        </td>
                        <td className="p-8 text-center">
                          <div className="text-sm font-bold text-violet-400">
                            {(u.creditsImageFX || 0).toFixed(0)}
                          </div>
                        </td>
                        <td className="p-8 text-center">
                          <div className="text-sm font-bold text-blue-400">
                            {(u.creditsVideoFX1 || 0).toFixed(0)}
                          </div>
                        </td>
                        <td className="p-8 text-center">
                          <div className="text-sm font-bold text-cyan-400">
                            {(u.creditsVideoFX2 || 0).toFixed(0)}
                          </div>
                        </td>
                        <td className="p-8 text-center">
                          <div className="text-sm font-bold text-indigo-400">
                            {(u.creditsVideoFX3 || 0).toFixed(0)}
                          </div>
                        </td>
                        <td className="p-8 text-right">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditModal(u)}
                              className="px-4 py-2 bg-gray-800 hover:bg-white text-gray-400 hover:text-black rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all"
                            >
                              Manage
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="px-4 py-2 bg-red-900/10 hover:bg-red-600 rounded-lg text-red-500 hover:text-white transition-all text-[9px] font-bold uppercase tracking-widest"
                            >
                              Purge
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB CONTENT: CONTROLS */}
        {activeTab === "controls" && settings && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-[10px] font-black mb-10 flex items-center gap-4 text-gray-500 uppercase tracking-[0.3em]">
              Inventory Resource Controls
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
              <div className="space-y-10">
                <div className="bg-[#0f1115] p-8 rounded-3xl border border-white/5 shadow-sm">
                  <h3 className="text-[9px] font-black text-white uppercase tracking-[0.25em] mb-8 pb-4 border-b border-white/5">
                    PicDrift Engine
                  </h3>
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Standard 5s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.pricePicDrift_5s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicDrift_5s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Standard 10s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.pricePicDrift_10s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicDrift_10s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center pt-6 border-t border-white/5">
                      <span className="text-[10px] font-bold text-white uppercase tracking-wider">Plus 5s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.pricePicDrift_Plus_5s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicDrift_Plus_5s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-white uppercase tracking-wider">Plus 10s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.pricePicDrift_Plus_10s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicDrift_Plus_10s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-[#0f1115] p-8 rounded-3xl border border-white/5 shadow-sm">
                  <h3 className="text-[9px] font-black text-white uppercase tracking-[0.25em] mb-8 pb-4 border-b border-white/5">
                    Pic FX & Studio Tools
                  </h3>
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Standard Image</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.pricePicFX_Standard}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicFX_Standard: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Carousel Batch</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.pricePicFX_Carousel}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicFX_Carousel: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mass Processing</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.pricePicFX_Batch}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicFX_Batch: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-10">
                <div className="bg-[#0f1115] p-8 rounded-3xl border border-white/5 shadow-sm">
                  <h3 className="text-[9px] font-black text-white uppercase tracking-[0.25em] mb-8 pb-4 border-b border-white/5">
                    Video FX Engine 1 & 2
                  </h3>
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">FX 1 - 10s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.priceVideoFX1_10s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX1_10s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">FX 1 - 15s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.priceVideoFX1_15s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX1_15s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center pt-6 border-t border-white/5">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">FX 2 - Base</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.priceVideoFX2_4s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX2_4s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">FX 2 - Max</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.priceVideoFX2_12s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX2_12s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-[#0f1115] p-8 rounded-3xl border border-white/5 shadow-sm">
                  <h3 className="text-[9px] font-black text-white uppercase tracking-[0.25em] mb-8 pb-4 border-b border-white/5">
                    Video FX Engine 3
                  </h3>
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">FX 3 - 4s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.priceVideoFX3_4s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX3_4s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">FX 3 - 6s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.priceVideoFX3_6s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX3_6s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">FX 3 - 8s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.priceVideoFX3_8s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX3_8s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-10">
                <div className="bg-[#0f1115] p-8 rounded-3xl border border-white/5 shadow-sm">
                  <h3 className="text-[9px] font-black text-white uppercase tracking-[0.25em] mb-8 pb-4 border-b border-white/5">
                    PicFX Editor
                  </h3>
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Pro Editor</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.priceEditor_Pro}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceEditor_Pro: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Enhance / Upscale</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.priceEditor_Enhance}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceEditor_Enhance: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Format Convert</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                        value={settings.priceEditor_Convert}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceEditor_Convert: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-[#0f1115] p-8 rounded-3xl border border-white/5 shadow-sm">
                  <h3 className="text-[9px] font-black text-white uppercase tracking-[0.25em] mb-8 pb-4 border-b border-white/5">
                    Drift Path Tool
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Generate Path
                    </span>
                    <input
                      step="0.01"
                      type="number"
                      className="w-24 bg-[#16191e] border border-white/5 rounded-lg p-2.5 text-center text-xs font-bold text-white outline-none focus:border-indigo-500/30"
                      value={settings.priceAsset_DriftPath}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceAsset_DriftPath: parseFloat(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* BUDGET CALCULATOR */}
            <div className="fixed bottom-12 right-12 bg-[#16191e]/90 backdrop-blur-xl border border-white/5 p-8 rounded-[2rem] shadow-2xl max-w-xs animate-in zoom-in-95 duration-300">
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <span className="text-[9px] font-black uppercase text-gray-500 tracking-[0.2em]">
                    Yield Valuation
                  </span>
                  <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-lg">
                    <span className="text-[10px] text-gray-600">$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-12 bg-transparent text-[11px] font-black outline-none text-white text-right"
                      value={baseBudgetRate}
                      onChange={(e) =>
                        setBaseBudgetRate(parseFloat(e.target.value))
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-3xl font-bold text-white tracking-tighter">
                    {totalRenderBudget}
                  </span>
                  <span className="text-[9px] text-gray-500 uppercase font-black mt-2 tracking-widest">
                    Aggregate Resource Value
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: MANAGE USER */}
        {editingUser && (
          <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-[100] overflow-y-auto p-4 py-10 backdrop-blur-sm custom-scrollbar">
            <div className="bg-[#0f1115] border border-white/5 rounded-[2rem] p-8 sm:p-10 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start mb-10 border-b border-white/5 pb-6">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    {editingUser.view === "PICDRIFT" ? "Demo Account Control" : "Account Settings"}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono mt-1">
                    {editingUser.email}
                  </p>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-gray-500 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-12">
                {/* 1. RENDER ALLOCATION (DEMO ONLY) */}
                {editingUser.view === "PICDRIFT" ? (
                  <div className="space-y-6">
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] block mb-6">
                      Assigned Renders (Integers)
                    </label>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                      {[
                        { id: "creditsPicDrift", label: "PicDrift Standard", color: "text-pink-400" },
                        { id: "creditsPicDriftPlus", label: "PicDrift Plus", color: "text-rose-400" },
                        { id: "creditsImageFX", label: "Pic FX", color: "text-violet-400" },
                        { id: "creditsVideoFX1", label: "Video FX 1", color: "text-blue-400" },
                        { id: "creditsVideoFX2", label: "Video FX 2", color: "text-cyan-400" },
                        { id: "creditsVideoFX3", label: "Video FX 3", color: "text-indigo-400" },
                      ].map((pool) => (
                        <div key={pool.id} className="flex flex-col gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${pool.color}`}>{pool.label}</span>
                          <input
                            type="number"
                            step="1"
                            className="w-full bg-[#16191e] border border-white/5 rounded-xl px-4 py-2.5 text-sm font-bold text-white outline-none focus:border-indigo-500/50 transition-all"
                            defaultValue={Math.floor((editingUser as any)[pool.id] || 0)}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              handleQuickAddCredits(editingUser.id, pool.id, (val - (editingUser as any)[pool.id]).toString());
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* STANDARD USER CREDIT ADJUSTMENT */
                  <div className="p-8 bg-indigo-500/5 rounded-[2rem] border border-indigo-500/10">
                    <label className="text-[10px] font-black text-indigo-400 uppercase mb-6 block tracking-widest text-center">
                      Wallet Configuration
                    </label>
                    <div className="space-y-6">
                      <div>
                        <span className="text-[9px] text-gray-500 uppercase font-black block mb-2 tracking-widest">
                          Target Wallet
                        </span>
                        <select
                          className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-indigo-500/50 text-gray-300"
                          value={targetCreditPool}
                          onChange={(e) => setTargetCreditPool(e.target.value)}
                        >
                          <option value="creditsPicDrift">PicDrift Standard</option>
                          <option value="creditsPicDriftPlus">PicDrift Plus</option>
                          <option value="creditsImageFX">PicFX</option>
                          <option value="creditsVideoFX1">Video FX 1</option>
                          <option value="creditsVideoFX2">Video FX 2</option>
                          <option value="creditsVideoFX3">Video FX 3</option>
                        </select>
                      </div>
                      <div>
                        <span className="text-[9px] text-gray-500 uppercase font-black block mb-2 tracking-widest">
                          Allocation Adjustment
                        </span>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            step="0.01"
                            className="flex-1 bg-black/40 border border-white/5 rounded-xl p-3 text-sm text-white font-bold outline-none"
                            value={customCreditAmount}
                            onChange={(e) =>
                              setCustomCreditAmount(e.target.value)
                            }
                          />
                          <button
                            onClick={() =>
                              handleQuickAddCredits(
                                editingUser.id,
                                targetCreditPool,
                                customCreditAmount,
                              )
                            }
                            disabled={actionLoading}
                            className="px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all"
                          >
                            Assign
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. BILLING MODE */}
                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase mb-4 block tracking-widest text-center">
                    Billing Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() =>
                        setPendingUpdates({
                          ...pendingUpdates,
                          creditSystem: "COMMERCIAL",
                        })
                      }
                      className={`p-4 rounded-2xl border font-bold text-[10px] uppercase transition-all ${pendingUpdates.creditSystem === "COMMERCIAL" ? "bg-indigo-600 border-indigo-500 text-white shadow-lg" : "bg-transparent border-white/5 text-gray-600 hover:text-gray-400"}`}
                    >
                      Commercial
                    </button>
                    <button
                      onClick={() =>
                        setPendingUpdates({
                          ...pendingUpdates,
                          creditSystem: "INTERNAL",
                        })
                      }
                      className={`p-4 rounded-2xl border font-bold text-[10px] uppercase transition-all ${pendingUpdates.creditSystem === "INTERNAL" ? "bg-indigo-600 border-indigo-500 text-white shadow-lg" : "bg-transparent border-white/5 text-gray-600 hover:text-gray-400"}`}
                    >
                      Internal
                    </button>
                  </div>
                </div>

                {/* 3. PERMISSION LEVEL */}
                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase mb-4 block tracking-widest text-center">
                    Authorization Tier
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {["USER", "MANAGER", "ADMIN"].map((r) => (
                      <button
                        key={r}
                        disabled={adminUser?.role === "MANAGER"}
                        onClick={() =>
                          setPendingUpdates({ ...pendingUpdates, role: r as any })
                        }
                        className={`p-3 rounded-xl border font-bold text-[9px] uppercase transition-all ${pendingUpdates.role === r ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-white/5 text-gray-700 hover:text-gray-500"}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. VIEW & PROJECTS */}
                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase mb-4 block tracking-widest text-center">
                    Interface & Limits
                  </label>
                  <div className="space-y-4">
                    <select
                      className="w-full bg-black/40 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-indigo-500/50 text-gray-300"
                      value={pendingUpdates.view || "VISIONLIGHT"}
                      onChange={(e) => setPendingUpdates({ ...pendingUpdates, view: e.target.value as any })}
                    >
                      <option value="VISIONLIGHT">VisionLight FX (Full)</option>
                      <option value="PICDRIFT">PicDrift (Demo)</option>
                    </select>
                    <div className="flex items-center justify-between p-3 bg-black/40 border border-white/5 rounded-xl text-xs">
                      <span className="text-gray-500 font-bold uppercase tracking-tighter">Max Projects</span>
                      <input
                        type="number"
                        min="1"
                        className="w-20 bg-transparent text-right outline-none font-bold text-white"
                        value={pendingUpdates.maxProjects || 3}
                        onChange={(e) => setPendingUpdates({ ...pendingUpdates, maxProjects: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-10 border-t border-white/5 space-y-4">
                  <button
                    onClick={handleSaveChanges}
                    disabled={actionLoading}
                    className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl font-bold uppercase text-[11px] tracking-widest shadow-xl shadow-indigo-500/20 transition-all disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <LoadingSpinner size="sm" variant="light" />
                    ) : (
                      "Apply System Changes"
                    )}
                  </button>
                  <button
                    onClick={() => setEditingUser(null)}
                    className="w-full text-[9px] text-gray-600 font-bold uppercase tracking-[0.2em] hover:text-white transition-all"
                  >
                    Dismiss Manager
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: INVITE */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-[100] overflow-y-auto p-4 py-20 backdrop-blur-sm">
            <div className="bg-[#0f1115] border border-white/5 rounded-[2rem] p-10 w-full max-w-md shadow-2xl animate-in zoom-in-95">
              <h3 className="text-xl font-bold text-white mb-10 text-center uppercase tracking-widest">
                User Provisioning
              </h3>
              <form onSubmit={handleInviteUser} className="space-y-6">
                <input
                  className="w-full p-4 bg-[#16191e] border border-white/5 rounded-2xl text-sm outline-none focus:border-indigo-500/50 transition-all text-white"
                  placeholder="Registry Email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  required
                />
                <input
                  className="w-full p-4 bg-[#16191e] border border-white/5 rounded-2xl text-sm outline-none focus:border-indigo-500/50 transition-all text-white"
                  placeholder="Identification Name"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                  required
                />
                <input
                  type="password"
                  className="w-full p-4 bg-[#16191e] border border-white/5 rounded-2xl text-sm outline-none focus:border-indigo-500/50 transition-all text-white"
                  placeholder="Access Key (Password)"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  required
                />
                <select
                  className="w-full p-4 bg-[#16191e] border border-white/5 rounded-2xl text-sm outline-none focus:border-indigo-500/50 transition-all text-gray-300"
                  value={newUser.view}
                  onChange={(e) => setNewUser({ ...newUser, view: e.target.value })}
                >
                  <option value="VISIONLIGHT">VisionLight FX (Standard)</option>
                  <option value="PICDRIFT">PicDrift (Demo/Guest)</option>
                </select>
                <div className="flex items-center justify-between p-4 bg-[#16191e] border border-white/5 rounded-2xl text-sm">
                  <span className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Project Cap</span>
                  <input
                    type="number"
                    min="1"
                    className="w-20 bg-transparent text-right outline-none text-white font-bold"
                    value={newUser.maxProjects}
                    onChange={(e) => setNewUser({ ...newUser, maxProjects: parseInt(e.target.value) || 1 })}
                    required
                  />
                </div>
                <div className="flex gap-4 pt-8">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest hover:text-white transition-all"
                  >
                    Abort
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-4 bg-white hover:bg-gray-200 text-black rounded-2xl font-bold uppercase text-[10px] tracking-widest shadow-lg transition-all"
                  >
                    Provision
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
