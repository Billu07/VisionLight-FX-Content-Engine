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

export default function Rotation3DAdminPanel() {
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

  const [productName, setProductName] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
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

  const deleteBrand = async (b: Brand) => {
    if (!window.confirm(`Delete "${b.name}" and all of its products? This cannot be undone.`)) return;
    try {
      await apiEndpoints.r3dDeleteBrand(b.id);
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
                <div className="mt-3 flex items-center gap-3">
                  <button
                    className={btn}
                    onClick={uploadVideo}
                    disabled={busy || !videoFile || !productName.trim()}
                  >
                    {busy ? "Working…" : "Upload & build spin"}
                  </button>
                  {uploadPct !== null && (
                    <span className="text-xs text-gray-400">
                      {processing ? "Extracting frames…" : `Uploading ${uploadPct}%`}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  A short single-rotation clip works best; the pipeline extracts ~36 frames.
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
                      {(p.status === "READY" || p.status === "PUBLISHED") && (
                        <a
                          href={`${PLAYER_ORIGIN}/p/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                        >
                          View player ↗
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
