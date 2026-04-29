import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useAuth } from "../hooks/useAuth";
import { apiEndpoints } from "../lib/api";

export default function Projects() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [newProjectName, setNewProjectName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string | null>(null);

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await apiEndpoints.getProjects();
      return res.data.projects || [];
    },
    enabled: !!user,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => apiEndpoints.createProject({ name }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNewProjectName("");
      setShowCreateForm(false);
      localStorage.setItem("visionlight_active_project", res.data.project.id);
      navigate("/app");
    },
    onError: (err: any) => {
      alert("Failed to create project: " + err.message);
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) =>
      apiEndpoints.updateProject(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEditingProjectId(null);
      setEditingName("");
      setOpenMenuProjectId(null);
    },
    onError: (err: any) => {
      alert("Failed to rename project: " + err.message);
    },
  });

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-project-menu]")) {
        setOpenMenuProjectId(null);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const nextName = newProjectName.trim();
    if (!nextName) return;
    createProjectMutation.mutate(nextName);
  };

  const handleSelectProject = (projectId: string) => {
    localStorage.setItem("visionlight_active_project", projectId);
    navigate("/app");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <LoadingSpinner size="lg" variant="neon" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070a20] px-4 py-6 text-gray-200 sm:px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(34,211,238,0.14),transparent_36%),radial-gradient(circle_at_82%_12%,rgba(56,189,248,0.16),transparent_44%)]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Your Projects
          </h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm((prev) => !prev)}
              className="rounded-lg border border-cyan-700/50 bg-cyan-900/50 px-4 py-2 text-xs font-semibold text-cyan-300 transition-colors hover:border-cyan-500 hover:bg-cyan-800"
            >
              {showCreateForm ? "Close" : "Create Project"}
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>

        {showCreateForm && (
          <div className="mb-6 rounded-2xl border border-cyan-500/25 bg-gray-900/55 p-4 shadow-2xl backdrop-blur-xl">
            <form
              onSubmit={handleCreate}
              className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]"
            >
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project Name..."
                className="w-full rounded-xl border border-white/10 bg-gray-900/70 p-3 text-sm text-white focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                required
              />
              <button
                type="submit"
                disabled={createProjectMutation.isPending}
                className="rounded-xl border border-cyan-700/50 bg-cyan-900/50 px-4 py-3 text-sm font-bold text-cyan-300 transition-colors hover:border-cyan-500 hover:bg-cyan-800 hover:text-white disabled:opacity-60"
              >
                {createProjectMutation.isPending ? "Creating..." : "Create"}
              </button>
            </form>
          </div>
        )}

        {projectsData.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-gray-900/50 p-8 text-center text-gray-400">
            No projects yet. Create your first project to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projectsData.map((project: any) => (
              <div
                key={project.id}
                className="group relative flex min-h-[210px] flex-col rounded-2xl border border-white/10 bg-gray-800/30 p-5 shadow-[0_22px_50px_rgba(2,8,23,0.45)] backdrop-blur-lg transition-all hover:border-cyan-500/35 hover:bg-gray-800/45"
              >
                {editingProjectId === project.id ? (
                  <div className="flex h-full flex-col gap-3">
                    <label className="text-[11px] font-bold uppercase tracking-widest text-cyan-300/90">
                      Rename Project
                    </label>
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="w-full rounded-lg border border-cyan-500/60 bg-gray-900/90 p-3 text-white text-sm font-semibold focus:outline-none"
                      autoFocus
                    />
                    <div className="mt-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateProjectMutation.mutate({
                            id: project.id,
                            name: editingName.trim(),
                          })
                        }
                        className="flex-1 rounded-lg border border-cyan-700/50 bg-cyan-900/50 py-2 text-xs font-bold uppercase tracking-widest text-cyan-300 transition-colors hover:border-cyan-500 hover:bg-cyan-800 hover:text-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingProjectId(null);
                          setEditingName("");
                        }}
                        className="flex-1 rounded-lg border border-gray-600 bg-gray-800 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-xl font-bold text-white">{project.name}</h3>
                        <p className="mt-1 text-xs text-gray-400">
                          Created {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="relative" data-project-menu>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuProjectId((prev) =>
                              prev === project.id ? null : project.id,
                            )
                          }
                          className="rounded-lg border border-white/10 bg-gray-900/65 p-2 text-gray-300 transition-colors hover:border-cyan-500/40 hover:text-white"
                          aria-label="Project options"
                        >
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>

                        {openMenuProjectId === project.id && (
                          <div className="absolute right-0 top-full z-20 mt-2 w-36 rounded-xl border border-white/10 bg-gray-900 p-1 shadow-2xl">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProjectId(project.id);
                                setEditingName(project.name);
                                setOpenMenuProjectId(null);
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/10"
                            >
                              Rename
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto">
                      <button
                        type="button"
                        onClick={() => handleSelectProject(project.id)}
                        className="w-full rounded-xl border border-cyan-700/50 bg-cyan-900/50 px-4 py-2.5 text-sm font-bold text-cyan-300 transition-colors hover:border-cyan-500 hover:bg-cyan-800 hover:text-white"
                      >
                        Open Project
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
