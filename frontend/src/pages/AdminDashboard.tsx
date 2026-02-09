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
  creditsImageFX: number;
  creditsVideoFX1: number;
  creditsVideoFX2: number;
  creditsVideoFX3: number;
  role: "USER" | "MANAGER" | "ADMIN";
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
  priceEditor_Standard: number;
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
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "" });
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
    setPendingUpdates({ creditSystem: user.creditSystem, role: user.role });
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
      setNewUser({ email: "", password: "", name: "" });
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
    <div className="min-h-screen bg-gray-950 text-white p-4 sm:p-8">
      <div className="max-w-7xl mx-auto pb-24">
        {/* HEADER (PDF PAGE 1) */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6 border-b border-white/5 pb-8">
          <div className="w-full md:w-1/4">
            <h1 className="text-2xl font-bold text-white tracking-tighter">
              Admin Panel
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">
              Logged in as: {adminUser?.email}
            </p>
          </div>

          <div className="flex bg-gray-900 p-1 rounded-xl border border-gray-800 shadow-inner">
            <button
              onClick={() => navigate("/app")}
              className="px-6 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition-all"
            >
              App
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "users" ? "bg-cyan-600 text-white shadow-lg" : "text-gray-400 hover:text-white"}`}
            >
              Users
            </button>
            <button
              onClick={() => setActiveTab("controls")}
              className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "controls" ? "bg-cyan-600 text-white shadow-lg" : "text-gray-400 hover:text-white"}`}
            >
              Controls
            </button>
          </div>

          <div className="flex gap-4 w-full md:w-1/4 justify-end">
            <input
              placeholder="Search..."
              className="bg-gray-900 border border-gray-800 rounded-xl p-2.5 w-full text-xs outline-none focus:ring-1 focus:ring-cyan-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              onClick={() => setShowInviteModal(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs whitespace-nowrap"
            >
              + New User
            </button>
          </div>
        </div>

        {msg && (
          <div className="mb-6 p-4 rounded-xl border flex justify-between items-center bg-green-900/20 border-green-500/30 text-green-300 animate-in fade-in">
            <span className="text-sm font-medium">{msg}</span>
            <button onClick={() => setMsg("")}>✕</button>
          </div>
        )}

        {/* REQUESTS (PDF PAGE 3) */}
        {requests.length > 0 && (
          <div className="mb-8 bg-purple-900/10 border border-purple-500/20 rounded-2xl p-6">
            <h2 className="text-xs font-bold text-purple-300 mb-4 uppercase tracking-widest">
              🔔 Render Reserve Request ({requests.length})
            </h2>
            <div className="grid gap-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between bg-gray-900/50 p-4 rounded-xl border border-white/5"
                >
                  <div className="flex flex-col">
                    <span className="font-bold text-sm">{req.name}</span>
                    <span className="text-xs text-gray-500 font-mono">
                      {req.email}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setSearchTerm(req.email);
                        setActiveTab("users");
                      }}
                      className="text-[10px] text-cyan-400 font-black uppercase hover:underline"
                    >
                      User Reserve
                    </button>
                    <button
                      onClick={() =>
                        apiEndpoints.adminResolveRequest(req.id).then(fetchData)
                      }
                      className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-[10px] uppercase font-bold transition-all"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB CONTENT: USERS */}
        {activeTab === "users" && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-800/50 text-gray-500 text-[10px] uppercase tracking-widest font-black">
                  <tr>
                    <th className="p-6 border-b border-white/5">
                      User Identity
                    </th>
                    <th className="p-6 border-b border-white/5">PicDrift</th>
                    <th className="p-6 border-b border-white/5">PicFX</th>
                    <th className="p-6 border-b border-white/5">Video FX 1</th>
                    <th className="p-6 border-b border-white/5">Video FX 2</th>
                    <th className="p-6 border-b border-white/5">Video FX 3</th>
                    <th className="p-6 border-b border-white/5 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="p-20 text-center">
                        <LoadingSpinner size="lg" variant="neon" />
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr
                        key={u.id}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="p-6">
                          <div className="font-bold text-sm">{u.name}</div>
                          <div className="text-[10px] text-gray-500">
                            {u.email}
                          </div>
                          <div
                            className={`mt-1 text-[8px] font-black uppercase ${u.creditSystem === "COMMERCIAL" ? "text-green-500" : "text-purple-400"}`}
                          >
                            {u.creditSystem === "COMMERCIAL"
                              ? "Commercial"
                              : "Internal"}
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="text-base font-bold text-pink-500">
                            {(u.creditsPicDrift || 0).toFixed(2)} pts
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="text-base font-bold text-violet-500">
                            {(u.creditsImageFX || 0).toFixed(2)} pts
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="text-base font-bold text-blue-500">
                            {(u.creditsVideoFX1 || 0).toFixed(2)} pts
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="text-base font-bold text-cyan-500">
                            {(u.creditsVideoFX2 || 0).toFixed(2)} pts
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="text-base font-bold text-teal-500">
                            {(u.creditsVideoFX3 || 0).toFixed(2)} pts
                          </div>
                        </td>
                        <td className="p-6 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEditModal(u)}
                              className="px-4 py-2 bg-gray-800 hover:bg-cyan-600 rounded-lg text-[10px] font-bold uppercase transition-all"
                            >
                              Manage
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-2 bg-red-900/10 hover:bg-red-600 rounded-lg text-red-500 hover:text-white transition-all"
                            >
                              🗑️
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

        {/* TAB CONTENT: CONTROLS (PDF PAGE 2) */}
        {activeTab === "controls" && settings && (
          <div className="animate-in slide-in-from-bottom-2">
            <h2 className="text-sm font-black mb-8 flex items-center gap-3 text-gray-400 uppercase tracking-widest">
              Render Reserve Controls
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <div className="space-y-8">
                <div className="bg-gray-900 p-6 rounded-2xl border border-white/5">
                  <h3 className="text-[10px] font-black text-pink-500 uppercase tracking-widest mb-6">
                    PicDrift
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">5s Gen</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold outline-none"
                        value={settings.pricePicDrift_5s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicDrift_5s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">10s Gen</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold outline-none"
                        value={settings.pricePicDrift_10s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicDrift_10s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center border-t border-white/5 pt-4">
                      <span className="text-xs text-rose-400 font-bold">Plus 5s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold outline-none text-rose-400"
                        value={settings.pricePicDrift_Plus_5s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicDrift_Plus_5s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-rose-400 font-bold">Plus 10s</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold outline-none text-rose-400"
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
                <div className="bg-gray-900 p-6 rounded-2xl border border-white/5">
                  <h3 className="text-[10px] font-black text-violet-500 uppercase tracking-widest mb-6">
                    Pic FX
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Standard</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
                        value={settings.pricePicFX_Standard}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicFX_Standard: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Carousel</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
                        value={settings.pricePicFX_Carousel}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            pricePicFX_Carousel: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Batch</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
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

              <div className="space-y-8">
                <div className="bg-gray-900 p-6 rounded-2xl border border-white/5">
                  <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-6">
                    Video FX 1
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">10s Gen</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
                        value={settings.priceVideoFX1_10s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX1_10s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">15s Gen</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
                        value={settings.priceVideoFX1_15s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX1_15s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="bg-gray-900 p-6 rounded-2xl border border-white/5">
                  <h3 className="text-[10px] font-black text-cyan-500 uppercase tracking-widest mb-6">
                    Video FX 2
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">4s/8s Gen</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
                        value={settings.priceVideoFX2_4s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX2_4s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">12s Gen</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
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
                <div className="bg-gray-900 p-6 rounded-2xl border border-teal-500/20">
                  <h3 className="text-[10px] font-black text-teal-500 uppercase tracking-widest mb-6">
                    Video FX 3
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">4s Gen</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
                        value={settings.priceVideoFX3_4s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX3_4s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">6s Gen</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
                        value={settings.priceVideoFX3_6s}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceVideoFX3_6s: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">8s Gen</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
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

              <div className="space-y-8">
                <div className="bg-gray-900 p-6 rounded-2xl border border-emerald-500/20">
                  <h3 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-6">
                    PicFX Editor
                  </h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Standard</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
                        value={settings.priceEditor_Standard}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceEditor_Standard: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Pro Edit</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
                        value={settings.priceEditor_Pro}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceEditor_Pro: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Enhance</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
                        value={settings.priceEditor_Enhance}
                        onChange={(e) =>
                          handleUpdateGlobalSettings({
                            priceEditor_Enhance: parseFloat(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">Ratio</span>
                      <input
                        step="0.01"
                        type="number"
                        className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
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
                <div className="bg-gray-900 p-6 rounded-2xl border border-rose-500/20">
                  <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-6">
                    Path Tools
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-400">
                      Drift Video Path
                    </span>
                    <input
                      step="0.01"
                      type="number"
                      className="w-20 bg-gray-950 border border-gray-800 rounded p-2 text-center text-xs font-bold"
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
            <div className="fixed bottom-8 right-8 bg-gray-900/90 backdrop-blur-md border border-cyan-500/30 p-6 rounded-3xl shadow-2xl max-w-xs animate-in zoom-in-95">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <span className="text-[10px] font-black uppercase text-cyan-400 tracking-widest">
                    Total Render Budget
                  </span>
                  <div className="flex items-center gap-1 bg-gray-950 px-2 py-1 rounded-lg">
                    <span className="text-[9px] text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-10 bg-transparent text-[10px] font-bold outline-none text-white text-right"
                      value={baseBudgetRate}
                      onChange={(e) =>
                        setBaseBudgetRate(parseFloat(e.target.value))
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-black text-white">
                    {totalRenderBudget}
                  </span>
                  <span className="text-[9px] text-gray-500 uppercase font-bold mt-1">
                    Global User Reserve Value
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: MANAGE USER (FIXED FLEXIBILITY & CUTTING) */}
        {editingUser && (
          <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-[100] overflow-y-auto p-4 py-10 backdrop-blur-sm custom-scrollbar">
            <div className="bg-gray-900 border border-white/10 rounded-3xl p-8 sm:p-10 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tighter text-white">
                    User Identity
                  </h3>
                  <p className="text-xs text-gray-500 font-mono mt-1">
                    {editingUser.email}
                  </p>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-gray-500 hover:text-white p-2"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-10">
                {/* 1. RESERVE ADJUSTMENT */}
                <div className="p-6 bg-gray-950 rounded-2xl border border-white/5">
                  <label className="text-[10px] font-black text-cyan-500 uppercase mb-6 block tracking-widest text-center">
                    User Reserve
                  </label>
                  <div className="space-y-5">
                    <div>
                      <span className="text-[9px] text-gray-500 uppercase font-black block mb-2">
                        Select Target Function:
                      </span>
                      <select
                        className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs outline-none focus:border-cyan-500"
                        value={targetCreditPool}
                        onChange={(e) => setTargetCreditPool(e.target.value)}
                      >
                        <option value="creditsPicDrift">PicDrift</option>
                        <option value="creditsImageFX">PicFX</option>
                        <option value="creditsVideoFX1">VideoFX 1</option>
                        <option value="creditsVideoFX2">VideoFX 2</option>
                        <option value="creditsVideoFX3">VideoFX 3</option>
                      </select>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-500 uppercase font-black block mb-2">
                        Amount Adjustment:
                      </span>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="0.01"
                          className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-3 text-sm text-white font-bold outline-none"
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
                          className="px-6 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. BILLING MODE */}
                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase mb-3 block tracking-widest text-center">
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
                      className={`p-4 rounded-2xl border font-bold text-[10px] uppercase transition-all ${pendingUpdates.creditSystem === "COMMERCIAL" ? "bg-green-600 border-green-500 text-white shadow-lg" : "bg-gray-950 border-gray-800 text-gray-600"}`}
                    >
                      Commercial ($)
                    </button>
                    <button
                      onClick={() =>
                        setPendingUpdates({
                          ...pendingUpdates,
                          creditSystem: "INTERNAL",
                        })
                      }
                      className={`p-4 rounded-2xl border font-bold text-[10px] uppercase transition-all ${pendingUpdates.creditSystem === "INTERNAL" ? "bg-purple-600 border-purple-500 text-white shadow-lg" : "bg-gray-950 border-gray-800 text-gray-600"}`}
                    >
                      Internal (pts)
                    </button>
                  </div>
                </div>

                {/* 3. PERMISSION LEVEL (Admin Only) */}
                <div>
                  <label className="text-[9px] font-black text-gray-500 uppercase mb-3 block tracking-widest text-center">
                    Permission Level
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      disabled={adminUser?.role === "MANAGER"}
                      onClick={() =>
                        setPendingUpdates({ ...pendingUpdates, role: "USER" })
                      }
                      className={`p-3 rounded-xl border font-bold text-[9px] uppercase transition-all ${pendingUpdates.role === "USER" ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-950 border-gray-800 text-gray-700"}`}
                    >
                      User
                    </button>
                    <button
                      disabled={adminUser?.role === "MANAGER"}
                      onClick={() =>
                        setPendingUpdates({
                          ...pendingUpdates,
                          role: "MANAGER",
                        })
                      }
                      className={`p-3 rounded-xl border font-bold text-[9px] uppercase transition-all ${pendingUpdates.role === "MANAGER" ? "bg-amber-600 border-amber-500 text-white" : "bg-gray-950 border-gray-800 text-gray-700"}`}
                    >
                      Manager
                    </button>
                    <button
                      disabled={adminUser?.role === "MANAGER"}
                      onClick={() =>
                        setPendingUpdates({ ...pendingUpdates, role: "ADMIN" })
                      }
                      className={`p-3 rounded-xl border font-bold text-[9px] uppercase transition-all ${pendingUpdates.role === "ADMIN" ? "bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/40" : "bg-gray-950 border-gray-800 text-gray-700"}`}
                    >
                      Admin
                    </button>
                  </div>
                  {adminUser?.role === "MANAGER" && (
                    <p className="text-[8px] text-center text-red-500 font-bold uppercase mt-3 tracking-tighter">
                      Permission levels can only be updated by the account
                      owner.
                    </p>
                  )}
                </div>

                <div className="pt-8 border-t border-white/5 space-y-4">
                  <button
                    onClick={handleSaveChanges}
                    disabled={actionLoading}
                    className="w-full py-5 bg-cyan-600 hover:bg-cyan-500 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl transition-all disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      "Save Profile Changes"
                    )}
                  </button>
                  <button
                    onClick={() => setEditingUser(null)}
                    className="w-full text-[9px] text-gray-600 font-black uppercase tracking-widest hover:text-white transition-all"
                  >
                    Close manager
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: INVITE (Similar styling fix) */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/95 flex items-start justify-center z-[100] overflow-y-auto p-4 py-20 backdrop-blur-sm">
            <div className="bg-gray-900 border border-white/10 rounded-3xl p-10 w-full max-w-md shadow-2xl animate-in zoom-in-95">
              <h3 className="text-xl font-black mb-8 text-center uppercase tracking-tighter">
                Invite New User
              </h3>
              <form onSubmit={handleInviteUser} className="space-y-5">
                <input
                  className="w-full p-4 bg-gray-950 border border-gray-800 rounded-2xl text-sm outline-none focus:border-cyan-500"
                  placeholder="Email Address"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  required
                />
                <input
                  className="w-full p-4 bg-gray-950 border border-gray-800 rounded-2xl text-sm outline-none focus:border-cyan-500"
                  placeholder="Full Display Name"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                  required
                />
                <input
                  type="password"
                  title="Password"
                  className="w-full p-4 bg-gray-950 border border-gray-800 rounded-2xl text-sm outline-none focus:border-cyan-500"
                  placeholder="Password"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  required
                />
                <div className="flex gap-4 pt-6">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-4 bg-cyan-600 hover:bg-cyan-500 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg transition-all"
                  >
                    Create
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
