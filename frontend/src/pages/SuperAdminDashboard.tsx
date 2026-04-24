import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { confirmAction } from "../lib/notifications";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";

interface Tenant {
  id: string;
  name: string;
  isActive: boolean;
  maxUsers: number;
  maxProjectsTotal: number;
  maxStorageMb: number;
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  view: string;
  isDemo?: boolean;
  organizationId: string;
  creditsPicDrift: number;
  creditsPicDriftPlus: number;
  creditsImageFX: number;
  creditsVideoFX1: number;
  creditsVideoFX2: number;
  creditsVideoFX3: number;
}

interface CreditRequest {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  organization?: {
    id: string;
    name: string;
  } | null;
  user?: {
    id: string;
    email: string;
    name?: string;
    role?: string;
  } | null;
}

type CreditPoolCostKey =
  | "creditsPicDrift"
  | "creditsPicDriftPlus"
  | "creditsImageFX"
  | "creditsVideoFX1"
  | "creditsVideoFX2"
  | "creditsVideoFX3";

const COVERAGE_COST_ROWS: {
  key: CreditPoolCostKey;
  label: string;
  provider: "fal" | "kie";
}[] = [
  { key: "creditsPicDrift", label: "PicDrift", provider: "fal" },
  { key: "creditsPicDriftPlus", label: "PicDrift Plus", provider: "fal" },
  { key: "creditsImageFX", label: "PicFX", provider: "fal" },
  { key: "creditsVideoFX1", label: "Seedance 2.0 Kie", provider: "kie" },
  { key: "creditsVideoFX2", label: "Seedance 2.0 Fal", provider: "fal" },
  { key: "creditsVideoFX3", label: "Veo 3", provider: "fal" },
];

