import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

export default function Projects() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await apiEndpoints.getProjects();
      return res.data.projects;
    },
    enabled: !!user,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      return await apiEndpoints.createProject({ name });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setNewProjectName("");
      setIsCreating(false);
      // Automatically navigate to the new project dashboard
      localStorage.setItem("visionlight_active_project", res.data.project.id);
      navigate("/app");
    },
    onError: (err: any) => {
      alert("Failed to create project: " + err.message);
      setIsCreating(false);
    }
  });

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return await apiEndpoints.updateProject(id, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setEditingProjectId(null);
      setEditingName("");
    },
    onError: (err: any) => {
      alert("Failed to rename project: " + err.message);
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setIsCreating(true);
    createProjectMutation.mutate(newProjectName);
  };

  const handleSelectProject = (projectId: string) => {
    localStorage.setItem("visionlight_active_project", projectId);
    navigate("/app");
  };

  if (isLoading) return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <LoadingSpinner size="lg" variant="neon" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl flex justify-between items-center mb-12">
        <h1 className="text-3xl font-bold text-white">Your Projects</h1>
        <button
          onClick={logout}
          className="px-4 py-2 bg-gray-800/60 border border-purple-400/30 rounded-xl text-purple-300 hover:bg-purple-400/10 transition-colors"
        >
          Logout
        </button>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Create New Project Card */}
        <div className="bg-gray-800/40 border border-cyan-500/30 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[200px] hover:bg-gray-800/60 transition-colors">
          <form onSubmit={handleCreate} className="w-full flex flex-col items-center">
            <h3 className="text-xl font-bold text-white mb-4">Create New Project</h3>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Project Name..."
              className="w-full p-3 bg-gray-900/50 border border-white/10 rounded-xl text-white mb-4 focus:outline-none focus:border-cyan-500"
              required
            />
            <button
              type="submit"
              disabled={isCreating}
              className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-white disabled:opacity-50 transition-colors"
            >
              {isCreating ? "Creating..." : "Create"}
            </button>
          </form>
        </div>

        {/* Existing Projects */}
        {projectsData?.map((project: any) => (
          <div
            key={project.id}
            className="bg-gray-800/40 border border-purple-500/30 rounded-2xl p-6 flex flex-col justify-between min-h-[200px] hover:bg-gray-800/60 transition-all shadow-lg relative group"
          >
            {editingProjectId === project.id ? (
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  className="w-full p-2 bg-gray-900 border border-cyan-500 rounded-lg text-white text-lg font-bold"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => updateProjectMutation.mutate({ id: project.id, name: editingName })}
                    className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white font-bold text-xs uppercase"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingProjectId(null)}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 font-bold text-xs uppercase"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div onClick={() => handleSelectProject(project.id)} className="cursor-pointer flex-1">
                  <h3 className="text-2xl font-bold text-white mb-2">{project.name}</h3>
                  <p className="text-gray-400 text-sm">
                    Created: {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex justify-between items-end mt-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingProjectId(project.id);
                      setEditingName(project.name);
                    }}
                    className="p-2 text-gray-500 hover:text-cyan-400 transition-colors"
                    title="Rename Project"
                  >
                    ✏️
                  </button>
                  <div 
                    onClick={() => handleSelectProject(project.id)}
                    className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-300 group-hover:bg-purple-600 group-hover:text-white transition-colors cursor-pointer"
                  >
                    ➔
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
