import { useEffect, useMemo, useState } from "react";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";

/**
 * drift.li landing — cinematic, motion-first. A large looping hero drift with a
 * minimal wordmark, then a grid of looping tiles. Curated (cross-line) via the
 * superadmin Drift → Landing showcase; falls back to a clean empty hero before
 * anything is curated.
 */

const DRIFT_PRIMARY = "#22d3ee";
const DRIFT_SECONDARY = "#3b82f6";

type Item = {
  itemId: string;
  source: string;
  id: string;
  name: string;
  brandName: string;
  defaultFrame: number;
  background: string | null;
  loopEnabled: boolean;
  manifest: any;
  secondManifest: any;
  isHero: boolean;
};

// Combine clip A + clip B into one circular sequence (matches the player).
const combinedManifest = (it: Item) => {
  const a: string[] = Array.isArray(it.manifest?.frames) ? it.manifest.frames : [];
  const b: string[] = Array.isArray(it.secondManifest?.frames) ? it.secondManifest.frames : [];
  const frames = b.length ? [...a, ...b] : a;
  return { frameCount: frames.length, frames, defaultFrame: 0 };
};

function Tile({ it }: { it: Item }) {
  const manifest = useMemo(() => combinedManifest(it), [it]);
  return (
    <a href={`/p/${it.id}`} className="drift-tile group">
      <div className="drift-tile-stage">
        <SpinViewer
          manifest={manifest}
          variant="hero"
          driftMode
          enableLoop
          background={it.background || undefined}
          primaryColor={DRIFT_PRIMARY}
          secondaryColor={DRIFT_SECONDARY}
          className="drift-tile-viewer"
        />
      </div>
      <div className="drift-tile-meta">
        <span className="drift-tile-name">{it.name}</span>
        {it.brandName && <span className="drift-tile-brand">{it.brandName}</span>}
      </div>
    </a>
  );
}

export default function DriftLanding() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiEndpoints
      .driftPublicLanding()
      .then((r) => alive && setItems(r.data.items || []))
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const hero = items.find((i) => i.isHero) || items[0] || null;
  const tiles = items.filter((i) => i !== hero);
  const heroManifest = hero ? combinedManifest(hero) : null;

  return (
    <div className="drift-root">
      <style>{CSS}</style>

      <header className="drift-header">
        <div className="drift-word">
          drift<span>.li</span>
        </div>
      </header>

      {/* Hero */}
      <section className="drift-hero">
        {hero && heroManifest ? (
          <div className="drift-hero-stage">
            <SpinViewer
              manifest={heroManifest}
              variant="hero"
              driftMode
              enableLoop
              background={hero.background || undefined}
              primaryColor={DRIFT_PRIMARY}
              secondaryColor={DRIFT_SECONDARY}
              className="drift-hero-viewer"
            />
          </div>
        ) : null}
        <div className="drift-hero-scrim" />
        <div className="drift-hero-copy">
          <h1 className="drift-title">
            Drag anything <em>to life</em>
          </h1>
          <p className="drift-sub">Interactive drift paths — real motion you scrub with a finger.</p>
        </div>
        {!loading && !hero && <div className="drift-empty">Nothing showcased yet.</div>}
      </section>

      {/* Grid */}
      {tiles.length > 0 && (
        <section className="drift-grid-wrap">
          <div className="drift-grid">
            {tiles.map((it) => (
              <Tile key={it.itemId} it={it} />
            ))}
          </div>
        </section>
      )}

      <footer className="drift-footer">
        <span>drift.li</span>
        <span>Interactive drift paths</span>
      </footer>
    </div>
  );
}

const CSS = `
.drift-root{min-height:100dvh;background:
  radial-gradient(120% 90% at 50% -10%, #10233a 0%, rgba(4,10,20,0) 55%),
  radial-gradient(80% 60% at 100% 100%, rgba(59,130,246,.10) 0%, rgba(4,10,20,0) 60%),
  linear-gradient(to bottom, #060b14, #04070d);
  color:#e8eef7;font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif;overflow-x:hidden}
.drift-header{position:absolute;top:0;left:0;right:0;z-index:10;display:flex;align-items:center;justify-content:space-between;padding:22px 26px}
.drift-word{font-weight:800;font-size:22px;letter-spacing:-.02em;color:#fff}
.drift-word span{background:linear-gradient(135deg,${DRIFT_PRIMARY},${DRIFT_SECONDARY});-webkit-background-clip:text;background-clip:text;color:transparent}

.drift-hero{position:relative;height:82vh;min-height:520px;display:flex;align-items:flex-end;overflow:hidden}
.drift-hero-stage{position:absolute;inset:0}
.drift-hero-viewer{position:absolute;inset:0}
.drift-hero-scrim{position:absolute;inset:0;pointer-events:none;background:
  radial-gradient(90% 70% at 50% 40%, rgba(4,7,13,0) 40%, rgba(4,7,13,.55) 100%),
  linear-gradient(to top, rgba(4,7,13,.92) 0%, rgba(4,7,13,0) 45%)}
.drift-hero-copy{position:relative;z-index:3;padding:0 26px 8vh;max-width:820px;pointer-events:none}
.drift-title{margin:0;font-size:clamp(34px,6.4vw,76px);line-height:1.02;font-weight:800;letter-spacing:-.03em;color:#fff}
.drift-title em{font-style:normal;background:linear-gradient(135deg,${DRIFT_PRIMARY},${DRIFT_SECONDARY});-webkit-background-clip:text;background-clip:text;color:transparent}
.drift-sub{margin:18px 0 0;font-size:clamp(14px,1.7vw,18px);color:#9fb2c9;max-width:40ch}
.drift-empty{position:absolute;left:26px;bottom:8vh;z-index:3;color:#6b7c93;font-size:13px}

.drift-grid-wrap{padding:min(9vw,110px) 26px 40px}
.drift-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;max-width:1240px;margin:0 auto}
.drift-tile{display:block;text-decoration:none;color:inherit;border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.02);transition:transform .35s cubic-bezier(.2,.7,.2,1),border-color .35s,box-shadow .35s}
.drift-tile:hover{transform:translateY(-4px);border-color:rgba(34,211,238,.4);box-shadow:0 24px 60px -30px rgba(34,211,238,.5)}
.drift-tile-stage{position:relative;aspect-ratio:4/3;overflow:hidden;background:linear-gradient(180deg,#0a1524,#060b14)}
.drift-tile-viewer{position:absolute;inset:0}
.drift-tile-viewer .r3d-hint{display:none!important}
.drift-tile-meta{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:13px 15px 15px}
.drift-tile-name{font-weight:600;font-size:14px;color:#eaf1fa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drift-tile-brand{font-size:11px;color:#7286a0;white-space:nowrap}

.drift-footer{display:flex;align-items:center;justify-content:space-between;padding:26px;border-top:1px solid rgba(255,255,255,.06);color:#5f7089;font-size:12px;letter-spacing:.04em}
@media (max-width:560px){.drift-hero{height:74vh}.drift-hero-copy{padding-bottom:12vh}}
`;
