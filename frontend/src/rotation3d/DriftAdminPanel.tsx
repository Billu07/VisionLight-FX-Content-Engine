import { useEffect, useRef, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import DriftCaptionEditor from "./DriftCaptionEditor";
import BrandProductEditModal from "./BrandProductEditModal";
import DriftBrandDashboard from "./DriftBrandDashboard";

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
  title?: string | null;
  description?: string | null;
  defaultFrame?: number;
  ctaPrimary?: { label?: string; url?: string } | null;
  ctaSecondary?: { label?: string; url?: string } | null;
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

const sourceBadge = (s: string) =>
  s === "ROTATION3D"
    ? "border-violet-400/40 bg-violet-500/15 text-violet-200"
    : "border-brand-accent/40 bg-brand-accent/15 text-brand-accent";

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
      const [a, b] = await Promise.all([
        apiEndpoints.driftLandingList(),
        apiEndpoints.driftLandingCandidates(),
      ]);
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
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Curated landing */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Landing showcase</h2>
            <p className="mt-1 text-xs text-gray-400">
              What appears on drift.li — {items.length} item(s){items.some((i) => i.isHero) ? ", 1 hero" : ""}.
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
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-xs text-gray-500">
            Nothing on the landing yet. Add drifts or Rotation3D spins from the right.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {items.map((it) => (
              <div
                key={it.itemId}
                className={`rounded-xl border p-3 ${
                  it.isHero ? "border-amber-400/40 bg-amber-400/[0.06]" : "border-gray-700/60 bg-gray-950/50"
                }`}
              >
                <div className="flex gap-3">
                  <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-gray-900">
                    {it.thumb ? (
                      <img src={it.thumb} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-[9px] text-gray-600">no preview</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{it.name}</p>
                    <p className="truncate text-[11px] text-gray-500">{it.brandName}</p>
                    <span
                      className={`mt-1 inline-block rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sourceBadge(it.source)}`}
                    >
                      {it.source === "ROTATION3D" ? "Rotation3D" : "Drift"}
                    </span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setHero(it)}
                    disabled={busy === it.itemId}
                    className={`rounded-lg py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 ${
                      it.isHero
                        ? "border border-amber-400/40 bg-amber-400/15 text-amber-200"
                        : "border border-gray-700 text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    {it.isHero ? "★ Hero" : "Hero"}
                  </button>
                  <button
                    onClick={() => remove(it.itemId)}
                    disabled={busy === it.itemId}
                    className="rounded-lg border border-gray-700 py-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-300 transition-colors hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Candidate picker */}
      <div className={card}>
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Add to landing</h2>
        <p className="mt-1 text-xs text-gray-400">Pick from drifts or Rotation3D spins.</p>
        <div className="mt-3 flex gap-2">
          {(["DRIFT", "ROTATION3D"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                tab === t ? "bg-white/10 text-white" : "border border-gray-700 text-gray-400 hover:text-white"
              }`}
            >
              {t === "DRIFT" ? "Drifts" : "Rotation3D"}
            </button>
          ))}
        </div>
        <input
          className={`${input} mt-3`}
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="mt-3 max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-6 text-center">
              <LoadingSpinner size="sm" />
            </div>
          ) : pool.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-gray-500">
              {ql ? "No matches." : "Nothing available to add."}
            </p>
          ) : (
            pool.map((c) => (
              <div
                key={`${c.source}:${c.id}`}
                className="flex items-center gap-2 rounded-lg border border-gray-700/60 bg-gray-950/50 p-2"
              >
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md border border-white/10 bg-gray-900">
                  {c.thumb ? <img src={c.thumb} alt="" className="h-full w-full object-contain" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-white">{c.name}</p>
                  <p className="truncate text-[10px] text-gray-500">{c.brandName}</p>
                </div>
                <button
                  onClick={() => add(c.source, c.id)}
                  disabled={busy === c.source + c.id}
                  className="shrink-0 rounded-md border border-brand-accent/40 bg-brand-accent/15 px-2.5 py-1 text-[11px] font-bold text-brand-accent hover:bg-brand-accent/25 disabled:opacity-50"
                >
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

  if (pct !== null) return <span className="text-[11px] text-amber-300">2nd {pct}%</span>;
  if (has) {
    return (
      <span className="flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300">
        2nd ✓
        <button
          onClick={remove}
          disabled={removing}
          title="Remove second clip"
          className="leading-none text-emerald-300/70 hover:text-rose-300"
        >
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
      <button
        onClick={() => ref.current?.click()}
        title="Link a second clip for a 2-clip loop"
        className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
      >
        + 2nd clip
      </button>
    </>
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
        <LandingPanel />
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

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setBrandView(false)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${!brandView ? "bg-white/10 text-white" : "border border-gray-700 text-gray-400 hover:text-white"}`}
                  >
                    Team tools
                  </button>
                  <button
                    onClick={() => setBrandView(true)}
                    className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${brandView ? "bg-white/10 text-white" : "border border-gray-700 text-gray-400 hover:text-white"}`}
                  >
                    Brand dashboard
                  </button>
                </div>

                {brandView ? (
                  <div className="mt-4">
                    <DriftBrandDashboard adminOrgId={selected.id} />
                  </div>
                ) : (
                <>

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
                                onClick={() => setEditingProduct(p)}
                                className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setEditingCaptions({ id: p.id, name: p.name })}
                                className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                              >
                                Captions
                              </button>
                              <button
                                onClick={() => downloadProduct(p)}
                                disabled={exportingId === p.id}
                                className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
                              >
                                {exportingId === p.id ? "Rendering…" : "⬇ Download"}
                              </button>
                              <SecondClipButton
                                orgId={selected.id}
                                product={p}
                                onChange={() => loadProducts(selected, true)}
                                onMsg={setMsg}
                              />
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

      {editingProduct && selected && (
        <BrandProductEditModal
          product={editingProduct}
          showLoop
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
