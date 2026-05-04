import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateBrandConfig } from "../hooks/useBrandConfig";
import { useBrand } from "../contexts/BrandContext";
import { LoadingSpinner } from "./LoadingSpinner";
import { apiEndpoints } from "../lib/api";
import { notify } from "../lib/notifications";

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
  const [isLogoUploading, setIsLogoUploading] = useState(false);

  const { updateBrandConfig } = useBrand();
  const updateMutation = useUpdateBrandConfig();
  const queryClient = useQueryClient();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData, {
      onSuccess: (savedResponse) => {
        updateBrandConfig(savedResponse?.config || formData);
        queryClient.invalidateQueries({ queryKey: ["brand-config"] });
        onClose();
      },
      onError: (err: any) => {
        notify.error(err?.message || "Failed to save brand settings.");
      },
    });
  };

  const handleLogoUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify.error("Logo must be an image file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify.error("Logo file is too large. Maximum size is 10MB.");
      return;
    }

    setIsLogoUploading(true);
    try {
      const payload = new FormData();
      payload.append("image", file);
      const res = await apiEndpoints.uploadBrandLogo(payload);
      const nextLogoUrl = res.data?.logoUrl || res.data?.config?.logoUrl || "";
      const nextConfig = {
        ...formData,
        ...(res.data?.config || {}),
        logoUrl: nextLogoUrl,
      };
      setFormData(nextConfig);
      updateBrandConfig(nextConfig);
      queryClient.invalidateQueries({ queryKey: ["brand-config"] });
      notify.success("Logo uploaded to storage.");
    } catch (err: any) {
      notify.error(err?.message || "Logo upload failed.");
    } finally {
      setIsLogoUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="border-b border-white/10 p-6">
          <h2 className="text-2xl font-bold text-white">Brand Settings</h2>
          <p className="text-purple-300 text-sm mt-1">
            Customize your AI content studio
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              Company Name
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-white mb-3">
                Primary Color
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
                Secondary Color
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

          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              Logo
            </label>
            <div className="mb-3 rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-gray-800/70 px-4 py-3 text-sm font-semibold text-cyan-200 hover:bg-gray-700/80">
                <span>{isLogoUploading ? "Uploading logo..." : "Upload logo to storage"}</span>
                {isLogoUploading ? (
                  <LoadingSpinner size="sm" variant="light" />
                ) : (
                  <span className="text-xs uppercase tracking-widest text-cyan-300">Choose</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={isLogoUploading}
                  onChange={(event) => {
                    void handleLogoUpload(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
                Best for Google Drive or temporary links. The file is copied to your storage and used from a stable URL.
              </p>
            </div>
            <input
              type="url"
              value={formData.logoUrl}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, logoUrl: e.target.value }))
              }
              className="w-full p-4 bg-gray-700/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400 focus:border-transparent text-white placeholder-gray-400 backdrop-blur-sm"
              placeholder="https://example.com/logo.png"
            />
            <p className="mt-2 text-[11px] text-gray-500">
              Direct image URLs are copied into storage on save. If a Drive URL fails, upload the file above.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 px-6 bg-gray-700/50 border border-white/10 text-white rounded-xl hover:bg-gray-600/50 transition-all duration-200 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending || isLogoUploading}
              className="flex-1 py-4 px-6 text-white rounded-xl hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-semibold flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${formData.primaryColor}, ${formData.secondaryColor})`,
              }}
            >
              {updateMutation.isPending ? (
                <LoadingSpinner size="sm" variant="light" />
              ) : null}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
