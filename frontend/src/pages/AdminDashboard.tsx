import { useState, useEffect } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";

interface User {
  id: string;
  email: string;
  name: string;
  creditSystem: "COMMERCIAL" | "INTERNAL";
  demoCredits: { video: number; image: number; carousel: number };
}

interface CreditRequest {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export default function AdminDashboard() {
  const { user: adminUser } = useAuth();

  // Data State
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // UI State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Forms State
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "" });
  const [editForm, setEditForm] = useState<{
    credits: { video: number; image: number; carousel: number };
    creditSystem: "COMMERCIAL" | "INTERNAL";
    name: string;
  }>({
    credits: { video: 0, image: 0, carousel: 0 },
    creditSystem: "COMMERCIAL",
    name: "",
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, reqRes] = await Promise.all([
        apiEndpoints.adminGetUsers(),
        apiEndpoints.adminGetRequests(),
      ]);

      if (usersRes.data.success) setUsers(usersRes.data.users);
      if (reqRes.data.success) setRequests(reqRes.data.requests);
    } catch (err) {
      console.error("Failed to load data", err);
    } finally {
      setLoading(false);
    }
  };

  // --- NOTIFICATION ACTIONS ---
  const handleResolveRequest = async (id: string) => {
    try {
      await apiEndpoints.adminResolveRequest(id);
      fetchData(); // Refresh list
    } catch (err) {
      console.error(err);
    }
  };

  // --- USER ACTIONS ---

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

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setEditForm({
      credits: { ...u.demoCredits },
      creditSystem: u.creditSystem || "COMMERCIAL",
      name: u.name,
    });
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setActionLoading(true);
    try {
      await apiEndpoints.adminUpdateUser(editingUser.id, editForm);
      setEditingUser(null);
      fetchData();
    } catch (err: any) {
      alert("Update failed: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (user: User) => {
    if (
      !window.confirm(
        `Are you sure you want to delete ${user.email}? This cannot be undone.`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      await apiEndpoints.adminDeleteUser(user.id);
      setMsg(`✅ User ${user.email} deleted.`);
      fetchData();
    } catch (err: any) {
      alert("Failed to delete user: " + err.message);
      setLoading(false);
    }
  };

  // Filter
  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-cyan-400">
              Admin Dashboard
            </h1>
            <p className="text-sm text-gray-400">
              Logged in as: {adminUser?.email}
            </p>
          </div>

          <div className="flex gap-4 w-full md:w-auto">
            <input
              placeholder="Search users..."
              className="bg-gray-800 border border-gray-700 rounded-lg p-3 w-full md:w-64 focus:ring-2 focus:ring-cyan-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              onClick={() => setShowInviteModal(true)}
              className="bg-green-600 hover:bg-green-500 text-white font-bold px-6 py-3 rounded-lg transition-all shadow-lg shadow-green-900/20 whitespace-nowrap"
            >
              + Invite User
            </button>
          </div>
        </div>

        {/* ALERTS */}
        {msg && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              msg.startsWith("✅")
                ? "bg-green-900/20 border-green-500/30 text-green-300"
                : "bg-red-900/20 border-red-500/30 text-red-300"
            }`}
          >
            {msg}
            <button
              onClick={() => setMsg("")}
              className="float-right font-bold ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* === NOTIFICATION CENTER === */}
        {requests.length > 0 && (
          <div className="mb-8 bg-purple-900/20 border border-purple-500/30 rounded-xl p-6 animate-in fade-in">
            <h2 className="text-xl font-bold text-purple-300 mb-4 flex items-center gap-2">
              🔔 Pending Credit Requests ({requests.length})
            </h2>
            <div className="grid gap-3">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between bg-gray-800 p-4 rounded-lg border border-gray-700"
                >
                  <div>
                    <span className="font-bold text-white">{req.name}</span>
                    <span className="text-gray-400 text-sm ml-2">
                      ({req.email})
                    </span>
                    <span className="text-xs text-gray-500 block mt-1">
                      Requested: {new Date(req.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setSearchTerm(req.email); // Auto-filter the table
                        setMsg(
                          `🔍 Filtered for ${req.email}. Click 'Edit' to grant credits.`
                        );
                      }}
                      className="text-cyan-400 hover:text-white text-sm underline"
                    >
                      Find User
                    </button>
                    <button
                      onClick={() => handleResolveRequest(req.id)}
                      className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-xs text-white uppercase font-bold"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* USERS TABLE */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-4 border-b border-gray-700">User Details</th>
                  <th className="p-4 border-b border-gray-700">System</th>
                  <th className="p-4 border-b border-gray-700">
                    Credits (Vid/Img/Car)
                  </th>
                  <th className="p-4 border-b border-gray-700 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center">
                      <LoadingSpinner size="lg" variant="neon" />
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-gray-500">
                      No users found.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-gray-750 transition-colors"
                    >
                      <td className="p-4">
                        <div className="font-bold text-white text-base">
                          {u.name || "Unnamed"}
                        </div>
                        <div className="text-sm text-cyan-400/80">
                          {u.email}
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold border ${
                            u.creditSystem === "COMMERCIAL"
                              ? "bg-green-500/10 border-green-500/30 text-green-400"
                              : "bg-purple-500/10 border-purple-500/30 text-purple-300"
                          }`}
                        >
                          {u.creditSystem === "COMMERCIAL"
                            ? "💵 COMMERCIAL"
                            : "🏢 INTERNAL"}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-sm">
                        <div className="flex gap-3">
                          <span title="Video" className="text-blue-300">
                            🎬 {u.demoCredits.video}
                          </span>
                          <span title="Image" className="text-pink-300">
                            🖼️ {u.demoCredits.image}
                          </span>
                          <span title="Carousel" className="text-orange-300">
                            📱 {u.demoCredits.carousel}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEditModal(u)}
                            className="text-cyan-400 hover:text-white bg-cyan-950 hover:bg-cyan-600 border border-cyan-800 hover:border-cyan-500 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="text-red-400 hover:text-white bg-red-950/50 hover:bg-red-600 border border-red-900 hover:border-red-500 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
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

        {/* MODAL: INVITE USER */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl border border-gray-600 p-8 w-full max-w-md shadow-2xl">
              <h3 className="text-2xl font-bold mb-6 text-white">
                Invite New User
              </h3>
              <form onSubmit={handleInviteUser} className="space-y-4">
                <div>
                  <label className="text-xs uppercase text-gray-400 font-bold">
                    Email
                  </label>
                  <input
                    className="w-full p-3 bg-gray-900 rounded border border-gray-700 mt-1"
                    value={newUser.email}
                    onChange={(e) =>
                      setNewUser({ ...newUser, email: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-gray-400 font-bold">
                    Full Name
                  </label>
                  <input
                    className="w-full p-3 bg-gray-900 rounded border border-gray-700 mt-1"
                    value={newUser.name}
                    onChange={(e) =>
                      setNewUser({ ...newUser, name: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="text-xs uppercase text-gray-400 font-bold">
                    Password
                  </label>
                  <input
                    className="w-full p-3 bg-gray-900 rounded border border-gray-700 mt-1"
                    value={newUser.password}
                    onChange={(e) =>
                      setNewUser({ ...newUser, password: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="flex gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 py-3 bg-gray-700 rounded hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 py-3 bg-green-600 rounded font-bold hover:bg-green-500"
                  >
                    {actionLoading ? (
                      <LoadingSpinner size="sm" variant="light" />
                    ) : (
                      "Create User"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: EDIT USER */}
        {editingUser && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-2xl border border-cyan-500/30 p-8 w-full max-w-lg shadow-2xl relative">
              <button
                onClick={() => setEditingUser(null)}
                className="absolute top-4 right-4 text-gray-500 hover:text-white"
              >
                ✕
              </button>
              <h3 className="text-xl font-bold mb-2 text-white">Edit User</h3>
              <p className="text-sm text-cyan-400 mb-6">{editingUser.email}</p>

              <div className="space-y-6">
                <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
                  <label className="block text-xs uppercase text-gray-400 font-bold mb-3">
                    Credit System Mode
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditForm({ ...editForm, creditSystem: "COMMERCIAL" })
                      }
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${
                        editForm.creditSystem === "COMMERCIAL"
                          ? "bg-green-600 border-green-500 text-white"
                          : "bg-gray-800 border-gray-600 text-gray-400"
                      }`}
                    >
                      💵 Commercial (Buy $)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditForm({ ...editForm, creditSystem: "INTERNAL" })
                      }
                      className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${
                        editForm.creditSystem === "INTERNAL"
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "bg-gray-800 border-gray-600 text-gray-400"
                      }`}
                    >
                      🏢 Internal (Request)
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {editForm.creditSystem === "COMMERCIAL"
                      ? "User sees 'Buy Credits' buttons."
                      : "User sees 'Request Credits' buttons."}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs uppercase text-blue-300 font-bold mb-1">
                      Video
                    </label>
                    <input
                      type="number"
                      className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-center font-mono text-lg"
                      value={editForm.credits.video}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          credits: {
                            ...editForm.credits,
                            video: parseInt(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-pink-300 font-bold mb-1">
                      Image
                    </label>
                    <input
                      type="number"
                      className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-center font-mono text-lg"
                      value={editForm.credits.image}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          credits: {
                            ...editForm.credits,
                            image: parseInt(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-orange-300 font-bold mb-1">
                      Carousel
                    </label>
                    <input
                      type="number"
                      className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-center font-mono text-lg"
                      value={editForm.credits.carousel}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          credits: {
                            ...editForm.credits,
                            carousel: parseInt(e.target.value) || 0,
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase text-gray-400 font-bold mb-1">
                    Display Name
                  </label>
                  <input
                    className="w-full p-2 bg-gray-900 border border-gray-600 rounded"
                    value={editForm.name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, name: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-8 pt-4 border-t border-gray-700">
                <button
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-3 bg-gray-700 rounded hover:bg-gray-600 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateUser}
                  disabled={actionLoading}
                  className="flex-1 py-3 bg-cyan-600 rounded hover:bg-cyan-500 font-bold text-white shadow-lg shadow-cyan-900/20"
                >
                  {actionLoading ? (
                    <LoadingSpinner size="sm" variant="light" />
                  ) : (
                    "Save Changes"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
