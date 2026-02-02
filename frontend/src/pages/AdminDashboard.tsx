import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";

interface User {
  id: string;
  email: string;
  name: string;
  creditSystem: "COMMERCIAL" | "INTERNAL";
  creditBalance: number; // Legacy
  creditsPicDrift: number;
  creditsImageFX: number;
  creditsVideoFX1: number;
  creditsVideoFX2: number;
  role?: string;
}

interface GlobalSettings {
  pricePicDrift_5s: number;
  pricePicDrift_10s: number;
  pricePicFX_Standard: number;
  pricePicFX_Carousel: number;
  pricePicFX_Batch: number;
  priceVideoFX1_10s: number;
  priceVideoFX1_15s: number;
  priceVideoFX2_4s: number;
  priceVideoFX2_8s: number;
  priceVideoFX2_12s: number;
  priceEditor_Standard: number;
  priceEditor_Pro: number;
  priceEditor_Enhance: number;
  priceEditor_Convert: number;
  priceAsset_DriftPath: number;
}

interface CreditRequest {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export default function AdminDashboard() {
  const { user: adminUser } = useAuth();
  const navigate = useNavigate();

  // Data State
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [customCreditAmount, setCustomCreditAmount] = useState<number>(0);
  const [targetCreditPool, setTargetCreditPool] =
    useState<string>("creditsPicDrift");

