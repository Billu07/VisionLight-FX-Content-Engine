import { useEffect, useRef, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import BrandProductEditModal from "./BrandProductEditModal";
import Rotation3DBrandDashboard from "./Rotation3DBrandDashboard";
import { DriftThemeStyles, useDriftTheme } from "./driftUiTheme";

/**
 * Team (SuperAdmin) console for Rotation3D — lives inside SuperAdminDashboard as
 * the "rotation3d" tab. Create a brand, then upload the rendered rotation video
 * per product; the backend pipeline turns it into a live spin on rotation3d.com.
 * Isolated component so the giant SuperAdminDashboard only gains a tiny hook.
 */

type Brand = { id: string; name: string; isActive: boolean; _count?: { rot3dProducts: number } };
type Product = {
  id: string;
  name: string;
  slug: string;
  status: string;
  title?: string | null;
  description?: string | null;
  defaultFrame?: number;
  ctaPrimary?: { label?: string; url?: string } | null;
  ctaSecondary?: { label?: string; url?: string } | null;
  spin?: { frameCount: number; status: string } | null;
  _count?: { sourceImages: number; videos: number };
};

const PLAYER_ORIGIN = "https://rotation3d.com";

const statusPill = (s: string) =>
  s === "PUBLISHED"
    ? "ok"
    : s === "READY"
      ? "accent"
      : s === "PROCESSING"
        ? "warn"
        : s === "FAILED"
          ? "err"
          : "";

// Scoped extras on top of the shared .d-* design system (driftUiTheme).
const R3_STYLES = `
.r3-form{display:grid;gap:8px;margin-top:14px}
.r3-block{width:100%}
.r3-center{display:grid;place-items:center;padding:24px 8px}
.r3-small{font-size:11.5px}
.r3-grid{display:grid;gap:10px;margin-top:14px;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr))}
.d-tile.r3-featured{border-color:var(--accent-border);background:var(--accent-soft)}
.r3-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.r3-cred{display:grid;gap:6px;margin-top:12px;padding:12px 14px;border-radius:var(--radius-sm);border:1px solid var(--ok-border);background:var(--ok-soft);font-size:12.5px;color:var(--text)}
.r3-cred b{color:var(--ok)}
.r3-cred p{margin:0}
.r3-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;overflow-wrap:anywhere}
.r3-warn{color:var(--warn);font-size:11.5px}
.r3-brands{margin-top:10px}
.r3-brand{display:flex;align-items:center;gap:4px;min-width:0;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-2);transition:border-color .16s,background .16s}
.r3-brand:hover{border-color:var(--border-strong);background:var(--surface-3)}
.r3-brand.active{border-color:var(--accent-border);background:var(--accent-soft)}
.r3-brand-main{appearance:none;flex:1;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 4px 10px 12px;background:transparent;border:0;color:var(--text);cursor:pointer;font-family:inherit;text-align:left}
.r3-box{padding:14px 16px;margin-top:14px}
.r3-box .d-note{margin:2px 0 0}
.r3-slug{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:10px}
.r3-slug .d-input{width:180px;padding:7px 10px;font-size:13px}
.r3-src{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.r3-src a{display:block;width:64px;height:64px;border-radius:10px;overflow:hidden;border:1px solid var(--border);background:var(--surface-3);transition:transform .16s}
.r3-src a:hover{transform:scale(1.04)}
.r3-src img{width:100%;height:100%;object-fit:cover;display:block}
.r3-upload{display:grid;gap:10px;margin-top:10px}
@media(min-width:640px){.r3-upload{grid-template-columns:minmax(0,1fr) minmax(0,auto);align-items:center}}
.r3-inline{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted)}
.r3-progress{display:grid;gap:6px;margin-top:12px}
.r3-filters{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.r3-filters .d-input{flex:1 1 180px;width:auto}
.r3-switch{appearance:none;position:relative;flex:none;width:44px;height:26px;border-radius:999px;border:1px solid var(--border-strong);background:var(--surface-3);cursor:pointer;transition:background .16s,border-color .16s}
.r3-switch::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .18s}
.r3-switch[aria-pressed="true"]{background:var(--accent);border-color:transparent}
.r3-switch[aria-pressed="true"]::after{transform:translateX(18px)}
.r3-switch:disabled{opacity:.5;cursor:not-allowed}
@media(prefers-reduced-motion:reduce){.r3-switch::after,.r3-src a{transition:none}}
`;

function ShowcasePanel() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiEndpoints.r3dAllProducts();
      setProducts(r.data.products || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const toggle = async (p: any, field: "featured" | "heroFeatured") => {
    setBusyId(p.id);
    try {
      const next = !p[field];
      await apiEndpoints.r3dSetFeatured(p.id, { [field]: next });
      if (field === "heroFeatured" && next) {
        await load(); // single hero — reflect others being cleared
      } else {
        setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, [field]: next } : x)));
      }
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  const heroCount = products.filter((p) => p.heroFeatured).length;
  const showcaseCount = products.filter((p) => p.featured).length;

  return (
    <div className="d-card d-card-pad">
      <div className="d-head">
        <div>
          <div className="d-h2">Homepage showcase</div>
          <p className="d-sub">
            Pick the homepage spins — {heroCount} hero, {showcaseCount} in showcase.
          </p>
        </div>
        <button type="button" className="d-btn ghost sm" onClick={load}>
          ↻ Refresh
        </button>
      </div>

      {loading ? (
        <div className="r3-center">
          <LoadingSpinner size="sm" />
        </div>
      ) : products.length === 0 ? (
        <div className="d-empty" style={{ marginTop: 14 }}>
          No ready products yet. Featured picks come from READY/PUBLISHED spins.
        </div>
      ) : (
        <div className="r3-grid">
          {products.map((p) => (
            <div key={p.id} className={`d-tile ${p.heroFeatured ? "is-hero" : p.featured ? "r3-featured" : ""}`}>
              <div className="d-tile-top">
                <div className="d-thumb lg">
                  {p.thumb ? <img src={p.thumb} alt="" /> : <span>no preview</span>}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="d-name">{p.name}</div>
                  <div className="d-meta">
                    {p.brandName && <span>{p.brandName}</span>}
                    <span className={`d-pill ${statusPill(p.status)}`}>{p.status}</span>
                  </div>
                </div>
              </div>
              <div className="r3-two">
                <button
                  type="button"
                  onClick={() => toggle(p, "heroFeatured")}
                  disabled={busyId === p.id}
                  className={`d-btn sm ${p.heroFeatured ? "warn" : ""}`}
                >
                  {p.heroFeatured ? "★ Hero" : "Hero"}
                </button>
                <button
                  type="button"
                  onClick={() => toggle(p, "featured")}
                  disabled={busyId === p.id}
                  className={`d-btn sm ${p.featured ? "soft" : ""}`}
                >
                  {p.featured ? "✓ Showcase" : "Showcase"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Experimental feature toggles for the Rotation3D player (global, off by default).
function LabPanel() {
  const [stills, setStills] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiEndpoints
      .r3dGetLab()
      .then((r) => setStills(!!r.data.stills))
      .catch(() => setStills(false));
  }, []);

  const toggle = async () => {
    if (stills === null) return;
    setSaving(true);
    try {
      const r = await apiEndpoints.r3dSetLab(!stills);
      setStills(!!r.data.stills);
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="d-card d-card-pad">
      <div className="d-h2">Lab — experimental</div>
      <p className="d-sub">
        Experimental player features, off by default. Changes apply to all published players.
      </p>
      <div className="d-row" style={{ marginTop: 14 }}>
        <div className="d-row-main">
          <div className="d-name">Player view selector (stills)</div>
          <p className="d-note" style={{ marginTop: 4 }}>
            Thumbnail boxes under the product — interactive 360° + 4 stills from different angles.
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={stills === null || saving}
          aria-pressed={!!stills}
          aria-label="Player view selector (stills)"
          className="r3-switch"
        />
      </div>
    </div>
  );
}

export default function Rotation3DAdminPanel() {
  // The theme toggle lives in the superadmin panel's top bar (shared theme state).
  const [theme] = useDriftTheme();
  const [mode, setMode] = useState<"brands" | "showcase" | "lab">("brands");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [newBrand, setNewBrand] = useState("");
  const [newBrandEmail, setNewBrandEmail] = useState("");
  const [newBrandAdminName, setNewBrandAdminName] = useState("");
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [credential, setCredential] = useState<{
    email: string;
    tempPassword?: string;
    reused?: boolean;
  } | null>(null);

  const [selected, setSelected] = useState<Brand | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [sourceImages, setSourceImages] = useState<any[]>([]);
  const [brandSlug, setBrandSlug] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugMsg, setSlugMsg] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [brandView, setBrandView] = useState(false);
  // Search/filter for the brand list + the selected brand's product list.
  const [brandQuery, setBrandQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productStatus, setProductStatus] = useState("ALL");

  const [downloadingZip, setDownloadingZip] = useState(false);
  const downloadSourceZip = async (brand: Brand) => {
    setDownloadingZip(true);
    try {
      const res = await apiEndpoints.r3dBrandSourceImagesZip(brand.id);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${brand.name.replace(/[^a-z0-9-_]+/gi, "-") || "brand"}-source-images.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to download ZIP" });
    } finally {
      setDownloadingZip(false);
    }
  };

  const copyProductLink = async (p: Product) => {
    const link =
      brandSlug && p.slug
        ? `${PLAYER_ORIGIN}/${brandSlug}/${p.slug}`
        : `${PLAYER_ORIGIN}/p/${p.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(p.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const [productName, setProductName] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [frames, setFrames] = useState(60);
  const [bgMode, setBgMode] = useState("keep");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBrands = async () => {
    setLoadingBrands(true);
    try {
      const res = await apiEndpoints.r3dListBrands();
      setBrands(res.data.brands || []);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to load brands" });
    } finally {
      setLoadingBrands(false);
    }
  };

  useEffect(() => {
    void loadBrands();
  }, []);

  const loadProducts = async (brand: Brand, silent = false) => {
    setSelected(brand);
    if (!silent) {
      setLoadingProducts(true);
      setProducts([]);
      setSourceImages([]);
      apiEndpoints
        .r3dBrandSourceImages(brand.id)
        .then((r) => setSourceImages(r.data.images || []))
        .catch(() => setSourceImages([]));
    }
    try {
      const res = await apiEndpoints.r3dBrandProducts(brand.id);
      setProducts(res.data.products || []);
      const bs = res.data.brandSlug || null;
      setBrandSlug(bs);
      if (!silent) {
        setSlugDraft(bs || "");
        setSlugMsg("");
      }
    } catch (e: any) {
      if (!silent) setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to load products" });
    } finally {
      if (!silent) setLoadingProducts(false);
    }
  };

  const saveBrandSlug = async () => {
    if (!selected || !slugDraft.trim()) return;
    setSavingSlug(true);
    setSlugMsg("");
    try {
      const res = await apiEndpoints.r3dSetBrandSlug(selected.id, slugDraft);
      setBrandSlug(res.data.slug);
      setSlugDraft(res.data.slug);
      setSlugMsg("Saved");
    } catch (e: any) {
      setSlugMsg(e?.response?.data?.error || "Failed");
    } finally {
      setSavingSlug(false);
    }
  };

  const backfillSlugs = async () => {
    setBackfilling(true);
    try {
      const res = await apiEndpoints.r3dBackfillSlugs();
      setMsg({ kind: "ok", text: `Generated ${res.data.updated} brand link(s).` });
      if (selected) await loadProducts(selected);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Backfill failed" });
    } finally {
      setBackfilling(false);
    }
  };

  // While anything is PROCESSING, quietly poll so it flips to READY/FAILED live.
  useEffect(() => {
    if (!selected || !products.some((p) => p.status === "PROCESSING")) return;
    const t = setInterval(() => void loadProducts(selected, true), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, selected]);

  const deleteProduct = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"? This removes its spin and can't be undone.`)) return;
    try {
      await apiEndpoints.r3dDeleteProduct(p.id);
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to delete product" });
    }
  };

  const deleteBrand = async (b: Brand) => {
    if (!window.confirm(`Delete "${b.name}" and all of its products? This cannot be undone.`)) return;
    try {
      await apiEndpoints.r3dDeleteBrand(b.id);
      if (selected?.id === b.id) {
        setSelected(null);
        setProducts([]);
        setSourceImages([]);
      }
      await loadBrands();
      setMsg({ kind: "ok", text: `Deleted "${b.name}".` });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to delete brand" });
    }
  };

  const createBrand = async () => {
    const name = newBrand.trim();
    if (!name) return;
    setCreatingBrand(true);
    setMsg(null);
    setCredential(null);
    try {
      const res = await apiEndpoints.r3dCreateBrand(
        name,
        newBrandEmail.trim() || undefined,
        newBrandAdminName.trim() || undefined,
      );
      setNewBrand("");
      setNewBrandEmail("");
      setNewBrandAdminName("");
      await loadBrands();
      if (res.data.admin) {
        setCredential(res.data.admin);
      } else if (res.data.adminError) {
        setMsg({ kind: "err", text: `Brand created, but admin login failed: ${res.data.adminError}` });
      } else {
        setMsg({ kind: "ok", text: `Brand "${name}" created.` });
      }
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to create brand" });
    } finally {
      setCreatingBrand(false);
    }
  };

  const uploadVideo = async () => {
    if (!selected || !videoFile || !productName.trim()) return;
    setMsg(null);
    setUploadPct(0);
    setProcessing(false);
    const fd = new FormData();
    fd.append("video", videoFile);
    fd.append("name", productName.trim());
    fd.append("frameCount", String(frames));
    fd.append("bgMode", bgMode);
    try {
      await apiEndpoints.r3dUploadProductVideo(selected.id, fd, {
        onUploadProgress: (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadPct(pct);
            if (pct >= 100) setProcessing(true); // server now extracting frames
          }
        },
      });
      setMsg({ kind: "ok", text: `"${productName.trim()}" uploaded — building the spin…` });
      setProductName("");
      setVideoFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await loadProducts(selected);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Upload / processing failed" });
    } finally {
      setUploadPct(null);
      setProcessing(false);
    }
  };

  const busy = uploadPct !== null;
  const bq = brandQuery.trim().toLowerCase();
  const visibleBrands = bq ? brands.filter((b) => b.name.toLowerCase().includes(bq)) : brands;
  const pq = productQuery.trim().toLowerCase();
  const visibleProducts = products.filter(
    (p) =>
      (productStatus === "ALL" || p.status === productStatus) &&
      (!pq || p.name.toLowerCase().includes(pq)),
  );

  return (
    <div className="drift-ui d-embed d-rise" data-theme={theme}>
      <DriftThemeStyles />
      <style>{R3_STYLES}</style>

      <div className="d-head" style={{ marginBottom: 16 }}>
        <div className="d-tabs" role="tablist" aria-label="Rotation3D console">
          {(["brands", "showcase", "lab"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`d-tab ${mode === m ? "active" : ""}`}
            >
              {m === "brands" ? "Brands" : m === "showcase" ? "Homepage showcase" : "Lab"}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className={`d-banner ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 16 }}>
          <span>{msg.text}</span>
          <button type="button" className="d-x" onClick={() => setMsg(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {mode === "lab" ? (
        <LabPanel />
      ) : mode === "showcase" ? (
        <ShowcasePanel />
      ) : (
        <div className={`d-split ${selected ? "has-detail" : ""}`}>
          {/* Brands column */}
          <div className="d-split-side d-card d-card-pad">
            <div className="d-h2">Brands</div>
            <p className="d-sub">Each brand is a managed Rotation3D org.</p>

            <div className="r3-form">
              <input
                className="d-input"
                placeholder="New brand name"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
              />
              <input
                className="d-input"
                placeholder="Brand admin email (optional — creates a login)"
                value={newBrandEmail}
                onChange={(e) => setNewBrandEmail(e.target.value)}
              />
              <input
                className="d-input"
                placeholder="Admin name (optional)"
                value={newBrandAdminName}
                onChange={(e) => setNewBrandAdminName(e.target.value)}
              />
              <button
                type="button"
                className="d-btn primary r3-block"
                onClick={createBrand}
                disabled={creatingBrand || !newBrand.trim()}
              >
                {creatingBrand ? "Creating…" : "Create brand"}
              </button>
            </div>

            {credential && (
              <div className="r3-cred">
                <div className="d-head">
                  <b>Brand admin login</b>
                  <button type="button" className="d-x" onClick={() => setCredential(null)} aria-label="Dismiss">
                    ×
                  </button>
                </div>
                {credential.reused ? (
                  <p>
                    <span className="r3-mono">{credential.email}</span> already has an account — they
                    log in with their existing password.
                  </p>
                ) : (
                  <>
                    <div>
                      Email: <span className="r3-mono">{credential.email}</span>
                    </div>
                    <div>
                      Password: <span className="r3-mono">{credential.tempPassword}</span>
                    </div>
                    <div className="r3-warn">Shown once — copy and forward to the brand now.</div>
                    <div className="d-actions">
                      <button
                        type="button"
                        className="d-btn sm"
                        onClick={() =>
                          navigator.clipboard.writeText(
                            `Login: https://rotation3d.com\nEmail: ${credential.email}\nPassword: ${credential.tempPassword}`,
                          )
                        }
                      >
                        Copy credentials
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {brands.length > 0 && (
              <button
                type="button"
                onClick={backfillSlugs}
                disabled={backfilling}
                className="d-btn sm r3-block"
                style={{ marginTop: 12 }}
                title="Assign vanity links to brands that don't have one yet"
              >
                {backfilling ? "Generating…" : "Generate missing brand links"}
              </button>
            )}

            {brands.length > 0 && (
              <input
                className="d-input"
                style={{ marginTop: 12 }}
                placeholder="Search brands…"
                value={brandQuery}
                onChange={(e) => setBrandQuery(e.target.value)}
              />
            )}
            <div className="d-list r3-brands">
              {loadingBrands ? (
                <div className="r3-center">
                  <LoadingSpinner size="sm" />
                </div>
              ) : brands.length === 0 ? (
                <div className="r3-center d-faint r3-small">No brands yet.</div>
              ) : visibleBrands.length === 0 ? (
                <div className="r3-center d-faint r3-small">No brands match “{brandQuery}”.</div>
              ) : (
                visibleBrands.map((b) => (
                  <div key={b.id} className={`r3-brand ${selected?.id === b.id ? "active" : ""}`}>
                    <button type="button" onClick={() => loadProducts(b)} className="r3-brand-main">
                      <span className="d-name">{b.name}</span>
                      <span className="d-faint r3-small">{b._count?.rot3dProducts ?? 0} products</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBrand(b)}
                      title="Delete brand"
                      aria-label={`Delete ${b.name}`}
                      className="d-x"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Products / upload column */}
          <div className="d-card d-card-pad">
            {!selected ? (
              <div className="d-empty">Select a brand to manage its products.</div>
            ) : (
              <>
                <button type="button" className="d-btn ghost sm d-mobile-back" onClick={() => setSelected(null)}>
                  ← All brands
                </button>
                <div className="d-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="d-eyebrow">Brand</div>
                    <div className="d-h1">{selected.name}</div>
                  </div>
                  <div className="d-actions">
                    <div className="d-tabs" role="tablist" aria-label="Brand view">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={!brandView}
                        onClick={() => setBrandView(false)}
                        className={`d-tab ${!brandView ? "active" : ""}`}
                      >
                        Team tools
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={brandView}
                        onClick={() => setBrandView(true)}
                        className={`d-tab ${brandView ? "active" : ""}`}
                      >
                        Brand dashboard
                      </button>
                    </div>
                    <button type="button" className="d-btn ghost sm" onClick={() => loadProducts(selected)}>
                      ↻ Refresh
                    </button>
                  </div>
                </div>

                {brandView ? (
                  // The brand's own (rotation3d.com) dashboard keeps its dark look.
                  <div className="sa-legacy" style={{ marginTop: 16 }}>
                    <Rotation3DBrandDashboard adminOrgId={selected.id} />
                  </div>
                ) : (
                  <>
                    {/* Brand vanity link (rotation3d.com/{slug}) */}
                    <div className="d-hair r3-box">
                      <div className="d-label">Brand link</div>
                      <p className="d-note">Public showcase &amp; the base of every product URL.</p>
                      <div className="r3-slug">
                        <span className="d-code">rotation3d.com/</span>
                        <input
                          className="d-input"
                          placeholder="brand-name"
                          value={slugDraft}
                          onChange={(e) => setSlugDraft(e.target.value)}
                        />
                        <button type="button" className="d-btn sm" onClick={saveBrandSlug} disabled={savingSlug}>
                          {savingSlug ? "Saving…" : "Save"}
                        </button>
                        {brandSlug && (
                          <a
                            className="d-btn sm ghost"
                            href={`https://rotation3d.com/${brandSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open ↗
                          </a>
                        )}
                        {slugMsg && <span className="d-faint r3-small">{slugMsg}</span>}
                      </div>
                    </div>

                    {/* Images the brand sent in */}
                    {sourceImages.length > 0 && (
                      <div className="d-hair r3-box">
                        <div className="d-head">
                          <div className="d-label" style={{ margin: 0 }}>
                            Images sent by the brand ({sourceImages.length})
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadSourceZip(selected)}
                            disabled={downloadingZip}
                            className="d-btn sm soft"
                          >
                            {downloadingZip ? "Zipping…" : "⬇ Download all (ZIP)"}
                          </button>
                        </div>
                        <p className="d-note">
                          Raw product photos to build spins from. Click a thumb to open one, or grab
                          them all as a ZIP.
                        </p>
                        <div className="r3-src">
                          {sourceImages.map((img) => (
                            <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" title="Open / download">
                              <img src={img.url} alt="" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Upload rendered video */}
                    <div className="d-hair r3-box">
                      <div className="d-label">Upload rendered rotation video</div>
                      <div className="r3-upload">
                        <input
                          className="d-input"
                          placeholder="Product name (e.g. Air Max 90)"
                          value={productName}
                          onChange={(e) => setProductName(e.target.value)}
                          disabled={busy}
                        />
                        <input
                          ref={fileRef}
                          type="file"
                          accept="video/*"
                          onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                          disabled={busy}
                          className="d-file"
                        />
                      </div>
                      <div className="d-actions" style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          className="d-btn primary"
                          onClick={uploadVideo}
                          disabled={busy || !videoFile || !productName.trim()}
                        >
                          {busy ? "Working…" : "Upload & build spin"}
                        </button>
                        <label className="r3-inline">
                          Smoothness
                          <select
                            value={frames}
                            onChange={(e) => setFrames(Number(e.target.value))}
                            disabled={busy}
                            className="d-select sm"
                          >
                            <option value={36}>36 frames · light</option>
                            <option value={48}>48 frames</option>
                            <option value={60}>60 frames · smooth</option>
                            <option value={72}>72 frames</option>
                            <option value={90}>90 frames · very smooth</option>
                            <option value={120}>120 frames · ultra</option>
                            <option value={180}>180 frames · max</option>
                          </select>
                        </label>
                        <label className="r3-inline">
                          Background
                          <select
                            value={bgMode}
                            onChange={(e) => setBgMode(e.target.value)}
                            disabled={busy}
                            className="d-select sm"
                          >
                            <option value="keep">Keep bg (auto-match)</option>
                            <option value="remove-white">Remove white bg · free</option>
                            <option value="remove-black">Remove black bg · free</option>
                            <option value="ai">AI cutout · paid</option>
                          </select>
                        </label>
                      </div>
                      {uploadPct !== null && (
                        <div className="r3-progress">
                          <div className="d-progress">
                            <i style={{ width: `${processing ? 100 : uploadPct}%` }} />
                          </div>
                          <span className="d-faint r3-small">
                            {processing ? "Extracting frames…" : `Uploading ${uploadPct}%`}
                          </span>
                        </div>
                      )}
                      <p className="d-note" style={{ marginTop: 10 }}>
                        A short single-rotation clip works best. "Remove white/black" keys out a
                        solid backdrop for <b>free</b> so the product floats; "AI cutout" is paid but
                        handles any background; "Keep" leaves it opaque and the player background
                        auto-matches the video's backdrop. More frames = smoother spin.
                      </p>
                    </div>

                    {/* Products list */}
                    {products.length > 0 && (
                      <div className="r3-filters">
                        <input
                          className="d-input"
                          placeholder="Search products…"
                          value={productQuery}
                          onChange={(e) => setProductQuery(e.target.value)}
                        />
                        <select
                          value={productStatus}
                          onChange={(e) => setProductStatus(e.target.value)}
                          className="d-select sm"
                        >
                          {["ALL", "PUBLISHED", "READY", "PROCESSING", "FAILED"].map((s) => (
                            <option key={s} value={s}>
                              {s === "ALL" ? "All statuses" : s}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="d-list" style={{ marginTop: 12 }}>
                      {loadingProducts ? (
                        <div className="r3-center">
                          <LoadingSpinner size="sm" />
                        </div>
                      ) : products.length === 0 ? (
                        <div className="d-empty">No products yet.</div>
                      ) : visibleProducts.length === 0 ? (
                        <div className="d-empty">No products match your filters.</div>
                      ) : (
                        visibleProducts.map((p) => (
                          <div key={p.id} className="d-row">
                            <div className="d-row-main">
                              <div className="d-name">{p.name}</div>
                              <div className="d-meta">
                                <span className={`d-pill ${statusPill(p.status)}`}>{p.status}</span>
                                {p.spin ? <span>{p.spin.frameCount} frames</span> : null}
                              </div>
                            </div>
                            <div className="d-actions">
                              <button type="button" onClick={() => setEditingProduct(p)} className="d-btn sm">
                                Edit
                              </button>
                              {(p.status === "READY" || p.status === "PUBLISHED") && (
                                <>
                                  <button type="button" onClick={() => copyProductLink(p)} className="d-btn sm">
                                    {copiedId === p.id ? "Copied!" : "Copy link"}
                                  </button>
                                  <a
                                    href={
                                      brandSlug && p.slug
                                        ? `${PLAYER_ORIGIN}/${brandSlug}/${p.slug}`
                                        : `${PLAYER_ORIGIN}/p/${p.id}`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="d-btn sm ghost"
                                  >
                                    View player ↗
                                  </a>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => deleteProduct(p)}
                                title="Delete product"
                                aria-label="Delete product"
                                className="d-x"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {editingProduct && selected && (
        <BrandProductEditModal
          product={editingProduct}
          onSave={async (data) => {
            await apiEndpoints.r3dAdminUpdateProduct(selected.id, editingProduct.id, data);
            await loadProducts(selected, true);
          }}
          onClose={() => setEditingProduct(null)}
        />
      )}
    </div>
  );
}
