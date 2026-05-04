import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiEndpoints, startReadOnlyImpersonation } from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
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

const COVERAGE_WALLETS = [
  { key: "creditsPicDrift", label: "PicDrift (Standard)", provider: "fal" },
  { key: "creditsPicDriftPlus", label: "Kling 3.0", provider: "fal" },
  { key: "creditsImageFX", label: "Image FX (Nano/GPT 2)", provider: "fal" },
  { key: "creditsVideoFX1", label: "Topaz Upscale", provider: "fal" },
  { key: "creditsVideoFX2", label: "Seedance 2.0", provider: "fal" },
  { key: "creditsVideoFX3", label: "Veo 3", provider: "fal" },
] as const;

type CoverageWalletKey = (typeof COVERAGE_WALLETS)[number]["key"];

const COVERAGE_VARIANTS = [
  { id: "picdrift_5s", label: "PicDrift 5s", provider: "fal", wallet: "creditsPicDrift", deductionKey: "pricePicDrift_5s" },
  { id: "picdrift_10s", label: "PicDrift 10s", provider: "fal", wallet: "creditsPicDrift", deductionKey: "pricePicDrift_10s" },
  { id: "picdrift_plus_5s", label: "Kling 3.0 5s", provider: "fal", wallet: "creditsPicDriftPlus", deductionKey: "pricePicDrift_Plus_5s" },
  { id: "picdrift_plus_10s", label: "Kling 3.0 10s", provider: "fal", wallet: "creditsPicDriftPlus", deductionKey: "pricePicDrift_Plus_10s" },
  { id: "picfx_standard", label: "Pic FX Standard (Nano/GPT 2)", provider: "fal", wallet: "creditsImageFX", deductionKey: "pricePicFX_Standard" },
  { id: "picfx_carousel", label: "Pic FX Carousel", provider: "fal", wallet: "creditsImageFX", deductionKey: "pricePicFX_Carousel" },
  { id: "picfx_batch", label: "Pic FX Batch", provider: "fal", wallet: "creditsImageFX", deductionKey: "pricePicFX_Batch" },
  { id: "editor_pro", label: "Pic FX Editor", provider: "fal", wallet: "creditsImageFX", deductionKey: "priceEditor_Pro" },
  { id: "editor_enhance", label: "Image Enhance/Upscale", provider: "fal", wallet: "creditsImageFX", deductionKey: "priceEditor_Enhance" },
  { id: "editor_convert", label: "Image Format Convert", provider: "fal", wallet: "creditsImageFX", deductionKey: "priceEditor_Convert" },
  { id: "topaz_upscale_2x", label: "Topaz Upscale 2x", provider: "fal", wallet: "creditsVideoFX1", deductionKey: "priceVideoFX1_10s" },
  { id: "topaz_upscale_4x", label: "Topaz Upscale 4x", provider: "fal", wallet: "creditsVideoFX1", deductionKey: "priceVideoFX1_15s" },
  { id: "seedance_fal_4s", label: "Seedance 2.0 4s", provider: "fal", wallet: "creditsVideoFX2", deductionKey: "priceVideoFX2_4s" },
  { id: "seedance_fal_8s", label: "Seedance 2.0 8s", provider: "fal", wallet: "creditsVideoFX2", deductionKey: "priceVideoFX2_8s" },
  { id: "seedance_fal_12s", label: "Seedance 2.0 12s", provider: "fal", wallet: "creditsVideoFX2", deductionKey: "priceVideoFX2_12s" },
  { id: "veo3_4s", label: "Veo 3 4s", provider: "fal", wallet: "creditsVideoFX3", deductionKey: "priceVideoFX3_4s" },
  { id: "veo3_6s", label: "Veo 3 6s", provider: "fal", wallet: "creditsVideoFX3", deductionKey: "priceVideoFX3_6s" },
  { id: "veo3_8s", label: "Veo 3 8s", provider: "fal", wallet: "creditsVideoFX3", deductionKey: "priceVideoFX3_8s" },
] as const;

