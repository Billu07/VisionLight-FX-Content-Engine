import { useState, useEffect, useMemo } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";

interface Tenant {
  id: string;
  name: string;
  isActive: boolean;
  maxUsers: number;
  maxProjectsTotal: number;
  createdAt: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  view: string;
  organizationId: string;
  creditsPicDrift: number;
  creditsImageFX: number;
}

export default function SuperAdminDashboard() {
  const { user: adminUser } = useAuth();

  const [activeTab, setActiveTab] = useState<"tenants" | "my-agency" | "demo-leads" | "global-settings">("tenants");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [globalSettings, setGlobalSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Modals
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  
  // Forms
  const [newTenant, setNewTenant] = useState({
    orgName: "",
    adminEmail: "",
    adminPassword: "",
    adminName: "",
    maxUsers: 5,
    maxProjectsTotal: 20
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

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      const [tenantsRes, settingsRes, usersRes] = await Promise.all([
        apiEndpoints.superadminGetOrganizations(),
        apiEndpoints.superadminGetGlobalSettings(),
        apiEndpoints.adminGetUsers() 
      ]);
      
      if (tenantsRes.data.success) setTenants(tenantsRes.data.organizations);
      if (settingsRes.data.success) setGlobalSettings(settingsRes.data.settings);
      if (usersRes.data.success) setUsers(usersRes.data.users);
    } catch (err: any) {
      setMsg("Error loading data: " + err.message);
    } finally {
      setLoading(false);
    }
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

  const handleCreateDemo = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await apiEndpoints.superadminCreateDemoUser(newDemo);
      setMsg("Demo user created (5 Picdrift, 15 PicFX).");
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

  const toggleTenantStatus = async (id: string, currentStatus: boolean) => {
    try {
      await apiEndpoints.superadminUpdateOrgStatus(id, !currentStatus);
      fetchInitialData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const myAgencyUsers = useMemo(() => {
    return users.filter(u => u.organizationId === adminUser?.organizationId);
  }, [users, adminUser]);

  const demoUsers = useMemo(() => {
    return users.filter(u => u.view === "PICDRIFT");
  }, [users]);

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
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2 uppercase">
              Platform <span className="text-brand-accent">Control</span>
            </h1>
            <p className="text-[11px] text-gray-400 uppercase tracking-widest font-semibold">
              Super Admin Interface — {adminUser?.email}
            </p>
          </div>

          <div className="flex flex-wrap bg-gray-900 p-1.5 rounded-lg border border-gray-800 gap-1">
            {["tenants", "my-agency", "demo-leads", "global-settings"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  activeTab === tab ? "bg-gray-800 text-brand-accent" : "text-gray-400 hover:text-white"
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

        {/* TAB CONTENT: TENANTS */}
        {activeTab === "tenants" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
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
                        <button
                          onClick={() => toggleTenantStatus(t.id, t.isActive)}
                          className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border ${
                            t.isActive 
                              ? "bg-green-500/10 text-green-400 border-green-500/20" 
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}
                        >
                          {t.isActive ? "Active" : "Deactivated"}
                        </button>
                      </td>
                      <td className="p-6 text-center">
                        <div className="text-xs text-gray-300 font-semibold">
                          Max Users: {t.maxUsers} | Max Projects: {t.maxProjectsTotal}
                        </div>
                      </td>
                      <td className="p-6 text-right">
                        <button 
                          className="text-gray-400 hover:text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 bg-gray-800 rounded-md"
                          onClick={() => setMsg(`Limits for ${t.name} managed via database for now.`)}
                        >
                          Configure
                        </button>
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
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-950 text-[10px] uppercase tracking-widest text-gray-500 font-bold">
                  <tr>
                    <th className="p-6">User</th>
                    <th className="p-6 text-center">Role</th>
                    <th className="p-6 text-center">PD Credits</th>
                    <th className="p-6 text-center">PicFX Credits</th>
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
                        <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                          {u.role}
                        </span>
                      </td>
                      <td className="p-6 text-center">
                         <input 
                            type="number" 
                            className="w-16 bg-gray-950 border border-gray-800 rounded p-1 text-center text-xs text-white"
                            defaultValue={u.creditsPicDrift}
                            onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: parseFloat(e.target.value) - u.creditsPicDrift, creditType: "creditsPicDrift" })}
                         />
                      </td>
                      <td className="p-6 text-center">
                         <input 
                            type="number" 
                            className="w-16 bg-gray-950 border border-gray-800 rounded p-1 text-center text-xs text-white"
                            defaultValue={u.creditsImageFX}
                            onBlur={(e) => handleUpdateAgencyUser(u.id, { addCredits: parseFloat(e.target.value) - u.creditsImageFX, creditType: "creditsImageFX" })}
                         />
                      </td>
                      <td className="p-6 text-right">
                         <button 
                          className="text-red-500/50 hover:text-red-400 text-[10px] font-bold uppercase tracking-widest"
                          onClick={() => {
                            if(window.confirm("Remove user from team?")) {
                              apiEndpoints.tenantDeleteUser(u.id).then(fetchInitialData);
                            }
                          }}
                         >
                          Remove
                         </button>
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
                    <span className="bg-cyan-500/10 text-cyan-400 text-[9px] font-bold px-2 py-1 rounded uppercase tracking-widest border border-cyan-500/20">
                      Demo
                    </span>
                  </div>
                  <div className="flex gap-4 border-t border-gray-800 pt-4 mt-4">
                    <div className="flex-1">
                      <div className="text-[9px] uppercase text-gray-500 font-bold mb-1">PicDrift</div>
                      <div className="text-sm font-bold text-white">{u.creditsPicDrift}</div>
                    </div>
                    <div className="flex-1 border-l border-gray-800 pl-4">
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
            <div className="bg-brand-accent/5 border border-brand-accent/20 p-6 rounded-xl">
              <h3 className="text-brand-accent font-bold uppercase text-xs tracking-widest mb-2">Global Pricing Template</h3>
              <p className="text-xs text-gray-400 italic">These prices are used as defaults for all new organizations unless overridden.</p>
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
                          className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                          defaultValue={globalSettings[key]}
                          onBlur={(e) => apiEndpoints.superadminUpdateGlobalSettings({ [key]: parseFloat(e.target.value) })}
                        />
                      </div>
                    ))}
                  </div>
               </div>
               <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 pb-2 border-b border-gray-800">Studio (Pic FX)</h4>
                  <div className="space-y-4">
                    {["pricePicFX_Standard", "pricePicFX_Carousel", "pricePicFX_Batch"].map(key => (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">{key.replace('price', '').replace(/_/g, ' ')}</span>
                        <input 
                          type="number" 
                          className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                          defaultValue={globalSettings[key]}
                          onBlur={(e) => apiEndpoints.superadminUpdateGlobalSettings({ [key]: parseFloat(e.target.value) })}
                        />
                      </div>
                    ))}
                  </div>
               </div>
               <div className="bg-gray-900 p-8 rounded-xl border border-gray-800">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6 pb-2 border-b border-gray-800">Video FX</h4>
                  <div className="space-y-4">
                    {["priceVideoFX1_10s", "priceVideoFX2_4s", "priceVideoFX3_4s"].map(key => (
                      <div key={key} className="flex justify-between items-center">
                        <span className="text-[10px] text-gray-400 uppercase font-bold">{key.replace('price', '').replace(/_/g, ' ')}</span>
                        <input 
                          type="number" 
                          className="w-16 bg-gray-950 border border-gray-700 rounded p-1 text-center text-xs text-white"
                          defaultValue={globalSettings[key]}
                          onBlur={(e) => apiEndpoints.superadminUpdateGlobalSettings({ [key]: parseFloat(e.target.value) })}
                        />
                      </div>
                    ))}
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
                    onChange={e => setNewTenant({...newTenant, orgName: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">User Limit</label>
                      <input type="number" className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white" defaultValue={5} onChange={e => setNewTenant({...newTenant, maxUsers: parseInt(e.target.value)})}/>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Project Limit</label>
                      <input type="number" className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white" defaultValue={20} onChange={e => setNewTenant({...newTenant, maxProjectsTotal: parseInt(e.target.value)})}/>
                   </div>
                </div>
                <div className="border-t border-gray-800 pt-6 space-y-4">
                  <h4 className="text-[10px] font-bold text-brand-accent uppercase tracking-widest">Tenant Admin Account</h4>
                  <input
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                    placeholder="Admin Email"
                    type="email"
                    required
                    onChange={e => setNewTenant({...newTenant, adminEmail: e.target.value})}
                  />
                  <input
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                    placeholder="Initial Password"
                    type="password"
                    required
                    onChange={e => setNewTenant({...newTenant, adminPassword: e.target.value})}
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
                  onChange={e => setNewDemo({...newDemo, email: e.target.value})}
                />
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                  placeholder="Demo Lead Name"
                  required
                  onChange={e => setNewDemo({...newDemo, name: e.target.value})}
                />
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white outline-none focus:border-brand-accent"
                  placeholder="Initial Password"
                  type="password"
                  required
                  onChange={e => setNewDemo({...newDemo, password: e.target.value})}
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
                  onChange={e => setNewTeamMember({...newTeamMember, email: e.target.value})}
                />
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                  placeholder="Full Name"
                  required
                  onChange={e => setNewTeamMember({...newTeamMember, name: e.target.value})}
                />
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                  placeholder="Password"
                  type="password"
                  required
                  onChange={e => setNewTeamMember({...newTeamMember, password: e.target.value})}
                />
                <select 
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300"
                  onChange={e => setNewTeamMember({...newTeamMember, role: e.target.value})}
                >
                  <option value="USER">Standard User</option>
                  <option value="MANAGER">Team Manager</option>
                  <option value="SUPERADMIN">System Admin</option>
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
