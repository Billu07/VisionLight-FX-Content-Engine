import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LoginModal } from "../LoginModal";
import picdriftLogo from "../../assets/picdrift.png";

type HeroVariant = "current" | "v1" | "v2" | "v3";

const HERO_VARIANTS: HeroVariant[] = ["current", "v1", "v2", "v3"];

const isHeroVariant = (value: string | null): value is HeroVariant => {
  if (!value) {
    return false;
  }

  return HERO_VARIANTS.includes(value as HeroVariant);
};

const readVariantFromSearch = (search: string): HeroVariant => {
  const params = new URLSearchParams(search);
  const candidates = [
    params.get("loginVariant"),
    params.get("heroVariant"),
    params.get("variant"),
  ];

  for (const candidate of candidates) {
    if (isHeroVariant(candidate)) {
      return candidate;
    }
  }

  return "current";
};

const scenePreviews = [
  "/login-previews/scene-01.jpg",
  "/login-previews/scene-02.jpg",
  "/login-previews/scene-03.jpg",
  "/login-previews/scene-04.jpg",
  "/login-previews/scene-05.jpg",
  "/login-previews/scene-06.jpg",
];

const portraitPreviews = [
  "/login-previews/portrait-01.jpg",
  "/login-previews/portrait-02.jpg",
  "/login-previews/portrait-03.jpg",
];

const mockCards = [
  {
    title: "Portrait FX",
    tone: "from-fuchsia-500 to-purple-700",
    rotate: "-10deg",
    x: "2%",
    y: "15%",
    chip: "Portrait",
    preview: portraitPreviews[0],
  },
  {
    title: "Landscape FX",
    tone: "from-orange-400 to-amber-600",
    rotate: "-4deg",
    x: "27%",
    y: "7%",
    chip: "Landscape",
    preview: scenePreviews[0],
  },
  {
    title: "Story FX",
    tone: "from-emerald-400 to-cyan-600",
    rotate: "4deg",
    x: "51%",
    y: "2%",
    chip: "Story",
    preview: scenePreviews[1],
  },
  {
    title: "Cinematic FX",
    tone: "from-cyan-300 to-sky-600",
    rotate: "10deg",
    x: "75%",
    y: "8%",
    chip: "Cinematic",
    preview: portraitPreviews[1],
  },
];

const v1RibbonRows = [
  [scenePreviews[0], scenePreviews[2], scenePreviews[4]],
  [scenePreviews[1], scenePreviews[3], scenePreviews[5]],
  [scenePreviews[2], scenePreviews[0], scenePreviews[3]],
];

const libraryPosters = [
  portraitPreviews[0],
  scenePreviews[0],
  portraitPreviews[1],
  scenePreviews[2],
  portraitPreviews[2],
  scenePreviews[5],
];

const popularPosters = [
  scenePreviews[1],
  portraitPreviews[2],
  scenePreviews[3],
  portraitPreviews[0],
  scenePreviews[4],
  portraitPreviews[1],
];

const v2CollageCards = [
  { preview: scenePreviews[2], top: "3%", left: "13%", rotate: "-11deg" },
  { preview: portraitPreviews[0], top: "0%", left: "46%", rotate: "-8deg" },
  { preview: portraitPreviews[1], top: "8%", left: "72%", rotate: "-12deg" },
  { preview: scenePreviews[3], top: "34%", left: "0%", rotate: "-11deg" },
  { preview: scenePreviews[4], top: "30%", left: "40%", rotate: "-7deg" },
  { preview: scenePreviews[5], top: "62%", left: "25%", rotate: "-6deg" },
  { preview: scenePreviews[1], top: "56%", left: "72%", rotate: "-9deg" },
];

