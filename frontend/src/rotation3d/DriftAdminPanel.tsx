import { useEffect, useRef, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import DriftCaptionEditor from "./DriftCaptionEditor";
import BrandProductEditModal from "./BrandProductEditModal";
import DriftBrandDashboard from "./DriftBrandDashboard";
import DriftMailSettings from "./DriftMailSettings";
import { DriftThemeStyles, ThemeToggle, useDriftTheme } from "./driftUiTheme";

/**
 * Team (SuperAdmin) console for Drift (drift.li) — lives inside
 * SuperAdminDashboard as the "drift.li" tab. A completely separate product line
 * from Rotation3D: its own DRIFT brand orgs, products, and player. Create a
 * brand, then upload the rendered clip per drift; the (shared) pipeline builds
 * it into a live interactive drift on drift.li.
 *
 * Built on the drift design system (driftUiTheme: .d-* classes, light/dark), the
 * same one the brand dashboard it embeds uses — so the whole tab themes together
 * and every row wraps cleanly on a phone.
 */

type Brand = { id: string; name: string; isActive: boolean; _count?: { driftProducts: number } };
type Product = {
  id: string;
  name: string;
  slug: string;
  status: string;
  loopEnabled?: boolean;
  title?: string | null;
  description?: string | null;
  defaultFrame?: number;
  ctaPrimary?: { label?: string; url?: string } | null;
  ctaSecondary?: { label?: string; url?: string } | null;
  spin?: { frameCount: number; secondFrameCount?: number | null; status: string } | null;
  _count?: { sourceImages: number; videos: number; captions: number };
};

const PLAYER_ORIGIN = "https://drift.li";

const statusPill = (s: string) =>
  s === "PUBLISHED" ? "ok" : s === "READY" ? "accent" : s === "PROCESSING" ? "warn" : s === "FAILED" ? "err" : "";

// drift.li landing curation — pick the showcase from BOTH Drift drifts and
// Rotation3D spins (unified curation table), set the single hero.
function LandingPanel() {
  const [items, setItems] = useState<any[]>([]);
  const [cands, setCands] = useState<{ drift: any[]; rotation3d: any[] }>({ drift: [], rotation3d: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<"DRIFT" | "ROTATION3D">("DRIFT");
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([apiEndpoints.driftLandingList(), apiEndpoints.driftLandingCandidates()]);
      setItems(a.data.items || []);
      setCands({ drift: b.data.drift || [], rotation3d: b.data.rotation3d || [] });
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const add = async (source: string, productId: string) => {
    setBusy(source + productId);
    try {
      await apiEndpoints.driftLandingAdd(source, productId);
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };
  const remove = async (itemId: string) => {
    setBusy(itemId);
    try {
      await apiEndpoints.driftLandingRemove(itemId);
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };
  const setHero = async (item: any) => {
    setBusy(item.itemId);
    try {
      await apiEndpoints.driftLandingUpdate(item.itemId, { isHero: !item.isHero });
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const curated = new Set(items.map((i) => `${i.source}:${i.id}`));
  const ql = q.trim().toLowerCase();
  const pool = (tab === "DRIFT" ? cands.drift : cands.rotation3d).filter(
    (c) => !curated.has(`${c.source}:${c.id}`) && (!ql || c.name.toLowerCase().includes(ql)),
  );

  return (
    <div className="d-split reverse d-rise">
      {/* Curated landing */}
      <div className="d-card d-card-pad">
        <div className="d-head">
          <div>
            <div className="d-h2">Landing showcase</div>
            <p className="d-sub">
              What appears on drift.li — {items.length} item{items.length === 1 ? "" : "s"}
              {items.some((i) => i.isHero) ? ", 1 hero" : ""}.
            </p>
          </div>
          <button className="d-btn ghost sm" onClick={load}>
            ↻ Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : items.length === 0 ? (
          <div className="d-empty" style={{ marginTop: 14 }}>
            Nothing on the landing yet. Add drifts or Rotation3D spins from the picker.
          </div>
        ) : (
          <div className="d-grid-2" style={{ marginTop: 14 }}>
            {items.map((it) => (
              <div key={it.itemId} className={`d-tile ${it.isHero ? "is-hero" : ""}`}>
                <div className="d-tile-top">
                  <div className="d-thumb lg">{it.thumb ? <img src={it.thumb} alt="" /> : <span>no preview</span>}</div>
                  <div className="grow" style={{ minWidth: 0, flex: 1 }}>
                    <div className="d-name">{it.name}</div>
                    <div className="d-faint truncate" style={{ fontSize: 11.5 }}>
                      {it.brandName}
                    </div>
                    <span className={`d-pill ${it.source === "ROTATION3D" ? "violet" : "accent"}`} style={{ marginTop: 6 }}>
                      {it.source === "ROTATION3D" ? "Rotation3D" : "Drift"}
                    </span>
                  </div>
                </div>
                <div className="d-actions" style={{ marginTop: 10 }}>
                  <button onClick={() => setHero(it)} disabled={busy === it.itemId} className={`d-btn sm ${it.isHero ? "warn" : ""}`}>
                    {it.isHero ? "★ Hero" : "Make hero"}
                  </button>
                  <button onClick={() => remove(it.itemId)} disabled={busy === it.itemId} className="d-btn sm ghost">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Candidate picker */}
      <div className="d-card d-card-pad">
        <div className="d-h2">Add to landing</div>
        <p className="d-sub">Pick from drifts or Rotation3D spins.</p>
        <div className="d-tabs fill" style={{ marginTop: 12 }}>
          {(["DRIFT", "ROTATION3D"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`d-tab ${tab === t ? "active" : ""}`}>
              {t === "DRIFT" ? "Drifts" : "Rotation3D"}
            </button>
          ))}
        </div>
        <input className="d-input" style={{ marginTop: 10 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="d-list d-scroll" style={{ marginTop: 10, maxHeight: 520 }}>
          {loading ? (
            <div className="py-6 text-center">
              <LoadingSpinner size="sm" />
            </div>
          ) : pool.length === 0 ? (
            <p className="d-faint py-6 text-center" style={{ fontSize: 12 }}>
              {ql ? "No matches." : "Nothing available to add."}
            </p>
          ) : (
            pool.map((c) => (
              <div key={`${c.source}:${c.id}`} className="d-item static">
                <div className="d-thumb" style={{ width: 44 }}>
                  {c.thumb ? <img src={c.thumb} alt="" /> : null}
                </div>
                <span className="grow">
                  <span className="d-name" style={{ fontSize: 13, display: "block" }}>
                    {c.name}
                  </span>
                  <span className="sub">{c.brandName}</span>
                </span>
                <button onClick={() => add(c.source, c.id)} disabled={busy === c.source + c.id} className="d-btn soft sm">
                  + Add
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Per-drift second-clip control: upload/replace/remove the linked clip B.
function SecondClipButton({
  orgId,
  product,
  onChange,
  onMsg,
}: {
  orgId: string;
  product: Product;
  onChange: () => void;
  onMsg: (m: { kind: "ok" | "err"; text: string }) => void;
}) {
  const [pct, setPct] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const has = !!product.spin?.secondFrameCount;

  const upload = async (file: File) => {
    setPct(0);
    const fd = new FormData();
    fd.append("video", file);
    fd.append("frameCount", String(product.spin?.frameCount || 60));
    fd.append("bgMode", "keep");
    try {
      await apiEndpoints.driftUploadSecondClip(orgId, product.id, fd, {
        onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded / e.total) * 100)),
      });
      onMsg({ kind: "ok", text: `Second clip uploaded for "${product.name}" — building… refresh shortly.` });
    } catch (e: any) {
      onMsg({ kind: "err", text: e?.response?.data?.error || "Second clip upload failed" });
    } finally {
      setPct(null);
      if (ref.current) ref.current.value = "";
      onChange();
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove the linked second clip?")) return;
    setRemoving(true);
    try {
      await apiEndpoints.driftDeleteSecondClip(orgId, product.id);
      onMsg({ kind: "ok", text: "Second clip removed." });
    } catch (e: any) {
      onMsg({ kind: "err", text: e?.response?.data?.error || "Failed to remove second clip" });
    } finally {
      setRemoving(false);
      onChange();
    }
  };

  if (pct !== null)
    return (
      <span className="d-pill warn" style={{ textTransform: "none", letterSpacing: 0 }}>
        2nd clip {pct}%
      </span>
    );
  if (has) {
    return (
      <span className="d-pill ok" style={{ textTransform: "none", letterSpacing: 0, paddingRight: 4 }}>
        2nd clip ✓
        <button onClick={remove} disabled={removing} title="Remove second clip" className="d-x" style={{ width: 20, height: 20, fontSize: 14 }}>
          ×
        </button>
      </span>
    );
  }
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <button onClick={() => ref.current?.click()} title="Link a second clip for a 2-clip loop" className="d-btn sm">
        + 2nd clip
      </button>
    </>
  );
}

export default function DriftAdminPanel() {
  const [theme, toggleTheme] = useDriftTheme();
  const [mode, setMode] = useState<"brands" | "showcase" | "emails">("brands");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
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
  const [formsList, setFormsList] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [brandSlug, setBrandSlug] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugMsg, setSlugMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingCaptions, setEditingCaptions] = useState<{ id: string; name: string } | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [brandView, setBrandView] = useState(false);
  const [brandQuery, setBrandQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productStatus, setProductStatus] = useState("ALL");

  const downloadProduct = async (p: Product) => {
    setExportingId(p.id);
    setMsg({ kind: "ok", text: `Rendering "${p.name}" — this can take a moment…` });
    try {
      const res = await apiEndpoints.driftExportZip(p.id);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.name.replace(/[^a-z0-9-_]+/gi, "-") || "drift"}-export.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg({ kind: "ok", text: "Download ready." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Export failed" });
    } finally {
      setExportingId(null);
    }
  };

  const productLink = (p: Product) =>
    brandSlug && p.slug ? `${PLAYER_ORIGIN}/${brandSlug}/${p.slug}` : `${PLAYER_ORIGIN}/p/${p.id}`;

  const copyProductLink = async (p: Product) => {
    try {
      await navigator.clipboard.writeText(productLink(p));
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
  const [loopDefault, setLoopDefault] = useState(false); // Drift defaults to no loop
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBrands = async () => {
    setLoadingBrands(true);
    try {
      const res = await apiEndpoints.driftListBrands();
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
    }
    try {
      const res = await apiEndpoints.driftBrandProducts(brand.id);
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
      const res = await apiEndpoints.driftSetBrandSlug(selected.id, slugDraft);
      setBrandSlug(res.data.slug);
      setSlugDraft(res.data.slug);
      setSlugMsg("Saved");
    } catch (e: any) {
      setSlugMsg(e?.response?.data?.error || "Failed");
    } finally {
      setSavingSlug(false);
    }
  };

  // While anything is PROCESSING, quietly poll so it flips to READY/FAILED live.
  useEffect(() => {
    if (!selected || !products.some((p) => p.status === "PROCESSING")) return;
    const t = setInterval(() => void loadProducts(selected, true), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, selected]);

  // Forms for the selected brand — so the edit modal can attach one to a CTA.
  useEffect(() => {
    if (!selected) return setFormsList([]);
    apiEndpoints
      .driftBrandForms(selected.id)
      .then((r) => setFormsList((r.data.forms || []).map((f: any) => ({ id: f.id, name: f.name }))))
      .catch(() => setFormsList([]));
  }, [selected]);

  const [heroId, setHeroId] = useState<string | null>(null);
  const setLandingHero = async (p: Product) => {
    if (
      !window.confirm(
        `Make "${p.name}" the drift.li landing page?\n\nThe whole drift.li homepage will become this drift's interactive player (its own logo/name hidden, drift.li branding in the header), replacing the gallery. You can revert it from the Landing showcase tab.`,
      )
    )
      return;
    setHeroId(p.id);
    try {
      await apiEndpoints.driftLandingSetHero("DRIFT", p.id);
      setMsg({ kind: "ok", text: `"${p.name}" is now the drift.li landing page.` });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Could not set the landing page" });
    } finally {
      setHeroId(null);
    }
  };

  const deleteProduct = async (p: Product) => {
    if (!window.confirm(`Delete "${p.name}"? This removes its drift and can't be undone.`)) return;
    try {
      await apiEndpoints.driftDeleteProduct(p.id);
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to delete drift" });
    }
  };

  const deleteBrand = async (b: Brand) => {
    if (!window.confirm(`Delete "${b.name}" and all of its drifts? This cannot be undone.`)) return;
    try {
      await apiEndpoints.driftDeleteBrand(b.id);
      if (selected?.id === b.id) {
        setSelected(null);
        setProducts([]);
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
      const res = await apiEndpoints.driftCreateBrand(
        name,
        newBrandEmail.trim() || undefined,
        newBrandAdminName.trim() || undefined,
      );
      setNewBrand("");
      setNewBrandEmail("");
      setNewBrandAdminName("");
      setShowCreate(false);
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
    fd.append("loopEnabled", loopDefault ? "true" : "false");
    try {
      await apiEndpoints.driftUploadProductVideo(selected.id, fd, {
        onUploadProgress: (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded / e.total) * 100);
            setUploadPct(pct);
            if (pct >= 100) setProcessing(true); // server now extracting frames
          }
        },
      });
      setMsg({ kind: "ok", text: `"${productName.trim()}" uploaded — building the drift…` });
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
    (p) => (productStatus === "ALL" || p.status === productStatus) && (!pq || p.name.toLowerCase().includes(pq)),
  );
  const isReady = (p: Product) => p.status === "READY" || p.status === "PUBLISHED";

  return (
    <div className="drift-ui d-embed d-rise" data-theme={theme}>
      <DriftThemeStyles />

      <div className="d-head" style={{ marginBottom: 16 }}>
        <div className="d-tabs" role="tablist" aria-label="drift.li console">
          {(["brands", "showcase", "emails"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`d-tab ${mode === m ? "active" : ""}`}>
              {m === "brands" ? "Brands" : m === "showcase" ? "Landing showcase" : "Emails"}
            </button>
          ))}
        </div>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      {msg && (
        <div className={`d-banner ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 16 }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="d-x" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {mode === "emails" ? (
        <DriftMailSettings />
      ) : mode === "showcase" ? (
        <LandingPanel />
      ) : (
        <div className={`d-split ${selected ? "has-detail" : ""}`}>
          {/* Brands column */}
          <aside className="d-split-side">
            <div className="d-card d-card-pad">
              <div className="d-head">
                <div>
                  <div className="d-h2">Brands</div>
                  <p className="d-sub" style={{ fontSize: 12.5 }}>
                    Each brand is a managed Drift org on drift.li.
                  </p>
                </div>
                <button className={`d-btn sm ${showCreate ? "" : "soft"}`} onClick={() => setShowCreate((v) => !v)}>
                  {showCreate ? "Close" : "+ New brand"}
                </button>
              </div>

              {showCreate && (
                <div className="d-hair" style={{ marginTop: 12, padding: 12, display: "grid", gap: 8 }}>
                  <input className="d-input" placeholder="Brand name" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} autoFocus />
                  <input
                    className="d-input"
                    placeholder="Brand admin email (optional — creates a login)"
                    value={newBrandEmail}
                    onChange={(e) => setNewBrandEmail(e.target.value)}
                    inputMode="email"
                  />
                  <input className="d-input" placeholder="Admin name (optional)" value={newBrandAdminName} onChange={(e) => setNewBrandAdminName(e.target.value)} />
                  <button className="d-btn primary" onClick={createBrand} disabled={creatingBrand || !newBrand.trim()}>
                    {creatingBrand ? "Creating…" : "Create brand"}
                  </button>
                </div>
              )}

              {credential && (
                <div className="d-banner ok" style={{ marginTop: 12, alignItems: "flex-start", flexDirection: "column", gap: 6 }}>
                  <div className="d-head" style={{ width: "100%" }}>
                    <strong style={{ fontSize: 13 }}>Brand admin login</strong>
                    <button className="d-x" onClick={() => setCredential(null)} aria-label="Dismiss">
                      ×
                    </button>
                  </div>
                  {credential.reused ? (
                    <span className="d-sub" style={{ fontSize: 12.5 }}>
                      <code className="d-code">{credential.email}</code> already has an account — a new Drift profile was added; they log in with
                      their existing password and pick the Drift workspace.
                    </span>
                  ) : (
                    <>
                      <span className="d-sub" style={{ fontSize: 12.5, display: "grid", gap: 4 }}>
                        <span>
                          Email: <code className="d-code">{credential.email}</code>
                        </span>
                        <span>
                          Password: <code className="d-code">{credential.tempPassword}</code>
                        </span>
                      </span>
                      <span className="d-note" style={{ color: "var(--warn)" }}>
                        Shown once — copy and forward to the brand now.
                      </span>
                      <button
                        className="d-btn sm"
                        onClick={() =>
                          navigator.clipboard.writeText(`Login: https://drift.li\nEmail: ${credential.email}\nPassword: ${credential.tempPassword}`)
                        }
                      >
                        Copy credentials
                      </button>
                    </>
                  )}
                </div>
              )}

              {brands.length > 3 && (
                <input className="d-input" style={{ marginTop: 12 }} placeholder="Search brands…" value={brandQuery} onChange={(e) => setBrandQuery(e.target.value)} />
              )}
              <div className="d-list" style={{ marginTop: 12 }}>
                {loadingBrands ? (
                  <div className="py-6 text-center">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : brands.length === 0 ? (
                  <p className="d-faint py-6 text-center" style={{ fontSize: 12.5 }}>
                    No brands yet.
                  </p>
                ) : visibleBrands.length === 0 ? (
                  <p className="d-faint py-6 text-center" style={{ fontSize: 12.5 }}>
                    No brands match “{brandQuery}”.
                  </p>
                ) : (
                  visibleBrands.map((b) => (
                    <div key={b.id} className={`d-item ${selected?.id === b.id ? "active" : ""}`} onClick={() => loadProducts(b)} role="button" tabIndex={0}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && loadProducts(b)}>
                      <span className="grow">
                        <span className="d-name" style={{ display: "block", fontSize: 13.5 }}>
                          {b.name}
                        </span>
                        <span className="sub">
                          {b._count?.driftProducts ?? 0} drift{(b._count?.driftProducts ?? 0) === 1 ? "" : "s"}
                        </span>
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBrand(b);
                        }}
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
          </aside>

          {/* Selected brand */}
          <section style={{ minWidth: 0 }}>
            {!selected ? (
              <div className="d-empty">Select a brand to manage its drifts.</div>
            ) : (
              <>
                <button className="d-btn ghost sm d-mobile-back" onClick={() => setSelected(null)}>
                  ← All brands
                </button>
                <div className="d-head" style={{ marginBottom: 14 }}>
                  <div>
                    <div className="d-eyebrow">Brand</div>
                    <div className="d-h1">{selected.name}</div>
                  </div>
                  <div className="d-actions">
                    <div className="d-tabs" role="tablist" aria-label="Brand view">
                      <button role="tab" aria-selected={!brandView} onClick={() => setBrandView(false)} className={`d-tab ${!brandView ? "active" : ""}`}>
                        Team tools
                      </button>
                      <button role="tab" aria-selected={brandView} onClick={() => setBrandView(true)} className={`d-tab ${brandView ? "active" : ""}`}>
                        Brand dashboard
                      </button>
                    </div>
                    {!brandView && (
                      <button className="d-btn ghost sm" onClick={() => loadProducts(selected)} title="Refresh">
                        ↻
                      </button>
                    )}
                  </div>
                </div>

                {brandView ? (
                  <DriftBrandDashboard adminOrgId={selected.id} />
                ) : (
                  <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                    {/* Brand vanity link (drift.li/{slug}) */}
                    <div className="d-card d-card-pad">
                      <div className="d-eyebrow">Brand link</div>
                      <p className="d-note" style={{ marginTop: 4 }}>
                        The public showcase, and the base of every drift URL.
                      </p>
                      <div className="d-actions" style={{ marginTop: 10 }}>
                        <span className="d-faint" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 }}>
                          drift.li/
                        </span>
                        <input
                          className="d-input"
                          style={{ flex: "1 1 160px", maxWidth: 260 }}
                          placeholder="brand-name"
                          value={slugDraft}
                          onChange={(e) => setSlugDraft(e.target.value)}
                        />
                        <button className="d-btn sm" onClick={saveBrandSlug} disabled={savingSlug}>
                          {savingSlug ? "Saving…" : "Save"}
                        </button>
                        {brandSlug && (
                          <a className="d-btn sm" href={`https://drift.li/${brandSlug}`} target="_blank" rel="noopener noreferrer">
                            Open ↗
                          </a>
                        )}
                        {slugMsg && (
                          <span className="d-faint" style={{ fontSize: 12 }}>
                            {slugMsg}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Upload rendered clip */}
                    <div className="d-card d-card-pad">
                      <div className="d-eyebrow">Upload a rendered drift clip</div>
                      <div className="d-grid-2" style={{ marginTop: 12 }}>
                        <div className="d-field">
                          <label className="d-label">Drift name</label>
                          <input className="d-input" placeholder="e.g. Runner — beach" value={productName} onChange={(e) => setProductName(e.target.value)} disabled={busy} />
                        </div>
                        <div className="d-field">
                          <label className="d-label">Clip</label>
                          <input
                            ref={fileRef}
                            type="file"
                            accept="video/*"
                            onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                            disabled={busy}
                            className="d-file"
                          />
                        </div>
                      </div>
                      <div className="d-actions" style={{ marginTop: 12 }}>
                        <button className="d-btn primary" onClick={uploadVideo} disabled={busy || !videoFile || !productName.trim()}>
                          {busy ? "Working…" : "Upload & build drift"}
                        </button>
                        <label className="d-check">
                          Smoothness
                          <select value={frames} onChange={(e) => setFrames(Number(e.target.value))} disabled={busy} className="d-select sm">
                            <option value={36}>36 frames · light</option>
                            <option value={48}>48 frames</option>
                            <option value={60}>60 frames · smooth</option>
                            <option value={72}>72 frames</option>
                            <option value={90}>90 frames · very smooth</option>
                            <option value={120}>120 frames · ultra</option>
                            <option value={180}>180 frames · max</option>
                          </select>
                        </label>
                        <label className="d-check">
                          Background
                          <select value={bgMode} onChange={(e) => setBgMode(e.target.value)} disabled={busy} className="d-select sm">
                            <option value="keep">Keep bg (auto-match)</option>
                            <option value="remove-white">Remove white bg · free</option>
                            <option value="remove-black">Remove black bg · free</option>
                            <option value="ai">AI cutout · paid</option>
                          </select>
                        </label>
                        <label className="d-check">
                          <input type="checkbox" checked={loopDefault} onChange={(e) => setLoopDefault(e.target.checked)} disabled={busy} />
                          Loop by default
                        </label>
                      </div>
                      {uploadPct !== null && (
                        <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                          <div className="d-progress">
                            <i style={{ width: `${processing ? 100 : uploadPct}%` }} />
                          </div>
                          <span className="d-faint" style={{ fontSize: 12 }}>
                            {processing ? "Extracting frames…" : `Uploading ${uploadPct}%`}
                          </span>
                        </div>
                      )}
                      <p className="d-note" style={{ marginTop: 10 }}>
                        A short clip works best — the drift plays as you drag. "Remove white/black" keys out a solid backdrop for free; "AI cutout"
                        is paid but handles any background; "Keep" leaves it opaque and the player background auto-matches. Loop makes playback
                        continuous instead of stopping at the ends.
                      </p>
                    </div>

                    {/* Drifts list */}
                    <div style={{ minWidth: 0 }}>
                      <div className="d-head" style={{ marginBottom: 10 }}>
                        <div className="d-h2">Drifts</div>
                        <span className="d-faint" style={{ fontSize: 12 }}>
                          {products.length} total
                        </span>
                      </div>
                      {products.length > 0 && (
                        <div className="d-actions" style={{ marginBottom: 10 }}>
                          <input
                            className="d-input"
                            style={{ flex: "1 1 160px" }}
                            placeholder="Search drifts…"
                            value={productQuery}
                            onChange={(e) => setProductQuery(e.target.value)}
                          />
                          <select value={productStatus} onChange={(e) => setProductStatus(e.target.value)} className="d-select sm">
                            {["ALL", "PUBLISHED", "READY", "PROCESSING", "FAILED"].map((s) => (
                              <option key={s} value={s}>
                                {s === "ALL" ? "All statuses" : s}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="d-list" style={{ gap: 10 }}>
                        {loadingProducts ? (
                          <div className="py-6 text-center">
                            <LoadingSpinner size="sm" />
                          </div>
                        ) : products.length === 0 ? (
                          <div className="d-empty" style={{ padding: "36px 20px" }}>
                            No drifts yet. Upload the first rendered clip above.
                          </div>
                        ) : visibleProducts.length === 0 ? (
                          <p className="d-faint py-6 text-center" style={{ fontSize: 12.5 }}>
                            No drifts match your filters.
                          </p>
                        ) : (
                          visibleProducts.map((p) => (
                            <div key={p.id} className="d-row">
                              <div className="d-row-main">
                                <div className="d-name">{p.name}</div>
                                <div className="d-meta">
                                  <span className={`d-pill ${statusPill(p.status)}`}>{p.status}</span>
                                  <span>
                                    {p.spin ? `${p.spin.frameCount} frames` : ""}
                                    {p.spin?.secondFrameCount ? " · +2nd clip" : ""}
                                    {p.loopEnabled ? " · loop" : ""}
                                  </span>
                                </div>
                              </div>
                              <div className="d-actions">
                                {isReady(p) && (
                                  <>
                                    <button onClick={() => setEditingProduct(p)} className="d-btn sm">
                                      Edit
                                    </button>
                                    <button onClick={() => setEditingCaptions({ id: p.id, name: p.name })} className="d-btn sm">
                                      Captions
                                    </button>
                                    <button onClick={() => downloadProduct(p)} disabled={exportingId === p.id} className="d-btn soft sm">
                                      {exportingId === p.id ? "Rendering…" : "⬇ Download"}
                                    </button>
                                    <SecondClipButton orgId={selected.id} product={p} onChange={() => loadProducts(selected, true)} onMsg={setMsg} />
                                    <button
                                      onClick={() => setLandingHero(p)}
                                      disabled={heroId === p.id}
                                      title="Make this drift the drift.li landing page (full-screen player)"
                                      className="d-btn warn sm"
                                    >
                                      {heroId === p.id ? "Setting…" : "★ Set as landing"}
                                    </button>
                                    <button onClick={() => copyProductLink(p)} className="d-btn sm">
                                      {copiedId === p.id ? "Copied!" : "Copy link"}
                                    </button>
                                    <a href={productLink(p)} target="_blank" rel="noopener noreferrer" className="d-btn sm">
                                      View ↗
                                    </a>
                                  </>
                                )}
                                <button onClick={() => deleteProduct(p)} title="Delete drift" aria-label={`Delete ${p.name}`} className="d-x">
                                  ×
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {editingCaptions && (
        <DriftCaptionEditor productId={editingCaptions.id} productName={editingCaptions.name} onClose={() => setEditingCaptions(null)} />
      )}

      {editingProduct && selected && (
        <BrandProductEditModal
          product={editingProduct}
          showLoop
          adminControls
          forms={formsList}
          onSave={async (data) => {
            await apiEndpoints.driftAdminUpdateProduct(selected.id, editingProduct.id, data);
            await loadProducts(selected, true);
          }}
          onClose={() => setEditingProduct(null)}
        />
      )}
    </div>
  );
}
