import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useExitReadOnly } from "../hooks/useExitReadOnly";
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
  title?: string | null;
  description?: string | null;
  slug?: string;
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

function ProductCard({
  product,
  onSaved,
  brandSlug,
}: {
  product: Product;
  onSaved: () => void;
  brandSlug?: string | null;
}) {
  const [linkCopied, setLinkCopied] = useState(false);
  const playerLink =
    brandSlug && product.slug
      ? `${PLAYER_ORIGIN}/${brandSlug}/${product.slug}`
      : `${PLAYER_ORIGIN}/p/${product.id}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(playerLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const [p1Label, setP1Label] = useState(product.ctaPrimary?.label || "");
  const [p1Url, setP1Url] = useState(product.ctaPrimary?.url || "");
  const [p2Label, setP2Label] = useState(product.ctaSecondary?.label || "");
  const [p2Url, setP2Url] = useState(product.ctaSecondary?.url || "");
  const [bg, setBg] = useState(product.background || "");
  const [title, setTitle] = useState(product.title || "");
  const [description, setDescription] = useState(product.description || "");
  const frames = product.spin?.manifest?.frames || [];
  const [showFrame, setShowFrame] = useState(false);
  const [frameIdx, setFrameIdx] = useState(product.defaultFrame || 0);
  const [savingFrame, setSavingFrame] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState("");

  const saveFrame = async () => {
    setSavingFrame(true);
    try {
      await apiEndpoints.r3dUpdateProduct(product.id, { defaultFrame: frameIdx });
      onSaved();
      setShowFrame(false);
    } catch {
      /* ignore */
    } finally {
      setSavingFrame(false);
    }
  };
  const [emCtas, setEmCtas] = useState(true);
  const [emControls, setEmControls] = useState(true);
  const [emLogo, setEmLogo] = useState(true);
  const [slug, setSlug] = useState(product.slug || "");
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugNote, setSlugNote] = useState("");

  const saveSlug = async () => {
    if (!slug.trim()) return;
    setSlugSaving(true);
    setSlugNote("");
    try {
      await apiEndpoints.r3dUpdateProduct(product.id, { slug });
      onSaved();
      setSlugNote("Saved");
    } catch (e: any) {
      setSlugNote(e?.response?.data?.error || "Failed");
    } finally {
      setSlugSaving(false);
    }
  };

  const thumb = product.spin?.manifest?.frames?.[0];
  const published = product.status === "PUBLISHED";

  const embedUrl = () => {
    const q = new URLSearchParams();
    if (!emCtas) q.set("cta", "0");
    if (!emControls) q.set("controls", "0");
    if (!emLogo) q.set("brand", "0");
    const s = q.toString();
    return `${PLAYER_ORIGIN}/embed/${product.id}${s ? `?${s}` : ""}`;
  };
  const embedCode = () =>
    `<iframe src="${embedUrl()}" width="100%" height="520" style="border:0" allowfullscreen></iframe>`;

  const save = async (publishOverride?: boolean) => {
    setSaving(true);
    setNote("");
    try {
      await apiEndpoints.r3dUpdateProduct(product.id, {
        ctaPrimary: { label: p1Label, url: p1Url },
        ctaSecondary: { label: p2Label, url: p2Url },
        background: bg,
        title,
        description,
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
      await navigator.clipboard.writeText(embedCode());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const [cardBusy, setCardBusy] = useState(false);
  const downloadShareCard = async () => {
    setCardBusy(true);
    try {
      const res = await apiEndpoints.r3dShareCard(product.id);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${product.slug || product.name || "rotation3d"}-share.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setNote("Could not generate share card");
    } finally {
      setCardBusy(false);
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

          {/* Product info — optional title + description shown beside the player */}
          <div className="mt-3">
            <p className={label}>
              Product info <span className="font-normal normal-case text-gray-500">· optional</span>
            </p>
            <input
              className={`${input} mt-1`}
              placeholder="Title (defaults to the product name)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className={`${input} mt-2 resize-none`}
              rows={3}
              placeholder="Short description shown next to the player…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Start frame — the angle the player + share card open on */}
          {frames.length > 0 && (
            <div className="mt-3 rounded-lg border border-white/8 bg-gray-950/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className={label}>Start frame</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    The angle the player &amp; share card open on.
                  </p>
                </div>
                <button
                  className={ghostBtn}
                  onClick={() => {
                    setFrameIdx(product.defaultFrame || 0);
                    setShowFrame((s) => !s);
                  }}
                >
                  {showFrame ? "Close" : "Set start frame"}
                </button>
              </div>
              {showFrame && (
                <div className="mt-3">
                  <div className="mx-auto h-40 w-40 overflow-hidden rounded-xl border border-white/10 bg-gray-950">
                    <img
                      src={frames[Math.min(frameIdx, frames.length - 1)]}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={frames.length - 1}
                    value={frameIdx}
                    onChange={(e) => setFrameIdx(Number(e.target.value))}
                    className="mt-3 w-full accent-brand-primary"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[11px] text-gray-500">
                      Frame {frameIdx + 1} / {frames.length}
                    </span>
                    <button className={primaryBtn} onClick={saveFrame} disabled={savingFrame}>
                      {savingFrame ? "Saving…" : "Save start frame"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className={primaryBtn} onClick={() => save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button className={ghostBtn} onClick={() => save(!published)} disabled={saving}>
              {published ? "Unpublish" : "Publish"}
            </button>
            <button className={ghostBtn} onClick={copyLink}>
              {linkCopied ? "Copied!" : "Copy link"}
            </button>
            <a className={ghostBtn} href={playerLink} target="_blank" rel="noopener noreferrer">
              View player ↗
            </a>
            {note && <span className="text-xs text-gray-400">{note}</span>}
          </div>

          {/* Custom link — name the shareable vanity URL (needs a brand slug) */}
          {brandSlug && (
            <div className="mt-3 rounded-lg border border-white/8 bg-gray-950/40 p-3">
              <p className={label}>Custom link</p>
              <p className="mt-0.5 text-[11px] text-gray-500">Name the shareable URL for this product.</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-xs text-gray-500">
                  {PLAYER_ORIGIN.replace(/^https?:\/\//, "")}/{brandSlug}/
                </span>
                <input
                  className={`${input} w-44`}
                  placeholder="product-name"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                />
                <button className={ghostBtn} onClick={saveSlug} disabled={slugSaving}>
                  {slugSaving ? "Saving…" : "Save link"}
                </button>
                {slugNote && <span className="text-xs text-gray-400">{slugNote}</span>}
              </div>
            </div>
          )}

          {/* Embed builder — choose what shows in the embed, then copy the code */}
          <div className="mt-3 rounded-lg border border-white/8 bg-gray-950/40 p-3">
            <p className={label}>Embed</p>
            <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-300">
              {(
                [
                  ["Buttons", emCtas, setEmCtas],
                  ["Controls", emControls, setEmControls],
                  ["Logo", emLogo, setEmLogo],
                ] as const
              ).map(([lbl, val, set]) => (
                <label key={lbl} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => set(e.target.checked)}
                    className="accent-brand-primary"
                  />
                  {lbl}
                </label>
              ))}
            </div>
            <div className="mt-2 overflow-x-auto rounded-md border border-white/10 bg-gray-950 p-2">
              <code className="whitespace-pre text-[10px] text-gray-400">{embedCode()}</code>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className={ghostBtn} onClick={copyEmbed}>
                {copied ? "Copied!" : "Copy embed code"}
              </button>
              <button className={ghostBtn} onClick={downloadShareCard} disabled={cardBusy}>
                {cardBusy ? "Preparing…" : "Download share card"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500">
              Share card = the product image + a scannable QR to its link, for social posts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Recreated (Rotation3D-branded) version of the capture-instructions infographic
// so brands shoot a clean, evenly-spaced set the team can turn into a spin.
function CaptureInstructions() {
  const [open, setOpen] = useState(true);

  const tips = [
    {
      t: "Good lighting",
      d: "Even, bright light so every detail is easy to see.",
      icon: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.2V16h6v-.3c0-.8.4-1.6 1-2.2A6 6 0 0 0 12 3Z" />,
    },
    {
      t: "Keep it still",
      d: "Once you start shooting, don't move the product.",
      icon: (
        <>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      ),
    },
    {
      t: "Same height & distance",
      d: "Hold the camera at one height and distance for every shot.",
      icon: (
        <>
          <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </>
      ),
    },
    {
      t: "Fill the frame",
      d: "Fill most of the frame — but never crop the product.",
      icon: <path d="M12 3 3 8v8l9 5 9-5V8l-9-5Zm0 0v18M3 8l9 5 9-5" />,
    },
  ];

  const steps = [
    { n: 1, t: "Start flat", d: "Picture a + on the floor with the product centered." },
    { n: 2, t: "Raise slightly", d: "Lift until the top shows, then keep that height." },
    { n: 3, t: "The 4 ends", d: "One photo from the end of each line of the + (4 photos)." },
    { n: 4, t: "The 4 corners", d: "Halfway between each, face every corner (4 more)." },
  ];

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-brand-primary/10 to-transparent">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
          </span>
          <span className="text-sm font-bold text-white">How to capture — read first</span>
        </span>
        <span className="text-xs text-gray-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-accent">
            Before you start
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {tips.map((tip) => (
              <div key={tip.t} className="rounded-lg border border-white/10 bg-gray-950/40 p-3">
                <span className="text-brand-accent">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                    {tip.icon}
                  </svg>
                </span>
                <p className="mt-2 text-xs font-semibold text-white">{tip.t}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">{tip.d}</p>
              </div>
            ))}
          </div>

          <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-accent">
            Capture order
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="rounded-lg border border-white/10 bg-gray-950/40 p-3">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary text-[11px] font-bold text-white">
                  {s.n}
                </span>
                <p className="mt-2 text-xs font-semibold text-white">{s.t}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">{s.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-accent/20 bg-brand-accent/[0.06] px-3 py-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-brand-accent">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <p className="text-[11px] text-gray-300">
              Finish with <b className="text-white">8 evenly spaced photos</b> around the product.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function SendImages({ onDone }: { onDone: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [productLabel, setProductLabel] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const upload = async () => {
    if (files.length === 0) return;
    setPct(0);
    setMsg("");
    const fd = new FormData();
    files.forEach((f) => fd.append("images", f));
    if (productLabel.trim()) fd.append("productLabel", productLabel.trim());
    try {
      await apiEndpoints.r3dUploadSourceImages(fd, {
        onUploadProgress: (e) => e.total && setPct(Math.round((e.loaded / e.total) * 100)),
      });
      setMsg(`Sent ${files.length} image${files.length === 1 ? "" : "s"} to the team.`);
      setFiles([]);
      setProductLabel("");
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
        Shoot one product at a time following the capture guide below, then upload the
        set. Our team turns them into an interactive 3D spin and adds it to your dashboard.
      </p>

      <CaptureInstructions />

      <div className="mt-4">
        <p className={label}>Product name</p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          Send one product at a time — this keeps each set together for the team.
        </p>
        <input
          className={`${input} mt-1.5 max-w-sm`}
          placeholder="e.g. Air Max 90"
          value={productLabel}
          onChange={(e) => setProductLabel(e.target.value)}
        />
      </div>

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
  const { exitReadOnly, exiting: exitingReadOnly } = useExitReadOnly();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"products" | "branding" | "send">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [brandSlug, setBrandSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiEndpoints.r3dMyProducts();
      setProducts(res.data.products || []);
      setBrandSlug(res.data.brandSlug || null);
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
    <div className="min-h-screen overflow-x-hidden bg-studio-gradient font-sans text-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        {/* Read-only agency access: the operator entered this brand account to
            grab share cards + links. Writes (publish, save link, upload) return
            403; this banner explains that and offers a clean exit. */}
        {user?.readOnlyImpersonation && (
          <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100 shadow-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="font-bold uppercase tracking-widest text-amber-300">
                  Read-only agency access
                </span>
                <p className="mt-1 text-xs text-amber-100/80">
                  You are viewing {user.email}. You can copy links, copy embed
                  codes, and download share cards. Publish, save-link, and upload
                  actions are blocked.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void exitReadOnly();
                }}
                disabled={exitingReadOnly}
                className="shrink-0 rounded-xl border border-amber-400/30 bg-amber-400/15 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-100 hover:bg-amber-400/25 disabled:cursor-wait disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {exitingReadOnly && (
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  {exitingReadOnly ? "Exiting..." : "Exit Read-only"}
                </span>
              </button>
            </div>
          </div>
        )}
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
            products.map((p) => (
              <ProductCard key={p.id} product={p} onSaved={load} brandSlug={brandSlug} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
