import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "../components/LoadingSpinner";

/**
 * Rotation3D brand-admin dashboard. Rendered at /app when a workspace profile's
 * view === "ROTATION3D". Brands view their spins, customize the player (prev/next
 * button URLs, publish), copy embed codes, and send us new product images. They
 * never upload the rendered videos — the team does that in SuperAdmin.
 */

const PLAYER_ORIGIN = "https://rotation3d.com";

type Cta = { label?: string; url?: string } | null;
type Product = {
  id: string;
  name: string;
  status: string;
  defaultFrame: number;
  background?: string | null;
  ctaPrimary: Cta;
  ctaSecondary: Cta;
  spin?: { manifest?: { frames?: string[] } } | null;
};

const panel = "rounded-2xl border border-white/8 bg-gray-900/60 p-5 backdrop-blur";
const input =
  "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-accent";
const label = "text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400";
const primaryBtn =
  "rounded-lg bg-gradient-to-r from-brand-primary to-brand-secondary px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white transition-all hover:brightness-110 disabled:opacity-50";
const ghostBtn =
  "rounded-lg border border-white/12 bg-white/[0.04] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-gray-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50";

const embedSnippet = (id: string) =>
  `<iframe src="${PLAYER_ORIGIN}/embed/${id}" width="100%" height="520" style="border:0" allowfullscreen></iframe>`;

