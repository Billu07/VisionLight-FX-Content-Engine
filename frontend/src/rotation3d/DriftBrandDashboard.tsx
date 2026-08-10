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
  title?: string | null;
  description?: string | null;
  defaultFrame?: number;
  ctaPrimary?: { label?: string; url?: string } | null;
  ctaSecondary?: { label?: string; url?: string } | null;
  spin?: { frameCount?: number; secondFrameCount?: number | null } | null;
};

const statusColor = (s: string) =>
  s === "PUBLISHED" ? "text-emerald-300" : s === "READY" ? "text-cyan-300" : s === "PROCESSING" ? "text-amber-300" : s === "FAILED" ? "text-rose-300" : "text-gray-400";

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
  const [embedCopied, setEmbedCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Full-player embed (captions + headlines + description all render inside).
  const copyEmbed = async (p: Product) => {
    const code = `<iframe src="${PLAYER_ORIGIN}/embed/${p.id}" width="100%" height="560" style="border:0;border-radius:16px" allowfullscreen></iframe>`;
    try {
      await navigator.clipboard.writeText(code);
      setEmbedCopied(p.id);
      setTimeout(() => setEmbedCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

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

  const productLink = (p: Product) =>
    brandSlug && p.slug ? `${PLAYER_ORIGIN}/${brandSlug}/${p.slug}` : `${PLAYER_ORIGIN}/p/${p.id}`;

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
                        onClick={() => copyEmbed(p)}
                        className="rounded-lg border border-gray-600 px-3 py-1.5 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                      >
                        {embedCopied === p.id ? "Copied!" : "Embed"}
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
    </div>
  );
}