const MarketingHeader = ({
  onLogin,
  tint,
}: {
  onLogin: () => void;
  tint: "soft" | "solid" | "ghost";
}) => {
  const headerTone =
    tint === "ghost"
      ? "border-b border-white/10 bg-[#07091f]/35 backdrop-blur-lg"
      : tint === "solid"
      ? "border-b border-white/10 bg-[#050714]/95"
      : "border-b border-white/10 bg-[#120f2b]/65 backdrop-blur-xl";

  return (
    <header className={`relative z-20 ${headerTone}`}>
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <a
          href="https://picdrift.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3"
        >
          <img
            src={picdriftLogo}
            alt="PicDrift"
            className="h-9 w-auto object-contain sm:h-10"
          />
        </a>

        <div className="hidden items-center gap-5 text-sm text-slate-200/85 md:flex">
          <span className="border-b-2 border-cyan-400 pb-1 font-semibold text-white">
            Home
          </span>
          <Link to="/terms" className="transition-colors hover:text-white">
            Terms
          </Link>
          <Link to="/privacy" className="transition-colors hover:text-white">
            Privacy
          </Link>
          <a
            href="https://www.picdrift.com/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-white"
          >
            Contact
          </a>
        </div>

        <button
          onClick={onLogin}
          className="rounded-full border border-white/35 bg-white/5 px-5 py-1.5 text-sm font-semibold text-white transition hover:bg-white/12"
        >
          Login
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 overflow-x-auto px-4 pb-3 text-xs text-slate-100/90 md:hidden">
        <span className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-3 py-1 font-semibold text-cyan-100">
          Home
        </span>
        <Link
          to="/terms"
          className="whitespace-nowrap rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium"
        >
          Terms
        </Link>
        <Link
          to="/privacy"
          className="whitespace-nowrap rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium"
        >
          Privacy
        </Link>
        <a
          href="https://www.picdrift.com/contact"
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap rounded-full border border-white/20 bg-white/5 px-3 py-1 font-medium"
        >
          Contact
        </a>
      </div>
    </header>
  );
};

