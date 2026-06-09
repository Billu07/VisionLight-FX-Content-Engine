import type { ReactNode } from "react";

type MobileTab = "create" | "sequencer" | "library" | "projects" | "history";

interface MobileNavbarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  onOpenLibrary: () => void;
  onOpenProjects: () => void;
  onOpenMenu?: () => void;
  showSequencerTab?: boolean;
}

type NavColor = "cyan" | "amber" | "purple" | "rose" | "blue" | "slate";

const ACTIVE_CLASS: Record<NavColor, string> = {
  cyan: "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/30",
  amber: "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30",
  purple: "bg-purple-500/20 text-purple-300 ring-1 ring-purple-400/30",
  rose: "bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/30",
  blue: "bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30",
  slate: "bg-white/10 text-gray-100 ring-1 ring-white/20",
};

const Icon = ({ d }: { d: string }) => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
);

export function MobileNavbar({
  activeTab,
  onTabChange,
  onOpenLibrary,
  onOpenProjects,
  onOpenMenu,
  showSequencerTab = true,
}: MobileNavbarProps) {
  const items: {
    key: string;
    label: string;
    color: NavColor;
    active: boolean;
    onClick: () => void;
    icon: ReactNode;
  }[] = [
    {
      key: "create",
      label: "Create",
      color: "cyan",
      active: activeTab === "create",
      onClick: () => onTabChange("create"),
      icon: <Icon d="M12 3l1.8 3.6L18 8.4l-3 2.8.7 4.1L12 13.6 8.3 15.3l.7-4.1-3-2.8 4.2-1.8L12 3z" />,
    },
    {
      key: "history",
      label: "History",
      color: "amber",
      active: activeTab === "history",
      onClick: () => onTabChange("history"),
      icon: <Icon d="M12 8v5l3 2m6-3a9 9 0 11-3-6.7M21 3v6h-6" />,
    },
    ...(showSequencerTab
      ? [
          {
            key: "sequencer",
            label: "Merge",
            color: "purple" as NavColor,
            active: activeTab === "sequencer",
            onClick: () => onTabChange("sequencer"),
            icon: <Icon d="M3 7h18M3 17h18M6 7v10m12-10v10M10 11l4 2-4 2v-4z" />,
          },
        ]
      : []),
    {
      key: "library",
      label: "Library",
      color: "rose",
      active: activeTab === "library",
      onClick: onOpenLibrary,
      icon: <Icon d="M4 5h13a3 3 0 013 3v11H7a3 3 0 01-3-3V5zM7 8h13" />,
    },
    {
      key: "projects",
      label: "Projects",
      color: "blue",
      active: activeTab === "projects",
      onClick: onOpenProjects,
      icon: <Icon d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />,
    },
    ...(onOpenMenu
      ? [
          {
            key: "menu",
            label: "Menu",
            color: "slate" as NavColor,
            active: false,
            onClick: onOpenMenu,
            icon: <Icon d="M4 6h16M4 12h16M4 18h16" />,
          },
        ]
      : []),
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[120] border-t border-white/15 bg-gray-950/95 px-2 pb-6 pt-2 shadow-[0_-10px_30px_rgba(0,0,0,0.55)] backdrop-blur-xl safe-area-bottom">
      <div className="flex items-stretch justify-between gap-1">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={item.onClick}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition-all ${
              item.active
                ? ACTIVE_CLASS[item.color]
                : "text-gray-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-bold uppercase tracking-widest">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
