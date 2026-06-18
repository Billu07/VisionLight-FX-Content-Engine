import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiEndpoints, getCORSProxyUrl, getCORSProxyVideoUrl } from "../lib/api";
import { notify } from "../lib/notifications";
import { getSiteBrand } from "../lib/branding";
import { LoadingSpinner } from "../components/LoadingSpinner";
import picdriftLogo from "../assets/picdrift.png";
import fxLogo from "../assets/fx.png";

type DemoView = "PICDRIFT" | "VISIONLIGHT";

interface DemoPost {
  id: string;
  title: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaProvider?: string | null;
}

interface DemoAsset {
  id: string;
  url?: string;
  type?: string;
  aspectRatio?: string;
}

const SIGN_UP_URL = "https://picdrift.com/sign-up";

const THEME: Record<
  DemoView,
  {
    label: string;
    tabActive: string;
    generate: string;
    badge: string;
    ring: string;
    tabs: { id: string; label: string }[];
  }
> = {
  PICDRIFT: {
    label: "PicDrift View",
    tabActive: "border-white/20 bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-2xl",
    generate: "from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400",
    badge: "border-rose-300/40 bg-rose-500/15 text-rose-100",
    ring: "focus:ring-rose-500/50",
    tabs: [
      { id: "pic", label: "Pic" },
      { id: "drift", label: "Drift" },
      { id: "3dx", label: "3DX" },
    ],
  },
  VISIONLIGHT: {
    label: "Visionlight View",
    tabActive: "border-white/20 bg-gradient-to-br from-cyan-600 to-blue-600 text-white shadow-2xl",
    generate: "from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400",
    badge: "border-cyan-300/40 bg-cyan-500/15 text-cyan-100",
    ring: "focus:ring-cyan-500/50",
    tabs: [
      { id: "picdrift", label: "PicDrift" },
      { id: "picfx", label: "Pic FX" },
      { id: "videofx", label: "Video FX" },
    ],
  },
};

const defaultViewFromBrand = (): DemoView => {
  return getSiteBrand() === "picdrift" ? "PICDRIFT" : "VISIONLIGHT";
};

// mediaUrl can be a JSON array string (carousels) — take the first item.
const getCleanUrl = (url?: string): string => {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
    } catch {
      /* fall through */
    }
  }
  return trimmed;
};

const isVideoMedia = (url: string, type?: string, provider?: string | null) =>
  type === "VIDEO" ||
  provider === "sora" ||
  (provider || "").includes("kling") ||
  /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);

function DemoMediaCard({
  url,
  type,
  provider,
  title,
}: {
  url?: string;
  type?: string;
  provider?: string | null;
  title?: string;
}) {
  const clean = getCleanUrl(url);
  if (!clean) return null;
  const video = isVideoMedia(clean, type, provider);

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-gray-900/60">
      {video ? (
        <video
          src={getCORSProxyVideoUrl(clean)}
          className="aspect-[3/4] w-full object-cover"
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={getCORSProxyUrl(clean, 600, 70)}
          alt={title || "Demo content"}
          className="aspect-[3/4] w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      )}
      {title ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="line-clamp-1 text-[11px] font-medium text-white/90">{title}</span>
        </div>
      ) : null}
    </div>
  );
}

