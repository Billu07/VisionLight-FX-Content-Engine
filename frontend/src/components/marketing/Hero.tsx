import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LoginModal } from "../LoginModal";
import picdriftLogo from "../../assets/picdrift.png";
import fxLogo from "../../assets/fx.png";
import { getSiteBrand } from "../../lib/branding";

type HeroVariant = "current" | "v2";

const HERO_VARIANTS: HeroVariant[] = ["current", "v2"];

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

type PreviewImageAsset = {
  sm: string;
  md: string;
  alt: string;
};

type PreviewVideoAsset = {
  src: string;
  poster: string;
  alt: string;
};

const IMAGES = {
  abstract1: {
    sm: "/login-previews/optimized/preview_abstract_1-sm.webp",
    md: "/login-previews/optimized/preview_abstract_1-md.webp",
    alt: "Abstract cinematic art",
  },
  abstract2: {
    sm: "/login-previews/optimized/preview_abstract_2-sm.webp",
    md: "/login-previews/optimized/preview_abstract_2-md.webp",
    alt: "Abstract creative scene",
  },
  abstract3: {
    sm: "/login-previews/optimized/preview_abstract_3-sm.webp",
    md: "/login-previews/optimized/preview_abstract_3-md.webp",
    alt: "Stylized abstract environment",
  },
  character1: {
    sm: "/login-previews/optimized/preview_character_1-sm.webp",
    md: "/login-previews/optimized/preview_character_1-md.webp",
    alt: "Character portrait",
  },
  character2: {
    sm: "/login-previews/optimized/preview_character_2-sm.webp",
    md: "/login-previews/optimized/preview_character_2-md.webp",
    alt: "Portrait concept art",
  },
  character3: {
    sm: "/login-previews/optimized/preview_character_3-sm.webp",
    md: "/login-previews/optimized/preview_character_3-md.webp",
    alt: "Creative portrait close-up",
  },
  landscape1: {
    sm: "/login-previews/optimized/preview_landscape_1-sm.webp",
    md: "/login-previews/optimized/preview_landscape_1-md.webp",
    alt: "Wide cinematic landscape",
  },
  landscape2: {
    sm: "/login-previews/optimized/preview_landscape_2-sm.webp",
    md: "/login-previews/optimized/preview_landscape_2-md.webp",
    alt: "Mountain landscape",
  },
  landscape3: {
    sm: "/login-previews/optimized/preview_landscape_3-sm.webp",
    md: "/login-previews/optimized/preview_landscape_3-md.webp",
    alt: "Dramatic scenic terrain",
  },
  nightStreet: {
    sm: "/login-previews/optimized/preview_night_street-sm.webp",
    md: "/login-previews/optimized/preview_night_street-md.webp",
    alt: "Night street cinematic frame",
  },
} satisfies Record<string, PreviewImageAsset>;

const VIDEOS = {
  cinematic: {
    src: "/login-previews/optimized/cinematic_futuristic-web.mp4",
    poster: "/login-previews/optimized/cinematic_futuristic-poster.webp",
    alt: "Futuristic cinematic clip",
  },
  dreamyCat: {
    src: "/login-previews/optimized/preview_dreamy_cat-web.mp4",
    poster: "/login-previews/optimized/preview_dreamy_cat-poster.webp",
    alt: "Dreamy cat styled clip",
  },
  tvAd: {
    src: "/login-previews/optimized/TV_ad_organic_product_influencer-web.mp4",
    poster: "/login-previews/optimized/TV_ad_organic_product_influencer-poster.webp",
    alt: "Ad style motion clip",
  },
} satisfies Record<string, PreviewVideoAsset>;

const scenePreviews: PreviewImageAsset[] = [
  IMAGES.landscape1,
  IMAGES.landscape2,
  IMAGES.landscape3,
  IMAGES.nightStreet,
  IMAGES.abstract1,
  IMAGES.abstract2,
];

const portraitPreviews: PreviewImageAsset[] = [
  IMAGES.character1,
  IMAGES.character2,
  IMAGES.character3,
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
    stripPreviews: [portraitPreviews[0], portraitPreviews[1], portraitPreviews[2]],
  },
  {
    title: "Landscape FX",
    tone: "from-orange-400 to-amber-600",
    rotate: "-4deg",
    x: "27%",
    y: "7%",
    chip: "Landscape",
    preview: scenePreviews[0],
    stripPreviews: [scenePreviews[0], scenePreviews[1], scenePreviews[2]],
  },
  {
    title: "Story FX",
    tone: "from-emerald-400 to-cyan-600",
    rotate: "4deg",
    x: "51%",
    y: "2%",
    chip: "Story",
    preview: IMAGES.abstract3,
    stripPreviews: [IMAGES.abstract1, IMAGES.abstract2, IMAGES.abstract3],
  },
  {
    title: "Cinematic FX",
    tone: "from-cyan-300 to-sky-600",
    rotate: "10deg",
    x: "75%",
    y: "8%",
    chip: "Cinematic",
    preview: scenePreviews[3],
    stripPreviews: [scenePreviews[3], scenePreviews[4], scenePreviews[5]],
    video: VIDEOS.cinematic,
  },
];

