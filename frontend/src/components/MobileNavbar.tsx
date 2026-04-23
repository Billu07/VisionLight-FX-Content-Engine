interface MobileNavbarProps {
  activeTab: "create" | "sequencer" | "library" | "projects" | "history";
  onTabChange: (
    tab: "create" | "sequencer" | "library" | "projects" | "history",
  ) => void;
  onOpenLibrary: () => void;
  onOpenProjects: () => void;
  showSequencerTab?: boolean;
}

export function MobileNavbar({
  activeTab,
  onTabChange,
  onOpenLibrary,
  onOpenProjects,
  showSequencerTab = true,
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
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 3l1.8 3.6L18 8.4l-3 2.8.7 4.1L12 13.6 8.3 15.3l.7-4.1-3-2.8 4.2-1.8L12 3z"
            />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Create
          </span>
        </button>

        <button
          onClick={() => onTabChange("history")}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === "history" ? "text-amber-400 scale-110" : "text-gray-500"
          }`}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v5l3 2m6-3a9 9 0 11-3-6.7M21 3v6h-6"
            />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-widest">
            History
          </span>
        </button>

        {showSequencerTab && (
          <button
            onClick={() => onTabChange("sequencer")}
            className={`flex flex-col items-center gap-1 transition-all ${
              activeTab === "sequencer"
                ? "text-purple-400 scale-110"
                : "text-gray-500"
            }`}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 7h18M3 17h18M6 7v10m12-10v10M10 11l4 2-4 2v-4z"
              />
            </svg>
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Merge
            </span>
          </button>
        )}

        <button
          onClick={onOpenLibrary}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === "library" ? "text-rose-400 scale-110" : "text-gray-500"
          }`}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 5h13a3 3 0 013 3v11H7a3 3 0 01-3-3V5zM7 8h13"
            />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Library
          </span>
        </button>

        <button
          onClick={onOpenProjects}
          className={`flex flex-col items-center gap-1 transition-all ${
            activeTab === "projects" ? "text-blue-400 scale-110" : "text-gray-500"
          }`}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
            />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-widest">
            Projects
          </span>
        </button>
      </div>
    </div>
  );
}
