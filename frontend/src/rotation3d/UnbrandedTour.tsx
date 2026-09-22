import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import SpinViewer from "./SpinViewer";
import { apiEndpoints } from "../lib/api";
import { combinedFrameSets, warmFrames } from "./driftNav";
import { newViewKey, type AttentionTarget } from "./attention";

/**
 * An unbranded (MLS-safe) tour: drift.li/u/{code}. The tour's menu and drifts with no page
 * name, logo, contact or enquiry buttons, on one neutral address (?d= picks the drift) —
 * real-estate listing services accept these where branded tour links aren't allowed.
 * The player stays mounted drift to drift (the same smooth swap as a branded tour) and
 * the next drift is fetched and warmed ahead.
 */

type Summary = {
  title: string;
  description: string | null;
  thumb: string | null;
  steps: { index: number; name: string; thumb: string | null }[];
};

const toCta = (c: any) =>
  c && typeof c === "object" && c.label && c.url ? { label: String(c.label), url: String(c.url) } : undefined;

const UB_CSS = `
.ub{min-height:100dvh;padding:0 16px;background:radial-gradient(120% 70% at 50% -10%,#1a2336 0%,rgba(17,24,39,0) 55%),#0b0f19;color:#eef1f6;font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif}
.ub-main{max-width:560px;margin:0 auto;padding:28px 0 48px;display:grid;gap:14px}
.ub-cover{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:18px;display:block;background:#111827}
.ub-kicker{font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#22d3ee}
.ub h1{margin:0;font-size:clamp(26px,6vw,36px);line-height:1.08;letter-spacing:-.02em}
.ub-desc{margin:0;color:#aab4c3;font-size:15px;line-height:1.5}
.ub-start{appearance:none;border:0;border-radius:14px;padding:14px 18px;background:#22d3ee;color:#04121a;font:inherit;font-size:16px;font-weight:800;cursor:pointer}
.ub-start:focus-visible,.ub-item:focus-visible{outline:2px solid #fff;outline-offset:2px}
.ub-list{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:8px}
.ub-item{appearance:none;width:100%;display:flex;align-items:center;gap:12px;padding:8px 12px 8px 8px;border-radius:14px;border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.04);color:inherit;font:inherit;text-align:left;cursor:pointer}
.ub-item:hover{background:rgba(255,255,255,.08)}
.ub-thumb{width:64px;height:48px;border-radius:10px;overflow:hidden;background:#111827;flex:none}
.ub-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.ub-n{font-size:12px;font-weight:800;color:#64748b;min-width:18px;text-align:center}
.ub-name{flex:1;min-width:0;font-size:15px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ub-go{color:#64748b;font-size:20px}
.ub-foot{margin:6px 0 0;color:#64748b;font-size:13px;text-align:center}
.ub-state{min-height:100dvh;display:grid;place-items:center;text-align:center;padding:24px;background:#0b0f19;color:#aab4c3;font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif}
@keyframes ubspin{to{transform:rotate(360deg)}}
.ub-spin{width:44px;height:44px;border-radius:50%;border:4px solid rgba(255,255,255,.1);border-top-color:#22d3ee;animation:ubspin .9s linear infinite}
`;

