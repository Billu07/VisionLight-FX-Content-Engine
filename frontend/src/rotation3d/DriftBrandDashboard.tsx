import { useEffect, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "../components/LoadingSpinner";
import BrandProductEditModal from "./BrandProductEditModal";
import DriftCaptionEditor from "./DriftCaptionEditor";

/**
 * Drift brand-admin home (/app for view="DRIFT"). The brand's own drifts with the
 * controls they need: edit product details, author captions, and download the
 * captioned video ZIP. The team (superadmin) creates the drifts; the brand refines
 * + exports. Mirrors the Rotation3D brand dashboard, scoped to Drift.
 */

const PLAYER_ORIGIN = "https://drift.li";

type Product = {
  id: string;
  name: string;
  slug: string;
  status: string;
  loopEnabled?: boolean;
  hideLogo?: boolean;
  hideName?: boolean;
  background?: string | null;
  title?: string | null;
  description?: string | null;
  defaultFrame?: number;
  ctaPrimary?: { label?: string; url?: string } | null;
  ctaSecondary?: { label?: string; url?: string } | null;
  spin?: { frameCount?: number; secondFrameCount?: number | null } | null;
};

const statusColor = (s: string) =>
  s === "PUBLISHED" ? "text-emerald-300" : s === "READY" ? "text-cyan-300" : s === "PROCESSING" ? "text-amber-300" : s === "FAILED" ? "text-rose-300" : "text-gray-400";

// Embed builder: full interactive player + toggles for the top-left elements.
const EMBED_RATIOS = [
  { key: "portrait", label: "Portrait 4:5", w: 4, h: 5 },
  { key: "square", label: "Square 1:1", w: 1, h: 1 },
  { key: "vertical", label: "Reel 9:16", w: 9, h: 16 },
  { key: "wide", label: "Wide 16:9", w: 16, h: 9 },
] as const;

function DriftEmbedModal({ product, onClose }: { product: { id: string; name: string }; onClose: () => void }) {
  const [logo, setLogo] = useState(true);
  const [name, setName] = useState(true);
  const [title, setTitle] = useState(true);
  const [cta, setCta] = useState(true);
  const [controls, setControls] = useState(true);
  const [ratioKey, setRatioKey] = useState<(typeof EMBED_RATIOS)[number]["key"]>("portrait");
  const [copied, setCopied] = useState(false);

  const ratio = EMBED_RATIOS.find((r) => r.key === ratioKey) || EMBED_RATIOS[0];
  const params: string[] = [];
  if (!logo) params.push("logo=0");
  if (!name) params.push("name=0");
  if (!title) params.push("title=0");
  if (!cta) params.push("cta=0");
  if (!controls) params.push("controls=0");
  const url = `${PLAYER_ORIGIN}/embed/${product.id}${params.length ? "?" + params.join("&") : ""}`;
  // Responsive wrapper: the iframe fills a fixed-aspect box so the player keeps
  // the same size/ratio as the platform at any container width (no letterbox,
  // no fixed pixel height that squishes on mobile).
  const code = `<div style="position:relative;width:100%;max-width:520px;margin:0 auto;aspect-ratio:${ratio.w}/${ratio.h}">
  <iframe src="${url}" style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:16px" allowfullscreen loading="lazy"></iframe>
</div>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const cb = "h-4 w-4 accent-cyan-400";
  const row = "flex items-center gap-2 text-xs text-gray-300";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Embed</h2>
            <p className="text-[11px] text-gray-500">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-500 hover:text-white">
            ×
          </button>
        </div>
        <p className="mb-3 text-xs text-gray-400">
          Full interactive player (captions + headlines). Toggle what shows in the top-left.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <label className={row}><input type="checkbox" checked={logo} onChange={(e) => setLogo(e.target.checked)} className={cb} />Logo</label>
          <label className={row}><input type="checkbox" checked={name} onChange={(e) => setName(e.target.checked)} className={cb} />Profile name</label>
          <label className={row}><input type="checkbox" checked={title} onChange={(e) => setTitle(e.target.checked)} className={cb} />Title</label>
          <label className={row}><input type="checkbox" checked={cta} onChange={(e) => setCta(e.target.checked)} className={cb} />CTA buttons</label>
          <label className={row}><input type="checkbox" checked={controls} onChange={(e) => setControls(e.target.checked)} className={cb} />Zoom / fullscreen</label>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Aspect ratio</p>
          <div className="flex flex-wrap gap-2">
            {EMBED_RATIOS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRatioKey(r.key)}
                className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  ratioKey === r.key
                    ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200"
                    : "border-gray-700 text-gray-300 hover:bg-gray-800"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid place-items-center rounded-xl border border-gray-800 bg-gray-950 p-3">
          <div style={{ position: "relative", width: "100%", maxWidth: 240, aspectRatio: `${ratio.w}/${ratio.h}` }}>
            <iframe
              src={url}
              title="Embed preview"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, borderRadius: 12 }}
              allowFullScreen
            />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-gray-700 bg-gray-950 p-3">
          <code className="block whitespace-pre-wrap break-all text-[10px] leading-relaxed text-gray-400">{code}</code>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-gray-700 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-800"
          >
            Preview ↗
          </a>
          <button
            onClick={copy}
            className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-cyan-200 hover:bg-cyan-500/20"
          >
            {copied ? "Copied!" : "Copy embed code"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DriftBrandDashboard({ adminOrgId }: { adminOrgId?: string } = {}) {
  // Superadmin brand-view: same dashboard embedded in the superadmin Drift tab,
  // pointed at any brand via org-scoped endpoints (no page chrome).
  const admin = !!adminOrgId;
  const { user, logout } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [brandSlug, setBrandSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | null>(null);
  const [captions, setCaptions] = useState<{ id: string; name: string } | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [embedProduct, setEmbedProduct] = useState<Product | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // Brand name (organization identity) — brand admins edit their own; superadmin
  // brand-view (admin mode) edits names via the product/org tools elsewhere.
  const [brandName, setBrandName] = useState("");
  const [brandNameSaved, setBrandNameSaved] = useState("");
  const [brandSaving, setBrandSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = admin
        ? await apiEndpoints.driftBrandProducts(adminOrgId!)
        : await apiEndpoints.driftMyProducts();
      setProducts(r.data.products || []);
      setBrandSlug(r.data.brandSlug || null);
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Failed to load your drifts" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminOrgId]);

  // Load the brand's current display name (own dashboard only).
  useEffect(() => {
    if (admin) return;
    apiEndpoints
      .getBrandConfig()
      .then((r) => {
        const n = r.data?.config?.companyName || "";
        setBrandName(n);
        setBrandNameSaved(n);
      })
      .catch(() => undefined);
  }, [admin]);

  const saveBrandName = async () => {
    const next = brandName.trim();
    if (!next || next === brandNameSaved) return;
    setBrandSaving(true);
    try {
      await apiEndpoints.updateBrandConfig({ companyName: next });
      setBrandNameSaved(next);
      setMsg({ kind: "ok", text: "Brand name updated." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Could not update the brand name" });
    } finally {
      setBrandSaving(false);
    }
  };

  const productLink = (p: Product) =>
    brandSlug && p.slug ? `${PLAYER_ORIGIN}/${brandSlug}/${p.slug}` : `${PLAYER_ORIGIN}/p/${p.id}`;

  const [cardId, setCardId] = useState<string | null>(null);
  const shareCard = async (p: Product) => {
    setCardId(p.id);
    try {
      const res = await apiEndpoints.driftShareCard(p.id);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.slug || p.name.replace(/[^a-z0-9-_]+/gi, "-") || "drift"}-share.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg({ kind: "ok", text: "Share card downloaded." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Could not generate the share card" });
    } finally {
      setCardId(null);
    }
  };

  const download = async (p: Product) => {
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

  return (
    <div className={admin ? "text-gray-100" : "min-h-[100dvh] bg-[#05070d] text-gray-100"} style={{ fontFamily: '"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif' }}>
      {!admin && (
      <header className="flex items-center justify-between border-b border-white/8 px-6 py-4">
        <div className="text-xl font-extrabold tracking-tight text-white">
          drift<span style={{ color: "#22d3ee" }}>.li</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-gray-500 sm:inline">{user?.email}</span>
          <button
            onClick={logout}
            className="rounded-lg border border-gray-700 px-3.5 py-1.5 text-xs font-semibold text-gray-300 hover:bg-gray-800"
          >
            Log out
          </button>
        </div>
      </header>
      )}

      <main className={admin ? "" : "mx-auto max-w-5xl px-6 py-8"}>
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Your drifts</h1>
            <p className="mt-1 text-sm text-gray-400">Edit details, add captions, and download the captioned video.</p>
          </div>
          <button onClick={load} className="text-xs text-gray-400 hover:text-white">
            ↻ refresh
          </button>
        </div>

        {!admin && (
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Brand name</span>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="Your brand / profile name"
              className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-400"
            />
            <button
              onClick={saveBrandName}
              disabled={brandSaving || !brandName.trim() || brandName.trim() === brandNameSaved}
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40"
            >
              {brandSaving ? "Saving…" : "Save"}
            </button>
          </div>
        )}

        {msg && (
          <div
            className={`mb-5 flex items-center justify-between rounded-xl border p-3.5 text-sm font-medium ${
              msg.kind === "ok" ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-rose-400/20 bg-rose-500/10 text-rose-200"
            }`}
          >
            {msg.text}
            <button onClick={() => setMsg(null)} className="text-lg">
              ×
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/[0.02] py-16 text-center text-sm text-gray-500">
            No drifts yet. Once the team publishes your drifts they'll appear here.
          </div>
        ) : (
          <div className="grid gap-3">
            {products.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{p.title || p.name}</p>
                  <p className="text-[11px] text-gray-500">
                    <span className={statusColor(p.status)}>{p.status}</span>
                    {p.spin?.frameCount ? ` · ${p.spin.frameCount} frames` : ""}
                    {p.spin?.secondFrameCount ? " · +2nd clip" : ""}
                    {p.loopEnabled ? " · loop" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    onClick={() => setEditing(p)}
                    className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                  >
                    Edit
                  </button>
                  {(p.status === "READY" || p.status === "PUBLISHED") && (
                    <>
                      <button
                        onClick={() => setCaptions({ id: p.id, name: p.name })}
                        className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                      >
                        Captions
                      </button>
                      <button
                        onClick={() => download(p)}
                        disabled={exportingId === p.id}
                        className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-50"
                      >
                        {exportingId === p.id ? "Rendering…" : "⬇ Download"}
                      </button>
                      <button
                        onClick={() => setEmbedProduct(p)}
                        className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                      >
                        Embed
                      </button>
                      <button
                        onClick={() => shareCard(p)}
                        disabled={cardId === p.id}
                        className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                        title="Download a social share card (frame + QR to the player)"
                      >
                        {cardId === p.id ? "Making…" : "Share card"}
                      </button>
                      <a
                        href={productLink(p)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                      >
                        View ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {editing && (
        <BrandProductEditModal
          product={editing}
          showLoop
          onSave={async (data) => {
            if (admin) await apiEndpoints.driftAdminUpdateProduct(adminOrgId!, editing.id, data);
            else await apiEndpoints.driftUpdateProduct(editing.id, data);
            await load();
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {captions && (
        <DriftCaptionEditor productId={captions.id} productName={captions.name} onClose={() => setCaptions(null)} />
      )}
      {embedProduct && <DriftEmbedModal product={embedProduct} onClose={() => setEmbedProduct(null)} />}
    </div>
  );
}
