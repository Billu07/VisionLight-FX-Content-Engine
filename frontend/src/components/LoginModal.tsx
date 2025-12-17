import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase"; // Make sure this path is correct
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "./LoadingSpinner";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  // removed onSuccess because navigation happens here now
}

export const LoginModal = ({ isOpen, onClose }: LoginModalProps) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); // Changed from 'name' to 'password'
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { checkAuth } = useAuth(); // We use checkAuth to sync, not login

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setIsLoading(true);
    setError("");

    try {
      // 1. Authenticate with Supabase directly
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      // 2. Sync with Backend (Airtable)
      await checkAuth();

      // 3. Navigate
      onClose();
      navigate("/app");
    } catch (err: any) {
      setError(err.message || "Invalid login credentials");
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

        <h2 className="text-2xl font-bold text-white mb-2">Login to Studio</h2>
        <p className="text-purple-200/70 text-sm mb-6">
          Enter your credentials to access PicDrift FX.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-purple-200 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@brand.com"
              className="w-full p-3 bg-gray-800/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-gray-500 transition-all outline-none"
              required
            />
          </div>

          {/* Password (Replaces 'Name Your Studio') */}
          <div>
            <label className="block text-sm font-medium text-purple-200 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-3 bg-gray-800/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent text-white placeholder-gray-500 transition-all outline-none"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

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
              disabled={isLoading || !email || !password}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white py-3 px-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-bold shadow-lg hover:shadow-cyan-500/25"
            >
              {isLoading ? <LoadingSpinner size="sm" variant="light" /> : null}
              Login
            </button>
          </div>

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
