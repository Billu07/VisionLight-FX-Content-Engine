import { dashboardAssets } from "../features/dashboard/assets";
import { getSiteBrand } from "../lib/branding";

type DashboardEntryLoaderProps = {
  organizationName?: string | null;
};

const BRAND_META = {
  picdrift: {
    title: "PicDrift Studio",
    subtitle: "Preparing your creative workspace",
    glow: "from-cyan-400/35 via-sky-400/20 to-blue-500/30",
    accent: "text-cyan-200",
    logo: dashboardAssets.picdriftLogo,
  },
  visualfx: {
    title: "VisualFX Studio",
    subtitle: "Loading cinematic controls",
    glow: "from-cyan-400/25 via-blue-500/20 to-indigo-500/35",
    accent: "text-blue-200",
    logo: dashboardAssets.fxLogo,
  },
  byok: {
    title: "BYOK Studio",
    subtitle: "Linking your key-powered environment",
    glow: "from-emerald-400/30 via-cyan-400/20 to-sky-500/30",
    accent: "text-emerald-200",
    logo: dashboardAssets.fxLogo,
  },
} as const;

export const DashboardEntryLoader = ({
  organizationName,
}: DashboardEntryLoaderProps) => {
  const siteBrand = getSiteBrand();
  const brand = BRAND_META[siteBrand];

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#060b1d] px-4 text-gray-100">
      <style>{`
        @keyframes logoFillRise {
          0% { height: 14%; }
          45% { height: 72%; }
          100% { height: 92%; }
        }
        @keyframes waveDrift {
          0% { transform: translateX(0); }
          100% { transform: translateX(-45%); }
        }
        @keyframes loaderPulse {
          0%, 100% { transform: scale(1); opacity: 0.88; }
          50% { transform: scale(1.02); opacity: 1; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(34,211,238,0.18),transparent_34%),radial-gradient(circle_at_84%_80%,rgba(14,116,144,0.2),transparent_42%)]" />

      <div className="relative w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center shadow-[0_30px_80px_rgba(2,8,23,0.65)] backdrop-blur-xl sm:p-10">
        <div className="mx-auto mb-7 w-fit rounded-full border border-white/10 bg-black/25 px-4 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-300">
          Entering Studio
        </div>

        <div className="relative mx-auto mb-7 h-40 w-40 animate-[loaderPulse_2.4s_ease-in-out_infinite]">
          <div className={`absolute inset-0 rounded-[1.5rem] bg-gradient-to-b ${brand.glow} blur-xl`} />
          <div className="absolute inset-0 rounded-[1.5rem] border border-white/10 bg-[#070f2d]/80" />

          <div className="absolute inset-0 overflow-hidden rounded-[1.5rem] p-5">
            <img
              src={brand.logo}
              alt={brand.title}
              className="h-full w-full object-contain opacity-25 grayscale"
            />
          </div>

          <div className="absolute inset-0 overflow-hidden rounded-[1.5rem] p-5 [animation:logoFillRise_3.2s_ease-in-out_infinite_alternate]">
            <img
              src={brand.logo}
              alt={`${brand.title} filled`}
              className="h-full w-full object-contain brightness-125 saturate-125"
            />
            <div className="absolute left-0 right-0 top-0 h-6 overflow-hidden">
              <div className="h-full w-[190%] [animation:waveDrift_2.1s_linear_infinite] bg-[radial-gradient(45%_95%_at_12%_100%,rgba(226,232,240,0.55),rgba(226,232,240,0.06)_72%),radial-gradient(45%_95%_at_40%_100%,rgba(125,211,252,0.55),rgba(125,211,252,0.08)_74%),radial-gradient(45%_95%_at_70%_100%,rgba(34,211,238,0.52),rgba(34,211,238,0.07)_75%)]" />
            </div>
          </div>
        </div>

        <h1 className={`text-2xl font-black tracking-tight ${brand.accent}`}>
          {brand.title}
        </h1>
        <p className="mt-2 text-sm text-gray-300">{brand.subtitle}</p>
        {organizationName ? (
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {organizationName}
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default DashboardEntryLoader;