export default function UnbrandedTour() {
  const { code = "" } = useParams();
  const [search, setSearch] = useSearchParams();
  const d = search.get("d");
  const index = d !== null && /^\d+$/.test(d) ? Number(d) : null;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [missing, setMissing] = useState(false);
  const [product, setProduct] = useState<any>(null);
  const cache = useRef(new Map<number, Promise<any>>());

  useEffect(() => {
    let alive = true;
    cache.current.clear();
    apiEndpoints
      .driftUnbrandedTour(code)
      .then((r) => alive && setSummary(r.data.tour))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [code]);

  const loadDrift = (i: number): Promise<any> => {
    let hit = cache.current.get(i);
    if (!hit) {
      hit = apiEndpoints.driftUnbrandedDrift(code, i).then((r) => r.data.product);
      hit.catch(() => cache.current.delete(i));
      cache.current.set(i, hit);
    }
    return hit;
  };

  useEffect(() => {
    if (index === null) return;
    let alive = true;
    loadDrift(index)
      .then((p) => {
        if (!alive) return;
        setProduct(p);
        if (p?.id) apiEndpoints.driftTrackEvent(p.id, "VIEW", { unbranded: true }).catch(() => undefined);
        // The likeliest next tap: fetch the next drift and warm its frames now.
        const total = p?.flow?.stops?.length || 0;
        if (total > 1) {
          loadDrift((index + 1) % total)
            .then((n) => warmFrames(n))
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (alive) setSearch({}, { replace: true }); // that drift is gone — back to the menu
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, index]);

  // Tour links inside the player (Home, the next drift, the stop dots) all point at /u/{code}.
  const go = (url: string): boolean => {
    try {
      const u = new URL(url, window.location.origin);
      if (u.origin !== window.location.origin || u.pathname.replace(/\/+$/, "") !== `/u/${code}`) return false;
      const next = u.searchParams.get("d");
      setSearch(next !== null ? { d: next } : {});
      return true;
    } catch {
      return false;
    }
  };

  const view = useMemo(() => {
    if (!product) return null;
    const p = product;
    const m = p.manifest || {};
    const sets = combinedFrameSets(p, true);
    const framesB: string[] = p.secondManifest && Array.isArray(p.secondManifest.frames) ? p.secondManifest.frames : [];
    const manifest = {
      frameCount: sets.frames.length || m.frameCount || 0,
      frames: sets.frames,
      ...(sets.framesMobile ? { framesMobile: sets.framesMobile } : {}),
      defaultFrame: p.defaultFrame ?? m.defaultFrame ?? 0,
    };
    const pins = !framesB.length && Array.isArray(p.pins) && p.pins.length ? p.pins : undefined;
    return { p, manifest, captions: framesB.length ? undefined : p.captions, pins, pinTrack: pins ? p.pinTrack ?? null : null };
  }, [product]);

  // Tour Insights: unbranded visits count too (marked as such).
  const attention = useMemo<AttentionTarget | null>(
    () => (product?.id && product?.flow ? { productId: String(product.id), key: newViewKey(), unbranded: true } : null),
    [product],
  );

  if (missing) {
    return (
      <div className="ub-state">
        <style>{UB_CSS}</style>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#eef1f6", marginBottom: 6 }}>This Tour Isn't Available</div>
          <div>The Link May Have Changed, or the Tour Is No Longer Online.</div>
        </div>
      </div>
    );
  }

  if (index === null) {
    if (!summary) {
      return (
        <div className="ub-state">
          <style>{UB_CSS}</style>
          <div className="ub-spin" aria-label="Loading" />
        </div>
      );
    }
    return (
      <div className="ub">
        <style>{UB_CSS}</style>
        <main className="ub-main">
          {summary.thumb && <img className="ub-cover" src={summary.thumb} alt="" />}
          <div className="ub-kicker">Interactive Tour</div>
          <h1>{summary.title}</h1>
          {summary.description && <p className="ub-desc">{summary.description}</p>}
          {summary.steps.length > 0 && (
            <button type="button" className="ub-start" onClick={() => setSearch({ d: "0" })}>
              ▶ Start Tour
            </button>
          )}
          <ol className="ub-list">
            {summary.steps.map((s) => (
              <li key={s.index}>
                <button type="button" className="ub-item" onClick={() => setSearch({ d: String(s.index) })}>
                  <span className="ub-n">{s.index + 1}</span>
                  <span className="ub-thumb">{s.thumb ? <img src={s.thumb} alt="" loading="lazy" decoding="async" /> : null}</span>
                  <span className="ub-name">{s.name}</span>
                  <span className="ub-go" aria-hidden>
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="ub-foot">Drag Across Each View to Look Around.</p>
        </main>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="ub-state">
        <style>{UB_CSS}</style>
        <div className="ub-spin" aria-label="Loading" />
      </div>
    );
  }

  const p = view.p;
  return (
    <SpinViewer
      manifest={view.manifest}
      brandName=""
      productName={p.name || "Drift"}
      title={p.title}
      description={p.description}
      titleEnd={p.titleEnd}
      descriptionEnd={p.descriptionEnd}
      helperStart={p.helperStart}
      helperEnd={p.helperEnd}
      loopScrub={p.loopEnabled ?? false}
      driftDirection={p.driftDirection}
      driftMode
      captions={view.captions}
      pins={view.pins}
      pinTrack={view.pinTrack}
      attention={attention}
      background={p.background}
      showBrand={false}
      showLogo={false}
      showName={!p.hideName}
      showTitle={!p.hideTitle}
      mobileZoom={!!p.mobileZoom}
      introHint
      ctaPrimary={toCta(p.ctaPrimary)}
      ctaSecondary={toCta(p.ctaSecondary)}
      ctaPlacement={p.ctaPlacement}
      uniformSize={!!p.inFlow}
      flowNav={p.flow || undefined}
      productId={p.id}
      onInternalNavigate={go}
    />
  );
}
