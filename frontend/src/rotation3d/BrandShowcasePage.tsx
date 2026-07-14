import { useEffect, useRef, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import SpinViewer, { type SpinManifest } from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { isRotation3dSite } from "../lib/branding";

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

  return (
    <div ref={ref} className="relative aspect-square" style={{ background }}>
      {poster && (
        <img src={poster} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain" />
      )}
      {live && (
        <div className="absolute inset-0">
          <SpinViewer manifest={galleryMan(p)} variant="hero" background={background} />
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

  useEffect(() => {
    if (!brandSlug) return;
    let alive = true;
    apiEndpoints
      .r3dPublicBrand(brandSlug)
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

  if (!isRotation3dSite()) return <Navigate to="/" replace />;
  if (state.loading) return <Shell>Loading…</Shell>;
  if (state.error || !state.brand) return <Shell>This page isn't available.</Shell>;

  const brand = state.brand;
  const products = state.products || [];
  const brandStyle = {
    ...(brand.primaryColor ? { ["--primary-brand" as any]: brand.primaryColor } : {}),
    ...(brand.secondaryColor ? { ["--secondary-brand" as any]: brand.secondaryColor } : {}),
  };

  return (
    <div style={brandStyle} className="min-h-screen overflow-x-hidden bg-studio-gradient font-sans text-white">
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
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
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
                  <span className="text-xs text-gray-500">Drag to rotate</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
