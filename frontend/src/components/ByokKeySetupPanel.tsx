import type React from "react";
import { LoadingSpinner } from "./LoadingSpinner";

type ByokKeySetupPanelProps = {
  falKey: string;
  onFalKeyChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  isSubmitting?: boolean;
  guideShown?: boolean;
  onGuideShown?: () => void;
  onClose?: () => void;
  closeLabel?: string;
  embedded?: boolean;
};

const FAL_HOME_URL = "https://fal.ai";
const FAL_KEYS_URL = "https://fal.ai/dashboard/keys";

export function ByokKeySetupPanel({
  falKey,
  onFalKeyChange,
  onSubmit,
  isSubmitting = false,
  guideShown = false,
  onGuideShown,
  onClose,
  closeLabel = "Do This Later",
  embedded = false,
}: ByokKeySetupPanelProps) {
  return (
    <div
      className={
        embedded
          ? "w-full rounded-2xl border border-cyan-400/25 bg-[#050b1f] p-6 shadow-[0_24px_70px_rgba(2,8,23,0.55)]"
          : "w-full max-w-lg rounded-2xl border border-cyan-400/25 bg-[#050b1f] p-7 shadow-[0_30px_90px_rgba(2,8,23,0.8)]"
      }
    >
      <h3 className="text-2xl font-black text-white">Bring Your Own Key</h3>
      <p className="mt-3 text-sm leading-relaxed text-slate-300">
        Click 3 Easy Steps. We never see your key.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <a
          href={FAL_HOME_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onGuideShown}
          className="rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-400/20"
        >
          1. Fal Signup
        </a>
        <a
          href={FAL_KEYS_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onGuideShown}
          className="rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white hover:bg-white/10"
        >
          2. Create Fal API Key
        </a>
      </div>

      {guideShown && (
        <p className="mt-3 text-xs text-cyan-200">
          Fal will open in a new window. Create your key, then return here and paste it.
        </p>
      )}

      <form className="mt-5 space-y-3" onSubmit={onSubmit}>
        <label className="block text-xs font-bold uppercase tracking-[0.12em] text-slate-300">
          Fal Key
        </label>
        <input
          type="password"
          value={falKey}
          onChange={(event) => onFalKeyChange(event.target.value)}
          placeholder="Paste your Fal API key"
          className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300"
          required
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl bg-cyan-700 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-cyan-600 disabled:opacity-60"
        >
          {isSubmitting ? (
            <span className="inline-flex items-center justify-center gap-2">
              <LoadingSpinner size="sm" variant="light" />
              Adding...
            </span>
          ) : (
            "3. ADD FAL API KEY"
          )}
        </button>
      </form>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-300 hover:bg-white/10"
        >
          {closeLabel}
        </button>
      )}
    </div>
  );
}

export default ByokKeySetupPanel;