const libraryPosters = [
  portraitPreviews[0],
  scenePreviews[0],
  portraitPreviews[1],
  IMAGES.abstract1,
  portraitPreviews[2],
  scenePreviews[5],
];

const popularPosters = [
  scenePreviews[1],
  portraitPreviews[2],
  IMAGES.abstract2,
  portraitPreviews[0],
  IMAGES.abstract3,
  portraitPreviews[1],
];

type V2CollageCard = {
  top: string;
  left: string;
  rotate: string;
  image?: PreviewImageAsset;
  video?: PreviewVideoAsset;
};

const v2CollageCards: V2CollageCard[] = [
  { video: VIDEOS.cinematic, top: "3%", left: "13%", rotate: "-11deg" },
  { image: portraitPreviews[0], top: "0%", left: "46%", rotate: "-8deg" },
  { image: portraitPreviews[1], top: "8%", left: "72%", rotate: "-12deg" },
  { image: IMAGES.abstract2, top: "34%", left: "0%", rotate: "-11deg" },
  { video: VIDEOS.tvAd, top: "30%", left: "40%", rotate: "-7deg" },
  { image: scenePreviews[5], top: "62%", left: "25%", rotate: "-6deg" },
  { image: scenePreviews[1], top: "56%", left: "72%", rotate: "-9deg" },
];

const ResponsivePreviewImage = ({
  asset,
  alt,
  className,
  sizes = "(max-width: 640px) 50vw, 220px",
  loading = "lazy",
}: {
  asset: PreviewImageAsset;
  alt: string;
  className: string;
  sizes?: string;
  loading?: "lazy" | "eager";
}) => {
  return (
    <img
      src={asset.md}
      srcSet={`${asset.sm} 480w, ${asset.md} 960w`}
      sizes={sizes}
      alt={alt}
      className={className}
      loading={loading}
    />
  );
};

const PreviewVideo = ({
  asset,
  className,
}: {
  asset: PreviewVideoAsset;
  className: string;
}) => {
  return (
    <video
      className={className}
      src={asset.src}
      poster={asset.poster}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={asset.alt}
    />
  );
};

