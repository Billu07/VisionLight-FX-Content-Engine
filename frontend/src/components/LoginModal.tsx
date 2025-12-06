import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "./LoadingSpinner";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LoginModal = ({ isOpen, onClose, onSuccess }: LoginModalProps) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    setError("");

    try {
      await login(email, name.trim() || undefined);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl relative overflow-hidden">
        {/* Decorative background glow */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -z-10"></div>

        <h2 className="text-2xl font-bold text-white mb-2">
          Login to your Studio
        </h2>
        <p className="text-purple-200/70 text-sm mb-6">
          Enter your email to access the PicDrift Studio
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-purple-200 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full p-3 bg-gray-800/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-gray-500 transition-all outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-purple-200 mb-1.5">
              Name Your Studio
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should we call your studio?"
              className="w-full p-3 bg-gray-800/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-gray-500 transition-all outline-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-4">
            <p className="text-sm text-cyan-300 font-semibold mb-1">
              Once you're inside:
            </p>
            <p className="text-sm text-purple-200/80 leading-relaxed">
              Create images and video that bring your imagination to life.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-white/10 rounded-xl text-gray-300 hover:bg-white/5 transition-colors font-medium"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white py-3 px-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-bold shadow-lg hover:shadow-cyan-500/25"
            >
              {isLoading ? <LoadingSpinner size="sm" variant="light" /> : null}
              Login
            </button>
          </div>

          {/* Footer Link */}
          <div className="text-center mt-4 pt-2 border-t border-white/5">
            <p className="text-sm text-gray-400">
              Need a Login?{" "}
              <a
                href="https://www.picdrift.com/studio-signup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
              >
                Sign Up Now
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
