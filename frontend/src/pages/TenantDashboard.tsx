import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiEndpoints, startReadOnlyImpersonation } from "../lib/api";
import { adminUi } from "../lib/adminUi";
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

interface ProvisionEmailStatus {
  email: string;
  authExists: boolean;
  profileCount: number;
  existingProfileInOrganization: boolean;
  requiresPassword: boolean;
}

const COVERAGE_WALLETS = [
  { key: "creditsPicDrift", label: "PicDrift (Standard)", provider: "fal" },
  { key: "creditsPicDriftPlus", label: "Kling 3.0", provider: "fal" },
  { key: "creditsImageFX", label: "Image FX (Nano/GPT 2)", provider: "fal" },
  { key: "creditsVideoFX1", label: "Topaz Upscale", provider: "fal" },
  { key: "creditsVideoFX2", label: "Seedance 2.0", provider: "fal" },
  { key: "creditsVideoFX3", label: "Veo 3.1", provider: "fal" },
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
  { id: "asset_drift_path", label: "3DX Drift Path", provider: "fal", wallet: "creditsPicDrift", deductionKey: "priceAsset_DriftPath" },
  { id: "topaz_upscale_2x", label: "Topaz Upscale 2x", provider: "fal", wallet: "creditsVideoFX1", deductionKey: "priceVideoFX1_10s" },
  { id: "topaz_upscale_4x", label: "Topaz Upscale 4x", provider: "fal", wallet: "creditsVideoFX1", deductionKey: "priceVideoFX1_15s" },
  { id: "seedance_fal_4s", label: "Seedance 2.0 4s", provider: "fal", wallet: "creditsVideoFX2", deductionKey: "priceVideoFX2_4s" },
  { id: "seedance_fal_8s", label: "Seedance 2.0 8s", provider: "fal", wallet: "creditsVideoFX2", deductionKey: "priceVideoFX2_8s" },
  { id: "seedance_fal_12s", label: "Seedance 2.0 12s", provider: "fal", wallet: "creditsVideoFX2", deductionKey: "priceVideoFX2_12s" },
  { id: "veo3_4s", label: "Veo 3.1 4s", provider: "fal", wallet: "creditsVideoFX3", deductionKey: "priceVideoFX3_4s" },
  { id: "veo3_6s", label: "Veo 3.1 6s", provider: "fal", wallet: "creditsVideoFX3", deductionKey: "priceVideoFX3_6s" },
  { id: "veo3_8s", label: "Veo 3.1 8s", provider: "fal", wallet: "creditsVideoFX3", deductionKey: "priceVideoFX3_8s" },
] as const;

type CoverageVariantId = (typeof COVERAGE_VARIANTS)[number]["id"];

