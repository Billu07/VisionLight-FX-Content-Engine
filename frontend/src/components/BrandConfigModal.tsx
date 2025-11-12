import { useState } from "react";
import { useUpdateBrandConfig } from "../hooks/useBrandConfig";
import { LoadingSpinner } from "./LoadingSpinner";

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
    primaryColor: currentConfig?.primaryColor || "#3B82F6",
    secondaryColor: currentConfig?.secondaryColor || "#1E40AF",
    logoUrl: currentConfig?.logoUrl || "",
  });

  const updateMutation = useUpdateBrandConfig();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData, {
      onSuccess: () => {
        onClose();
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Brand Settings</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="Your Brand Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Primary Color
            </label>
            <input
              type="color"
              value={formData.primaryColor}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  primaryColor: e.target.value,
                }))
              }
              className="w-full h-10 rounded border border-gray-300"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Logo URL (Optional)
            </label>
            <input
              type="url"
              value={formData.logoUrl}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, logoUrl: e.target.value }))
              }
              className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 px-4 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
            >
              {updateMutation.isPending ? <LoadingSpinner size="sm" /> : null}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
