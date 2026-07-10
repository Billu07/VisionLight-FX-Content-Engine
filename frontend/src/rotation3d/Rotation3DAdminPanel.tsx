import { useEffect, useRef, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

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
  spin?: { frameCount: number; status: string } | null;
  _count?: { sourceImages: number; videos: number };
};

const PLAYER_ORIGIN = "https://rotation3d.com";

const card = "rounded-xl border border-gray-700/60 bg-gray-900/60 p-5";
const input =
  "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-accent";
const btn =
  "rounded-lg border border-brand-accent/40 bg-brand-accent/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-brand-accent transition-colors hover:bg-brand-accent/25 disabled:opacity-50";

const statusColor = (s: string) =>
  s === "PUBLISHED"
    ? "text-emerald-300"
    : s === "READY"
      ? "text-cyan-300"
      : s === "PROCESSING"
        ? "text-amber-300"
        : s === "FAILED"
          ? "text-rose-300"
          : "text-gray-400";

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
    <div className={card}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Homepage showcase</h2>
          <p className="mt-1 text-xs text-gray-400">
            Pick the homepage spins — {heroCount} hero, {showcaseCount} in showcase.
          </p>
        </div>
        <button className="text-xs text-gray-400 hover:text-white" onClick={load}>
          ↻ refresh
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center">
          <LoadingSpinner size="sm" />
        </div>
      ) : products.length === 0 ? (
        <p className="py-10 text-center text-xs text-gray-500">
          No ready products yet. Featured picks come from READY/PUBLISHED spins.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div
              key={p.id}
              className={`rounded-xl border p-3 transition-colors ${
                p.featured
                  ? "border-brand-accent/50 bg-brand-accent/[0.06]"
                  : "border-gray-700/60 bg-gray-950/50"
              }`}
            >
              <div className="flex gap-3">
                <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-gray-900">
                  {p.thumb ? (
                    <img src={p.thumb} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-[9px] text-gray-600">no preview</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{p.name}</p>
                  <p className="truncate text-[11px] text-gray-500">{p.brandName}</p>
                  <p className="text-[11px]">
                    <span className={statusColor(p.status)}>{p.status}</span>
                  </p>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => toggle(p, "heroFeatured")}
                  disabled={busyId === p.id}
                  className={`rounded-lg py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 ${
                    p.heroFeatured
                      ? "border border-amber-400/40 bg-amber-400/15 text-amber-200"
                      : "border border-gray-700 text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  {p.heroFeatured ? "★ Hero" : "Hero"}
                </button>
                <button
                  onClick={() => toggle(p, "featured")}
                  disabled={busyId === p.id}
                  className={`rounded-lg py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 ${
                    p.featured
                      ? "border border-brand-accent/40 bg-brand-accent/15 text-brand-accent"
                      : "border border-gray-700 text-gray-300 hover:bg-gray-800"
                  }`}
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

export default function Rotation3DAdminPanel() {
  const [mode, setMode] = useState<"brands" | "showcase">("brands");
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
    } catch (e: any) {
      if (!silent) setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to load products" });
    } finally {
      if (!silent) setLoadingProducts(false);
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
      {msg && (
        <div
          className={`flex items-center justify-between rounded-xl border p-4 text-sm font-semibold ${
            msg.kind === "ok"
              ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/20 bg-rose-500/10 text-rose-200"
          }`}
        >
          {msg.text}
          <button onClick={() => setMsg(null)} className="text-lg">
            ×
          </button>
        </div>
      )}

      <div className="flex gap-2">
        {(["brands", "showcase"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
              mode === m ? "bg-white/10 text-white" : "border border-gray-700 text-gray-400 hover:text-white"
            }`}
          >
            {m === "brands" ? "Brands" : "Homepage showcase"}
          </button>
        ))}
      </div>

      {mode === "showcase" ? (
        <ShowcasePanel />
      ) : (
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Brands column */}
        <div className={card}>
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Brands</h2>
          <p className="mt-1 text-xs text-gray-400">Each brand is a managed Rotation3D org.</p>

          <div className="mt-4 space-y-2">
            <input
              className={input}
              placeholder="New brand name"
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
            />
            <input
              className={input}
              placeholder="Brand admin email (optional — creates a login)"
              value={newBrandEmail}
              onChange={(e) => setNewBrandEmail(e.target.value)}
            />
            <input
              className={input}
              placeholder="Admin name (optional)"
              value={newBrandAdminName}
              onChange={(e) => setNewBrandAdminName(e.target.value)}
            />
            <button
              className={`${btn} w-full`}
              onClick={createBrand}
              disabled={creatingBrand || !newBrand.trim()}
            >
              {creatingBrand ? "Creating…" : "Create brand"}
            </button>
          </div>

          {credential && (
            <div className="mt-3 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="font-bold text-emerald-200">Brand admin login</p>
                <button className="text-gray-400 hover:text-white" onClick={() => setCredential(null)}>
                  ×
                </button>
              </div>
              {credential.reused ? (
                <p className="mt-1 text-gray-300">
                  <span className="font-mono">{credential.email}</span> already has an account — they
                  log in with their existing password.
                </p>
              ) : (
                <>
                  <div className="mt-2 space-y-1 text-gray-200">
                    <p>
                      Email: <span className="font-mono text-white">{credential.email}</span>
                    </p>
                    <p>
                      Password: <span className="font-mono text-white">{credential.tempPassword}</span>
                    </p>
                  </div>
                  <p className="mt-2 text-[11px] text-amber-300">
                    Shown once — copy and forward to the brand now.
                  </p>
                  <button
                    className="mt-2 text-[11px] text-emerald-300 underline"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `Login: https://rotation3d.com\nEmail: ${credential.email}\nPassword: ${credential.tempPassword}`,
                      )
                    }
                  >
                    Copy credentials
                  </button>
                </>
              )}
            </div>
          )}

          <div className="mt-4 space-y-2">
            {loadingBrands ? (
              <div className="py-6 text-center">
                <LoadingSpinner size="sm" />
              </div>
            ) : brands.length === 0 ? (
              <p className="py-6 text-center text-xs text-gray-500">No brands yet.</p>
            ) : (
              brands.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center gap-1 rounded-lg border transition-colors ${
                    selected?.id === b.id
                      ? "border-brand-accent/50 bg-brand-accent/10"
                      : "border-gray-700/60 bg-gray-950/50 hover:bg-gray-800/60"
                  }`}
                >
                  <button
                    onClick={() => loadProducts(b)}
                    className="flex flex-1 items-center justify-between px-3 py-2.5 text-left"
                  >
                    <span className="text-sm font-medium text-white">{b.name}</span>
                    <span className="text-[11px] text-gray-500">{b._count?.rot3dProducts ?? 0} products</span>
                  </button>
                  <button
                    onClick={() => deleteBrand(b)}
                    title="Delete brand"
                    className="px-2.5 py-2.5 text-lg leading-none text-gray-600 hover:text-rose-400"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Products / upload column */}
        <div className={card}>
          {!selected ? (
            <div className="grid h-full place-items-center py-16 text-center text-sm text-gray-500">
              Select a brand to manage its products.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">
                  {selected.name}
                </h2>
                <button className="text-xs text-gray-400 hover:text-white" onClick={() => loadProducts(selected)}>
                  ↻ refresh
                </button>
              </div>

              {/* Images the brand sent in */}
              {sourceImages.length > 0 && (
                <div className="mt-4 rounded-lg border border-gray-700/60 bg-gray-950/50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-300">
                    Images sent by the brand ({sourceImages.length})
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Raw product photos to build spins from. Click to open / download.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {sourceImages.map((img) => (
                      <a
                        key={img.id}
                        href={img.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open / download"
                        className="block h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-gray-900 transition-transform hover:scale-105"
                      >
                        <img src={img.url} alt="" className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload rendered video */}
              <div className="mt-4 rounded-lg border border-gray-700/60 bg-gray-950/50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-300">
                  Upload rendered rotation video
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <input
                    className={input}
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
                    className="text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    className={btn}
                    onClick={uploadVideo}
                    disabled={busy || !videoFile || !productName.trim()}
                  >
                    {busy ? "Working…" : "Upload & build spin"}
                  </button>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    Smoothness
                    <select
                      value={frames}
                      onChange={(e) => setFrames(Number(e.target.value))}
                      disabled={busy}
                      className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white outline-none focus:border-brand-accent"
                    >
                      <option value={36}>36 frames · light</option>
                      <option value={48}>48 frames</option>
                      <option value={60}>60 frames · smooth</option>
                      <option value={72}>72 frames · very smooth</option>
                      <option value={90}>90 frames · max</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-400">
                    Background
                    <select
                      value={bgMode}
                      onChange={(e) => setBgMode(e.target.value)}
                      disabled={busy}
                      className="rounded-lg border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-white outline-none focus:border-brand-accent"
                    >
                      <option value="keep">Keep bg (auto-match)</option>
                      <option value="remove-white">Remove white bg · free</option>
                      <option value="remove-black">Remove black bg · free</option>
                      <option value="ai">AI cutout · paid</option>
                    </select>
                  </label>
                  {uploadPct !== null && (
                    <span className="text-xs text-gray-400">
                      {processing ? "Extracting frames…" : `Uploading ${uploadPct}%`}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  A short single-rotation clip works best. "Remove white/black" keys out a
                  solid backdrop for <b>free</b> so the product floats; "AI cutout" is paid but
                  handles any background; "Keep" leaves it opaque and the player background
                  auto-matches the video's backdrop. More frames = smoother spin.
                </p>
              </div>

              {/* Products list */}
              <div className="mt-5 space-y-2">
                {loadingProducts ? (
                  <div className="py-6 text-center">
                    <LoadingSpinner size="sm" />
                  </div>
                ) : products.length === 0 ? (
                  <p className="py-6 text-center text-xs text-gray-500">No products yet.</p>
                ) : (
                  products.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-lg border border-gray-700/60 bg-gray-950/50 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{p.name}</p>
                        <p className="text-[11px] text-gray-500">
                          <span className={statusColor(p.status)}>{p.status}</span>
                          {p.spin ? ` · ${p.spin.frameCount} frames` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {(p.status === "READY" || p.status === "PUBLISHED") && (
                          <a
                            href={`${PLAYER_ORIGIN}/p/${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                          >
                            View player ↗
                          </a>
                        )}
                        <button
                          onClick={() => deleteProduct(p)}
                          title="Delete product"
                          className="px-1.5 text-lg leading-none text-gray-600 hover:text-rose-400"
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
        </div>
      </div>
      )}
    </div>
  );
}