const DEFAULT_VARIANT_COST_USD: Record<CoverageVariantId, number> = {
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
  asset_drift_path: 0.08,
  topaz_upscale_2x: 0.45,
  topaz_upscale_4x: 0.7,
  seedance_fal_4s: 0.2,
  seedance_fal_8s: 0.35,
  seedance_fal_12s: 0.5,
  veo3_4s: 0.25,
  veo3_6s: 0.38,
  veo3_8s: 0.5,
};

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
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    role: "USER",
    maxProjects: 3
  });
  const [newUserEmailStatus, setNewUserEmailStatus] =
    useState<ProvisionEmailStatus | null>(null);
  const [checkingNewUserEmail, setCheckingNewUserEmail] = useState(false);

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

  const normalizedNewUserEmail = newUser.email.trim().toLowerCase();
  const isNewUserEmailChecked =
    !!newUserEmailStatus && newUserEmailStatus.email === normalizedNewUserEmail;
  const canContinueNewUser =
    isNewUserEmailChecked && !newUserEmailStatus?.existingProfileInOrganization;
  const newUserNeedsPassword =
    canContinueNewUser && newUserEmailStatus?.requiresPassword === true;
  const resetNewUserForm = () => {
    setNewUser({
      email: "",
      password: "",
      name: "",
      role: "USER",
      maxProjects: 3,
    });
    setNewUserEmailStatus(null);
  };

  const checkNewUserEmail = async () => {
    if (!normalizedNewUserEmail) {
      setMsg("Error: Email is required.");
      return null;
    }

    setCheckingNewUserEmail(true);
    try {
      const res = await apiEndpoints.tenantCheckTeamEmail(normalizedNewUserEmail);
      const status = res.data as ProvisionEmailStatus;
      setNewUserEmailStatus(status);
      if (status.authExists) {
        setNewUser((prev) => ({ ...prev, password: "" }));
      }
      return status;
    } catch (err: any) {
      setMsg("Error: " + err.message);
      return null;
    } finally {
      setCheckingNewUserEmail(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (
      requestedTab === "team" ||
      requestedTab === "pricing" ||
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

    if (!canContinueNewUser) {
      await checkNewUserEmail();
      return;
    }
    if (newUserNeedsPassword && newUser.password.trim().length < 6) {
      setMsg("Error: Password must be at least 6 characters for a new login.");
      return;
    }

    setActionLoading(true);
    try {
      const res = await apiEndpoints.tenantAddUser({
        ...newUser,
        password: newUserNeedsPassword ? newUser.password.trim() : "",
      });
      setMsg(
        res.data?.user?.authIdentityReused
          ? "User added to team. Existing login credentials will be reused."
          : "User added to team.",
      );
      setShowAddUserModal(false);
      resetNewUserForm();
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
    <div className={adminUi.loading}>
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
      Number(DEFAULT_VARIANT_COST_USD[variant.id]) || 0,
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

  return (
    <div className={`${adminUi.page} font-sans`}>
      <div className={adminUi.backdrop} />
      <div className={adminUi.container}>
        {/* HEADER */}
        <div className={adminUi.header}>
          <div>
            <div className="flex items-center gap-4 mb-2">
              <h1 className={`${adminUi.title} uppercase`}>
                Agency <span className="text-brand-accent">Management</span>
              </h1>

            </div>
            <p className={adminUi.eyebrow}>
              {adminUser?.organizationName || "Your Organization"} - Admin Panel
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full xl:w-auto xl:flex-row xl:items-center">
            <div className={adminUi.tabBar}>
              <button
                onClick={() => navigate("/app")}
                className={`${adminUi.tab} border border-brand-accent/20 text-brand-accent hover:bg-brand-accent/10`}
              >
                Back to App
              </button>
              {[
                { id: "team", label: "Team" },
                { id: "pricing", label: "Global Controls" },
                { id: "integrations", label: "Integrations" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() =>
                    handleTabChange(
                      tab.id as "team" | "pricing" | "integrations",
                    )
                  }
                  className={`${adminUi.tab} ${
                    activeTab === tab.id ? adminUi.tabActive : adminUi.tabInactive
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <a
              href="https://fal.ai/dashboard/usage-billing/credits"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-pink-400/40 bg-pink-600 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-pink-500"
            >
              Check Your Credit
            </a>
          </div>
        </div>

        {msg && (
          <div className="mb-8 flex items-center justify-between rounded-xl border border-brand-accent/20 bg-brand-accent/10 p-4 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-accent">
            {msg}
            <button onClick={() => setMsg("")} className="text-lg">x</button>
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === "team" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className={adminUi.tablePanel}>
              <div className={`${adminUi.panelHeader} flex items-center justify-between`}>
                <h2 className={adminUi.sectionTitle}>Pending Render Requests</h2>
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-accent">
                  {creditRequests.length} Pending
                </span>
              </div>
              {creditRequests.length === 0 ? (
                <div className="p-6 text-xs text-gray-500 italic">No pending render requests.</div>
              ) : (
                <table className="w-full text-left min-w-[700px]">
                  <thead className={adminUi.tableHead}>
                    <tr>
                      <th className="p-5">Requester</th>
                      <th className="p-5">Email</th>
                      <th className="p-5">Submitted</th>
                      <th className="p-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditRequests.map((r) => (
                      <tr key={r.id} className={adminUi.tableRow}>
                        <td className="p-5 text-sm text-white">{r.user?.name || r.name || "Unknown User"}</td>
                        <td className="p-5 text-xs text-gray-400 font-mono">{r.user?.email || r.email}</td>
                        <td className="p-5 text-xs text-gray-500">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="p-5 text-right">
                          <button
                            onClick={() => handleResolveCreditRequest(r.id)}
                            className={adminUi.primaryButton}
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
              <h2 className={adminUi.sectionTitle}>Team Members</h2>
              <button
                onClick={() => setShowAddUserModal(true)}
                className={adminUi.primaryButton}
              >
                Add Member
              </button>
            </div>

            <div className={`${adminUi.tablePanel} overflow-x-auto`}>
              <table
                className={`w-full text-left ${
                  isPicdriftTenant ? "min-w-[860px]" : "min-w-[1000px]"
                }`}
              >
                <thead className={adminUi.tableHead}>
                  <tr>
                    <th className="p-5">User</th>
                    <th className="p-5 text-center">Role</th>
                    <th className="p-5 text-center">
                      {isPicdriftTenant ? "PicDrift" : "PicDrift / Kling 3.0"}
                    </th>
                    <th className="p-5 text-center">PicFX</th>
                    {!isPicdriftTenant && (
                      <th className="p-5 text-center">Topaz / FAL / Veo 3.1</th>
                    )}
                    <th className="p-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} className={`${adminUi.tableRow} group`}>
                      <td className="p-5">
                        <div className="font-bold text-white text-sm">{u.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{u.email}</div>
                      </td>
                      <td className="p-5 text-center">
                        <span className={adminUi.pill}>
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
                            <input type="number" step="1" min="0" title="Veo 3.1" className="w-10 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsVideoFX3} onBlur={(e) => handleUpdateUserCredits(u.id, "creditsVideoFX3", (toInt(e.target.value, u.creditsVideoFX3) - u.creditsVideoFX3).toString())} />
                          </div>
                        </td>
                      )}
                      <td className="p-5 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleEnterReadOnlyDashboard(u)}
                            className={adminUi.amberButton}
                          >
                            Enter Dashboard
                          </button>
                          <button onClick={() => setEditingUser(u)} className={adminUi.cyanButton}>Manage</button>
                          {u.id === adminUser?.id ? (
                            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-500">
                              Active Admin
                            </span>
                          ) : (
                            <button
                              className={`${adminUi.dangerButton} opacity-0 group-hover:opacity-100`}
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
            <div className="rounded-2xl border border-brand-accent/20 bg-brand-accent/10 p-6 shadow-[0_18px_42px_rgba(2,8,23,0.24)] backdrop-blur-xl">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-accent">Global Control Settings</h3>
              <p className="text-xs text-gray-500 italic">
                Platform render deductions are controlled by the platform admin. This tenant view is read-only and shows coverage estimates only.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={adminUi.metricCard}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-bold">
                  Fal Coverage Needed
                </p>
                <p className="text-xl font-bold text-pink-400 mt-2">
                  {formatUsd(coverageTotals.fal)}
                </p>
              </div>
              <div className={adminUi.metricCard}>
                <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 font-bold">
                  Total Coverage Needed
                </p>
                <p className="text-xl font-bold text-white mt-2">
                  {formatUsd(coverageTotals.total)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8">
              <div className={`${adminUi.panel} p-6 sm:p-8`}>
                <div className="mb-6">
                  <h4 className={adminUi.sectionTitle}>
                    Provider Cost Reference
                  </h4>
                  <p className="text-xs text-gray-500 mt-2">
                    Read-only USD reference per render. Implied USD/credit is auto-calculated from platform deductions.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-gray-500">
                        <th className="py-3 text-left">Generation Variant</th>
                        <th className="py-3 text-left">Provider</th>
                        <th className="py-3 text-right">Credit / Render</th>
                        <th className="py-3 text-right">Cost / Render</th>
                        <th className="py-3 text-right">Implied / Credit ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variantRows.map((row) => (
                        <tr key={row.id} className="border-b border-white/10">
                          <td className="py-3 text-sm text-gray-200">{row.label}</td>
                          <td className="py-3 text-xs uppercase tracking-[0.14em] text-gray-400">
                            {row.provider}
                          </td>
                          <td className="py-3 text-sm text-right text-gray-200">
                            {row.deductionCredits.toFixed(0)}
                          </td>
                          <td className="py-3 text-right text-sm font-semibold text-gray-200">
                            {formatUsd(row.providerCostPerRender)}
                          </td>
                          <td className="py-3 text-sm text-right font-semibold text-brand-accent">
                            {formatUsd(row.impliedUsdPerCredit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 text-[10px] uppercase tracking-[0.14em] text-gray-500">
                  Wallet USD/credit uses the highest implied variant rate per wallet (conservative mode).
                </p>
                <div className="overflow-x-auto mt-3">
                  <table className="w-full min-w-[760px]">
                    <thead>
                      <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.14em] text-gray-500">
                        <th className="py-3 text-left">Wallet</th>
                        <th className="py-3 text-left">Provider</th>
                        <th className="py-3 text-right">Allocated Credits</th>
                        <th className="py-3 text-right">Derived / Credit ($)</th>
                        <th className="py-3 text-right">Coverage ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletCoverageRows.map((row) => (
                        <tr key={row.key} className="border-b border-white/10">
                          <td className="py-3 text-sm text-gray-200">{row.label}</td>
                          <td className="py-3 text-xs uppercase tracking-[0.14em] text-gray-400">
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
            </div>
          </div>
        )}

        {/* INTEGRATIONS TAB */}
        {activeTab === "integrations" && config && (
          <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className={`${adminUi.panel} p-6 sm:p-8`}>
              <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-tight">Organization Profile</h2>
              <form onSubmit={handleUpdateConfig} className="space-y-6">
                <div className="space-y-2">
                  <label className={adminUi.sectionTitle}>Agency Name</label>
                  <input
                    type="text"
                    className={`${adminUi.input} w-full p-3 text-sm`}
                    value={config.name}
                    onChange={e => setConfig({ ...config, name: e.target.value })}
                  />
                </div>
                <div className="mt-6 border-t border-white/10 pt-6">
                  <h3 className={`${adminUi.sectionTitle} mb-6`}>API Credentials</h3>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className={adminUi.sectionTitle}>Fal AI Key</label>
                      <input
                        type="password"
                        className={`${adminUi.input} w-full p-3 font-mono text-sm`}
                        value={config.falApiKey}
                        onChange={e => setConfig({ ...config, falApiKey: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className={`${adminUi.primaryButton} w-full py-4 text-[11px]`}
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
                    Passwords are account-level and may be shared across multiple studios. Members reset their own password from the login page.
                  </p>
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
                value={newUser.email}
                required
                onChange={(e) => {
                  setNewUser({ ...newUser, email: e.target.value });
                  setNewUserEmailStatus(null);
                }}
              />
              {isNewUserEmailChecked && (
                <div
                  className={`rounded-xl border p-3 text-[10px] font-bold uppercase tracking-widest ${
                    newUserEmailStatus?.existingProfileInOrganization
                      ? "border-red-500/30 bg-red-500/10 text-red-300"
                      : newUserEmailStatus?.authExists
                        ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-200"
                        : "border-amber-400/25 bg-amber-400/10 text-amber-200"
                  }`}
                >
                  {newUserEmailStatus?.existingProfileInOrganization
                    ? "This email is already a member of this organization."
                    : newUserEmailStatus?.authExists
                      ? "Existing login found. This member will use their current password."
                      : "New login. Set a temporary password for this member."}
                </div>
              )}

              {canContinueNewUser && (
                <>
                  <input
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                    placeholder="Full Name"
                    value={newUser.name}
                    required
                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                  />
                  {newUserNeedsPassword && (
                    <input
                      className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                      placeholder="Temporary Password"
                      type="password"
                      value={newUser.password}
                      required
                      minLength={6}
                      onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    />
                  )}
                  <select
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300"
                    value={newUser.role}
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
                </>
              )}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddUserModal(false);
                    resetNewUserForm();
                  }}
                  className="flex-1 py-3 text-xs font-bold uppercase text-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    actionLoading ||
                    checkingNewUserEmail ||
                    newUserEmailStatus?.existingProfileInOrganization === true
                  }
                  className="flex-1 py-3 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-lg font-bold uppercase text-xs tracking-widest disabled:opacity-50"
                >
                  {checkingNewUserEmail
                    ? "Checking..."
                    : canContinueNewUser
                      ? "Deploy"
                      : "Continue"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