function ProductCard({ product, onSaved }: { product: Product; onSaved: () => void }) {
  const [p1Label, setP1Label] = useState(product.ctaPrimary?.label || "");
  const [p1Url, setP1Url] = useState(product.ctaPrimary?.url || "");
  const [p2Label, setP2Label] = useState(product.ctaSecondary?.label || "");
  const [p2Url, setP2Url] = useState(product.ctaSecondary?.url || "");
  const [bg, setBg] = useState(product.background || "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");

  const thumb = product.spin?.manifest?.frames?.[0];
  const published = product.status === "PUBLISHED";

  const save = async (publishOverride?: boolean) => {
    setSaving(true);
    setNote("");
    try {
      await apiEndpoints.r3dUpdateProduct(product.id, {
        ctaPrimary: { label: p1Label, url: p1Url },
        ctaSecondary: { label: p2Label, url: p2Url },
        background: bg,
        ...(publishOverride !== undefined ? { publish: publishOverride } : {}),
      });
      onSaved();
      setNote("Saved");
    } catch (e: any) {
      setNote(e?.response?.data?.error || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const copyEmbed = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet(product.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className={panel}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-gray-950">
          {thumb ? (
            <img src={thumb} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="grid h-full place-items-center text-[10px] text-gray-600">no preview</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="truncate text-base font-semibold text-white">{product.name}</h3>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${
                published
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-cyan-500/15 text-cyan-300"
              }`}
            >
              {product.status}
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className={label}>Primary button</p>
              <input className={`${input} mt-1`} placeholder="Label (e.g. Buy now)" value={p1Label} onChange={(e) => setP1Label(e.target.value)} />
              <input className={`${input} mt-2`} placeholder="https://…" value={p1Url} onChange={(e) => setP1Url(e.target.value)} />
            </div>
            <div>
              <p className={label}>Secondary button</p>
              <input className={`${input} mt-1`} placeholder="Label (e.g. Next product)" value={p2Label} onChange={(e) => setP2Label(e.target.value)} />
              <input className={`${input} mt-2`} placeholder="https://…" value={p2Url} onChange={(e) => setP2Url(e.target.value)} />
            </div>
          </div>

          <div className="mt-3">
            <p className={label}>Player background</p>
            <p className="mt-0.5 text-[11px] text-gray-500">Match your video's background (white or black).</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={bg || "#0b0f19"}
                onChange={(e) => setBg(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-700 bg-gray-950"
              />
              {[
                ["White", "#ffffff"],
                ["Black", "#000000"],
                ["Gradient", ""],
              ].map(([lbl, val]) => (
                <button
                  key={lbl}
                  type="button"
                  onClick={() => setBg(val)}
                  className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    bg === val
                      ? "border-brand-accent/50 bg-brand-accent/10 text-white"
                      : "border-gray-700 text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  {lbl}
                </button>
              ))}
              <span className="font-mono text-xs text-gray-500">{bg || "default"}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className={primaryBtn} onClick={() => save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className={ghostBtn} onClick={() => save(!published)} disabled={saving}>
              {published ? "Unpublish" : "Publish"}
            </button>
            <button className={ghostBtn} onClick={copyEmbed}>
              {copied ? "Copied!" : "Copy embed"}
            </button>
            <a className={ghostBtn} href={`${PLAYER_ORIGIN}/p/${product.id}`} target="_blank" rel="noopener noreferrer">
              View player ↗
            </a>
            {note && <span className="text-xs text-gray-400">{note}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SendImages({ onDone }: { onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const upload = async () => {
    if (files.length === 0) return;
    setPct(0);
    setMsg("");
    const fd = new FormData();
    files.forEach((f) => fd.append("images", f));
    try {
      await apiEndpoints.r3dUploadSourceImages(fd, {
        onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded / e.total) * 100)),
      });
      setMsg(`Sent ${files.length} image${files.length === 1 ? "" : "s"} to the team.`);
      setFiles([]);
      if (ref.current) ref.current.value = "";
      onDone();
    } catch (e: any) {
      setMsg(e?.response?.data?.error || "Upload failed");
    } finally {
      setPct(null);
    }
  };

  return (
    <div className={panel}>
      <h3 className="text-base font-semibold text-white">Send product images</h3>
      <p className="mt-1 text-sm text-gray-400">
        Upload photos of a product from multiple angles. Our team turns them into an
        interactive 3D spin and adds it to your dashboard.
      </p>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => setFiles(Array.from(e.target.files || []))}
        className="mt-4 text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
      />
      <div className="mt-4 flex items-center gap-3">
        <button className={primaryBtn} onClick={upload} disabled={pct !== null || files.length === 0}>
          {pct !== null ? `Uploading ${pct}%` : `Send ${files.length || ""} image${files.length === 1 ? "" : "s"}`}
        </button>
        {msg && <span className="text-xs text-gray-400">{msg}</span>}
      </div>
    </div>
  );
}

function BrandingPanel() {
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [secondaryColor, setSecondaryColor] = useState("#8b5cf6");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiEndpoints
      .getBrandConfig()
      .then((res) => {
        const c = res.data?.config || res.data || {};
        setCompanyName(c.companyName || "");
        if (c.primaryColor) setPrimaryColor(c.primaryColor);
        if (c.secondaryColor) setSecondaryColor(c.secondaryColor);
        setLogoUrl(c.logoUrl || null);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    setNote("");
    const fd = new FormData();
    fd.append("image", file);
    try {
      const res = await apiEndpoints.uploadBrandLogo(fd);
      setLogoUrl(res.data?.logoUrl || null);
      setNote("Logo updated.");
    } catch {
      setNote("Logo upload failed.");
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = "";
    }
  };

  const save = async () => {
    setSaving(true);
    setNote("");
    try {
      await apiEndpoints.updateBrandConfig({ companyName, primaryColor, secondaryColor, logoUrl });
      setNote("Saved.");
    } catch {
      setNote("Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className={panel}>
        <div className="py-6 text-center">
          <LoadingSpinner size="sm" />
        </div>
      </div>
    );

  return (
    <div className={panel}>
      <h3 className="text-base font-semibold text-white">Player branding</h3>
      <p className="mt-1 text-sm text-gray-400">
        Your logo and colors appear on every product player and embed.
      </p>

      <div className="mt-5">
        <p className={label}>Logo</p>
        <div className="mt-2 flex items-center gap-4">
          <div className="grid h-16 w-32 place-items-center overflow-hidden rounded-xl border border-white/10 bg-gray-950">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[10px] text-gray-600">no logo</span>
            )}
          </div>
          <div>
            <input
              ref={ref}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
              className="text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
            />
            {uploading && <span className="ml-2 text-xs text-gray-500">Uploading…</span>}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <p className={label}>Brand name</p>
        <input
          className={`${input} mt-1 max-w-sm`}
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Your brand"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-6">
        {([
          ["Primary color", primaryColor, setPrimaryColor] as const,
          ["Secondary color", secondaryColor, setSecondaryColor] as const,
        ]).map(([lbl, val, setVal]) => (
          <div key={lbl}>
            <p className={label}>{lbl}</p>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-gray-700 bg-gray-950"
              />
              <span className="font-mono text-xs text-gray-400">{val}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button className={primaryBtn} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save branding"}
        </button>
        {note && <span className="text-xs text-gray-400">{note}</span>}
      </div>
    </div>
  );
}

export default function Rotation3DBrandDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"products" | "branding" | "send">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiEndpoints.r3dMyProducts();
      setProducts(res.data.products || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Failed to load products");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="min-h-screen bg-studio-gradient font-sans text-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-brand-primary to-brand-secondary shadow-glow">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
              </span>
              <h1 className="text-xl font-bold tracking-tight">Rotation3D Studio</h1>
            </div>
            <p className="mt-1 text-xs text-gray-500">{user?.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
              {(["products", "branding", "send"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                    tab === t ? "bg-white/10 text-white" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {t === "products" ? "Products" : t === "branding" ? "Branding" : "Send images"}
                </button>
              ))}
            </div>
            <button onClick={() => navigate("/studios")} className={ghostBtn}>
              Switch studio
            </button>
            <button onClick={logout} className={ghostBtn}>
              Log out
            </button>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {tab === "branding" ? (
            <BrandingPanel />
          ) : tab === "send" ? (
            <SendImages onDone={load} />
          ) : loading ? (
            <div className="py-20 text-center">
              <LoadingSpinner size="lg" variant="neon" />
            </div>
          ) : error ? (
            <div className={`${panel} text-sm text-rose-300`}>{error}</div>
          ) : products.length === 0 ? (
            <div className={`${panel} text-center text-sm text-gray-400`}>
              No products yet. Send us your product images and we'll build your first spin.
            </div>
          ) : (
            products.map((p) => <ProductCard key={p.id} product={p} onSaved={load} />)
          )}
        </div>
      </div>
    </div>
  );
}
