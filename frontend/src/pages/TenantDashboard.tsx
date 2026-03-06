import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  maxProjects: number;
  creditsPicDrift: number;
  creditsImageFX: number;
}

interface Config {
  name: string;
  falApiKey: string;
  kieApiKey: string;
  openaiApiKey: string;
}

export default function TenantDashboard() {
  const { user: adminUser } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"team" | "integrations">("team");
  const [users, setUsers] = useState<User[]>([]);
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

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === "team") {
        const res = await apiEndpoints.tenantGetTeam();
        if (res.data.success) setUsers(res.data.users);
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

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
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
        addCredits: parseFloat(amount),
        creditType: pool
      });
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
      <div className="max-w-[1200px] mx-auto pb-24">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-8 border-b border-gray-800 pb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2 uppercase">
              Agency <span className="text-brand-accent">Management</span>
            </h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
              {adminUser?.organizationName || "Your Organization"} — Admin Panel
            </p>
          </div>

          <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
            <button
              onClick={() => setActiveTab("team")}
              className={`px-6 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
                activeTab === "team" ? "bg-gray-800 text-brand-accent" : "text-gray-400 hover:text-white"
              }`}
            >
              My Team
            </button>
            <button
              onClick={() => setActiveTab("integrations")}
              className={`px-6 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors ${
                activeTab === "integrations" ? "bg-gray-800 text-brand-accent" : "text-gray-400 hover:text-white"
              }`}
            >
              Integrations
            </button>
          </div>
        </div>

        {msg && (
          <div className="mb-8 p-4 rounded-lg bg-brand-accent/5 border border-brand-accent/20 text-brand-accent text-xs font-semibold">
            {msg}
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === "team" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Team Members</h2>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="bg-brand-accent hover:bg-cyan-300 text-gray-950 px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                Add Member
              </button>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
              <table className="w-full text-left">
                <thead className="bg-gray-950/50 text-[9px] uppercase tracking-widest text-gray-500 font-bold">
                  <tr>
                    <th className="p-5">User</th>
                    <th className="p-5 text-center">Role</th>
                    <th className="p-5 text-center">PD Credits</th>
                    <th className="p-5 text-center">PicFX Credits</th>
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
                         <input 
                            type="number" 
                            className="w-16 bg-gray-950 border border-gray-800 rounded p-1 text-center text-xs"
                            defaultValue={u.creditsPicDrift}
                            onBlur={(e) => handleUpdateUserCredits(u.id, "creditsPicDrift", (parseFloat(e.target.value) - u.creditsPicDrift).toString())}
                         />
                      </td>
                      <td className="p-5 text-center">
                         <input 
                            type="number" 
                            className="w-16 bg-gray-950 border border-gray-800 rounded p-1 text-center text-xs"
                            defaultValue={u.creditsImageFX}
                            onBlur={(e) => handleUpdateUserCredits(u.id, "creditsImageFX", (parseFloat(e.target.value) - u.creditsImageFX).toString())}
                         />
                      </td>
                      <td className="p-5 text-right">
                         <button 
                          className="text-red-500/50 hover:text-red-400 text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all"
                          onClick={() => {
                            if(window.confirm("Remove user from team?")) {
                              apiEndpoints.tenantDeleteUser(u.id).then(fetchData);
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

        {/* INTEGRATIONS TAB */}
        {activeTab === "integrations" && config && (
          <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 shadow-xl">
              <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-tight">API Credentials</h2>
              <form onSubmit={handleUpdateConfig} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Fal AI Key</label>
                  <input
                    type="password"
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white focus:border-brand-accent outline-none font-mono"
                    value={config.falApiKey}
                    onChange={e => setConfig({...config, falApiKey: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Kling/KIE AI Key</label>
                  <input
                    type="password"
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white focus:border-brand-accent outline-none font-mono"
                    value={config.kieApiKey}
                    onChange={e => setConfig({...config, kieApiKey: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">OpenAI Key</label>
                  <input
                    type="password"
                    className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white focus:border-brand-accent outline-none font-mono"
                    value={config.openaiApiKey}
                    onChange={e => setConfig({...config, openaiApiKey: e.target.value})}
                  />
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
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                />
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                  placeholder="Full Name"
                  required
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                />
                <input
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-white"
                  placeholder="Password"
                  type="password"
                  required
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                />
                <select 
                  className="w-full p-3 bg-gray-950 border border-gray-800 rounded-lg text-sm text-gray-300"
                  onChange={e => setNewUser({...newUser, role: e.target.value})}
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