export default function DemoDashboard() {
  const location = useLocation();
  const initialView = useMemo<DemoView>(() => {
    const param = new URLSearchParams(location.search).get("view");
    if (param) {
      const upper = param.toUpperCase();
      if (upper === "PICDRIFT" || upper === "VISIONLIGHT") return upper;
    }
    return defaultViewFromBrand();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [view, setView] = useState<DemoView>(initialView);
  const [activeTab, setActiveTab] = useState<string>(THEME[initialView].tabs[0].id);
  const theme = THEME[view];

  useEffect(() => {
    setActiveTab(THEME[view].tabs[0].id);
  }, [view]);

  const { data, isLoading } = useQuery({
    queryKey: ["demo-content", view],
    queryFn: async () => {
      const res = await apiEndpoints.getDemoContent(view);
      return res.data as { posts: DemoPost[]; assets: DemoAsset[] };
    },
    staleTime: 5 * 60 * 1000,
  });

  const posts = data?.posts ?? [];
  const assets = data?.assets ?? [];

  const showDemoNotice = () =>
    notify.info("This is a preview — sign up to create your own.");

  return (
    <div className="min-h-screen bg-[#070a20] text-gray-100">
      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#070a20]/90 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={picdriftLogo} alt="PicDrift" className="h-8 w-auto object-contain sm:h-9" />
            {view === "VISIONLIGHT" && (
              <>
                <span className="h-6 w-px bg-white/20" />
                <img src={fxLogo} alt="FX" className="h-6 w-auto object-contain opacity-95" />
              </>
            )}
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* VIEW TOGGLE */}
            <div className="flex rounded-full border border-white/10 bg-white/5 p-1">
              {(["VISIONLIGHT", "PICDRIFT"] as DemoView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors sm:text-xs ${
                    view === v
                      ? "bg-white text-gray-900"
                      : "text-gray-300 hover:text-white"
                  }`}
                >
                  {v === "PICDRIFT" ? "PicDrift" : "Visionlight"}
                </button>
              ))}
            </div>

            <a
              href={SIGN_UP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-1.5 text-xs font-black text-white transition hover:from-cyan-400 hover:to-blue-400 sm:px-5"
            >
              Sign Up Free
            </a>
          </div>
        </div>
      </header>

      {/* READ-ONLY BANNER */}
      <div className="border-b border-amber-400/20 bg-amber-500/10">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2 text-[12px] text-amber-100 sm:px-6">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${theme.badge}`}>
            Demo Preview
          </span>
          <span className="text-amber-100/90">
            Read-only — look around freely. Creating, uploading & rendering are disabled.
          </span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* CREATE PANEL (inert chrome) */}
        <section className="rounded-3xl border border-white/10 bg-gray-800/30 p-4 shadow-[0_24px_60px_rgba(2,8,23,0.45)] backdrop-blur-lg sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Create</h2>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              {theme.label}
            </span>
          </div>

          <label className="mb-3 block text-sm font-semibold text-white">Select Content Type</label>
          <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
            {theme.tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl border-2 p-3 text-center text-xs font-semibold uppercase tracking-wider transition-all sm:p-4 sm:text-sm ${
                  activeTab === tab.id
                    ? theme.tabActive
                    : "border-white/5 bg-gray-800/50 text-white hover:border-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">
                Describe your vision
              </label>
              <textarea
                readOnly
                onClick={showDemoNotice}
                placeholder="e.g. 'A cinematic mountain sunrise, volumetric light'…"
                className="h-24 w-full cursor-not-allowed resize-none rounded-xl border border-white/10 bg-gray-900/70 p-3 text-sm text-white placeholder-gray-500 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={showDemoNotice}
              className={`rounded-xl bg-gradient-to-r px-6 py-3 text-sm font-black text-white shadow-lg transition ${theme.generate}`}
            >
              Generate
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={showDemoNotice}
              className="cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-300"
            >
              Upload Media
            </button>
            <button
              type="button"
              onClick={showDemoNotice}
              className="cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-300"
            >
              Open Library
            </button>
          </div>
        </section>

        {/* CONTENT */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <LoadingSpinner size="lg" variant="neon" />
          </div>
        ) : (
          <>
            <section className="mt-8">
              <h3 className="mb-4 text-base font-bold text-white">Recent Renders</h3>
              {posts.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-gray-900/40 p-8 text-center text-sm text-gray-500">
                  Demo content is being prepared. Check back shortly.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {posts.map((post) => (
                    <DemoMediaCard
                      key={post.id}
                      url={post.mediaUrl}
                      type={post.mediaType}
                      provider={post.mediaProvider}
                      title={post.title}
                    />
                  ))}
                </div>
              )}
            </section>

            {assets.length > 0 && (
              <section className="mt-10">
                <h3 className="mb-4 text-base font-bold text-white">Asset Library</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {assets.map((asset) => (
                    <DemoMediaCard
                      key={asset.id}
                      url={asset.url}
                      type={asset.type}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* BOTTOM CTA */}
        <section className="mt-12 rounded-3xl border border-white/10 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 p-6 text-center sm:p-8">
          <h3 className="text-xl font-black text-white sm:text-2xl">Like what you see?</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-300">
            Create your own cinematic stories, 3DX paths and edits — start in minutes.
          </p>
          <a
            href={SIGN_UP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-block rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 px-7 py-3 text-sm font-black text-white transition hover:from-cyan-400 hover:to-blue-400"
          >
            Sign Up Free
          </a>
        </section>
      </main>
    </div>
  );
}