const MarketingHeader = ({
  onLogin,
  tint,
  showFxLogo,
}: {
  onLogin: () => void;
  tint: "soft" | "solid" | "ghost";
  showFxLogo: boolean;
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
          {showFxLogo && (
            <>
              <span className="h-7 w-px bg-white/20" />
              <img
                src={fxLogo}
                alt="FX"
                className="h-7 w-auto object-contain opacity-95"
              />
            </>
          )}
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

const HeroCurrent = ({
  onLogin,
  showFxLogo,
}: {
  onLogin: () => void;
  showFxLogo: boolean;
}) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070a20] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(157,57,255,0.2),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(26,103,255,0.35),transparent_42%),radial-gradient(circle_at_50%_64%,rgba(15,12,40,0.65),transparent_62%)]" />
      <div className="absolute inset-x-0 top-0 h-[52%] bg-gradient-to-r from-[#170316] via-[#1a164f] to-[#0d2f59]" />
      <div
        className="absolute inset-x-0 bottom-[-140px] h-[68%] bg-gradient-to-r from-[#2f58df] via-[#5364f2] to-[#3f58dd]"
        style={{ clipPath: "polygon(0 16%, 100% 0, 100% 100%, 0 100%)" }}
      />

      <MarketingHeader onLogin={onLogin} tint="soft" showFxLogo={showFxLogo} />

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
                        {card.video ? (
                          <PreviewVideo
                            asset={card.video}
                            className="h-24 w-full object-cover sm:h-28"
                          />
                        ) : (
                          <ResponsivePreviewImage
                            asset={card.preview}
                            alt={`${card.title} preview`}
                            className="h-24 w-full object-cover sm:h-28"
                            sizes="(max-width: 640px) 28vw, 180px"
                          />
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-1.5">
                        {card.stripPreviews.map((preview, idx) => (
                          <ResponsivePreviewImage
                            key={`${card.title}-${idx}`}
                            asset={preview}
                            alt=""
                            className="aspect-[3/4] rounded-md border border-white/20 object-cover"
                            sizes="60px"
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
                  Recent Generations
                </span>
                <span className="rounded-full bg-slate-800/80 px-2.5 py-1">
                  Asset Library
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {libraryPosters.map((poster, idx) => (
                  <div key={`poster-${idx}`} className="overflow-hidden rounded-lg border border-white/10">
                    <ResponsivePreviewImage
                      asset={poster}
                      alt={`Library poster ${idx + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                      sizes="(max-width: 640px) 30vw, 120px"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-6 text-xs font-semibold tracking-[0.15em] text-slate-400">
                Style Inspirations
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
                {popularPosters.map((poster, idx) => (
                  <div
                    key={`poster-bottom-${idx}`}
                    className="overflow-hidden rounded-lg border border-white/10"
                  >
                    <ResponsivePreviewImage
                      asset={poster}
                      alt={`Popular poster ${idx + 1}`}
                      className="aspect-[3/4] w-full object-cover"
                      sizes="(max-width: 640px) 30vw, 120px"
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
              Transform your content creation with AI-powered image, and video
              generation.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};

const HeroV2 = ({
  onLogin,
  showFxLogo,
}: {
  onLogin: () => void;
  showFxLogo: boolean;
}) => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050717] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(90,52,214,0.34),transparent_38%),radial-gradient(circle_at_82%_26%,rgba(13,148,245,0.26),transparent_44%),radial-gradient(circle_at_56%_74%,rgba(12,18,56,0.72),transparent_64%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(17,24,69,0.45),rgba(7,9,34,0.82))]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(118,108,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(118,108,255,0.05)_1px,transparent_1px)] bg-[size:140px_140px]" />

      <MarketingHeader onLogin={onLogin} tint="ghost" showFxLogo={showFxLogo} />

      <main className="relative z-10">
        <section className="mx-auto grid w-full max-w-[1700px] gap-10 px-4 pb-10 pt-10 sm:px-8 lg:min-h-[72vh] lg:grid-cols-[1fr_1.05fr] lg:items-center lg:pb-14 lg:pt-14">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-black leading-[1.06] sm:text-6xl xl:text-[6.2rem]">
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

          <div className="relative h-[360px] overflow-visible sm:h-[430px] lg:h-[560px]">
            {v2CollageCards.map((card, idx) => (
              <div
                key={`v2-${idx}`}
                className="absolute h-[140px] w-[190px] overflow-hidden rounded-[1.3rem] border border-white/10 shadow-[0_16px_30px_rgba(0,0,0,0.4)] sm:h-[170px] sm:w-[240px] lg:h-[220px] lg:w-[300px]"
                style={{
                  top: card.top,
                  left: card.left,
                  transform: `rotate(${card.rotate})`,
                }}
              >
                {card.video ? (
                  <PreviewVideo
                    asset={card.video}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ResponsivePreviewImage
                    asset={card.image!}
                    alt={`Preview ${idx + 1}`}
                    className="h-full w-full object-cover"
                    sizes="(max-width: 640px) 42vw, 300px"
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-white/15 bg-[#0f1433]/80 backdrop-blur-sm">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <h2 className="text-4xl font-bold leading-tight sm:text-6xl">
                Transform your content creation
              </h2>
              <p className="mt-5 text-xl text-slate-300 sm:text-4xl">
                with AI-powered image, and video generation.
              </p>
            </div>

            <div className="rounded-3xl border border-white/15 bg-[#151c46]/70 p-3">
              <div className="relative aspect-video overflow-hidden rounded-2xl">
                <PreviewVideo
                  asset={VIDEOS.dreamyCat}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                <span className="absolute left-3 top-3 rounded-md border border-white/30 bg-black/35 px-2 py-1 text-xs font-semibold text-white">
                  Live Preview Reel
                </span>
              </div>
            </div>
          </div>
        </section>
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
  const siteBrand = useMemo(() => getSiteBrand(), []);
  const isVisualFxDomain = siteBrand === "visualfx";

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
      {variant === "v2" && (
        <HeroV2 onLogin={() => setShowLogin(true)} showFxLogo={isVisualFxDomain} />
      )}
      {variant === "current" && (
        <HeroCurrent
          onLogin={() => setShowLogin(true)}
          showFxLogo={isVisualFxDomain}
        />
      )}

      <VariantPicker
        active={variant}
        toSearch={toVariantSearch}
        pathname={location.pathname}
      />

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
};
