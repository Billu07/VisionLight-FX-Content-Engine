import { useEffect, useRef, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import SpinViewer, { type SpinManifest } from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { isSpinPlayerSite, isDriftSite } from "../lib/branding";

/**
 * Public brand showcase — rotation3d.com/{brandSlug}: a grid of all the brand's
 * published spins, each linking to its vanity player URL. Also serves the
 * embeddable group at /embed/showcase/{brandSlug} (embed = no header chrome).
 */

const STUDIO_GRADIENT =
  "radial-gradient(120% 80% at 50% -10%,#1a2336 0%,rgba(17,24,39,0) 55%),linear-gradient(to bottom right,#111827,#0B0F19)";

type P = {
  id: string;
  slug: string;
  name: string;
  defaultFrame?: number;
  background?: string | null;
  manifest?: { frameCount?: number; frames?: string[]; framesMobile?: string[] };
};

// Gallery tiles don't need a product's full 120/180 frames — cap them to ~90
// (evenly subsampled) so a grid of spins stays light. The player page (opened
// on click) still uses the full-density manifest.
const GALLERY_MAX_FRAMES = 90;
const cap = (arr: string[] | undefined, max: number): string[] | undefined => {
  if (!arr || arr.length <= max) return arr;
  const out: string[] = [];
  const step = arr.length / max;
  for (let i = 0; i < max; i++) out.push(arr[Math.floor(i * step)]);
  return out;
};
type Brand = {
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

const galleryMan = (p: P): SpinManifest => {
  const frames = cap(p.manifest?.frames, GALLERY_MAX_FRAMES);
  const framesMobile = cap(p.manifest?.framesMobile, GALLERY_MAX_FRAMES);
  return {
    frameCount: frames?.length || p.manifest?.frameCount || 36,
    frames,
    framesMobile,
    defaultFrame: 0,
  };
};

const posterFor = (p: P): string | undefined => {
  const src = p.manifest?.framesMobile?.length ? p.manifest.framesMobile : p.manifest?.frames;
  if (!src || src.length === 0) return undefined;
  const d = Math.min(src.length - 1, Math.max(0, p.defaultFrame ?? 0));
  return src[d];
};

// Lazy gallery tile: shows a static poster frame instantly (grid feels
// immediate), and only mounts the live SpinViewer — which then loads its
// coarse ring first, per the player's progressive loader — once the tile
// scrolls near the viewport. That keeps a big grid from loading every spin at
// once. Once mounted it stays mounted (no reload thrash on scroll).
function GalleryTile({ p, background }: { p: P; background: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const fsRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const poster = posterFor(p);

  useEffect(() => {
    const el = ref.current;
    if (!el || live) return;
    if (typeof IntersectionObserver === "undefined") { setLive(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { setLive(true); io.disconnect(); }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [live]);

  // Expand this tile's spin to native fullscreen so it can be explored in place.
  // (iOS Safari can't fullscreen a <div>, so the button no-ops there — the tile's
  // name still links to the full player, which has an iOS-safe fullscreen.)
  const toggleFs = () => {
    const el = fsRef.current;
    if (!el) return;
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const anyEl = el as HTMLDivElement & { webkitRequestFullscreen?: () => void };
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen || doc.webkitExitFullscreen)?.call(doc);
    } else {
      (anyEl.requestFullscreen || anyEl.webkitRequestFullscreen)?.call(anyEl);
    }
  };

  return (
    <div ref={ref} className="relative aspect-square" style={{ background }}>
      {poster && (
        <img src={poster} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain" />
      )}
      {live && (
        <div ref={fsRef} className="r3d-gallery-fs absolute inset-0" style={{ background }}>
          <SpinViewer manifest={galleryMan(p)} variant="hero" background={background} />
          <button
            type="button"
            onClick={toggleFs}
            aria-label="Fullscreen"
            title="Fullscreen"
            className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg border border-white/15 bg-black/40 text-white backdrop-blur transition-colors hover:bg-black/60"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-studio-gradient p-6 text-center font-sans text-gray-400">
      {children}
    </div>
  );
}

export default function BrandShowcasePage({ embed = false }: { embed?: boolean }) {
  const { brandSlug } = useParams();
  const [state, setState] = useState<{
    loading: boolean;
    brand?: Brand;
    products?: P[];
    error?: boolean;
  }>({ loading: true });
  const [page, setPage] = useState(0);

  // drift.li serves this same showcase against its own brands/products.
  const drift = isDriftSite();

  useEffect(() => {
    if (!brandSlug) return;
    let alive = true;
    (drift ? apiEndpoints.driftPublicBrand : apiEndpoints.r3dPublicBrand)(brandSlug)
      .then((r) => {
        if (alive) setState({ loading: false, brand: r.data.brand, products: r.data.products || [] });
      })
      .catch(() => {
        if (alive) setState({ loading: false, error: true });
      });
    return () => {
      alive = false;
    };
  }, [brandSlug]);

  if (!isSpinPlayerSite()) return <Navigate to="/" replace />;
  if (state.loading) return <Shell>Loading…</Shell>;
  if (state.error || !state.brand) return <Shell>This page isn't available.</Shell>;

  const brand = state.brand;
  const products = state.products || [];
  // Paginate the grid so a large brand doesn't mount every spin at once (the
  // cause of the load stutter). 6 per page; each tile still lazy-mounts + loads
  // its coarse ring first, so a page settles fast.
  const PAGE_SIZE = 6;
  const pageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageProducts = products.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const goPage = (n: number) => {
    setPage(Math.max(0, Math.min(pageCount - 1, n)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const brandStyle = {
    ...(brand.primaryColor ? { ["--primary-brand" as any]: brand.primaryColor } : {}),
    ...(brand.secondaryColor ? { ["--secondary-brand" as any]: brand.secondaryColor } : {}),
  };

  return (
    <div style={brandStyle} className="min-h-screen overflow-x-hidden bg-studio-gradient font-sans text-white">
      <style>{`
        .r3d-gallery-fs:fullscreen{width:100vw;height:100vh}
        .r3d-gallery-fs:-webkit-full-screen{width:100vw;height:100vh}
      `}</style>
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-8">
        {!embed && (
          <div className="mb-10 flex items-center gap-3">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.name} className="h-10 max-w-[180px] object-contain" />
            ) : (
              <h1 className="text-xl font-bold">{brand.name}</h1>
            )}
          </div>
        )}

        {products.length === 0 ? (
          <p className="py-20 text-center text-sm text-gray-500">No products yet.</p>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {pageProducts.map((p) => (
                <div key={p.id} className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02]">
                  <GalleryTile p={p} background={p.background || STUDIO_GRADIENT} />
                  <div className="flex items-center justify-between border-t border-white/8 px-5 py-4">
                    <Link
                      to={`/${brand.slug}/${p.slug}`}
                      target={embed ? "_blank" : undefined}
                      rel={embed ? "noopener noreferrer" : undefined}
                      className="text-sm font-medium transition-colors hover:text-brand-accent"
                    >
                      {p.name}
                    </Link>
                    <span className="text-xs text-gray-500">{drift ? "Drag to drift" : "Drag to rotate"}</span>
                  </div>
                </div>
              ))}
            </div>

            {pageCount > 1 && (
              <div className="mt-10 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => goPage(safePage - 1)}
                  disabled={safePage === 0}
                  className="rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
                >
                  ← Prev
                </button>
                <span className="text-xs text-gray-400">
                  Page {safePage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => goPage(safePage + 1)}
                  disabled={safePage >= pageCount - 1}
                  className="rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
