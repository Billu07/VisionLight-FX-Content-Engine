import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LoginModal } from "../LoginModal";
import picdriftLogo from "../../assets/picdrift.png";
import fxLogo from "../../assets/fx.png";
import { getSiteBrand } from "../../lib/branding";

type PreviewImageAsset = {
  sm: string;
  md: string;
  alt: string;
};

type PreviewVideoAsset = {
  src: string;
  poster?: string;
  alt: string;
};

type HeroPreviewCard = {
  title: string;
  tone: string;
  rotate: string;
  x: string;
  y: string;
  chip: string;
  preview?: PreviewImageAsset;
  stripPreviews: PreviewImageAsset[];
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
  d1: {
    src: "/login-previews/optimized/d1-web.mp4",
    poster: "/login-previews/optimized/d1-poster.webp",
    alt: "3DX path preview 1",
  },
  d2: {
    src: "/login-previews/optimized/d2-web.mp4",
    poster: "/login-previews/optimized/d2-poster.webp",
    alt: "3DX path preview 2",
  },
  d3: {
    src: "/login-previews/optimized/d3-web.mp4",
    poster: "/login-previews/optimized/d3-poster.webp",
    alt: "3DX path preview 3",
  },
  d4: {
    src: "/login-previews/optimized/d4-web.mp4",
    poster: "/login-previews/optimized/d4-poster.webp",
    alt: "3DX path preview 4",
  },
  d5: {
    src: "/login-previews/optimized/d5-web.mp4",
    poster: "/login-previews/optimized/d5-poster.webp",
    alt: "3DX path preview 5",
  },
  d6: {
    src: "/login-previews/optimized/d6-web.mp4",
    poster: "/login-previews/optimized/d6-poster.webp",
    alt: "3DX path preview 6",
  },
} satisfies Record<string, PreviewVideoAsset>;

const rightCanvasVideos: PreviewVideoAsset[] = [
  VIDEOS.d1,
  VIDEOS.d2,
  VIDEOS.d3,
  VIDEOS.d4,
  VIDEOS.d5,
  VIDEOS.d6,
  VIDEOS.cinematic,
];

const pathPreviewVideos: PreviewVideoAsset[] = [
  VIDEOS.d1,
  VIDEOS.d2,
  VIDEOS.d3,
  VIDEOS.d4,
  VIDEOS.d5,
  VIDEOS.d6,
];

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

const mockCards: HeroPreviewCard[] = [
  {
    title: "Portrait FX",
    tone: "from-fuchsia-500 to-purple-700",
    rotate: "-10deg",
    x: "2%",
    y: "15%",
    chip: "Portrait",
    stripPreviews: [portraitPreviews[0], portraitPreviews[1], portraitPreviews[2]],
  },
  {
    title: "Landscape FX",
    tone: "from-orange-400 to-amber-600",
    rotate: "-4deg",
    x: "27%",
    y: "7%",
    chip: "Landscape",
    stripPreviews: [scenePreviews[0], scenePreviews[1], scenePreviews[2]],
  },
  {
    title: "Story FX",
    tone: "from-emerald-400 to-cyan-600",
    rotate: "4deg",
    x: "51%",
    y: "2%",
    chip: "Story",
    stripPreviews: [IMAGES.abstract1, IMAGES.abstract2, IMAGES.abstract3],
  },
  {
    title: "Cinematic FX",
    tone: "from-cyan-300 to-sky-600",
    rotate: "10deg",
    x: "75%",
    y: "8%",
    chip: "Cinematic",
    stripPreviews: [scenePreviews[3], scenePreviews[4], scenePreviews[5]],
  },
];

const popularPosters: PreviewImageAsset[] = [
  scenePreviews[1],
  portraitPreviews[2],
  IMAGES.abstract2,
  portraitPreviews[0],
  IMAGES.abstract3,
  portraitPreviews[1],
];

const ResponsivePreviewImage = ({
  asset,
  alt,
  className,
  sizes = "(max-width: 640px) 50vw, 220px",
  loading = "lazy",
  fetchPriority = "low",
}: {
  asset: PreviewImageAsset;
  alt: string;
  className: string;
  sizes?: string;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
}) => {
  return (
    <img
      src={asset.sm}
      srcSet={`${asset.sm} 480w, ${asset.md} 960w`}
      sizes={sizes}
      alt={alt}
      className={className}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
    />
  );
};

const PreviewVideo = ({
  asset,
  className,
  preload = "metadata",
  autoPlay = true,
  loop = false,
}: {
  asset: PreviewVideoAsset;
  className: string;
  preload?: "none" | "metadata" | "auto";
  autoPlay?: boolean;
  loop?: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !autoPlay) return;
    el.muted = true;
    void el.play().catch(() => {
      // Keep poster fallback if autoplay is blocked by browser policy.
    });
  }, [asset.src, autoPlay]);

  return (
    <video
      ref={videoRef}
      key={asset.src}
      className={className}
      src={asset.src}
      poster={asset.poster}
      autoPlay={autoPlay}
      muted
      loop={loop}
      playsInline
      preload={preload}
      aria-label={asset.alt}
    />
  );
};

const MarketingHeader = ({
  onLogin,
  showFxLogo,
}: {
  onLogin: () => void;
  showFxLogo: boolean;
}) => {
  return (
    <header className="relative z-20 border-b border-white/10 bg-[#120f2b]/65 backdrop-blur-xl">
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
    </header>
  );
};