  // UI State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [pendingUpdates, setPendingUpdates] = useState<Partial<User>>({});
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "" });
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState("");

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
    } catch (err) {
      console.error("Failed to load data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveRequest = async (id: string) => {
    try {
      await apiEndpoints.adminResolveRequest(id);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateGlobalSettings = async (
    updatedSettings: Partial<GlobalSettings>,
  ) => {
    try {
      const res = await apiEndpoints.adminUpdateSettings(updatedSettings);
      if (res.data.success) {
        setSettings(res.data.settings);
        setMsg("✅ Pricing updated globally!");
      }
    } catch (err: any) {
      alert("Failed to update settings: " + err.message);
    }
  };

  const formatCurrency = (
    amount: number,
    system: "COMMERCIAL" | "INTERNAL",
  ) => {
    if (system === "COMMERCIAL") return `$${amount}`;
    return `${amount} pts`;
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setMsg("");
    try {
      await apiEndpoints.adminCreateUser(newUser);
      setMsg("✅ User created & synced!");
      setNewUser({ email: "", password: "", name: "" });
      setShowInviteModal(false);
      fetchData();
    } catch (err: any) {
      setMsg("❌ " + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuickAddCredits = async (
    userId: string,
    type: string,
    amount: number,
  ) => {
    setActionLoading(true);
    try {
      await apiEndpoints.adminUpdateUser(userId, {
        addCredits: amount,
        creditType: type,
      });
      setMsg(`✅ Added credits successfully!`);
      fetchData();
    } catch (err: any) {
      alert("Failed: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!editingUser) return;
    setActionLoading(true);
    try {
      await apiEndpoints.adminUpdateUser(editingUser.id, pendingUpdates);
      setMsg("✅ User updated successfully");
      setEditingUser(null);
      fetchData();
    } catch (err: any) {
      alert("Failed to save changes: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Delete ${user.email}?`)) return;
    setLoading(true);
    try {
      await apiEndpoints.adminDeleteUser(user.id);
      setMsg(`✅ User deleted.`);
      fetchData();
    } catch (err: any) {
      alert("Failed: " + err.message);
      setLoading(false);
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setPendingUpdates({
      creditSystem: user.creditSystem,
      role: user.role || "USER",
    });
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* HEADER & NAVIGATION */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/app")}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-400 transition-colors border border-gray-700"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-3xl font-bold text-cyan-400">Admin Panel</h1>
              <p className="text-sm text-gray-500">
                Logged in as: {adminUser?.email}
              </p>
            </div>
          </div>

          <div className="flex gap-4 w-full md:w-auto">
            <input
              placeholder="Search users..."
              className="bg-gray-900 border border-gray-800 rounded-xl p-3 w-full md:w-64 focus:ring-2 focus:ring-cyan-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              onClick={() => setShowInviteModal(true)}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-lg"
            >
              + New User
            </button>
          </div>
        </div>

        {msg && (
          <div
            className={`mb-6 p-4 rounded-xl border flex justify-between items-center ${
              msg.startsWith("✅")
                ? "bg-green-900/20 border-green-500/30 text-green-300"
                : "bg-red-900/20 border-red-500/30 text-red-300"
            }`}
          >
            <span>{msg}</span>
            <button onClick={() => setMsg("")}>✕</button>
          </div>
        )}

        {/* PENDING REQUESTS */}
        {requests.length > 0 && (
          <div className="mb-8 bg-purple-900/20 border border-purple-500/30 rounded-xl p-6 animate-in fade-in">
            <h2 className="text-xl font-bold text-purple-300 mb-4 flex items-center gap-2">
              🔔 Pending Credit Requests ({requests.length})
            </h2>
            <div className="grid gap-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between bg-gray-900 p-4 rounded-lg border border-gray-800"
                >
                  <div>
                    <span className="font-bold text-white">{req.name}</span>
                    <span className="text-gray-400 text-sm ml-2">
                      ({req.email})
                    </span>
                  </div>
                  <button
                    onClick={() => handleResolveRequest(req.id)}
                    className="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded text-xs text-white uppercase font-bold"
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GLOBAL PRICING ENGINE - ALL 15 CONTROLS */}
        {settings && (
          <div className="mb-10 bg-gray-900/50 border border-gray-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-cyan-400">
              ⚙️ Global Pricing Engine
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* COLUMN 1: PICDRIFT & PIC FX */}
              <div className="space-y-6">
                <div className="space-y-4 bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <h3 className="text-xs font-bold text-pink-500 uppercase tracking-widest border-b border-pink-500/20 pb-2">
                    PicDrift (Kling 2.5)
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">5s Gen</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.pricePicDrift_5s}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          pricePicDrift_5s: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">10s Gen</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.pricePicDrift_10s}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          pricePicDrift_10s: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4 bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <h3 className="text-xs font-bold text-violet-500 uppercase tracking-widest border-b border-violet-500/20 pb-2">
                    Pic FX (Studio)
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">
                      Standard Image
                    </span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.pricePicFX_Standard}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          pricePicFX_Standard: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Carousel Gen</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.pricePicFX_Carousel}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          pricePicFX_Carousel: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">
                      Batch (Per Img)
                    </span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.pricePicFX_Batch}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          pricePicFX_Batch: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* COLUMN 2: VIDEO FX ENGINES */}
              <div className="space-y-6">
                <div className="space-y-4 bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <h3 className="text-xs font-bold text-blue-500 uppercase tracking-widest border-b border-blue-500/20 pb-2">
                    Video FX 1 (Kling)
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">10s Gen</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.priceVideoFX1_10s}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceVideoFX1_10s: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">15s Gen</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.priceVideoFX1_15s}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceVideoFX1_15s: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4 bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest border-b border-cyan-500/20 pb-2">
                    Video FX 2 (Sora)
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">4s Gen</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.priceVideoFX2_4s}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceVideoFX2_4s: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">8s Gen</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.priceVideoFX2_8s}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceVideoFX2_8s: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">12s Gen</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.priceVideoFX2_12s}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceVideoFX2_12s: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* COLUMN 3: ASSET EDITOR & PATH TOOLS */}
              <div className="space-y-6">
                <div className="space-y-4 bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest border-b border-emerald-500/20 pb-2">
                    Editor Tools
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Standard Edit</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.priceEditor_Standard}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceEditor_Standard: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Pro Edit (AI)</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.priceEditor_Pro}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceEditor_Pro: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Enhance Tool</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.priceEditor_Enhance}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceEditor_Enhance: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">Ratio Convert</span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.priceEditor_Convert}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceEditor_Convert: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4 bg-gray-950 p-4 rounded-xl border border-gray-800">
                  <h3 className="text-xs font-bold text-rose-500 uppercase tracking-widest border-b border-rose-500/20 pb-2">
                    Path Tools
                  </h3>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-400">
                      Drift Video Path
                    </span>
                    <input
                      type="number"
                      className="w-16 bg-gray-900 border border-gray-700 rounded p-1 text-center"
                      value={settings.priceAsset_DriftPath}
                      onChange={(e) =>
                        handleUpdateGlobalSettings({
                          priceAsset_DriftPath: parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* USER MANAGEMENT TABLE */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-800/50 text-gray-400 text-[10px] uppercase tracking-widest">
                <tr>
                  <th className="p-5 border-b border-gray-800">
                    User Identity
                  </th>
                  <th className="p-5 border-b border-gray-800">PicDrift</th>
                  <th className="p-5 border-b border-gray-800">Pic FX</th>
                  <th className="p-5 border-b border-gray-800">Video FX 1</th>
                  <th className="p-5 border-b border-gray-800">Video FX 2</th>
                  <th className="p-5 border-b border-gray-800 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-20 text-center">
                      <LoadingSpinner size="lg" variant="neon" />
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-20 text-center text-gray-500">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-gray-800/30 transition-colors"
                    >
                      <td className="p-5">
                        <div className="font-bold flex items-center gap-2">
                          {u.name}{" "}
                          {u.role === "ADMIN" && (
                            <span className="text-[9px] bg-red-900 text-red-200 px-1 rounded">
                              ADMIN
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{u.email}</div>
                        <div
                          className={`mt-1 text-[9px] font-bold uppercase ${u.creditSystem === "COMMERCIAL" ? "text-green-500" : "text-purple-400"}`}
                        >
                          {u.creditSystem === "COMMERCIAL"
                            ? "💵 Commercial"
                            : "🏢 Internal"}
                        </div>
                      </td>

                      {/* Granular Pools */}
                      <td className="p-5">
                        <div className="text-lg font-bold text-pink-400">
                          {formatCurrency(u.creditsPicDrift, u.creditSystem)}
                        </div>
                        <button
                          disabled={actionLoading}
                          onClick={() =>
                            handleQuickAddCredits(u.id, "creditsPicDrift", 10)
                          }
                          className="text-[10px] text-gray-600 hover:text-white disabled:opacity-30"
                        >
                          +10
                        </button>
                      </td>
                      <td className="p-5">
                        <div className="text-lg font-bold text-violet-400">
                          {formatCurrency(u.creditsImageFX, u.creditSystem)}
                        </div>
                        <button
                          disabled={actionLoading}
                          onClick={() =>
                            handleQuickAddCredits(u.id, "creditsImageFX", 10)
                          }
                          className="text-[10px] text-gray-600 hover:text-white disabled:opacity-30"
                        >
                          +10
                        </button>
                      </td>
                      <td className="p-5">
                        <div className="text-lg font-bold text-blue-400">
                          {formatCurrency(u.creditsVideoFX1, u.creditSystem)}
                        </div>
                        <button
                          disabled={actionLoading}
                          onClick={() =>
                            handleQuickAddCredits(u.id, "creditsVideoFX1", 10)
                          }
                          className="text-[10px] text-gray-600 hover:text-white disabled:opacity-30"
                        >
                          +10
                        </button>
                      </td>
                      <td className="p-5">
                        <div className="text-lg font-bold text-cyan-400">
                          {formatCurrency(u.creditsVideoFX2, u.creditSystem)}
                        </div>
                        <button
                          disabled={actionLoading}
                          onClick={() =>
                            handleQuickAddCredits(u.id, "creditsVideoFX2", 10)
                          }
                          className="text-[10px] text-gray-600 hover:text-white disabled:opacity-30"
                        >
                          +10
                        </button>
                      </td>

                      <td className="p-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs"
                          >
                            Manage
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-2 bg-red-900/20 hover:bg-red-600 rounded-lg text-xs text-red-400 hover:text-white"
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

        {/* MODAL: INVITE USER */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-md shadow-2xl">
              <h3 className="text-xl font-bold mb-6">Invite User</h3>
              <form onSubmit={handleInviteUser} className="space-y-4">
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-xl focus:ring-1 focus:ring-cyan-500 outline-none"
                  placeholder="Email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  required
                />
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-xl focus:ring-1 focus:ring-cyan-500 outline-none"
                  placeholder="Full Name"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                  required
                />
                <input
                  type="password"
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-xl focus:ring-1 focus:ring-cyan-500 outline-none"
                  placeholder="Password"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  required
                />
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 py-3 text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold disabled:opacity-50 flex justify-center"
                  >
                    {actionLoading ? (
                      <LoadingSpinner size="sm" variant="light" />
                    ) : (
                      "Create"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: MANAGE USER */}
        {editingUser && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold mb-1">Manage User</h3>
                  <p className="text-sm text-gray-500">{editingUser.email}</p>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="text-gray-500 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-8">
                {/* 1. WALLET ADJUSTMENT (THE NEW SECTION) */}
                <div className="p-4 bg-gray-950 rounded-xl border border-gray-800">
                  <label className="text-xs font-bold text-cyan-500 uppercase mb-4 block tracking-widest">
                    Individual Wallet Adjustment
                  </label>
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase font-bold block mb-2">
                        Select Target Wallet
                      </span>
                      <select
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-sm text-white"
                        value={targetCreditPool}
                        onChange={(e) => setTargetCreditPool(e.target.value)}
                      >
                        <option value="creditsPicDrift">PicDrift Wallet</option>
                        <option value="creditsImageFX">Pic FX Wallet</option>
                        <option value="creditsVideoFX1">
                          Video FX 1 Wallet
                        </option>
                        <option value="creditsVideoFX2">
                          Video FX 2 Wallet
                        </option>
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-500 uppercase font-bold block mb-2">
                        Amount to Add (Use negative to deduct)
                      </span>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white font-bold"
                          value={customCreditAmount}
                          onChange={(e) =>
                            setCustomCreditAmount(parseInt(e.target.value))
                          }
                        />
                        <button
                          onClick={() => {
                            handleQuickAddCredits(
                              editingUser.id,
                              targetCreditPool,
                              customCreditAmount,
                            );
                            setCustomCreditAmount(0); // Reset after adding
                          }}
                          disabled={actionLoading || customCreditAmount === 0}
                          className="px-6 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold text-sm disabled:opacity-30"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. BILLING MODE */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block tracking-widest">
                    Billing Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        setPendingUpdates({
                          ...pendingUpdates,
                          creditSystem: "COMMERCIAL",
                        })
                      }
                      className={`p-3 rounded-xl border font-bold text-sm transition-all ${pendingUpdates.creditSystem === "COMMERCIAL" ? "bg-green-600 border-green-500" : "bg-gray-950 border-gray-800 text-gray-500"}`}
                    >
                      💵 Commercial ($)
                    </button>
                    <button
                      onClick={() =>
                        setPendingUpdates({
                          ...pendingUpdates,
                          creditSystem: "INTERNAL",
                        })
                      }
                      className={`p-3 rounded-xl border font-bold text-sm transition-all ${pendingUpdates.creditSystem === "INTERNAL" ? "bg-purple-600 border-purple-500" : "bg-gray-950 border-gray-800 text-gray-500"}`}
                    >
                      🏢 Internal (pts)
                    </button>
                  </div>
                </div>

                {/* 3. PERMISSION LEVEL */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block tracking-widest">
                    Permission Level
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        setPendingUpdates({ ...pendingUpdates, role: "USER" })
                      }
                      className={`p-3 rounded-xl border font-bold text-sm transition-all ${pendingUpdates.role === "USER" ? "bg-gray-700 border-gray-600" : "bg-gray-950 border-gray-800 text-gray-500"}`}
                    >
                      👤 Regular User
                    </button>
                    <button
                      onClick={() =>
                        setPendingUpdates({ ...pendingUpdates, role: "ADMIN" })
                      }
                      className={`p-3 rounded-xl border font-bold text-sm transition-all ${pendingUpdates.role === "ADMIN" ? "bg-red-600 border-red-500" : "bg-gray-950 border-gray-800 text-gray-500"}`}
                    >
                      🛡️ Super Admin
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-800 space-y-3">
                  <button
                    onClick={handleSaveChanges}
                    disabled={actionLoading}
                    className="w-full py-4 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold shadow-xl transition-all disabled:opacity-50 flex justify-center"
                  >
                    {actionLoading ? (
                      <LoadingSpinner size="sm" variant="light" />
                    ) : (
                      "Save Profile Changes"
                    )}
                  </button>
                  <button
                    onClick={() => setEditingUser(null)}
                    className="w-full text-gray-500 text-sm hover:text-gray-300"
                  >
                    Close Manager
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
