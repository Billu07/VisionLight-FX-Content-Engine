import { useEffect, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { LoadingSpinner } from "../components/LoadingSpinner";
import BrandProductEditModal from "./BrandProductEditModal";
import DriftCaptionEditor from "./DriftCaptionEditor";
import DriftFormsManager from "./DriftFormsManager";
import DriftAnalytics from "./DriftAnalytics";
import DriftDomains from "./DriftDomains";
import { useDriftTheme, DriftThemeStyles, ThemeToggle } from "./driftUiTheme";

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

const statusPill = (s: string) =>
  s === "PUBLISHED" ? "ok" : s === "READY" ? "accent" : s === "PROCESSING" ? "warn" : s === "FAILED" ? "err" : "";

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
  const cb = "h-4 w-4";
  const row = "d-muted flex items-center gap-2 text-xs";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="d-h2">Embed</h2>
            <p className="d-faint text-[11px]">{product.name}</p>
          </div>
          <button onClick={onClose} className="d-btn ghost sm" style={{ fontSize: 20, padding: "2px 8px" }}>
            ×
          </button>
        </div>
        <p className="d-sub mb-3 text-xs">
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
          <p className="d-label">Aspect ratio</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {EMBED_RATIOS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRatioKey(r.key)}
                className={`d-btn sm ${ratioKey === r.key ? "soft" : ""}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="d-hair mt-4 grid place-items-center p-3">
          <div style={{ position: "relative", width: "100%", maxWidth: ratio.h > ratio.w ? 260 : 320, aspectRatio: `${ratio.w}/${ratio.h}`, marginInline: "auto" }}>
            <iframe
              src={url}
              title="Embed preview"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, borderRadius: 12 }}
              allowFullScreen
            />
          </div>
        </div>
        <div className="d-hair mt-4 p-3">
          <code className="d-muted block whitespace-pre-wrap break-all text-[10px] leading-relaxed">{code}</code>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <a href={url} target="_blank" rel="noopener noreferrer" className="d-btn">
            Preview ↗
          </a>
          <button onClick={copy} className="d-btn primary">
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
  const [brandPixel, setBrandPixel] = useState("");
  const [brandPixelSaved, setBrandPixelSaved] = useState("");
  const [pixelSaving, setPixelSaving] = useState(false);
  const [brandTerms, setBrandTerms] = useState("");
  const [brandTermsSaved, setBrandTermsSaved] = useState("");
  const [brandPrivacy, setBrandPrivacy] = useState("");
  const [brandPrivacySaved, setBrandPrivacySaved] = useState("");
  const [legalSaving, setLegalSaving] = useState(false);
  const [brandHero, setBrandHero] = useState("");
  const [brandHeroSaved, setBrandHeroSaved] = useState("");
  const [heroSaving, setHeroSaving] = useState(false);
  const [view, setView] = useState<"drifts" | "forms" | "analytics" | "domain">("drifts");
  const [theme, toggleTheme] = useDriftTheme();
  const [formsList, setFormsList] = useState<{ id: string; name: string }[]>([]);

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

  // Forms available to attach to a CTA (refreshed when the Forms tab may edit them).
  useEffect(() => {
    (admin ? apiEndpoints.driftBrandForms(adminOrgId!) : apiEndpoints.driftMyForms())
      .then((r) => setFormsList((r.data.forms || []).map((f: any) => ({ id: f.id, name: f.name }))))
      .catch(() => undefined);
  }, [admin, adminOrgId, view]);

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

  // Brand-default Meta Pixel (both modes).
  useEffect(() => {
    (admin ? apiEndpoints.driftAdminBrandSettings(adminOrgId!) : apiEndpoints.driftBrandSettings())
      .then((r) => {
        const p = r.data?.settings?.metaPixelId || "";
        setBrandPixel(p);
        setBrandPixelSaved(p);
        const t = r.data?.settings?.termsUrl || "";
        setBrandTerms(t);
        setBrandTermsSaved(t);
        const pr = r.data?.settings?.privacyUrl || "";
        setBrandPrivacy(pr);
        setBrandPrivacySaved(pr);
        const h = r.data?.settings?.landingHeroProductId || "";
        setBrandHero(h);
        setBrandHeroSaved(h);
      })
      .catch(() => undefined);
  }, [admin, adminOrgId]);

  const savePixel = async () => {
    if (brandPixel.trim() === brandPixelSaved) return;
    setPixelSaving(true);
    try {
      const data = { metaPixelId: brandPixel.trim() || null };
      admin
        ? await apiEndpoints.driftAdminUpdateBrandSettings(adminOrgId!, data)
        : await apiEndpoints.driftUpdateBrandSettings(data);
      setBrandPixelSaved(brandPixel.trim());
      setMsg({ kind: "ok", text: "Meta Pixel saved." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Could not save the pixel" });
    } finally {
      setPixelSaving(false);
    }
  };

  const legalDirty =
    brandTerms.trim() !== brandTermsSaved || brandPrivacy.trim() !== brandPrivacySaved;
  const saveLegal = async () => {
    if (!legalDirty) return;
    setLegalSaving(true);
    try {
      const data = {
        termsUrl: brandTerms.trim() || null,
        privacyUrl: brandPrivacy.trim() || null,
      };
      admin
        ? await apiEndpoints.driftAdminUpdateBrandSettings(adminOrgId!, data)
        : await apiEndpoints.driftUpdateBrandSettings(data);
      setBrandTermsSaved(brandTerms.trim());
      setBrandPrivacySaved(brandPrivacy.trim());
      setMsg({ kind: "ok", text: "Landing legal links saved." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Could not save the links" });
    } finally {
      setLegalSaving(false);
    }
  };

  const saveHero = async () => {
    if (brandHero === brandHeroSaved) return;
    setHeroSaving(true);
    try {
      const data = { landingHeroProductId: brandHero || null };
      admin
        ? await apiEndpoints.driftAdminUpdateBrandSettings(adminOrgId!, data)
        : await apiEndpoints.driftUpdateBrandSettings(data);
      setBrandHeroSaved(brandHero);
      setMsg({ kind: "ok", text: "Landing drift saved." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.response?.data?.error || "Could not save the landing drift" });
    } finally {
      setHeroSaving(false);
    }
  };

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
    <div className={`drift-ui ${admin ? "" : "d-page"}`} data-theme={theme}>
      <DriftThemeStyles />
      {!admin && (
        <header className="d-topbar">
          <div className="d-wordmark">
            drift<i>.li</i>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="d-faint hidden text-xs sm:inline">{user?.email}</span>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button onClick={logout} className="d-btn sm">
              Log out
            </button>
          </div>
        </header>
      )}

      <main className={admin ? "" : "d-main"}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="d-tabs">
            {(["drifts", "forms", "analytics", "domain"] as const).map((t) => (
              <button key={t} onClick={() => setView(t)} className={`d-tab ${view === t ? "active" : ""}`}>
                {t === "drifts" ? "Drifts" : t === "forms" ? "Forms & Leads" : t === "analytics" ? "Analytics" : "Domain"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {view === "drifts" && (
              <button onClick={load} className="d-btn ghost sm">
                ↻ Refresh
              </button>
            )}
            {admin && <ThemeToggle theme={theme} onToggle={toggleTheme} />}
          </div>
        </div>

        {view === "analytics" ? (
          <DriftAnalytics adminOrgId={adminOrgId} />
        ) : view === "domain" ? (
          <DriftDomains adminOrgId={adminOrgId} />
        ) : view === "forms" ? (
          <DriftFormsManager adminOrgId={adminOrgId} />
        ) : (
        <>
        <div className="d-card d-card-pad mb-6">
          <div className="d-eyebrow" style={{ marginBottom: 12 }}>Brand settings</div>
          <div className="grid gap-4 sm:grid-cols-2">
            {!admin && (
              <div>
                <label className="d-label">Brand name</label>
                <div className="flex gap-2">
                  <input
                    className="d-input"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Your brand / profile name"
                  />
                  <button
                    onClick={saveBrandName}
                    disabled={brandSaving || !brandName.trim() || brandName.trim() === brandNameSaved}
                    className="d-btn soft"
                  >
                    {brandSaving ? "…" : "Save"}
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className="d-label">Meta Pixel ID</label>
              <div className="flex gap-2">
                <input
                  className="d-input"
                  value={brandPixel}
                  onChange={(e) => setBrandPixel(e.target.value)}
                  placeholder="Brand-default pixel (a drift can override)"
                  inputMode="numeric"
                />
                <button
                  onClick={savePixel}
                  disabled={pixelSaving || brandPixel.trim() === brandPixelSaved}
                  className="d-btn soft"
                >
                  {pixelSaving ? "…" : "Save"}
                </button>
              </div>
            </div>
            <div>
              <label className="d-label">Landing legal links</label>
              <p className="d-faint mb-2 text-[11px]">
                Shown on your drift.li landing page. Must start with https://
              </p>
              <div className="flex flex-col gap-2">
                <input
                  className="d-input"
                  value={brandTerms}
                  onChange={(e) => setBrandTerms(e.target.value)}
                  placeholder="Terms URL (https://…)"
                  inputMode="url"
                />
                <input
                  className="d-input"
                  value={brandPrivacy}
                  onChange={(e) => setBrandPrivacy(e.target.value)}
                  placeholder="Privacy URL (https://…)"
                  inputMode="url"
                />
                <button
                  onClick={saveLegal}
                  disabled={legalSaving || !legalDirty}
                  className="d-btn soft self-start"
                >
                  {legalSaving ? "…" : "Save links"}
                </button>
              </div>
            </div>
            <div>
              <label className="d-label">Landing page drift</label>
              <p className="d-faint mb-2 text-[11px]">
                The drift shown full-screen at your custom domain's root.
              </p>
              <div className="flex gap-2">
                <select
                  className="d-input"
                  value={brandHero}
                  onChange={(e) => setBrandHero(e.target.value)}
                >
                  <option value="">None (no landing takeover)</option>
                  {products
                    .filter((p) => p.status === "READY" || p.status === "PUBLISHED")
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={saveHero}
                  disabled={heroSaving || brandHero === brandHeroSaved}
                  className="d-btn soft"
                >
                  {heroSaving ? "…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="d-h1">Your drifts</h1>
          <span className="d-faint text-xs">{products.length} total</span>
        </div>

        {msg && (
          <div className={`d-banner ${msg.kind === "ok" ? "ok" : "err"}`} style={{ marginBottom: 20 }}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="d-btn ghost sm" style={{ padding: "2px 8px" }}>
              ×
            </button>
          </div>
        )}

        {loading ? (
          <div className="py-20 text-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : products.length === 0 ? (
          <div className="d-empty">No drifts yet. Once the team publishes your drifts they'll appear here.</div>
        ) : (
          <div className="grid gap-3">
            {products.map((p) => (
              <div key={p.id} className="d-row">
                <div className="min-w-0">
                  <p className="truncate" style={{ fontWeight: 650 }}>{p.name}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                    <span className={`d-pill ${statusPill(p.status)}`}>{p.status}</span>
                    <span className="d-faint">
                      {p.spin?.frameCount ? `${p.spin.frameCount} frames` : ""}
                      {p.spin?.secondFrameCount ? " · +2nd clip" : ""}
                      {p.loopEnabled ? " · loop" : ""}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button onClick={() => setEditing(p)} className="d-btn sm">Edit</button>
                  {(p.status === "READY" || p.status === "PUBLISHED") && (
                    <>
                      <button onClick={() => setCaptions({ id: p.id, name: p.name })} className="d-btn sm">Captions</button>
                      <button onClick={() => download(p)} disabled={exportingId === p.id} className="d-btn soft sm">
                        {exportingId === p.id ? "Rendering…" : "⬇ Download"}
                      </button>
                      <button onClick={() => setEmbedProduct(p)} className="d-btn sm">Embed</button>
                      <button
                        onClick={() => shareCard(p)}
                        disabled={cardId === p.id}
                        className="d-btn sm"
                        title="Download a social share card (frame + QR to the player)"
                      >
                        {cardId === p.id ? "Making…" : "Share card"}
                      </button>
                      <a href={productLink(p)} target="_blank" rel="noopener noreferrer" className="d-btn sm">
                        View ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </main>

      {editing && (
        <BrandProductEditModal
          product={editing}
          showLoop
          forms={formsList}
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