export const Hero = () => {
  const location = useLocation();
  const [showLogin, setShowLogin] = useState(false);
  const [activeRightCanvasVideoIndex, setActiveRightCanvasVideoIndex] = useState(-1);
  const siteBrand = useMemo(() => getSiteBrand(), []);
  const isVisualFxDomain = siteBrand === "visualfx";

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("login_email")) {
      setShowLogin(true);
    }
  }, [location.search]);

  const handleSwapPreviewVideo = () => {
    setActiveRightCanvasVideoIndex(
      (prevIndex) => (prevIndex + 1) % rightCanvasVideos.length,
    );
  };

  return (
    <>
      <div className="relative min-h-screen overflow-hidden bg-[#070a20] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(157,57,255,0.2),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(26,103,255,0.35),transparent_42%),radial-gradient(circle_at_50%_64%,rgba(15,12,40,0.65),transparent_62%)]" />
        <div className="absolute inset-x-0 top-0 h-[52%] bg-gradient-to-r from-[#170316] via-[#1a164f] to-[#0d2f59]" />
        <div
          className="absolute inset-x-0 bottom-[-140px] h-[68%] bg-gradient-to-r from-[#2f58df] via-[#5364f2] to-[#3f58dd]"
          style={{ clipPath: "polygon(0 16%, 100% 0, 100% 100%, 0 100%)" }}
        />

        <MarketingHeader onLogin={() => setShowLogin(true)} showFxLogo={isVisualFxDomain} />

        <main className="relative z-10">
          <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 pb-10 pt-12 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:pt-14">
            <div className="max-w-xl">
              <h1 className="text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
                <span className="block">Welcome to</span>
                <span className="mt-1 block bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400 bg-clip-text text-transparent">
                  Your Creative Studio
                </span>
              </h1>

              <p className="mt-4 text-lg text-slate-200 sm:text-2xl">
                Start Generating Cinematic Stories
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="https://www.picdrift.com/studio-signup"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-7 py-3 text-sm font-black text-white transition hover:from-cyan-400 hover:to-blue-400"
                >
                  Sign Up Now
                </a>
                <button
                  onClick={() => setShowLogin(true)}
                  className="rounded-full border border-white/45 bg-white/5 px-7 py-3 text-sm font-bold text-white transition hover:bg-white/12"
                >
                  Login
                </button>
              </div>
            </div>

            <div className="relative h-[300px] overflow-hidden sm:h-[340px] sm:overflow-visible lg:h-[370px]">
              <div className="absolute inset-0 origin-top-left scale-[0.76] sm:scale-100">
                {mockCards.map((card, cardIndex) => {
                const hasSelectedVideo = activeRightCanvasVideoIndex >= 0;
                const selectedVideo = hasSelectedVideo
                  ? rightCanvasVideos[
                      (activeRightCanvasVideoIndex + cardIndex) % rightCanvasVideos.length
                    ]
                  : null;
                const posterAsset = rightCanvasVideos[cardIndex % rightCanvasVideos.length];

                  return (
                    <div
                      key={card.title}
                      className={`absolute h-[255px] w-[150px] rounded-3xl border border-white/20 bg-gradient-to-b ${card.tone} p-3 shadow-[0_22px_40px_rgba(0,0,0,0.45)] ${cardIndex === 0 ? "ml-4 sm:ml-0" : ""} sm:h-[290px] sm:w-[175px]`}
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
                              {selectedVideo ? (
                              <PreviewVideo
                                asset={selectedVideo}
                                className="h-24 w-full object-cover sm:h-28"
                                preload="metadata"
                                autoPlay
                                loop
                              />
                              ) : (
                                <img
                                  src={posterAsset.poster}
                                  alt={`${card.title} video poster`}
                                  className="h-24 w-full object-cover sm:h-28"
                                  loading="eager"
                                  fetchPriority="high"
                                  decoding="async"
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
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleSwapPreviewVideo}
                title="Play next preview video"
                aria-label="Play next preview video"
                className="absolute left-1/2 top-[34%] flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border border-white/30 bg-white/20 backdrop-blur-xl shadow-[0_12px_30px_rgba(5,10,35,0.55)] transition hover:scale-[1.04] hover:bg-white/30 sm:h-20 sm:w-20"
              >
                <div className="ml-1 h-0 w-0 border-y-[12px] border-l-[18px] border-y-transparent border-l-white" />
              </button>
            </div>
          </section>

          <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 pb-16 pt-5 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:pt-0">
            <div className="relative [perspective:1800px]">
              <div className="relative rounded-[2rem] border border-indigo-300/25 bg-[#070c2b]/85 p-4 shadow-[0_24px_70px_rgba(10,12,38,0.45)] backdrop-blur-sm transition-transform duration-700 lg:[transform:rotateY(24deg)_rotateX(6deg)_translateX(10px)] lg:[transform-origin:center_right] lg:[transform-style:preserve-3d] sm:p-6">
                <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-gradient-to-br from-cyan-300/8 via-transparent to-indigo-500/10" />
                <div className="relative rounded-[1.4rem] border border-white/10 bg-gradient-to-br from-[#090b24] to-[#07081c] p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold tracking-wide text-slate-200">
                    3DX Paths
                  </span>
                  <span className="rounded-full bg-slate-800/80 px-2.5 py-1">
                    Asset Library
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {pathPreviewVideos.map((video, idx) => (
                    <div key={`path-${idx}`} className="overflow-hidden rounded-lg border border-white/10">
                      <PreviewVideo
                        asset={video}
                        className="aspect-[3/4] w-full object-cover"
                        preload="metadata"
                        autoPlay
                        loop
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

      <LoginModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
    </>
  );
};