const HeroCurrent = ({ onLogin }: { onLogin: () => void }) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070a20] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(157,57,255,0.2),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(26,103,255,0.35),transparent_42%),radial-gradient(circle_at_50%_64%,rgba(15,12,40,0.65),transparent_62%)]" />
      <div className="absolute inset-x-0 top-0 h-[52%] bg-gradient-to-r from-[#170316] via-[#1a164f] to-[#0d2f59]" />
      <div
        className="absolute inset-x-0 bottom-[-140px] h-[68%] bg-gradient-to-r from-[#2f58df] via-[#5364f2] to-[#3f58dd]"
        style={{ clipPath: "polygon(0 16%, 100% 0, 100% 100%, 0 100%)" }}
      />

      <MarketingHeader onLogin={onLogin} tint="soft" />

      <main className="relative z-10">
        <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 pb-10 pt-12 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:pt-14">
          <div className="max-w-xl">
            <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
              <span className="block">Welcome to</span>
              <span className="mt-1 block bg-gradient-to-r from-cyan-300 to-blue-300 bg-clip-text text-transparent">
                Your Creative Studio
              </span>
            </h1>

            <p className="mt-4 text-lg text-slate-200 sm:text-2xl">
              Start Generating Cinematic Stories
            </p>

            <p className="mt-8 text-sm font-bold uppercase tracking-[0.16em] text-slate-300/75">
              Download PicDrift Studio Beta Now
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="https://www.picdrift.com/studio-signup"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#72cf06] px-7 py-3 text-sm font-black text-[#0b1205] transition hover:bg-[#83e30f]"
              >
                Sign Up Now
              </a>
              <button
                onClick={onLogin}
                className="rounded-full border border-white/45 bg-white/5 px-7 py-3 text-sm font-bold text-white transition hover:bg-white/12"
              >
                Login
              </button>
            </div>
          </div>

          <div className="relative h-[300px] sm:h-[340px] lg:h-[370px]">
            {mockCards.map((card) => (
              <div
                key={card.title}
                className={`absolute h-[255px] w-[150px] rounded-3xl border border-white/20 bg-gradient-to-b ${card.tone} p-3 shadow-[0_22px_40px_rgba(0,0,0,0.45)] sm:h-[290px] sm:w-[175px]`}
                style={{
                  left: card.x,
                  top: card.y,
                  transform: `rotate(${card.rotate})`,
                }}
              >
                <div className="flex h-full flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full border border-white/30 bg-black/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/90 backdrop-blur-sm">
                        {card.chip}
                      </span>
                      <span className="h-2 w-2 rounded-full bg-white/80 shadow-[0_0_14px_rgba(255,255,255,0.85)]" />
                    </div>

                    <div className="rounded-xl border border-white/20 bg-black/15 p-2 backdrop-blur-[1px]">
                      <div className="overflow-hidden rounded-lg border border-white/20">
                        <img
                          src={card.preview}
                          alt={`${card.title} preview`}
                          className="h-24 w-full object-cover sm:h-28"
                          loading="lazy"
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {scenePreviews.slice(0, 3).map((preview, idx) => (
                          <img
                            key={`${card.title}-${idx}`}
                            src={preview}
                            alt=""
                            className="aspect-[3/4] rounded-md border border-white/20 object-cover"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <span className="w-full rounded-xl bg-black/30 px-2 py-1 text-center text-xs font-bold text-white/90 backdrop-blur-sm">
                    {card.title}
                  </span>
                </div>
              </div>
            ))}

            <div className="absolute left-[42%] top-[34%] flex h-20 w-20 items-center justify-center rounded-full border border-white/30 bg-white/20 backdrop-blur-xl shadow-[0_12px_30px_rgba(5,10,35,0.55)]">
              <div className="ml-1 h-0 w-0 border-y-[12px] border-l-[18px] border-y-transparent border-l-white" />
            </div>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-16 pt-5 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:pt-0">
          <div className="rounded-[2rem] border border-indigo-300/25 bg-[#070c2b]/85 p-4 shadow-[0_24px_70px_rgba(10,12,38,0.45)] backdrop-blur-sm sm:p-6">
            <div className="rounded-[1.4rem] border border-white/10 bg-gradient-to-br from-[#090b24] to-[#07081c] p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold tracking-wide text-slate-200">
                  Continue Watching
                </span>
                <span className="rounded-full bg-slate-800/80 px-2.5 py-1">
                  Library
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {libraryPosters.map((poster, idx) => (
                  <div key={`poster-${idx}`} className="overflow-hidden rounded-lg border border-white/10">
                    <img
                      src={poster}
                      alt={`Library poster ${idx + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-6 text-xs font-semibold tracking-[0.15em] text-slate-400">
                Popular Movies
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                {popularPosters.map((poster, idx) => (
                  <div
                    key={`poster-bottom-${idx}`}
                    className="overflow-hidden rounded-lg border border-white/10"
                  >
                    <img
                      src={poster}
                      alt={`Popular poster ${idx + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="max-w-xl text-slate-100">
            <p className="text-xl leading-relaxed sm:text-3xl sm:leading-[1.45]">
              Imagine it. Create it.
              <br />
              <span className="font-semibold text-white">All from one dashboard.</span>
            </p>

            <p className="mt-6 text-sm leading-relaxed text-slate-200/90 sm:text-base">
              Transform your content creation with AI-powered video, image, and
              carousel generation.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

const HeroV1 = ({ onLogin }: { onLogin: () => void }) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#040617] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_17%_70%,rgba(124,64,255,0.26),transparent_44%),radial-gradient(circle_at_82%_20%,rgba(40,115,255,0.25),transparent_45%),radial-gradient(circle_at_55%_52%,rgba(18,18,48,0.8),transparent_70%)]" />
      <MarketingHeader onLogin={onLogin} tint="ghost" />

      <main className="relative z-10 mx-auto grid w-full max-w-[1600px] gap-12 px-4 pb-14 pt-10 sm:px-8 lg:grid-cols-[1.12fr_0.88fr] lg:items-center lg:pb-20 lg:pt-16">
        <section className="relative h-[420px] overflow-hidden rounded-[2.2rem] border border-white/10 bg-gradient-to-br from-[#0d1538]/75 to-[#080a26]/90 shadow-[0_35px_80px_rgba(4,6,18,0.6)] sm:h-[520px] lg:h-[700px]">
          <div className="absolute left-[6%] top-[10%] h-[26%] w-[95%] rotate-[-15deg] rounded-[60px] border border-violet-300/25 bg-[#10173f]/65 p-4 shadow-[0_25px_70px_rgba(23,32,72,0.6)]">
            <div className="grid h-full grid-cols-3 gap-3">
              {v1RibbonRows[0].map((preview, idx) => (
                <div
                  key={`v1-r1-${idx}`}
                  className="overflow-hidden rounded-2xl border border-white/15"
                >
                  <img
                    src={preview}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="absolute left-[12%] top-[38%] h-[26%] w-[95%] rotate-[-9deg] rounded-[60px] border border-fuchsia-300/20 bg-[#12173f]/70 p-4 shadow-[0_20px_65px_rgba(41,37,89,0.7)]">
            <div className="grid h-full grid-cols-3 gap-3">
              {v1RibbonRows[1].map((preview, idx) => (
                <div
                  key={`v1-r2-${idx}`}
                  className="overflow-hidden rounded-2xl border border-white/15"
                >
                  <img
                    src={preview}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="absolute left-[20%] top-[66%] h-[26%] w-[95%] rotate-[-4deg] rounded-[60px] border border-cyan-300/20 bg-[#11173c]/70 p-4 shadow-[0_20px_60px_rgba(24,40,94,0.65)]">
            <div className="grid h-full grid-cols-3 gap-3">
              {v1RibbonRows[2].map((preview, idx) => (
                <div
                  key={`v1-r3-${idx}`}
                  className="overflow-hidden rounded-2xl border border-white/15"
                >
                  <img
                    src={preview}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="absolute left-[2%] top-[58%] h-[115px] w-[96px] rotate-[-8deg] overflow-hidden rounded-2xl border border-fuchsia-300/35 bg-gradient-to-br from-[#4a348f]/70 to-[#23235d]/80 p-1 shadow-[0_10px_30px_rgba(84,62,179,0.45)]">
            <img
              src={portraitPreviews[2]}
              alt=""
              className="h-full w-full rounded-xl object-cover"
              loading="lazy"
            />
          </div>
          <div className="absolute left-[66%] top-[14%] h-[120px] w-[110px] rotate-[9deg] overflow-hidden rounded-2xl border border-violet-300/30 bg-gradient-to-br from-[#5635aa]/60 to-[#22275d]/80 p-1">
            <img
              src={scenePreviews[5]}
              alt=""
              className="h-full w-full rounded-xl object-cover"
              loading="lazy"
            />
          </div>
          <div className="absolute left-[74%] top-[72%] h-[120px] w-[220px] rotate-[-5deg] overflow-hidden rounded-2xl border border-cyan-300/25 bg-[#131945]/70 p-1 text-sm text-slate-200/80">
            <div className="relative h-full w-full rounded-xl">
              <img
                src={scenePreviews[3]}
                alt=""
                className="h-full w-full rounded-xl object-cover"
                loading="lazy"
              />
              <span className="absolute bottom-2 left-2 rounded-md bg-black/45 px-2 py-0.5 text-xs font-semibold text-slate-100">
                Cinematic Style
              </span>
            </div>
          </div>
          <div className="absolute left-[8%] top-[80%] h-[120px] w-[285px] rotate-[-3deg] rounded-2xl border border-violet-300/25 bg-[#13163f]/80 p-3 text-xs text-slate-300/85">
            <div className="mb-2 flex items-center gap-2">
              <img
                src={scenePreviews[0]}
                alt=""
                className="h-10 w-16 rounded-md object-cover"
                loading="lazy"
              />
              <span>AI Prompt: A futuristic city at night, cinematic mood.</span>
            </div>
          </div>
        </section>

        <section className="max-w-[640px] lg:justify-self-end">
          <h1 className="text-4xl font-black leading-[1.05] sm:text-6xl xl:text-[5.5rem]">
            <span className="block text-white">Welcome to</span>
            <span className="mt-2 block bg-gradient-to-r from-cyan-300 via-blue-300 to-violet-400 bg-clip-text text-transparent">
              Your Creative Studio
            </span>
          </h1>

          <p className="mt-6 text-2xl text-transparent bg-gradient-to-r from-violet-400 to-indigo-300 bg-clip-text sm:text-4xl">
            Start Generating Cinematic Stories
          </p>

          <p className="mt-6 text-lg text-slate-300/85 sm:text-4xl sm:leading-[1.2]">
            Imagine it. Create it.
            <br className="hidden sm:block" />
            <span className="text-slate-200/75"> All from one dashboard.</span>
          </p>

          <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />

          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="https://www.picdrift.com/studio-signup"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl bg-gradient-to-r from-blue-500 to-violet-500 px-10 py-4 text-lg font-semibold text-white shadow-[0_12px_35px_rgba(83,105,255,0.45)] transition hover:brightness-110"
            >
              Sign Up Now
            </a>
            <button
              onClick={onLogin}
              className="rounded-2xl border border-white/35 bg-white/5 px-8 py-4 text-lg font-semibold text-slate-100 transition hover:bg-white/10"
            >
              Login
            </button>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 text-sm text-slate-300 sm:grid-cols-4">
            {[
              "AI-Powered Generation",
              "Cinematic Quality",
              "Endless Possibilities",
              "Your Privacy Matters",
            ].map((item) => (
              <div
                key={item}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                {item}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

const HeroV2 = ({ onLogin }: { onLogin: () => void }) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060817] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_40%,rgba(95,67,192,0.18),transparent_40%),radial-gradient(circle_at_84%_74%,rgba(44,100,210,0.14),transparent_36%)]" />
      <MarketingHeader onLogin={onLogin} tint="solid" />

      <main className="relative z-10">
        <section className="mx-auto grid w-full max-w-[1700px] gap-10 px-4 pb-10 pt-10 sm:px-8 lg:min-h-[74vh] lg:grid-cols-[1fr_1.05fr] lg:items-center lg:pb-16 lg:pt-16">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-black leading-[1.06] sm:text-6xl xl:text-[6.4rem]">
              <span className="block text-white">Welcome to Your</span>
              <span className="mt-2 block bg-gradient-to-r from-[#b8a3ff] via-[#8f7aff] to-[#6058ff] bg-clip-text text-transparent">
                Creative Studio
              </span>
            </h1>

            <p className="mt-8 text-2xl text-slate-300 sm:text-5xl">
              Start Generating Cinematic Stories
            </p>

            <div className="mt-7 h-1 w-28 rounded-full bg-gradient-to-r from-violet-300 to-indigo-500" />

            <div className="mt-10 flex flex-wrap gap-3">
              <a
                href="https://www.picdrift.com/studio-signup"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl bg-gradient-to-r from-[#5134ee] to-[#8660ff] px-8 py-3 text-lg font-semibold text-white transition hover:brightness-110"
              >
                Sign Up Now
              </a>
              <button
                onClick={onLogin}
                className="rounded-2xl border border-white/25 bg-white/5 px-8 py-3 text-lg font-semibold text-slate-100 transition hover:bg-white/12"
              >
                Login
              </button>
            </div>
          </div>

          <div className="relative h-[320px] overflow-visible sm:h-[430px] lg:h-[560px]">
            {v2CollageCards.map((card, idx) => (
              <div
                key={`v2-${idx}`}
                className="absolute h-[130px] w-[180px] overflow-hidden rounded-[1.3rem] border border-white/10 shadow-[0_14px_26px_rgba(0,0,0,0.35)] sm:h-[170px] sm:w-[240px] lg:h-[220px] lg:w-[300px]"
                style={{
                  top: card.top,
                  left: card.left,
                  transform: `rotate(${card.rotate})`,
                }}
              >
                <img
                  src={card.preview}
                  alt={`Preview ${idx + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-white/15 bg-gradient-to-b from-[#111635]/75 to-[#0d112a]/95">
          <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-14 text-center sm:px-8">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl border border-violet-400/40 bg-[#171d43]/70 text-2xl font-semibold text-violet-200">
              AI
            </div>
            <h2 className="text-4xl font-bold leading-tight sm:text-6xl">
              Transform your content creation
            </h2>
            <p className="mt-5 text-xl text-slate-300 sm:text-4xl">
              with AI-powered video, image, and carousel generation.
            </p>
            <a
              href="https://www.picdrift.com/studio-signup"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 rounded-2xl bg-gradient-to-r from-[#4e32e2] to-[#8562ff] px-12 py-4 text-2xl font-semibold text-white shadow-[0_12px_35px_rgba(90,70,255,0.45)] transition hover:brightness-110"
            >
              Sign Up Now
            </a>
          </div>
        </section>
      </main>
    </div>
  );
};

const HeroV3 = ({ onLogin }: { onLogin: () => void }) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#04071f] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_55%,rgba(69,63,178,0.4),transparent_42%),radial-gradient(circle_at_82%_50%,rgba(53,85,205,0.32),transparent_40%),radial-gradient(circle_at_50%_12%,rgba(111,79,220,0.28),transparent_34%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(120,120,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(120,120,255,0.06)_1px,transparent_1px)] bg-[size:110px_110px]" />
      <MarketingHeader onLogin={onLogin} tint="ghost" />

      <main className="relative z-10 mx-auto w-full max-w-[1750px] px-4 pb-16 pt-12 sm:px-8 lg:pt-16">
        <section className="relative grid gap-8 lg:grid-cols-[1fr_0.9fr_1fr] lg:items-center">
          <div className="rounded-[2rem] border border-violet-300/25 bg-[#11163d]/55 p-5 backdrop-blur-md">
            <div className="mb-5 flex items-center gap-3">
              <span className="text-sm font-semibold tracking-wide text-cyan-200">VID</span>
              <h3 className="text-3xl font-semibold text-slate-100">AI Video</h3>
            </div>
            <p className="max-w-xs text-xl leading-relaxed text-slate-300/85">
              Transform ideas into cinematic videos with AI.
            </p>
            <div className="mt-7 rounded-3xl border border-white/15 bg-[#161f4a] p-3">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
                <img
                  src={scenePreviews[4]}
                  alt="AI video preview"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute inset-x-0 bottom-3 mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-black/35 text-white">
                  ▶
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/10">
                <div className="h-full w-[34%] rounded-full bg-violet-300" />
              </div>
            </div>
          </div>

          <div className="text-center">
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[1.8rem] border border-cyan-300/35 bg-[#1a2454]/75 text-2xl font-semibold text-cyan-200 shadow-[0_0_26px_rgba(98,170,255,0.55)]">
              FX
            </div>
            <h1 className="text-4xl font-black leading-[1.06] text-cyan-100 drop-shadow-[0_0_22px_rgba(91,152,255,0.72)] sm:text-6xl xl:text-[6.2rem]">
              Welcome to Your
              <span className="block">Creative Studio</span>
            </h1>
            <p className="mt-6 text-2xl text-slate-300 sm:text-5xl">Imagine it. Create it.</p>
            <a
              href="https://www.picdrift.com/studio-signup"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-10 inline-flex rounded-[1.8rem] border border-cyan-200/65 bg-gradient-to-r from-[#3874ff] to-[#6c48ff] px-12 py-4 text-3xl font-semibold text-white shadow-[0_0_30px_rgba(92,129,255,0.62)] transition hover:brightness-110"
            >
              Sign Up Now
            </a>
          </div>

          <div className="space-y-5">
            <div className="rounded-[2rem] border border-violet-300/25 bg-[#11163d]/55 p-5 backdrop-blur-md">
              <div className="mb-5 flex items-center gap-3">
                <span className="text-sm font-semibold tracking-wide text-violet-200">CRS</span>
                <h3 className="text-3xl font-semibold text-slate-100">Carousel</h3>
              </div>
              <p className="max-w-sm text-xl leading-relaxed text-slate-300/85">
                Create engaging carousel posts for any platform.
              </p>
              <div className="mt-6 flex h-[180px] items-end gap-3 rounded-3xl border border-white/15 bg-[#12183c] px-4 py-4">
                {["h-[70%]", "h-[86%]", "h-[74%]"].map((height, idx) => (
                  <div
                    key={`v3-slide-${idx}`}
                    className={`w-full ${height} overflow-hidden rounded-2xl border border-white/20`}
                  >
                    <img
                      src={scenePreviews[idx + 1]}
                      alt={`Carousel slide ${idx + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-violet-300/25 bg-[#0f1436]/65 p-4">
              <p className="text-lg text-slate-200">What will you create today?</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                {["Video", "Image", "Carousel"].map((label) => (
                  <div
                    key={label}
                    className="rounded-xl border border-white/15 bg-[#1a2151]/70 px-3 py-2 text-center text-slate-100"
                  >
                    {label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto mt-12 max-w-4xl border-t border-white/10 pt-8 text-center text-2xl text-slate-300/90 sm:text-4xl">
          Start Generating Cinematic Stories
        </div>
      </main>
    </div>
  );
};

const VariantPicker = ({
  active,
  toSearch,
  pathname,
}: {
  active: HeroVariant;
  toSearch: (variant: HeroVariant) => string;
  pathname: string;
}) => {
  return (
    <div className="fixed bottom-4 left-4 z-40 rounded-2xl border border-white/20 bg-[#090d26]/90 p-2 backdrop-blur-md">
      <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
        Login Variant Preview
      </div>
      <div className="flex flex-wrap gap-2">
        {HERO_VARIANTS.map((variantName) => {
          const isActive = variantName === active;
          return (
            <Link
              key={variantName}
              to={{
                pathname,
                search: toSearch(variantName),
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? "bg-violet-500 text-white"
                  : "border border-white/20 bg-white/5 text-slate-200 hover:bg-white/10"
              }`}
            >
              {variantName}
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export const Hero = () => {
  const location = useLocation();
  const [showLogin, setShowLogin] = useState(false);

  const variant = useMemo(() => readVariantFromSearch(location.search), [location.search]);

  const toVariantSearch = (variantName: HeroVariant) => {
    const params = new URLSearchParams(location.search);
    params.set("loginVariant", variantName);
    return `?${params.toString()}`;
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("login_email")) {
      setShowLogin(true);
    }
  }, [location.search]);

  return (
    <>
      {variant === "v1" && <HeroV1 onLogin={() => setShowLogin(true)} />}
      {variant === "v2" && <HeroV2 onLogin={() => setShowLogin(true)} />}
      {variant === "v3" && <HeroV3 onLogin={() => setShowLogin(true)} />}
      {variant === "current" && <HeroCurrent onLogin={() => setShowLogin(true)} />}

      <VariantPicker
        active={variant}
        toSearch={toVariantSearch}
        pathname={location.pathname}
      />

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
};