type CoverageVariantId = (typeof COVERAGE_VARIANTS)[number]["id"];

const PICDRIFT_PRICING_KEYS = [
  "pricePicDrift_5s",
  "pricePicDrift_10s",
  "pricePicFX_Standard",
  "pricePicFX_Carousel",
  "pricePicFX_Batch",
  "priceEditor_Pro",
  "priceEditor_Enhance",
  "priceEditor_Convert",
  "priceAsset_DriftPath",
] as const;

export default function TenantDashboard() {
  const { user: adminUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPicdriftTenant = adminUser?.view === "PICDRIFT";

  const [activeTab, setActiveTab] = useState<"team" | "pricing" | "integrations">(
    "team",
  );
  const [users, setUsers] = useState<User[]>([]);
  const [creditRequests, setCreditRequests] = useState<CreditRequest[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [variantCostUsd, setVariantCostUsd] = useState<
    Record<CoverageVariantId, number>
  >({
    picdrift_5s: 0.1,
    picdrift_10s: 0.2,
    picdrift_plus_5s: 0.2,
    picdrift_plus_10s: 0.3,
    picfx_standard: 0.08,
    picfx_carousel: 0.2,
    picfx_batch: 0.08,
    editor_pro: 0.1,
    editor_enhance: 0.12,
    editor_convert: 0.08,
    topaz_upscale_2x: 0.45,
    topaz_upscale_4x: 0.7,
    seedance_fal_4s: 0.2,
    seedance_fal_8s: 0.35,
    seedance_fal_12s: 0.5,
    veo3_4s: 0.25,
    veo3_6s: 0.38,
    veo3_8s: 0.5,
  });
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    role: "USER",
    maxProjects: 3
  });

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");

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
    const requestedTab = searchParams.get("tab");
    if (
      requestedTab === "team" ||
      requestedTab === "integrations"
    ) {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

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
      } else if (activeTab === "pricing") {
        const [configRes, teamRes] = await Promise.all([
          apiEndpoints.tenantGetConfig(),
          apiEndpoints.tenantGetTeam(),
        ]);
        if (configRes.data.success) setConfig(configRes.data.config);
        if (teamRes.data.success) setUsers(teamRes.data.users);
      } else if (activeTab === "integrations") {
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
    if (!config) return;
    setActionLoading(true);
    try {
      const isIntegrationSave = activeTab === "integrations";

      if (isPicdriftTenant) {
        const payload: Partial<Config> & { pricing?: Record<string, number> } = {
          name: config.name,
          falApiKey: config.falApiKey,
        };

        if (!isIntegrationSave && config.pricing) {
          payload.pricing = PICDRIFT_PRICING_KEYS.reduce<Record<string, number>>(
            (acc, key) => {
              const value = Number(config.pricing[key]);
              if (Number.isFinite(value)) acc[key] = value;
              return acc;
            },
            {},
          );
        }

        await apiEndpoints.tenantUpdateConfig(payload);
      } else {
        if (isIntegrationSave) {
          await apiEndpoints.tenantUpdateConfig({
            name: config.name,
            falApiKey: config.falApiKey,
            kieApiKey: config.kieApiKey,
          });
        } else {
          await apiEndpoints.tenantUpdateConfig(config);
        }
      }
      setMsg("Configuration saved.");
      if (isIntegrationSave && config.falApiKey.trim()) {
        sessionStorage.setItem(
          "visionlight_activation_message",
          "Your dashboard is activated. Welcome to your creative studio.",
        );
        navigate("/app");
      }
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
      setMsg("Credit balance updated.");
      fetchData();
    } catch (err: any) {
      setMsg("Error: " + (err?.message || "Failed to update credit balance."));
    }
  };

  const handleResolveCreditRequest = async (requestId: string) => {
    try {
      await apiEndpoints.tenantResolveRequest(requestId);
      setMsg("Credit request resolved.");
      fetchData();
    } catch (err: any) {
      setMsg("Error: " + (err?.message || "Failed to resolve request."));
    }
  };

  const handleEnterReadOnlyDashboard = async (target: User) => {
    try {
      startReadOnlyImpersonation(target.id, target.email);
      const res = await apiEndpoints.getProjects();
      const firstProject = res.data?.projects?.[0];
      if (firstProject?.id) {
        localStorage.setItem("visionlight_active_project", firstProject.id);
        navigate("/app");
        return;
      }
      navigate("/projects");
    } catch (err: any) {
      setMsg("Error: " + (err?.message || "Failed to enter dashboard."));
    }
  };

  const handleTabChange = (tab: "team" | "pricing" | "integrations") => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === "team") {
      next.delete("tab");
    } else {
      next.set("tab", tab);
    }
    setSearchParams(next, { replace: true });
  };

  if (loading && !users.length && !config) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <LoadingSpinner size="lg" variant="neon" />
    </div>
  );

  const allowedCoverageWalletKeys: CoverageWalletKey[] = isPicdriftTenant
    ? ["creditsPicDrift", "creditsImageFX"]
    : [
        "creditsPicDrift",
        "creditsPicDriftPlus",
        "creditsImageFX",
        "creditsVideoFX1",
        "creditsVideoFX2",
        "creditsVideoFX3",
      ];
  const visibleCoverageWallets = COVERAGE_WALLETS.filter((wallet) =>
    allowedCoverageWalletKeys.includes(wallet.key),
  );
  const visibleCoverageVariants = COVERAGE_VARIANTS.filter((variant) =>
    allowedCoverageWalletKeys.includes(variant.wallet),
  );

  const variantRows = visibleCoverageVariants.map((variant) => {
    const deductionCredits = Math.max(
      0,
      Number(config?.pricing?.[variant.deductionKey]) || 0,
    );
    const providerCostPerRender = Math.max(
      0,
      Number(variantCostUsd[variant.id]) || 0,
    );
    const impliedUsdPerCredit =
      deductionCredits > 0 ? providerCostPerRender / deductionCredits : 0;
    return {
      ...variant,
      deductionCredits,
      providerCostPerRender,
      impliedUsdPerCredit,
    };
  });

  const walletUsdPerCredit = visibleCoverageWallets.reduce((acc, wallet) => {
    const rates = variantRows
      .filter((row) => row.wallet === wallet.key)
      .map((row) => row.impliedUsdPerCredit)
      .filter((value) => Number.isFinite(value) && value > 0);
    acc[wallet.key] = rates.length ? Math.max(...rates) : 0;
    return acc;
  }, {} as Record<string, number>);

  const walletCoverageRows = visibleCoverageWallets.map((wallet) => {
    const allocatedCredits = users.reduce(
      (sum, user) => sum + (Number(user[wallet.key]) || 0),
      0,
    );
    const usdPerCredit = walletUsdPerCredit[wallet.key] || 0;
    return {
      ...wallet,
      allocatedCredits,
      usdPerCredit,
      requiredUsd: allocatedCredits * usdPerCredit,
    };
  });

  const coverageTotals = walletCoverageRows.reduce(
    (acc, row) => {
      acc.fal += row.requiredUsd;
      acc.total += row.requiredUsd;
      return acc;
    },
    { fal: 0, total: 0 },
  );

  const formatUsd = (value: number) =>
    value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleVariantCostChange = (key: CoverageVariantId, raw: string) => {
    const parsed = Number(raw);
    setVariantCostUsd((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    }));
  };

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
              {adminUser?.organizationName || "Your Organization"} - Admin Panel
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto md:items-center">
            <div className="flex flex-nowrap overflow-x-auto w-full md:w-auto bg-gray-900 p-1 rounded-lg border border-gray-800 gap-1">
              <button
                onClick={() => navigate("/app")}
                className="shrink-0 whitespace-nowrap px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest text-brand-accent hover:bg-brand-accent/10 transition-all border border-brand-accent/20 mr-1"
              >
                Back to App
              </button>
              {["team", "integrations"].map((tab) => (
                <button
                  key={tab}
                  onClick={() =>
                    handleTabChange(tab as "team" | "pricing" | "integrations")
                  }
                  className={`shrink-0 whitespace-nowrap px-3 py-1.5 rounded-md text-[9px] font-bold uppercase tracking-widest transition-colors ${
                    activeTab === tab
                      ? "bg-gray-800 text-brand-accent"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <a
              href="https://fal.ai/dashboard/usage-billing/credits"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest bg-pink-600 hover:bg-pink-500 border border-pink-400/40 text-white transition-colors whitespace-nowrap"
            >
              Check Your Credit
            </a>
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
              <table
                className={`w-full text-left ${
                  isPicdriftTenant ? "min-w-[860px]" : "min-w-[1000px]"
                }`}
              >
                <thead className="bg-gray-950/50 text-[9px] uppercase tracking-widest text-gray-500 font-bold">
                  <tr>
                    <th className="p-5">User</th>
                    <th className="p-5 text-center">Role</th>
                    <th className="p-5 text-center">
                      {isPicdriftTenant ? "PicDrift" : "PicDrift / Kling 3.0"}
                    </th>
                    <th className="p-5 text-center">PicFX</th>
                    {!isPicdriftTenant && (
                      <th className="p-5 text-center">Topaz / FAL / VFX3</th>
                    )}
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
                          {!isPicdriftTenant && (
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] text-gray-500">Kling:</span>
                              <input type="number" step="1" min="0" className="w-12 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsPicDriftPlus} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsPicDriftPlus", (toInt(e.target.value, u.creditsPicDriftPlus) - u.creditsPicDriftPlus).toString())} />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-5 text-center">
                        <input type="number" step="1" min="0" className="w-16 bg-gray-950 border border-gray-800 rounded p-1 text-center text-xs" defaultValue={u.creditsImageFX} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsImageFX", (toInt(e.target.value, u.creditsImageFX) - u.creditsImageFX).toString())} />
                      </td>
                      {!isPicdriftTenant && (
                        <td className="p-5 text-center">
                          <div className="flex gap-1 justify-center">
                            <input type="number" step="1" min="0" title="Topaz Upscale" className="w-10 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsVideoFX1} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsVideoFX1", (toInt(e.target.value, u.creditsVideoFX1) - u.creditsVideoFX1).toString())} />
                            <input type="number" step="1" min="0" title="Seedance 2.0" className="w-10 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsVideoFX2} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsVideoFX2", (toInt(e.target.value, u.creditsVideoFX2) - u.creditsVideoFX2).toString())} />
                            <input type="number" step="1" min="0" title="VidFX 3" className="w-10 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsVideoFX3} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsVideoFX3", (toInt(e.target.value, u.creditsVideoFX3) - u.creditsVideoFX3).toString())} />
                          </div>
                        </td>
                      )}
                      <td className="p-5 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleEnterReadOnlyDashboard(u)}
                            className="text-amber-300 hover:text-amber-200 text-[9px] font-bold uppercase tracking-widest bg-amber-400/10 px-3 py-1 rounded"
                          >
                            Enter Dashboard
                          </button>
                          <button onClick={() => { setEditingUser(u); setResetPassword(""); }} className="text-cyan-400 hover:text-cyan-300 text-[9px] font-bold uppercase tracking-widest bg-cyan-400/10 px-3 py-1 rounded">Manage</button>
                          {u.id === adminUser?.id ? (
                            <span className="text-gray-500 text-[9px] font-bold uppercase tracking-widest">
                              Active Admin
                            </span>
                          ) : (
                            <button
                              className="text-red-500/50 hover:text-red-400 text-[9px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all"
                              onClick={async () => {
                                if (await confirmAction("Remove user?", { confirmLabel: "Remove" })) {
                                  try {
                                    await apiEndpoints.tenantDeleteUser(u.id);
                                    setMsg("User removed from team.");
                                    fetchData();
                                  } catch (err: any) {
                                    setMsg("Error: " + (err?.message || "Failed to remove user."));
                                  }
                                }
                              }}
                            >
                              Remove
                            </button>
                          )}
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
              <p className="text-xs text-gray-500 italic">
                Enter actual provider cost per render and keep your platform deductions aligned.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                  Fal Coverage Needed
                </p>
                <p className="text-xl font-bold text-pink-400 mt-2">
                  {formatUsd(coverageTotals.fal)}
                </p>
              </div>
              <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                  Total Coverage Needed
                </p>
                <p className="text-xl font-bold text-white mt-2">
                  {formatUsd(coverageTotals.total)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
                <div className="mb-6">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    Actual Provider Cost
                  </h4>
                  <p className="text-xs text-gray-500 mt-2">
                    USD per render. Implied USD/credit is auto-calculated from your platform deductions.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-gray-800">
                        <th className="py-3 text-left">Generation Variant</th>
                        <th className="py-3 text-left">Provider</th>
                        <th className="py-3 text-right">Credit / Render</th>
                        <th className="py-3 text-right">Cost / Render ($)</th>
                        <th className="py-3 text-right">Implied / Credit ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variantRows.map((row) => (
                        <tr key={row.id} className="border-b border-gray-900/60">
                          <td className="py-3 text-sm text-gray-200">{row.label}</td>
                          <td className="py-3 text-xs uppercase tracking-widest text-gray-400">
                            {row.provider}
                          </td>
                          <td className="py-3 text-sm text-right text-gray-200">
                            {row.deductionCredits.toFixed(0)}
                          </td>
                          <td className="py-3 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.providerCostPerRender}
                              onChange={(e) =>
                                handleVariantCostChange(row.id, e.target.value)
                              }
                              className="w-24 bg-gray-950 border border-gray-700 rounded p-2 text-right text-xs text-white outline-none focus:border-brand-accent"
                            />
                          </td>
                          <td className="py-3 text-sm text-right font-semibold text-brand-accent">
                            {formatUsd(row.impliedUsdPerCredit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-4">
                  Wallet USD/credit uses the highest implied variant rate per wallet (conservative mode).
                </p>
                <div className="overflow-x-auto mt-3">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-gray-800">
                        <th className="py-3 text-left">Wallet</th>
                        <th className="py-3 text-left">Provider</th>
                        <th className="py-3 text-right">Allocated Credits</th>
                        <th className="py-3 text-right">Derived / Credit ($)</th>
                        <th className="py-3 text-right">Coverage ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletCoverageRows.map((row) => (
                        <tr key={row.key} className="border-b border-gray-900/60">
                          <td className="py-3 text-sm text-gray-200">{row.label}</td>
                          <td className="py-3 text-xs uppercase tracking-widest text-gray-400">
                            {row.provider}
                          </td>
                          <td className="py-3 text-sm text-right text-gray-200">
                            {row.allocatedCredits.toFixed(0)}
                          </td>
                          <td className="py-3 text-sm text-right text-gray-200">
                            {formatUsd(row.usdPerCredit)}
                          </td>
                          <td className="py-3 text-sm text-right font-semibold text-brand-accent">
                            {formatUsd(row.requiredUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 pb-2 border-b border-gray-800">
                  Platform Render Credit Cost
                </h4>
                <div className="space-y-8">
                  <div>
                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                      PicDrift Credits
                    </h5>
                    <div className="space-y-4">
                      {[
                        "pricePicDrift_5s",
                        "pricePicDrift_10s",
                        ...(!isPicdriftTenant
                          ? ["pricePicDrift_Plus_5s", "pricePicDrift_Plus_10s"]
                          : []),
                      ].map((key) => (
                        <div key={key} className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-400 uppercase font-bold">
                            {key.replace("price", "").replace(/_/g, " ")}
                          </span>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                            value={config.pricing[key]}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                pricing: {
                                  ...config.pricing,
                                  [key]: toInt(e.target.value, config.pricing[key]),
                                },
                              })
                            }
                            onBlur={() => handleUpdateConfig()}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                      Pic FX & Editor
                    </h5>
                    <div className="space-y-4">
                      {[
                        "pricePicFX_Standard",
                        "pricePicFX_Carousel",
                        "pricePicFX_Batch",
                        "priceEditor_Pro",
                        "priceEditor_Enhance",
                        "priceEditor_Convert",
                        "priceAsset_DriftPath",
                      ].map((key) => (
                        <div key={key} className="flex justify-between items-center">
                          <span
                            className="text-[10px] text-gray-400 uppercase font-bold truncate max-w-[120px]"
                            title={key}
                          >
                            {key.replace("price", "").replace(/_/g, " ")}
                          </span>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                            value={config.pricing[key]}
                            onChange={(e) =>
                              setConfig({
                                ...config,
                                pricing: {
                                  ...config.pricing,
                                  [key]: toInt(e.target.value, config.pricing[key]),
                                },
                              })
                            }
                            onBlur={() => handleUpdateConfig()}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {!isPicdriftTenant && (
                    <div>
                      <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
                        Video FX
                      </h5>
                      <div className="space-y-4">
                        {[
                          "priceVideoFX1_10s",
                          "priceVideoFX1_15s",
                          "priceVideoFX2_4s",
                          "priceVideoFX2_8s",
                          "priceVideoFX2_12s",
                          "priceVideoFX3_4s",
                          "priceVideoFX3_6s",
                          "priceVideoFX3_8s",
                        ].map((key) => (
                          <div key={key} className="flex justify-between items-center">
                            <span className="text-[10px] text-gray-400 uppercase font-bold">
                              {key.replace("price", "").replace(/_/g, " ")}
                            </span>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                              value={config.pricing[key]}
                              onChange={(e) =>
                                setConfig({
                                  ...config,
                                  pricing: {
                                    ...config.pricing,
                                    [key]: toInt(e.target.value, config.pricing[key]),
                                  },
                                })
                              }
                              onBlur={() => handleUpdateConfig()}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
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
                    onChange={async (e) => {
                      try {
                        await apiEndpoints.tenantUpdateUser(editingUser.id, {
                          role: e.target.value,
                        });
                        setMsg("User role updated.");
                        fetchData();
                      } catch (err: any) {
                        notify.error(
                          err?.message || "Failed to update user role.",
                        );
                      }
                    }}
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
                    onBlur={async (e) => {
                      try {
                        await apiEndpoints.tenantUpdateUser(editingUser.id, {
                          maxProjects: parseInt(e.target.value, 10),
                        });
                        setMsg("Project limit updated.");
                        fetchData();
                      } catch (err: any) {
                        notify.error(
                          err?.message || "Failed to update project limit.",
                        );
                      }
                    }}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-800">
                <div className="mb-6 space-y-3 rounded-xl border border-gray-800 bg-gray-950/60 p-4">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Password Reset</label>
                  <p className="text-[10px] leading-relaxed text-gray-500">
                    Current passwords are not viewable. Set a new temporary password if this member needs access help.
                  </p>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                  />
                  <button
                    type="button"
                    disabled={!resetPassword.trim()}
                    onClick={async () => {
                      try {
                        await apiEndpoints.tenantUpdateUser(editingUser.id, {
                          password: resetPassword.trim(),
                        });
                        setResetPassword("");
                        setMsg("Password updated.");
                      } catch (err: any) {
                        notify.error(err?.message || "Failed to update password.");
                      }
                    }}
                    className="w-full rounded-lg bg-brand-accent py-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-950 disabled:opacity-50"
                  >
                    Set New Password
                  </button>
                </div>
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
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
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
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Project Limit
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                  value={newUser.maxProjects}
                  onChange={(e) =>
                    setNewUser({
                      ...newUser,
                      maxProjects: Math.max(1, toInt(e.target.value, 3)),
                    })
                  }
                />
              </div>
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
