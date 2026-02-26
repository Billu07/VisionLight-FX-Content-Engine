interface MobileNavbarProps {
  activeTab: "create" | "sequencer" | "library" | "projects" | "history";
  onTabChange: (tab: "create" | "sequencer" | "library" | "projects" | "history") => void;
  onOpenLibrary: () => void;
  onOpenProjects: () => void;
}

export function MobileNavbar({
  activeTab,
  onTabChange,
  onOpenLibrary,
  onOpenProjects,
}: MobileNavbarProps) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[60] bg-gray-900/80 backdrop-blur-xl border-t border-white/10 px-4 pb-6 pt-2 safe-area-bottom">
      <div className="flex items-center justify-around">
        <button
          onClick={() => onTabChange("create")}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === "create" ? "text-cyan-400 scale-110" : "text-gray-500"
          }`}
        >
          <span className="text-xl">✨</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">Create</span>
        </button>

        <button
          onClick={() => onTabChange("history")}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === "history" ? "text-amber-400 scale-110" : "text-gray-500"
          }`}
        >
          <span className="text-xl">⏳</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">History</span>
        </button>

        <button
          onClick={() => onTabChange("sequencer")}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === "sequencer" ? "text-purple-400 scale-110" : "text-gray-500"
          }`}
        >
          <span className="text-xl">🎬</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">Merge</span>
        </button>

        <button
          onClick={onOpenLibrary}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === "library" ? "text-rose-400 scale-110" : "text-gray-500"
          }`}
        >
          <span className="text-xl">📚</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">Library</span>
        </button>

        <button
          onClick={onOpenProjects}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === "projects" ? "text-blue-400 scale-110" : "text-gray-500"
          }`}
        >
          <span className="text-xl">📁</span>
          <span className="text-[10px] font-bold uppercase tracking-widest">Projects</span>
        </button>
      </div>
    </div>
  );
}
