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
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    view: "VISIONLIGHT",
    maxProjects: 3,
  });
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
    setPendingUpdates({
      creditSystem: user.creditSystem,
      role: user.role,
      view: user.view,
      maxProjects: user.maxProjects,
    });
  };

  const handleDeleteUser = async (user: User) => {
    if (!window.confirm(`Delete ${user.email}?`)) return;
    setActionLoading(true);
    try {
      await apiEndpoints.adminDeleteUser(user.id);
      setMsg("User deleted successfully.");
      setTimeout(() => setMsg(""), 3000);
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
      setMsg("User created successfully.");
      setTimeout(() => setMsg(""), 3000);
      setNewUser({
        email: "",
        password: "",
        name: "",
        view: "VISIONLIGHT",
        maxProjects: 3,
      });
      setShowInviteModal(false);
      fetchData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
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
        setMsg("Controls updated successfully.");
        setTimeout(() => setMsg(""), 3000);
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
      setMsg(`Render limits updated.`);
      setTimeout(() => setMsg(""), 3000);
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
      setMsg("User profile updated.");
      setTimeout(() => setMsg(""), 3000);
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
    <div className="min-h-screen bg-gray-950 text-gray-200 p-6 sm:p-10 font-sans">
      <div className="max-w-[1400px] mx-auto pb-24">
        {/* HEADER */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-12 gap-8 border-b border-gray-800 pb-8">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
              VISIONLIGHT <span className="text-brand-accent">ADMIN</span>
            </h1>
            <p className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold">
              Systems Control — Operator: {adminUser?.email}
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-6 w-full xl:w-auto">
            <div className="flex bg-gray-900 p-1.5 rounded-lg border border-gray-800 shadow-sm w-fit">
              <button
                onClick={() => navigate("/app")}
                className="px-6 py-2.5 rounded-md text-[11px] font-bold text-gray-400 hover:text-white hover:bg-gray-800 transition-colors uppercase tracking-widest"
              >
                App
              </button>
              <button
                onClick={() => setActiveTab("users")}
                className={`px-6 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  activeTab === "users"
                    ? "bg-gray-800 text-brand-accent shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                }`}
              >
                Users
              </button>
              <button
                onClick={() => setActiveTab("controls")}
                className={`px-6 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  activeTab === "controls"
                    ? "bg-gray-800 text-brand-accent shadow-sm"
                    : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                }`}
              >
                Global Control
              </button>
            </div>

            <div className="flex gap-4 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <input
                  placeholder="Search entities..."
                  className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 w-full text-sm text-gray-200 outline-none focus:border-brand-accent transition-colors placeholder-gray-500 h-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button
                onClick={() => setShowInviteModal(true)}
                className="bg-brand-accent hover:bg-cyan-300 text-gray-950 font-bold px-6 py-2 rounded-lg text-[11px] uppercase tracking-widest transition-colors whitespace-nowrap h-full"
              >
                Create User
              </button>
            </div>
          </div>
        </div>

        {msg && (
          <div className="mb-8 p-4 rounded-lg border border-brand-accent/20 bg-brand-accent/5 text-brand-accent flex justify-between items-center">
            <span className="text-sm font-semibold tracking-wide">{msg}</span>
            <button
              onClick={() => setMsg("")}
              className="text-brand-accent hover:text-cyan-300 text-lg"
            >
              ×
            </button>
          </div>
        )}

        {/* REQUESTS */}
        {requests.length > 0 && (
          <div className="mb-12 bg-gray-900 border border-gray-800 rounded-xl p-8">
            <h2 className="text-[11px] font-bold text-gray-400 mb-6 uppercase tracking-widest">
              Pending Allocations ({requests.length})
            </h2>
            <div className="grid gap-4">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-gray-950 p-5 rounded-lg border border-gray-800 gap-4"
                >
                  <div className="flex flex-col gap-1.5">
                    <span className="font-bold text-sm text-white tracking-tight">
                      {req.name}
                    </span>
                    <span className="text-xs text-gray-500 font-mono tracking-wider">
                      {req.email}
                    </span>
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button
                      onClick={() => {
                        setSearchTerm(req.email);
                        setActiveTab("users");
                      }}
                      className="flex-1 sm:flex-none text-[10px] text-gray-400 font-bold uppercase tracking-widest hover:text-white transition-colors bg-gray-800 px-4 py-2 rounded-md"
                    >
                      Locate
                    </button>
                    <button
                      onClick={() =>
                        apiEndpoints.adminResolveRequest(req.id).then(fetchData)
                      }
                      className="flex-1 sm:flex-none bg-brand-accent/10 hover:bg-brand-accent/20 px-4 py-2 rounded-md text-[10px] uppercase font-bold text-brand-accent transition-colors border border-brand-accent/20"
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-gray-950/50 text-gray-400 text-[10px] uppercase tracking-widest font-semibold">
                  <tr>
                    <th className="p-6 border-b border-gray-800">Identity</th>
                    <th className="p-6 border-b border-gray-800 text-center">PD Standard</th>
                    <th className="p-6 border-b border-gray-800 text-center">PD Plus</th>
                    <th className="p-6 border-b border-gray-800 text-center">PicFX</th>
                    <th className="p-6 border-b border-gray-800 text-center">Video FX 1</th>
                    <th className="p-6 border-b border-gray-800 text-center">Video FX 2</th>
                    <th className="p-6 border-b border-gray-800 text-center">Video FX 3</th>
                    <th className="p-6 border-b border-gray-800 text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="p-24 text-center">
                        <LoadingSpinner size="lg" variant="neon" />
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr
                        key={u.id}
                        className="hover:bg-gray-800/50 transition-colors group"
                      >
                        <td className="p-6">
                          <div className="font-bold text-sm text-white tracking-tight">
                            {u.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-1 font-mono">
                            {u.email}
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <span
                              className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md ${
                                u.creditSystem === "COMMERCIAL"
                                  ? "bg-brand-accent/10 text-brand-accent border border-brand-accent/20"
                                  : "bg-gray-800 text-gray-400 border border-gray-700"
                              }`}
                            >
                              {u.view === "PICDRIFT"
                                ? "Demo Access"
                                : u.creditSystem}
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md bg-gray-800 text-gray-400 border border-gray-700">
                              {u.role}
                            </span>
                          </div>
                        </td>
                        {[
                          u.creditsPicDrift,
                          u.creditsPicDriftPlus,
                          u.creditsImageFX,
                          u.creditsVideoFX1,
                          u.creditsVideoFX2,
                          u.creditsVideoFX3,
                        ].map((credit, idx) => (
                          <td key={idx} className="p-6 text-center">
                            <div className="text-sm font-semibold text-gray-300">
                              {(credit || 0).toFixed(0)}
                            </div>
                          </td>
                        ))}
                        <td className="p-6 text-right">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditModal(u)}
                              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors border border-gray-700"
                            >
                              Manage
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors border border-red-500/20"
                            >
                              Delete
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
          <div>
            <h2 className="text-[11px] font-bold mb-8 text-gray-400 uppercase tracking-widest">
              Inventory Resource Controls
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  title: "PicDrift Engine",
                  items: [
                    { label: "Standard 5s", key: "pricePicDrift_5s" },
                    { label: "Standard 10s", key: "pricePicDrift_10s" },
                    { label: "Plus 5s", key: "pricePicDrift_Plus_5s" },
                    { label: "Plus 10s", key: "pricePicDrift_Plus_10s" },
                  ],
                },
                {
                  title: "Pic FX & Studio Tools",
                  items: [
                    { label: "Standard Image", key: "pricePicFX_Standard" },
                    { label: "Carousel Batch", key: "pricePicFX_Carousel" },
                    { label: "Mass Processing", key: "pricePicFX_Batch" },
                  ],
                },
                {
                  title: "Video FX Engine 1",
                  items: [
                    { label: "FX 1 - 10s", key: "priceVideoFX1_10s" },
                    { label: "FX 1 - 15s", key: "priceVideoFX1_15s" },
                  ],
                },
                {
                  title: "Video FX Engine 2",
                  items: [
                    { label: "FX 2 - Base", key: "priceVideoFX2_4s" },
                    { label: "FX 2 - Max", key: "priceVideoFX2_12s" },
                  ],
                },
                {
                  title: "Video FX Engine 3",
                  items: [
                    { label: "FX 3 - 4s", key: "priceVideoFX3_4s" },
                    { label: "FX 3 - 6s", key: "priceVideoFX3_6s" },
                    { label: "FX 3 - 8s", key: "priceVideoFX3_8s" },
                  ],
                },
                {
                  title: "PicFX Editor & Path",
                  items: [
                    { label: "Pro Editor", key: "priceEditor_Pro" },
                    { label: "Enhance / Upscale", key: "priceEditor_Enhance" },
                    { label: "Format Convert", key: "priceEditor_Convert" },
                    { label: "Generate Path", key: "priceAsset_DriftPath" },
                  ],
                },
              ].map((section, sIdx) => (
                <div
                  key={sIdx}
                  className="bg-gray-900 p-8 rounded-xl border border-gray-800 shadow-sm"
                >
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 pb-4 border-b border-gray-800">
                    {section.title}
                  </h3>
                  <div className="space-y-5">
                    {section.items.map((item, iIdx) => (
                      <div
                        key={iIdx}
                        className="flex justify-between items-center"
                      >
                        <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-widest">
                          {item.label}
                        </span>
                        <input
                          step="0.01"
                          type="number"
                          className="w-24 bg-gray-950 border border-gray-700 rounded-md p-2 text-center text-xs font-semibold text-white outline-none focus:border-brand-accent transition-colors"
                          defaultValue={(settings as any)[item.key]}
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              handleUpdateGlobalSettings({
                                [item.key]: val,
                              });
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* BUDGET CALCULATOR */}
            <div className="fixed bottom-10 right-10 bg-gray-900 border border-gray-800 p-6 rounded-xl shadow-2xl max-w-sm z-50">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-4 gap-8">
                  <span className="text-[10px] font-bold uppercase text-gray-400 tracking-widest">
                    Yield Valuation
                  </span>
                  <div className="flex items-center gap-2 bg-gray-950 px-3 py-2 rounded-md border border-gray-800">
                    <span className="text-xs text-gray-500 font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="w-16 bg-transparent text-xs font-bold outline-none text-white text-right"
                      value={baseBudgetRate}
                      onChange={(e) =>
                        setBaseBudgetRate(parseFloat(e.target.value))
                      }
                    />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-brand-accent tracking-tight">
                    {totalRenderBudget}
                  </span>
                  <span className="text-[10px] text-gray-500 uppercase font-bold mt-1 tracking-widest">
                    Aggregate Resource Value
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: MANAGE USER */}
        {editingUser && (
          <div className="fixed inset-0 bg-gray-950/80 flex items-start justify-center z-[100] overflow-y-auto p-4 py-10 backdrop-blur-sm custom-scrollbar">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 sm:p-10 w-full max-w-2xl shadow-2xl relative">
              <button
                onClick={() => setEditingUser(null)}
                className="absolute top-8 right-8 text-gray-500 hover:text-white transition-colors text-xl font-bold"
              >
                ×
              </button>

              <div className="mb-10 pb-6 border-b border-gray-800">
                <h3 className="text-xl font-bold text-white tracking-tight mb-2 uppercase tracking-widest">
                  {editingUser.view === "PICDRIFT"
                    ? "Demo Account Control"
                    : "Account Settings"}
                </h3>
                <p className="text-sm text-gray-400 font-mono">
                  {editingUser.email}
                </p>
              </div>

              <div className="space-y-10">
                {/* 1. RENDER ALLOCATION */}
                {editingUser.view === "PICDRIFT" ? (
                  <div className="space-y-6">
                    <label className="text-[11px] font-bold text-brand-accent uppercase tracking-widest block mb-4">
                      Assigned Renders (Integers)
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      {[
                        { id: "creditsPicDrift", label: "PD Standard" },
                        { id: "creditsPicDriftPlus", label: "PD Plus" },
                        { id: "creditsImageFX", label: "Pic FX" },
                        { id: "creditsVideoFX1", label: "Video FX 1" },
                        { id: "creditsVideoFX2", label: "Video FX 2" },
                        { id: "creditsVideoFX3", label: "Video FX 3" },
                      ].map((pool) => (
                        <div key={pool.id} className="flex flex-col gap-3">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                            {pool.label}
                          </span>
                          <input
                            type="number"
                            step="1"
                            className="w-full bg-gray-950 border border-gray-800 rounded-md px-4 py-2 text-sm font-semibold text-white outline-none focus:border-brand-accent transition-colors"
                            defaultValue={Math.floor(
                              (editingUser as any)[pool.id] || 0,
                            )}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value) || 0;
                              handleQuickAddCredits(
                                editingUser.id,
                                pool.id,
                                (
                                  val - (editingUser as any)[pool.id]
                                ).toString(),
                              );
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-gray-950 rounded-xl border border-gray-800">
                    <label className="text-[11px] font-bold text-brand-accent uppercase mb-6 block tracking-widest">
                      Wallet Configuration
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase font-bold block mb-3 tracking-widest">
                          Target Wallet
                        </span>
                        <select
                          className="w-full bg-gray-900 border border-gray-700 rounded-md p-2.5 text-sm outline-none focus:border-brand-accent text-gray-200 transition-colors"
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
                        <span className="text-[10px] text-gray-400 uppercase font-bold block mb-3 tracking-widest">
                          Allocation Adjustment (Current: {Math.floor((editingUser as any)[targetCreditPool] || 0)})
                        </span>
                        <div className="flex gap-3">
                          <input
                            type="number"
                            step="0.01"
                            className="flex-1 bg-gray-900 border border-gray-700 rounded-md p-2.5 text-sm text-white font-semibold outline-none focus:border-brand-accent transition-colors"
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
                            className="px-6 bg-gray-800 hover:bg-gray-700 text-brand-accent border border-gray-700 rounded-md font-bold text-[10px] uppercase tracking-widest transition-colors"
                          >
                            Assign
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* 2. BILLING MODE */}
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase mb-4 block tracking-widest">
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
                        className={`p-3 rounded-md border font-bold text-[10px] uppercase tracking-widest transition-colors ${
                          pendingUpdates.creditSystem === "COMMERCIAL"
                            ? "bg-brand-accent/10 border-brand-accent text-brand-accent"
                            : "bg-gray-950 border-gray-800 text-gray-500 hover:text-gray-300"
                        }`}
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
                        className={`p-3 rounded-md border font-bold text-[10px] uppercase tracking-widest transition-colors ${
                          pendingUpdates.creditSystem === "INTERNAL"
                            ? "bg-brand-accent/10 border-brand-accent text-brand-accent"
                            : "bg-gray-950 border-gray-800 text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        Internal
                      </button>
                    </div>
                  </div>

                  {/* 3. PERMISSION LEVEL */}
                  <div>
                    <label className="text-[11px] font-bold text-gray-400 uppercase mb-4 block tracking-widest">
                      Authorization Tier
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {["USER", "MANAGER", "ADMIN"].map((r) => (
                        <button
                          key={r}
                          disabled={adminUser?.role === "MANAGER"}
                          onClick={() =>
                            setPendingUpdates({
                              ...pendingUpdates,
                              role: r as any,
                            })
                          }
                          className={`p-3 rounded-md border font-bold text-[10px] uppercase tracking-widest transition-colors ${
                            pendingUpdates.role === r
                              ? "bg-gray-800 border-gray-600 text-white"
                              : "bg-gray-950 border-gray-800 text-gray-500 hover:text-gray-300"
                          }`}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. VIEW & PROJECTS */}
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase mb-4 block tracking-widest">
                    Interface & Limits
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <select
                      className="w-full bg-gray-950 border border-gray-800 rounded-md p-3 text-sm outline-none focus:border-brand-accent text-gray-300 transition-colors"
                      value={pendingUpdates.view || "VISIONLIGHT"}
                      onChange={(e) =>
                        setPendingUpdates({
                          ...pendingUpdates,
                          view: e.target.value as any,
                        })
                      }
                    >
                      <option value="VISIONLIGHT">VisionLight FX (Full)</option>
                      <option value="PICDRIFT">PicDrift (Demo)</option>
                    </select>
                    <div className="flex items-center justify-between p-3 bg-gray-950 border border-gray-800 rounded-md text-sm">
                      <span className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                        Max Projects
                      </span>
                      <input
                        type="number"
                        min="1"
                        className="w-20 bg-transparent text-right outline-none font-bold text-white focus:text-brand-accent transition-colors"
                        value={pendingUpdates.maxProjects || 3}
                        onChange={(e) =>
                          setPendingUpdates({
                            ...pendingUpdates,
                            maxProjects: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-8 mt-8 border-t border-gray-800 flex flex-col-reverse sm:flex-row gap-4 sm:justify-end">
                  <button
                    onClick={() => setEditingUser(null)}
                    className="px-8 py-3 text-[10px] text-gray-400 font-bold uppercase tracking-widest hover:text-white transition-colors bg-gray-950 border border-gray-800 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveChanges}
                    disabled={actionLoading}
                    className="flex justify-center items-center px-8 py-3 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-md font-bold uppercase text-[11px] tracking-widest transition-colors min-w-[200px]"
                  >
                    {actionLoading ? (
                      <LoadingSpinner size="sm" color="text-gray-950" />
                    ) : (
                      "Apply Changes"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: INVITE */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-gray-950/80 flex items-start justify-center z-[100] overflow-y-auto p-4 py-20 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 w-full max-w-md shadow-2xl relative">
              <button
                onClick={() => setShowInviteModal(false)}
                className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors text-xl font-bold"
              >
                ×
              </button>
              <h3 className="text-lg font-bold text-white mb-8 uppercase tracking-widest">
                User Provisioning
              </h3>
              <form onSubmit={handleInviteUser} className="space-y-5">
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-md text-sm outline-none focus:border-brand-accent transition-colors text-white placeholder-gray-600"
                  placeholder="Registry Email"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  required
                />
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-md text-sm outline-none focus:border-brand-accent transition-colors text-white placeholder-gray-600"
                  placeholder="Identification Name"
                  value={newUser.name}
                  onChange={(e) =>
                    setNewUser({ ...newUser, name: e.target.value })
                  }
                  required
                />
                <input
                  type="password"
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-md text-sm outline-none focus:border-brand-accent transition-colors text-white placeholder-gray-600"
                  placeholder="Access Key (Password)"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                  required
                />
                <select
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-md text-sm outline-none focus:border-brand-accent transition-colors text-gray-300"
                  value={newUser.view}
                  onChange={(e) =>
                    setNewUser({ ...newUser, view: e.target.value })
                  }
                >
                  <option value="VISIONLIGHT">VisionLight FX (Standard)</option>
                  <option value="PICDRIFT">PicDrift (Demo/Guest)</option>
                </select>
                <div className="flex items-center justify-between p-3 bg-gray-950 border border-gray-800 rounded-md text-sm">
                  <span className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">
                    Project Cap
                  </span>
                  <input
                    type="number"
                    min="1"
                    className="w-20 bg-transparent text-right outline-none text-white font-bold focus:text-brand-accent"
                    value={newUser.maxProjects}
                    onChange={(e) =>
                      setNewUser({
                        ...newUser,
                        maxProjects: parseInt(e.target.value) || 1,
                      })
                    }
                    required
                  />
                </div>
                <div className="pt-6">
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex justify-center items-center w-full py-4 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-md font-bold uppercase text-[11px] tracking-widest transition-colors"
                  >
                    {actionLoading ? (
                      <LoadingSpinner size="sm" color="text-gray-950" />
                    ) : (
                      "Provision User"
                    )}
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