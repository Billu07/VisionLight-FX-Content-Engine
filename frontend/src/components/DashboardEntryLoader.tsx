import { dashboardAssets } from "../features/dashboard/assets";
import { getSiteBrand } from "../lib/branding";

type DashboardEntryLoaderProps = {
  organizationName?: string | null;
  playMode?: "loop" | "once";
  durationMs?: number;
  overlay?: boolean;
};

type BrandMeta = {
  title: string;
  subtitle: string;
  accentText: string;
  chipText: string;
  panelGradient: string;
  haloGradient: string;
  liquidGradient: string;
  logo: string;
};

const BRAND_META: Record<"picdrift" | "visualfx" | "byok", BrandMeta> = {
  picdrift: {
    title: "PicDrift Studio",
    subtitle: "Preparing your motion canvas",
    accentText: "text-cyan-200",
    chipText: "PICDRIFT SESSION",
    panelGradient:
      "from-cyan-400/20 via-sky-500/10 to-blue-500/20",
    haloGradient:
      "from-cyan-300/35 via-sky-300/20 to-blue-400/35",
    liquidGradient:
      "from-cyan-300 via-sky-300 to-blue-400",
    logo: dashboardAssets.picdriftLogo,
  },
  visualfx: {
    title: "VisualFX Studio",
    subtitle: "Loading cinematic controls",
    accentText: "text-blue-200",
    chipText: "VISUALFX SESSION",
    panelGradient:
      "from-blue-400/20 via-indigo-500/12 to-cyan-500/20",
    haloGradient:
      "from-blue-300/35 via-indigo-300/20 to-cyan-300/35",
    liquidGradient:
      "from-blue-300 via-indigo-300 to-cyan-300",
    logo: dashboardAssets.fxLogo,
  },
  byok: {
    title: "BYOK Studio",
    subtitle: "Linking your key-powered workspace",
    accentText: "text-emerald-200",
    chipText: "BYOK SESSION",
    panelGradient:
      "from-emerald-400/22 via-cyan-500/12 to-sky-500/20",
    haloGradient:
      "from-emerald-300/35 via-cyan-300/20 to-sky-300/35",
    liquidGradient:
      "from-emerald-300 via-cyan-300 to-sky-300",
    logo: dashboardAssets.driftLogo,
  },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const DashboardEntryLoader = ({
  organizationName,
  playMode = "loop",
  durationMs = 2400,
  overlay = false,
}: DashboardEntryLoaderProps) => {
  const siteBrand = getSiteBrand();
  const brand = BRAND_META[siteBrand];
  const onceDuration = clamp(durationMs, 1800, 4200);

  const cardAnimation =
    playMode === "once"
      ? `loaderCardFloat ${onceDuration}ms ease-out 1 forwards`
      : "loaderCardFloat 2.8s ease-in-out infinite";

  const coreAnimation =
    playMode === "once"
      ? `loaderCorePulse ${onceDuration}ms ease-out 1 forwards`
      : "loaderCorePulse 2.4s ease-in-out infinite";

  const fillAnimation =
    playMode === "once"
      ? `loaderRevealFill ${Math.max(1500, onceDuration - 250)}ms cubic-bezier(.2,.85,.2,1) 1 forwards`
      : "loaderRevealFill 3.4s cubic-bezier(.22,.76,.21,1) infinite alternate";

  const waveLiftAnimation =
    playMode === "once"
      ? `loaderWaveLift ${Math.max(1500, onceDuration - 250)}ms cubic-bezier(.2,.85,.2,1) 1 forwards`
      : "loaderWaveLift 3.4s cubic-bezier(.22,.76,.21,1) infinite alternate";

  const waveAnimation =
    playMode === "once"
      ? `loaderWaveDrift ${Math.max(1200, onceDuration - 450)}ms linear 1 forwards`
      : "loaderWaveDrift 2.1s linear infinite";

  const ringAnimationA =
    playMode === "once"
      ? `loaderRingSpinA ${onceDuration}ms linear 1 forwards`
      : "loaderRingSpinA 5.8s linear infinite";

  const ringAnimationB =
    playMode === "once"
      ? `loaderRingSpinB ${onceDuration}ms linear 1 forwards`
      : "loaderRingSpinB 4.9s linear infinite";

  const sparkAnimation =
    playMode === "once"
      ? `loaderSparkRise ${onceDuration}ms ease-out 1 forwards`
      : "loaderSparkRise 2.7s ease-in-out infinite";

  return (
    <div
      className={`${overlay ? "fixed inset-0 z-[999]" : "relative min-h-screen"} flex items-center justify-center overflow-hidden bg-[#040916] px-4 text-gray-100`}
    >
      <style>{`
        @keyframes loaderCardFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        @keyframes loaderCorePulse {
          0%, 100% { transform: scale(1); opacity: .92; }
          50% { transform: scale(1.025); opacity: 1; }
        }
        @keyframes loaderRevealFill {
          0% { clip-path: inset(92% 0 0 0 round 0.6rem); }
          44% { clip-path: inset(36% 0 0 0 round 0.6rem); }
          78% { clip-path: inset(12% 0 0 0 round 0.6rem); }
          100% { clip-path: inset(0% 0 0 0 round 0.6rem); }
        }
        @keyframes loaderWaveLift {
          0% { transform: translateY(92%); }
          44% { transform: translateY(36%); }
          78% { transform: translateY(12%); }
          100% { transform: translateY(0%); }
        }
        @keyframes loaderWaveDrift {
          0% { transform: translateX(0); }
          100% { transform: translateX(-46%); }
        }
        @keyframes loaderRingSpinA {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes loaderRingSpinB {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        @keyframes loaderSparkRise {
          0%, 100% { transform: translateY(0px); opacity: .55; }
          50% { transform: translateY(-10px); opacity: .95; }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_16%,rgba(56,189,248,0.2),transparent_34%),radial-gradient(circle_at_86%_80%,rgba(45,212,191,0.16),transparent_42%),radial-gradient(circle_at_42%_76%,rgba(14,116,144,0.22),transparent_52%)]" />

      <div
        className={`relative w-full max-w-xl overflow-hidden rounded-[2.2rem] border border-white/10 bg-[#070f2a]/82 p-8 shadow-[0_36px_110px_rgba(2,8,23,0.72)] backdrop-blur-xl sm:p-10`}
        style={{ animation: cardAnimation }}
      >
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${brand.panelGradient}`} />

        <div className="relative z-10 text-center">
          <div className="mx-auto mb-6 w-fit rounded-full border border-white/15 bg-black/30 px-4 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gray-300">
            {brand.chipText}
          </div>

          <div className="relative mx-auto mb-7 h-44 w-44" style={{ animation: coreAnimation }}>
            <div className="absolute -inset-8 opacity-80" style={{ animation: ringAnimationA }}>
              <div className="h-full w-full rounded-full border border-cyan-200/18" />
            </div>
            <div className="absolute -inset-4 opacity-70" style={{ animation: ringAnimationB }}>
              <div className="h-full w-full rounded-full border border-white/10" />
            </div>

            <div className={`absolute inset-0 rounded-[1.65rem] bg-gradient-to-b ${brand.haloGradient} blur-xl`} />
            <div className="absolute inset-0 rounded-[1.65rem] border border-white/12 bg-[#061233]/84" />

            <div className="absolute inset-0 overflow-hidden rounded-[1.65rem] p-5">
              <img
                src={brand.logo}
                alt={brand.title}
                className="h-full w-full object-contain opacity-22 grayscale"
              />
            </div>

            <div className="absolute inset-0 overflow-hidden rounded-[1.65rem] p-5">
              <div className="relative h-full w-full" style={{ animation: fillAnimation }}>
                <img
                  src={brand.logo}
                  alt={`${brand.title} loaded`}
                  className="h-full w-full object-contain brightness-125 saturate-150"
                />
              </div>

              <div
                className="pointer-events-none absolute left-5 right-5 top-5 h-7 overflow-hidden"
                style={{ animation: waveLiftAnimation }}
              >
                <div
                  className={`h-full w-[200%] bg-gradient-to-r ${brand.liquidGradient} opacity-85`}
                  style={{ animation: waveAnimation }}
                />
                <div
                  className="absolute inset-0 h-full w-[200%] bg-[radial-gradient(45%_90%_at_14%_100%,rgba(226,232,240,0.52),rgba(226,232,240,0.06)_72%),radial-gradient(45%_90%_at_38%_100%,rgba(125,211,252,0.5),rgba(125,211,252,0.06)_74%),radial-gradient(45%_90%_at_64%_100%,rgba(16,185,129,0.45),rgba(16,185,129,0.05)_74%)]"
                  style={{ animation: waveAnimation }}
                />
              </div>
            </div>

            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.65rem]">
              <span
                className="absolute left-[18%] top-[22%] h-1.5 w-1.5 rounded-full bg-white/90"
                style={{ animation: sparkAnimation }}
              />
              <span
                className="absolute left-[74%] top-[30%] h-1 w-1 rounded-full bg-cyan-200/90"
                style={{ animation: sparkAnimation, animationDelay: "220ms" }}
              />
              <span
                className="absolute left-[58%] top-[68%] h-1.5 w-1.5 rounded-full bg-emerald-200/85"
                style={{ animation: sparkAnimation, animationDelay: "420ms" }}
              />
            </div>
          </div>

          <h1 className={`text-3xl font-black tracking-tight ${brand.accentText}`}>
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
    </div>
  );
};

export default DashboardEntryLoader;
