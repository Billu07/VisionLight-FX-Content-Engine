import { useEffect, useRef, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import DriftCaptionEditor from "./DriftCaptionEditor";

/**
 * Team (SuperAdmin) console for Drift (drift.li) — lives inside
 * SuperAdminDashboard as the "drift" tab. A completely separate product line
 * from Rotation3D: its own DRIFT brand orgs, products, and player. Create a
 * brand, then upload the rendered clip per drift; the (shared) pipeline builds
 * it into a live interactive drift on drift.li.
 *
 * Lean v1: brands (create/delete) + clip upload/delete + landing showcase.
 * Drift extras (second clip, captions, source-image tools) come next.
 */

type Brand = { id: string; name: string; isActive: boolean; _count?: { driftProducts: number } };
type Product = {
  id: string;
  name: string;
  slug: string;
  status: string;
  loopEnabled?: boolean;
  spin?: { frameCount: number; secondFrameCount?: number | null; status: string } | null;
  _count?: { sourceImages: number; videos: number; captions: number };
};

const PLAYER_ORIGIN = "https://drift.li";

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
      const r = await apiEndpoints.driftAllProducts();
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
      await apiEndpoints.driftSetFeatured(p.id, { [field]: next });
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
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Landing showcase</h2>
          <p className="mt-1 text-xs text-gray-400">
            Pick the drift.li landing interactives — {heroCount} hero, {showcaseCount} in showcase.
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
          No ready drifts yet. Featured picks come from READY/PUBLISHED clips.
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

export default function DriftAdminPanel() {
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
  const [brandSlug, setBrandSlug] = useState<string | null>(null);
  const [slugDraft, setSlugDraft] = useState("");
  const [savingSlug, setSavingSlug] = useState(false);
  const [slugMsg, setSlugMsg] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingCaptions, setEditingCaptions] = useState<{ id: string; name: string } | null>(null);
  const [brandQuery, setBrandQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productStatus, setProductStatus] = useState("ALL");

  const copyProductLink = async (p: Product) => {
    const link =
      brandSlug && p.slug ? `${PLAYER_ORIGIN}/${brandSlug}/${p.slug}` : `${PLAYER_ORIGIN}/p/${p.id}`;
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
  const [loopDefault, setLoopDefault] = useState(true);
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
    (p) =>
      (productStatus === "ALL" || p.status === productStatus) &&
      (!pq || p.name.toLowerCase().includes(pq)),
  );

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
            {m === "brands" ? "Brands" : "Landing showcase"}
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
            <p className="mt-1 text-xs text-gray-400">Each brand is a managed Drift org (drift.li).</p>

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
                    <span className="font-mono">{credential.email}</span> already has an account — a new
                    Drift profile was added; they log in with their existing password and pick the Drift
                    workspace.
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
                          `Login: https://drift.li\nEmail: ${credential.email}\nPassword: ${credential.tempPassword}`,
                        )
                      }
                    >
                      Copy credentials
                    </button>
                  </>
                )}
              </div>
            )}

            {brands.length > 0 && (
              <input
                className={`${input} mt-4`}
                placeholder="Search brands…"
                value={brandQuery}
                onChange={(e) => setBrandQuery(e.target.value)}
              />
            )}
            <div className="mt-2 space-y-2">
              {loadingBrands ? (
                <div className="py-6 text-center">
                  <LoadingSpinner size="sm" />
                </div>
              ) : brands.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-500">No brands yet.</p>
              ) : visibleBrands.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-500">No brands match “{brandQuery}”.</p>
              ) : (
                visibleBrands.map((b) => (
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
                      <span className="text-[11px] text-gray-500">{b._count?.driftProducts ?? 0} drifts</span>
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
                Select a brand to manage its drifts.
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

                {/* Brand vanity link (drift.li/{slug}) */}
                <div className="mt-4 rounded-lg border border-gray-700/60 bg-gray-950/50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-300">Brand link</p>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Public showcase &amp; the base of every drift URL.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs text-gray-500">drift.li/</span>
                    <input
                      className={`${input} w-44`}
                      placeholder="brand-name"
                      value={slugDraft}
                      onChange={(e) => setSlugDraft(e.target.value)}
                    />
                    <button
                      className="rounded-md border border-gray-700 px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                      onClick={saveBrandSlug}
                      disabled={savingSlug}
                    >
                      {savingSlug ? "Saving…" : "Save"}
                    </button>
                    {brandSlug && (
                      <a
                        className="rounded-md border border-gray-700 px-2.5 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                        href={`https://drift.li/${brandSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open ↗
                      </a>
                    )}
                    {slugMsg && <span className="text-[11px] text-gray-400">{slugMsg}</span>}
                  </div>
                </div>

                {/* Upload rendered clip */}
                <div className="mt-4 rounded-lg border border-gray-700/60 bg-gray-950/50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-300">
                    Upload rendered drift clip
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input
                      className={input}
                      placeholder="Drift name (e.g. Runner — beach)"
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
                      {busy ? "Working…" : "Upload & build drift"}
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
                        <option value={72}>72 frames</option>
                        <option value={90}>90 frames · very smooth</option>
                        <option value={120}>120 frames · ultra</option>
                        <option value={180}>180 frames · max</option>
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
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <input
                        type="checkbox"
                        checked={loopDefault}
                        onChange={(e) => setLoopDefault(e.target.checked)}
                        disabled={busy}
                        className="h-3.5 w-3.5 accent-brand-accent"
                      />
                      Loop by default
                    </label>
                    {uploadPct !== null && (
                      <span className="text-xs text-gray-400">
                        {processing ? "Extracting frames…" : `Uploading ${uploadPct}%`}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500">
                    A short clip works best — the drift plays as you drag. "Remove white/black" keys
                    out a solid backdrop for <b>free</b>; "AI cutout" is paid but handles any
                    background; "Keep" leaves it opaque and the player background auto-matches. Loop
                    makes playback continuous instead of stopping at the ends.
                  </p>
                </div>

                {/* Drifts list */}
                {products.length > 0 && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <input
                      className={`${input} flex-1 min-w-[140px]`}
                      placeholder="Search drifts…"
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                    />
                    <select
                      value={productStatus}
                      onChange={(e) => setProductStatus(e.target.value)}
                      className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-accent"
                    >
                      {["ALL", "PUBLISHED", "READY", "PROCESSING", "FAILED"].map((s) => (
                        <option key={s} value={s}>
                          {s === "ALL" ? "All statuses" : s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  {loadingProducts ? (
                    <div className="py-6 text-center">
                      <LoadingSpinner size="sm" />
                    </div>
                  ) : products.length === 0 ? (
                    <p className="py-6 text-center text-xs text-gray-500">No drifts yet.</p>
                  ) : visibleProducts.length === 0 ? (
                    <p className="py-6 text-center text-xs text-gray-500">No drifts match your filters.</p>
                  ) : (
                    visibleProducts.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-gray-700/60 bg-gray-950/50 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">{p.name}</p>
                          <p className="text-[11px] text-gray-500">
                            <span className={statusColor(p.status)}>{p.status}</span>
                            {p.spin ? ` · ${p.spin.frameCount} frames` : ""}
                            {p.spin?.secondFrameCount ? " · +2nd clip" : ""}
                            {p.loopEnabled ? " · loop" : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {(p.status === "READY" || p.status === "PUBLISHED") && (
                            <>
                              <button
                                onClick={() => setEditingCaptions({ id: p.id, name: p.name })}
                                className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                              >
                                Captions
                              </button>
                              <button
                                onClick={() => copyProductLink(p)}
                                className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                              >
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
                                className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                              >
                                View player ↗
                              </a>
                            </>
                          )}
                          <button
                            onClick={() => deleteProduct(p)}
                            title="Delete drift"
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

      {editingCaptions && (
        <DriftCaptionEditor
          productId={editingCaptions.id}
          productName={editingCaptions.name}
          onClose={() => setEditingCaptions(null)}
        />
      )}
    </div>
  );
}