export default function SuperAdminDashboard() {
  const { user: adminUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"platform" | "my-agency" | "provider-balances" | "demo-leads" | "global-settings" | "global-presets">("platform");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [creditRequests, setCreditRequests] = useState<CreditRequest[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [presets, setPresets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Modals
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);

  // Edit Preset State
  const [editingPreset, setEditingPreset] = useState<any | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: "",
    prompt: "",
    isActive: true
  });

  // Restore Missing States
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tenantUpdates, setTenantUpdates] = useState({
    name: "",
    maxUsers: 0,
    maxProjectsTotal: 0,
    maxStorageMb: 500,
    view: "VISIONLIGHT",
    isActive: true
  });

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userUpdates, setUserUpdates] = useState({
    view: "VISIONLIGHT",
    role: "USER"
  });

  const [newTenant, setNewTenant] = useState({
    orgName: "",
    adminEmail: "",
    adminPassword: "",
    adminName: "",
    maxUsers: 5,
    maxProjectsTotal: 20,
    view: "VISIONLIGHT"
  });

  const [newDemo, setNewDemo] = useState({
    email: "",
    password: "",
    name: ""
  });

  const [newTeamMember, setNewTeamMember] = useState({
    email: "",
    password: "",
    name: "",
    role: "USER"
  });
  const [poolCostUsd, setPoolCostUsd] = useState<
    Record<CreditPoolCostKey, number>
  >({
    creditsPicDrift: 0.05,
    creditsPicDriftPlus: 0.07,
    creditsImageFX: 0.03,
    creditsVideoFX1: 0.12,
    creditsVideoFX2: 0.08,
    creditsVideoFX3: 0.09,
  });

  const toInt = (value: string, fallback = 0) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.round(n));
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeTab !== "platform") return;
    const interval = setInterval(async () => {
      try {
        const requestsRes = await apiEndpoints.superadminGetRequests();
        if (requestsRes.data.success) {
          setCreditRequests(requestsRes.data.requests || []);
        }
      } catch {
        // Silent polling failure
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [tenantsRes, settingsRes, usersRes, presetsRes, requestsRes] = await Promise.all([
        apiEndpoints.superadminGetOrganizations(),
        apiEndpoints.superadminGetGlobalSettings(),
        apiEndpoints.superadminGetUsers(),
        apiEndpoints.superadminGetPresets(),
        apiEndpoints.superadminGetRequests(),
      ]);

      if (tenantsRes.data.success) setTenants(tenantsRes.data.organizations);
      if (settingsRes.data.success) setGlobalSettings(settingsRes.data.settings);
      if (usersRes.data.success) setUsers(usersRes.data.users);
      if (presetsRes.data.success) setPresets(presetsRes.data.presets);
      if (requestsRes.data.success) setCreditRequests(requestsRes.data.requests || []);
    } catch (err: any) {
      setMsg("Error loading data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveCreditRequest = async (requestId: string) => {
    try {
      await apiEndpoints.superadminResolveRequest(requestId);
      setMsg("Credit request resolved.");
      fetchInitialData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (editingPreset) {
        await apiEndpoints.superadminUpdatePreset(editingPreset.id, presetForm);
      } else {
        await apiEndpoints.superadminCreatePreset(presetForm);
      }
      setMsg(`Preset ${editingPreset ? 'updated' : 'created'} successfully.`);
      setShowPresetModal(false);
      setEditingPreset(null);
      setPresetForm({ name: "", prompt: "", isActive: true });
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePreset = async (id: string) => {
    if (!(await confirmAction("Are you sure you want to delete this global preset?", { confirmLabel: "Delete" }))) return;
    try {
      await apiEndpoints.superadminDeletePreset(id);
      fetchInitialData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const openEditPreset = (p: any) => {
    setEditingPreset(p);
    setPresetForm({
      name: p.name,
      prompt: p.prompt,
      isActive: p.isActive
    });
    setShowPresetModal(true);
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await apiEndpoints.superadminCreateTenant(newTenant);
      setMsg("Tenant created successfully.");
      setShowTenantModal(false);
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteTenant = async (id: string) => {
    if (!(await confirmAction("Are you sure? This will delete the organization and ALL its users forever.", { confirmLabel: "Delete" }))) return;
    setActionLoading(true);
    try {
      await apiEndpoints.superadminDeleteOrganization(id);
      setMsg("Organization deleted.");
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateTenant = async () => {
    if (!editingTenant) return;
    setActionLoading(true);
    try {
      await apiEndpoints.superadminUpdateOrgLimits(editingTenant.id, {
        name: tenantUpdates.name,
        maxUsers: tenantUpdates.maxUsers,
        maxProjectsTotal: tenantUpdates.maxProjectsTotal,
        maxStorageMb: tenantUpdates.maxStorageMb,
        view: tenantUpdates.view
      });
      if (editingTenant.isActive !== tenantUpdates.isActive) {
        await apiEndpoints.superadminUpdateOrgStatus(editingTenant.id, tenantUpdates.isActive);
      }
      setMsg("Tenant updated.");
      setEditingTenant(null);
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openEditTenant = (t: Tenant) => {
    // Try to find an admin user for this tenant to get the current view
    const adminUser = users.find(u => u.organizationId === t.id && u.role === "ADMIN");
    setEditingTenant(t);
    setTenantUpdates({
      name: t.name,
      maxUsers: t.maxUsers,
      maxProjectsTotal: t.maxProjectsTotal,
      maxStorageMb: t.maxStorageMb || 500,
      view: adminUser ? adminUser.view : "VISIONLIGHT",
      isActive: t.isActive
    });
  };

  const handleCreateDemo = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await apiEndpoints.superadminCreateDemoUser(newDemo);
      setMsg("Demo user created.");
      setShowDemoModal(false);
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await apiEndpoints.tenantAddUser(newTeamMember);
      setMsg("Team member added.");
      setShowAddTeamModal(false);
      fetchInitialData();
    } catch (err: any) {
      setMsg("Error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateAgencyUser = async (userId: string, data: any) => {
    try {
      await apiEndpoints.tenantUpdateUser(userId, data);
      fetchInitialData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUpdateUserBasic = async () => {
    if (!editingUser) return;
    try {
      await apiEndpoints.superadminUpdateUser(editingUser.id, userUpdates);
      setMsg("User updated.");
      setEditingUser(null);
      fetchInitialData();
    } catch (err: any) {
      alert(err.message);
    }
  }

  const myAgencyUsers = useMemo(() => {
    return users.filter(u => u.organizationId === adminUser?.organizationId);
  }, [users, adminUser]);

  const demoUsers = useMemo(() => {
    return users.filter(u => u.isDemo === true);
  }, [users]);

  const agencyCoverageRows = useMemo(() => {
    return COVERAGE_COST_ROWS.map((entry) => {
      const allocatedCredits = myAgencyUsers.reduce(
        (sum, user) => sum + (Number(user[entry.key]) || 0),
        0,
      );
      const unitUsd = Number(poolCostUsd[entry.key]) || 0;
      return {
        ...entry,
        allocatedCredits,
        unitUsd,
        requiredUsd: allocatedCredits * unitUsd,
      };
    });
  }, [myAgencyUsers, poolCostUsd]);

  const agencyCoverageTotals = useMemo(() => {
    return agencyCoverageRows.reduce(
      (acc, row) => {
        if (row.provider === "kie") acc.kie += row.requiredUsd;
        else acc.fal += row.requiredUsd;
        acc.total += row.requiredUsd;
        return acc;
      },
      { fal: 0, kie: 0, total: 0 },
    );
  }, [agencyCoverageRows]);

  const formatUsd = (value: number) =>
    value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handlePoolCostChange = (key: CreditPoolCostKey, raw: string) => {
    const parsed = Number(raw);
    setPoolCostUsd((prev) => ({
      ...prev,
      [key]: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
    }));
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <LoadingSpinner size="lg" variant="neon" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 p-6 sm:p-10 font-sans">
      <div className="max-w-[1400px] mx-auto pb-24">
        {/* HEADER */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end mb-12 gap-8 border-b border-gray-800 pb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight uppercase mb-2">
              Platform <span className="text-brand-accent">Control</span>
            </h1>
            <p className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold">
              Super Admin Interface — {adminUser?.email}
            </p>
          </div>

          <div className="flex flex-nowrap overflow-x-auto items-center bg-gray-900 p-1 rounded-lg border border-gray-800 gap-1 w-full xl:w-auto">
            <button
              onClick={() => navigate("/app")}
              className="shrink-0 whitespace-nowrap px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest text-brand-accent hover:bg-brand-accent/10 transition-all border border-brand-accent/20 mr-1"
            >
              Back to App
            </button>
            {["platform", "my-agency", "provider-balances", "demo-leads", "global-settings", "global-presets"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${activeTab === tab ? "bg-gray-800 text-brand-accent" : "text-gray-400 hover:text-white"
                  }`}
              >
                {tab.replace("-", " ")}
              </button>
            ))}
          </div>
        </div>

        {msg && (
          <div className="mb-8 p-4 rounded-lg bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-sm font-semibold flex justify-between items-center">
            {msg}
            <button onClick={() => setMsg("")} className="text-lg">×</button>
          </div>
        )}

        {/* TAB CONTENT: GLOBAL PRESETS */}
        {activeTab === "global-presets" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Global Prompt Presets</h2>
                <p className="text-xs text-gray-500 mt-1">These presets automatically appear in every user's PromptFX menu.</p>
              </div>
              <button
                onClick={() => {
                  setEditingPreset(null);
                  setPresetForm({ name: "", prompt: "", isActive: true });
                  setShowPresetModal(true);
                }}
                className="bg-brand-accent hover:bg-cyan-300 text-gray-950 px-6 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest"
              >
                Add New Preset
              </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-950 text-[10px] uppercase tracking-widest text-gray-500">
                  <tr>
                    <th className="p-6">Preset Name</th>
                    <th className="p-6">Prompt Content</th>
                    <th className="p-6 text-center">Status</th>
                    <th className="p-6 text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {presets.length === 0 ? (
                    <tr><td colSpan={4} className="p-10 text-center text-gray-500 italic">No global presets created yet.</td></tr>
                  ) : presets.map(p => (
                    <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="p-6">
                        <div className="font-bold text-white">{p.name}</div>
                      </td>
                      <td className="p-6">
                        <div className="text-xs text-gray-400 line-clamp-2 max-w-md">{p.prompt}</div>
                      </td>
                      <td className="p-6 text-center">
                        <span
                          className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border ${p.isActive
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                            }`}
                        >
                          {p.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-6 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            className="text-gray-400 hover:text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-gray-800 rounded-md border border-gray-700 hover:bg-gray-700 transition-colors"
                            onClick={() => openEditPreset(p)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-red-500/50 hover:text-red-400 text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:bg-red-500/10 transition-colors rounded-md"
                            onClick={() => handleDeletePreset(p.id)}
                          >
                            Delete
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

        {/* TAB CONTENT: PROVIDER BALANCES */}
        {activeTab === "provider-balances" && (
          <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">
                Credit Check
              </h2>
              <p className="text-xs text-gray-500 mt-2 mb-6">
                Open your provider portal and verify available credit for your default organization.
              </p>
              <div className="flex justify-start">
                <a
                  href="https://fal.ai/dashboard/usage-billing/credits"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest bg-pink-600 hover:bg-pink-500 border border-pink-400/40 text-white transition-colors"
                >
                  Check Your Credit
                </a>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: PLATFORM (TENANTS) */}
        {activeTab === "platform" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Pending Render Requests</h2>
                <span className="text-[11px] font-bold uppercase tracking-widest text-brand-accent">
                  {creditRequests.length} Pending
                </span>
              </div>
              {creditRequests.length === 0 ? (
                <div className="p-6 text-xs text-gray-500 italic">No pending render requests across all tenants.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[900px]">
                    <thead className="bg-gray-950 text-[10px] uppercase tracking-widest text-gray-500">
                      <tr>
                        <th className="p-6">Requester</th>
                        <th className="p-6">Email</th>
                        <th className="p-6">Organization</th>
                        <th className="p-6">Submitted</th>
                        <th className="p-6 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {creditRequests.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-800/30 transition-colors">
                          <td className="p-6 text-sm text-white">{r.user?.name || r.name || "Unknown User"}</td>
                          <td className="p-6 text-xs text-gray-400 font-mono">{r.user?.email || r.email}</td>
                          <td className="p-6 text-xs text-gray-300">{r.organization?.name || "Unassigned"}</td>
                          <td className="p-6 text-xs text-gray-500">{new Date(r.createdAt).toLocaleString()}</td>
                          <td className="p-6 text-right">
                            <button
                              onClick={() => handleResolveCreditRequest(r.id)}
                              className="px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest bg-brand-accent hover:bg-cyan-300 text-gray-950 transition-colors"
                            >
                              Mark Resolved
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Subscription Management</h2>
              <button
                onClick={() => setShowTenantModal(true)}
                className="bg-brand-accent hover:bg-cyan-300 text-gray-950 px-6 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest"
              >
                Create New Tenant
              </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-950 text-[10px] uppercase tracking-widest text-gray-500">
                  <tr>
                    <th className="p-6">Organization</th>
                    <th className="p-6 text-center">Status</th>
                    <th className="p-6 text-center">Users / Projects</th>
                    <th className="p-6 text-right">Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {tenants.map(t => (
                    <tr key={t.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="p-6">
                        <div className="font-bold text-white">{t.name}</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">{t.id}</div>
                      </td>
                      <td className="p-6 text-center">
                        <span
                          className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border ${t.isActive
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                            }`}
                        >
                          {t.isActive ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td className="p-6 text-center">
                        <div className="text-xs text-gray-300 font-semibold">
                          Max Users: {t.maxUsers} | Max Projects: {t.maxProjectsTotal}
                        </div>
                      </td>
                      <td className="p-6 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            className="text-gray-400 hover:text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-gray-800 rounded-md border border-gray-700 hover:bg-gray-700 transition-colors"
                            onClick={() => openEditTenant(t)}
                          >
                            Configure
                          </button>
                          <button
                            className="text-red-500/50 hover:text-red-400 text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:bg-red-500/10 transition-colors rounded-md"
                            onClick={() => handleDeleteTenant(t.id)}
                          >
                            Delete
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

        {/* TAB CONTENT: MY AGENCY */}
        {activeTab === "my-agency" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Default Agency Team</h2>
              <button
                onClick={() => setShowAddTeamModal(true)}
                className="bg-brand-accent hover:bg-cyan-300 text-gray-950 px-6 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest"
              >
                Add Team Member
              </button>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left min-w-[1000px]">
                <thead className="bg-gray-950 text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                  <tr>
                    <th className="p-6">User</th>
                    <th className="p-6 text-center">View</th>
                    <th className="p-6 text-center">PicDrift / +</th>
                    <th className="p-6 text-center">PicFX</th>
                    <th className="p-6 text-center">Seedance Kie / FAL / VFX3</th>
                    <th className="p-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {myAgencyUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="p-6">
                        <div className="font-bold text-white text-sm">{u.name}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{u.email}</div>
                      </td>
                      <td className="p-6 text-center">
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${u.view === 'PICDRIFT' ? 'bg-pink-500/10 text-pink-400 border-pink-500/20' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'}`}>
                          {u.view}
                        </span>
                      </td>
                      <td className="p-6 text-center">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-[10px] text-gray-500">Std:</span>
                            <input type="number" step="1" min="0" className="w-12 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsPicDrift} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsPicDrift) - u.creditsPicDrift, creditType: "creditsPicDrift" })} />
                          </div>
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-[10px] text-gray-500">Plus:</span>
                            <input type="number" step="1" min="0" className="w-12 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsPicDriftPlus} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsPicDriftPlus) - u.creditsPicDriftPlus, creditType: "creditsPicDriftPlus" })} />
                          </div>
                        </div>
                      </td>
                      <td className="p-6 text-center">
                        <input type="number" step="1" min="0" className="w-16 bg-gray-950 border border-gray-800 rounded p-1 text-center text-xs text-white" defaultValue={u.creditsImageFX} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsImageFX) - u.creditsImageFX, creditType: "creditsImageFX" })} />
                      </td>
                      <td className="p-6 text-center">
                        <div className="flex gap-2 justify-center">
                          <input type="number" step="1" min="0" title="Seedance 2.0 - Kie" className="w-10 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsVideoFX1} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsVideoFX1) - u.creditsVideoFX1, creditType: "creditsVideoFX1" })} />
                          <input type="number" step="1" min="0" title="Seedance 2.0 FAL" className="w-10 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsVideoFX2} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsVideoFX2) - u.creditsVideoFX2, creditType: "creditsVideoFX2" })} />
                          <input type="number" step="1" min="0" title="VidFX 3" className="w-10 bg-gray-950 border border-gray-800 rounded text-[10px] text-center" defaultValue={u.creditsVideoFX3} onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: toInt(e.target.value, u.creditsVideoFX3) - u.creditsVideoFX3, creditType: "creditsVideoFX3" })} />
                        </div>
                      </td>
                      <td className="p-6 text-right">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => { setEditingUser(u); setUserUpdates({ view: u.view, role: u.role }); }} className="text-cyan-400 hover:text-cyan-300 text-[10px] font-bold uppercase tracking-widest bg-cyan-400/10 px-3 py-1 rounded">Manage</button>
                          <button
                            className="text-red-500/50 hover:text-red-400 text-[10px] font-bold uppercase tracking-widest"
                            onClick={async () => {
                              if (await confirmAction("Remove user?", { confirmLabel: "Remove" })) {
                                apiEndpoints.tenantDeleteUser(u.id).then(fetchInitialData);
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

        {/* TAB CONTENT: DEMO LEADS */}
        {activeTab === "demo-leads" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400">Picdrift Demo Users</h2>
              <button
                onClick={() => setShowDemoModal(true)}
                className="bg-brand-accent hover:bg-cyan-300 text-gray-950 px-6 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest"
              >
                New Demo User
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {demoUsers.map(u => (
                <div key={u.id} className="bg-gray-900 border border-gray-800 p-6 rounded-xl relative group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="font-bold text-white">{u.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{u.email}</div>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <span className="bg-cyan-500/10 text-cyan-400 text-[9px] font-bold px-2 py-1 rounded uppercase tracking-widest border border-cyan-500/20">
                        {u.view}
                      </span>
                      <button onClick={() => { setEditingUser(u); setUserUpdates({ view: u.view, role: u.role }); }} className="text-[8px] text-gray-500 hover:text-white uppercase font-bold tracking-tighter">Edit View</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-t border-gray-800 pt-4 mt-4">
                    <div>
                      <div className="text-[9px] uppercase text-gray-500 font-bold mb-1">PicDrift</div>
                      <div className="text-sm font-bold text-white">{u.creditsPicDrift}</div>
                    </div>
                    <div className="border-l border-gray-800 pl-4">
                      <div className="text-[9px] uppercase text-gray-500 font-bold mb-1">PicFX</div>
                      <div className="text-sm font-bold text-white">{u.creditsImageFX}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB CONTENT: GLOBAL SETTINGS */}
        {activeTab === "global-settings" && globalSettings && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-brand-accent/10 border border-brand-accent/20 p-6 rounded-xl">
              <h3 className="text-brand-accent font-bold uppercase text-xs tracking-widest mb-2">Global Pricing Template</h3>
              <p className="text-xs text-gray-400 italic">These prices are used as defaults for all new organizations unless overridden.</p>
            </div>

            <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Experimental Video Editor Rollout</h4>
                <p className="text-xs text-gray-500">
                  Keep editor restricted to SuperAdmin during testing, then switch once ready.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const nextValue = !Boolean(globalSettings.featureVideoEditorForAll);
                  try {
                    const res = await apiEndpoints.superadminUpdateGlobalSettings({
                      featureVideoEditorForAll: nextValue,
                    });
                    if (res.data?.success) {
                      setGlobalSettings(res.data.settings);
                      setMsg(
                        nextValue
                          ? "Video Editor rollout enabled for all users."
                          : "Video Editor restricted to SuperAdmin.",
                      );
                    }
                  } catch (err: any) {
                    setMsg("Error: " + err.message);
                  }
                }}
                className={`px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest border transition-colors ${
                  globalSettings.featureVideoEditorForAll
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
                    : "bg-gray-950 border-gray-700 text-gray-300 hover:bg-gray-800"
                }`}
              >
                {globalSettings.featureVideoEditorForAll
                  ? "Enabled For All Users"
                  : "SuperAdmin Only"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 pb-2 border-b border-gray-800">PicDrift Engine</h4>
                <div className="space-y-4">
                  {["pricePicDrift_5s", "pricePicDrift_10s", "pricePicDrift_Plus_5s", "pricePicDrift_Plus_10s"].map(key => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400 uppercase font-bold">{key.replace('price', '').replace(/_/g, ' ')}</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                        defaultValue={globalSettings[key]}
                        onBlur={(e) => apiEndpoints.superadminUpdateGlobalSettings({ [key]: toInt(e.target.value, globalSettings[key]) })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 pb-2 border-b border-gray-800">Studio & Editor</h4>
                <div className="space-y-4">
                  {["pricePicFX_Standard", "pricePicFX_Carousel", "pricePicFX_Batch", "priceEditor_Pro", "priceEditor_Enhance", "priceEditor_Convert", "priceAsset_DriftPath"].map(key => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400 uppercase font-bold truncate max-w-[100px]" title={key}>{key.replace('price', '').replace(/_/g, ' ')}</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                        defaultValue={globalSettings[key]}
                        onBlur={(e) => apiEndpoints.superadminUpdateGlobalSettings({ [key]: toInt(e.target.value, globalSettings[key]) })}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 pb-2 border-b border-gray-800">Video FX Engines</h4>
                <div className="space-y-4">
                  {["priceVideoFX1_10s", "priceVideoFX1_15s", "priceVideoFX2_4s", "priceVideoFX2_8s", "priceVideoFX2_12s", "priceVideoFX3_4s", "priceVideoFX3_6s", "priceVideoFX3_8s"].map(key => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-[10px] text-gray-400 uppercase font-bold">{key.replace('price', '').replace(/_/g, ' ')}</span>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                        defaultValue={globalSettings[key]}
                        onBlur={(e) => apiEndpoints.superadminUpdateGlobalSettings({ [key]: toInt(e.target.value, globalSettings[key]) })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
              <div className="mb-6">
                <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Default Org Coverage Planner
                </h4>
                <p className="text-xs text-gray-500 mt-2">
                  Set actual USD cost per credit type and monitor how much Fal/Kie balance your current agency allocations require.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-gray-800">
                      <th className="py-3 text-left">Generation</th>
                      <th className="py-3 text-left">Provider</th>
                      <th className="py-3 text-right">Allocated Credits</th>
                      <th className="py-3 text-right">Actual Cost / Credit ($)</th>
                      <th className="py-3 text-right">Required Coverage ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agencyCoverageRows.map((row) => (
                      <tr key={row.key} className="border-b border-gray-900/60">
                        <td className="py-3 text-sm text-gray-200">{row.label}</td>
                        <td className="py-3 text-xs uppercase tracking-widest text-gray-400">
                          {row.provider}
                        </td>
                        <td className="py-3 text-sm text-right text-gray-200">
                          {row.allocatedCredits.toFixed(0)}
                        </td>
                        <td className="py-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.unitUsd}
                            onChange={(e) => handlePoolCostChange(row.key, e.target.value)}
                            className="w-24 bg-gray-950 border border-gray-700 rounded p-2 text-right text-xs text-white outline-none focus:border-brand-accent"
                          />
                        </td>
                        <td className="py-3 text-sm text-right font-semibold text-brand-accent">
                          {formatUsd(row.requiredUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                    Fal Coverage Needed
                  </p>
                  <p className="text-xl font-bold text-pink-400 mt-2">
                    {formatUsd(agencyCoverageTotals.fal)}
                  </p>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                    Kie Coverage Needed
                  </p>
                  <p className="text-xl font-bold text-cyan-400 mt-2">
                    {formatUsd(agencyCoverageTotals.kie)}
                  </p>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-lg p-4">
                  <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                    Total Coverage Needed
                  </p>
                  <p className="text-xl font-bold text-white mt-2">
                    {formatUsd(agencyCoverageTotals.total)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL: NEW TENANT */}
      {showTenantModal && (
        <div className="fixed inset-0 bg-gray-950/90 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-gray-800">
              <h3 className="text-xl font-bold text-white uppercase tracking-tight">Provision New Tenant</h3>
              <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">Create Organization & Admin Account</p>
            </div>
            <form onSubmit={handleCreateTenant} className="p-8 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Organization Name</label>
                  <input
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm outline-none focus:border-brand-accent text-white"
                    placeholder="e.g. Paramount Visuals"
                    required
                    onChange={e => setNewTenant({ ...newTenant, orgName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">User Limit</label>
                    <input type="number" className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white" defaultValue={5} onChange={e => setNewTenant({ ...newTenant, maxUsers: parseInt(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Project Limit</label>
                    <input type="number" className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white" defaultValue={20} onChange={e => setNewTenant({ ...newTenant, maxProjectsTotal: parseInt(e.target.value) })} />
                  </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Storage Limit (MB)</label>
                    <input type="number" className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white" defaultValue={500} onChange={e => setNewTenant({ ...newTenant, maxStorageMb: parseInt(e.target.value) } as any)} />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Platform View</label>
                    <select
                      className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                      value={newTenant.view}
                      onChange={e => setNewTenant({ ...newTenant, view: e.target.value })}
                    >
                      <option value="VISIONLIGHT">VisionLight View (Full)</option>
                      <option value="PICDRIFT">PicDrift View (Limited)</option>
                    </select>
                </div>
                <div className="border-t border-gray-800 pt-6 space-y-4">
                  <h4 className="text-[10px] font-bold text-brand-accent uppercase tracking-widest">Tenant Admin Account</h4>
                  <input
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                    placeholder="Admin Email"
                    type="email"
                    required
                    onChange={e => setNewTenant({ ...newTenant, adminEmail: e.target.value })}
                  />
                  <input
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                    placeholder="Initial Password"
                    type="password"
                    required
                    onChange={e => setNewTenant({ ...newTenant, adminPassword: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowTenantModal(false)} className="flex-1 py-3 text-xs font-bold uppercase text-gray-500 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={actionLoading} className="flex-1 py-3 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-lg font-bold uppercase text-xs tracking-widest transition-all">
                  {actionLoading ? <LoadingSpinner size="sm" color="text-gray-950" /> : "Deploy Tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT TENANT */}
      {editingTenant && (
        <div className="fixed inset-0 bg-gray-950/90 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white uppercase tracking-tight">Configure Tenant</h3>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">{editingTenant.name}</p>
              </div>
              <button onClick={() => setEditingTenant(null)} className="text-gray-500 hover:text-white font-bold text-xl">×</button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Organization Name</label>
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                  value={tenantUpdates.name}
                  onChange={e => setTenantUpdates({ ...tenantUpdates, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Max Users</label>
                  <input
                    type="number"
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                    value={tenantUpdates.maxUsers}
                    onChange={e => setTenantUpdates({ ...tenantUpdates, maxUsers: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Max Projects</label>
                  <input
                    type="number"
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                    value={tenantUpdates.maxProjectsTotal}
                    onChange={e => setTenantUpdates({ ...tenantUpdates, maxProjectsTotal: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Storage Limit (MB)</label>
                <input
                  type="number"
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                  value={tenantUpdates.maxStorageMb}
                  onChange={e => setTenantUpdates({ ...tenantUpdates, maxStorageMb: parseInt(e.target.value) })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Platform View (Applies to all users)</label>
                <select
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                  value={tenantUpdates.view}
                  onChange={e => setTenantUpdates({ ...tenantUpdates, view: e.target.value })}
                >
                  <option value="VISIONLIGHT">VisionLight View (Full)</option>
                  <option value="PICDRIFT">PicDrift View (Limited)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Subscription Status</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setTenantUpdates({ ...tenantUpdates, isActive: true })}
                    className={`flex-1 py-3 rounded-lg border text-xs font-bold uppercase tracking-widest transition-colors ${tenantUpdates.isActive
                        ? "bg-green-500/10 border-green-500/50 text-green-400"
                        : "bg-gray-950 border-gray-800 text-gray-500 hover:text-white"
                      }`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setTenantUpdates({ ...tenantUpdates, isActive: false })}
                    className={`flex-1 py-3 rounded-lg border text-xs font-bold uppercase tracking-widest transition-colors ${!tenantUpdates.isActive
                        ? "bg-red-500/10 border-red-500/50 text-red-400"
                        : "bg-gray-950 border-gray-800 text-gray-500 hover:text-white"
                      }`}
                  >
                    Deactivated
                  </button>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setEditingTenant(null)} className="flex-1 py-3 text-xs font-bold uppercase text-gray-500 hover:text-white transition-colors">Cancel</button>
                <button onClick={handleUpdateTenant} disabled={actionLoading} className="flex-1 py-3 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-lg font-bold uppercase text-xs tracking-widest transition-all">
                  {actionLoading ? <LoadingSpinner size="sm" color="text-gray-950" /> : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT USER (Manage View/Role) */}
      {editingUser && (
        <div className="fixed inset-0 bg-gray-950/90 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-gray-800">
              <h3 className="text-xl font-bold text-white uppercase tracking-tight">Manage User</h3>
              <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">{editingUser.email}</p>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Platform View</label>
                <select
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                  value={userUpdates.view}
                  onChange={e => setUserUpdates({ ...userUpdates, view: e.target.value })}
                >
                  <option value="PICDRIFT">PICDRIFT (Demo Mode)</option>
                  <option value="VISIONLIGHT">VISIONLIGHT (Full Mode)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Account Role</label>
                <select
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                  value={userUpdates.role}
                  onChange={e => setUserUpdates({ ...userUpdates, role: e.target.value })}
                >
                  <option value="USER">Standard User</option>
                  <option value="MANAGER">Agency Manager</option>
                  <option value="ADMIN">Organization Admin</option>
                  <option value="SUPERADMIN">System SuperAdmin</option>
                </select>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setEditingUser(null)} className="flex-1 py-3 text-xs font-bold uppercase text-gray-500 hover:text-white transition-colors">Cancel</button>
                <button onClick={handleUpdateUserBasic} disabled={actionLoading} className="flex-1 py-3 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-lg font-bold uppercase text-xs tracking-widest transition-all">
                  Update User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NEW DEMO */}
      {showDemoModal && (
        <div className="fixed inset-0 bg-gray-950/90 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-gray-800">
              <h3 className="text-xl font-bold text-white uppercase tracking-tight">New Demo Account</h3>
              <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">Locked to PicDrift View</p>
            </div>
            <form onSubmit={handleCreateDemo} className="p-8 space-y-6">
              <input
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                placeholder="Demo Lead Email"
                type="email"
                required
                onChange={e => setNewDemo({ ...newDemo, email: e.target.value })}
              />
              <input
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                placeholder="Demo Lead Name"
                required
                onChange={e => setNewDemo({ ...newDemo, name: e.target.value })}
              />
              <input
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                placeholder="Initial Password"
                type="password"
                required
                onChange={e => setNewDemo({ ...newDemo, password: e.target.value })}
              />
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowDemoModal(false)} className="flex-1 py-3 text-xs font-bold uppercase text-gray-500 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={actionLoading} className="flex-1 py-3 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-lg font-bold uppercase text-xs tracking-widest transition-all">
                  {actionLoading ? <LoadingSpinner size="sm" color="text-gray-950" /> : "Create Demo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GLOBAL PRESET */}
      {showPresetModal && (
        <div className="fixed inset-0 bg-gray-950/90 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white uppercase tracking-tight">
                  {editingPreset ? "Edit Global Preset" : "New Global Preset"}
                </h3>
                <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest">Appears for every user</p>
              </div>
              <button onClick={() => setShowPresetModal(false)} className="text-gray-500 hover:text-white font-bold text-xl">×</button>
            </div>
            <form onSubmit={handleSavePreset} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Preset Name</label>
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                  placeholder="e.g. Cinematic 8K"
                  required
                  value={presetForm.name}
                  onChange={e => setPresetForm({ ...presetForm, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Prompt Content</label>
                <textarea
                  className="w-full h-32 p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent resize-none"
                  placeholder="The base prompt to apply..."
                  required
                  value={presetForm.prompt}
                  onChange={e => setPresetForm({ ...presetForm, prompt: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="preset-active"
                  className="w-4 h-4 rounded bg-gray-950 border-gray-800 text-brand-accent focus:ring-brand-accent"
                  checked={presetForm.isActive}
                  onChange={e => setPresetForm({ ...presetForm, isActive: e.target.checked })}
                />
                <label htmlFor="preset-active" className="text-xs font-bold text-gray-400 uppercase tracking-widest cursor-pointer">
                  Preset is Active
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowPresetModal(false)} className="flex-1 py-3 text-xs font-bold uppercase text-gray-500 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={actionLoading} className="flex-1 py-3 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-lg font-bold uppercase text-xs tracking-widest transition-all">
                  {actionLoading ? <LoadingSpinner size="sm" color="text-gray-950" /> : (editingPreset ? "Update Preset" : "Save Preset")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD TEAM MEMBER */}
      {showAddTeamModal && (
        <div className="fixed inset-0 bg-gray-950/90 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-8 border-b border-gray-800">
              <h3 className="text-xl font-bold text-white uppercase tracking-tight">New Agency Member</h3>
            </div>
            <form onSubmit={handleAddTeamMember} className="p-8 space-y-6">
              <input
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                placeholder="Email Address"
                type="email"
                required
                onChange={e => setNewTeamMember({ ...newTeamMember, email: e.target.value })}
              />
              <input
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                placeholder="Full Name"
                required
                onChange={e => setNewTeamMember({ ...newTeamMember, name: e.target.value })}
              />
              <input
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                placeholder="Password"
                type="password"
                required
                onChange={e => setNewTeamMember({ ...newTeamMember, password: e.target.value })}
              />
              <select
                className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300"
                onChange={e => setNewTeamMember({ ...newTeamMember, role: e.target.value })}
              >
                <option value="USER">Standard User</option>
                <option value="MANAGER">Team Manager</option>
              </select>
              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowAddTeamModal(false)} className="flex-1 py-3 text-xs font-bold uppercase text-gray-500 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={actionLoading} className="flex-1 py-3 bg-brand-accent hover:bg-cyan-300 text-gray-950 rounded-lg font-bold uppercase text-xs tracking-widest transition-all">
                  {actionLoading ? <LoadingSpinner size="sm" color="text-gray-950" /> : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
