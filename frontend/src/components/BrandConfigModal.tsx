import { useState } from "react";
import { useUpdateBrandConfig } from "../hooks/useBrandConfig";
import { useBrand } from "../contexts/BrandContext";
import { LoadingSpinner } from "./LoadingSpinner";
import { useQueryClient } from "@tanstack/react-query";

interface BrandConfigModalProps {
  onClose: () => void;
  currentConfig?: any;
}

export const BrandConfigModal = ({
  onClose,
  currentConfig,
}: BrandConfigModalProps) => {
  const [formData, setFormData] = useState({
    companyName: currentConfig?.companyName || "",
    primaryColor: currentConfig?.primaryColor || "#6366f1",
    secondaryColor: currentConfig?.secondaryColor || "#8b5cf6",
    logoUrl: currentConfig?.logoUrl || "",
  });

  const { updateBrandConfig } = useBrand();
  const updateMutation = useUpdateBrandConfig();
  const queryClient = useQueryClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData, {
      onSuccess: () => {
        // Update local context immediately for instant UI update
        updateBrandConfig(formData);
        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["brand-config"] });
        onClose();
      },
    });
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="border-b border-white/10 p-6">
          <h2 className="text-2xl font-bold text-white">Brand Settings</h2>
          <p className="text-purple-300 text-sm mt-1">
            Customize your AI content studio
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Company Name */}
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              🏢 Company Name
            </label>
            <input
              type="text"
              value={formData.companyName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  companyName: e.target.value,
                }))
              }
              className="w-full p-4 bg-gray-700/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-white placeholder-gray-400 backdrop-blur-sm"
              placeholder="Enter your brand name"
            />
          </div>

          {/* Color Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                🎨 Primary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.primaryColor}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      primaryColor: e.target.value,
                    }))
                  }
                  className="w-12 h-12 rounded-lg border border-white/10 cursor-pointer"
                />
                <div className="flex-1 p-3 bg-gray-700/50 rounded-lg border border-white/10">
                  <p className="text-white text-sm font-mono">
                    {formData.primaryColor}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                🌈 Secondary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.secondaryColor}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      secondaryColor: e.target.value,
                    }))
                  }
                  className="w-12 h-12 rounded-lg border border-white/10 cursor-pointer"
                />
                <div className="flex-1 p-3 bg-gray-700/50 rounded-lg border border-white/10">
                  <p className="text-white text-sm font-mono">
                    {formData.secondaryColor}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Color Preview */}
          <div className="p-4 bg-gray-700/30 rounded-xl border border-white/10">
            <p className="text-white text-sm font-semibold mb-2">Preview:</p>
            <div
              className="h-8 rounded-lg flex items-center justify-center text-white text-sm font-semibold"
              style={{
                background: `linear-gradient(135deg, ${formData.primaryColor}, ${formData.secondaryColor})`,
              }}
            >
              {formData.companyName || "Your Brand"}
            </div>
          </div>

          {/* Logo URL */}
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              🖼️ Logo URL (Optional)
            </label>
            <input
              type="url"
              value={formData.logoUrl}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, logoUrl: e.target.value }))
              }
              className="w-full p-4 bg-gray-700/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-white placeholder-gray-400 backdrop-blur-sm"
              placeholder="https://example.com/logo.png"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-4 px-6 bg-gray-700/50 border border-white/10 text-white rounded-xl hover:bg-gray-600/50 transition-all duration-200 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 py-4 px-6 text-white rounded-xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${formData.primaryColor}, ${formData.secondaryColor})`,
              }}
            >
              {updateMutation.isPending ? (
                <LoadingSpinner size="sm" variant="light" />
              ) : (
                "💾"
              )}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
