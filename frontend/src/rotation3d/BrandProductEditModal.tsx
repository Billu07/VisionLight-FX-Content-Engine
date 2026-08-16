import { useState } from "react";

/**
 * The per-product edit controls a brand admin has, in a modal — used by the
 * superadmin Rotation3D + Drift tabs so superadmins can edit any brand's product
 * ("brand-view"). Saves via a caller-supplied update fn (org-scoped superadmin
 * endpoint), so the same UI serves both product lines.
 */

type EditProduct = {
  id: string;
  name: string;
  slug?: string;
  title?: string | null;
  titleEnd?: string | null;
  description?: string | null;
  descriptionEnd?: string | null;
  helperStart?: string | null;
  helperEnd?: string | null;
  status?: string;
  defaultFrame?: number;
  loopEnabled?: boolean;
  background?: string | null;
  hideLogo?: boolean;
  hideName?: boolean;
  metaPixelId?: string | null;
  ctaPrimary?: { label?: string; url?: string; formId?: string | null } | null;
  ctaSecondary?: { label?: string; url?: string; formId?: string | null } | null;
  spin?: { frameCount?: number } | null;
};

const BG_SWATCHES = ["transparent", "#ffffff", "#000000", "#0b0f14", "#f5f5f4", "#e11d48", "#2563eb"];

const field =
  "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-accent";
const label = "block text-[11px] font-semibold uppercase tracking-wider text-gray-400";

export default function BrandProductEditModal({
  product,
  showLoop,
  forms,
  onSave,
  onClose,
}: {
  product: EditProduct;
  showLoop?: boolean;
  forms?: { id: string; name: string }[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const frameMax = Math.max(0, (product.spin?.frameCount || 1) - 1);
  const [name, setName] = useState(product.name || "");
  const [title, setTitle] = useState(product.title || "");
  const [titleEnd, setTitleEnd] = useState(product.titleEnd || "");
  const [helperStart, setHelperStart] = useState(product.helperStart || "");
  const [helperEnd, setHelperEnd] = useState(product.helperEnd || "");
  const [description, setDescription] = useState(product.description || "");
  const [descriptionEnd, setDescriptionEnd] = useState(product.descriptionEnd || "");
  const [ctaPLabel, setCtaPLabel] = useState(product.ctaPrimary?.label || "");
  const [ctaPUrl, setCtaPUrl] = useState(product.ctaPrimary?.url || "");
  const [ctaPForm, setCtaPForm] = useState(product.ctaPrimary?.formId || "");
  const [ctaSLabel, setCtaSLabel] = useState(product.ctaSecondary?.label || "");
  const [ctaSUrl, setCtaSUrl] = useState(product.ctaSecondary?.url || "");
  const [ctaSForm, setCtaSForm] = useState(product.ctaSecondary?.formId || "");
  const [defaultFrame, setDefaultFrame] = useState(product.defaultFrame ?? 0);
  const [slug, setSlug] = useState(product.slug || "");
  const [publish, setPublish] = useState(product.status === "PUBLISHED");
  const [loopEnabled, setLoopEnabled] = useState(product.loopEnabled ?? true);
  const [background, setBackground] = useState(product.background || "transparent");
  const [hideLogo, setHideLogo] = useState(product.hideLogo ?? false);
  const [hideName, setHideName] = useState(product.hideName ?? false);
  const [metaPixelId, setMetaPixelId] = useState(product.metaPixelId || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true);
    setErr("");
    const data: Record<string, unknown> = {
      name: name.trim() || product.name,
      title: title.trim() || null,
      description: description.trim() || null,
      // A CTA is valid with a link OR an attached form (form wins in the player).
      ctaPrimary:
        ctaPLabel.trim() && (ctaPUrl.trim() || ctaPForm)
          ? { label: ctaPLabel.trim(), url: ctaPUrl.trim(), formId: ctaPForm || null }
          : null,
      ctaSecondary:
        ctaSLabel.trim() && (ctaSUrl.trim() || ctaSForm)
          ? { label: ctaSLabel.trim(), url: ctaSUrl.trim(), formId: ctaSForm || null }
          : null,
      defaultFrame,
      publish,
    };
    if (slug.trim()) data.slug = slug.trim();
    if (showLoop) {
      data.loopEnabled = loopEnabled;
      data.titleEnd = titleEnd.trim() || null;
      data.descriptionEnd = descriptionEnd.trim() || null;
      data.helperStart = helperStart.trim() || null;
      data.helperEnd = helperEnd.trim() || null;
      data.background = background;
      data.hideLogo = hideLogo;
      data.hideName = hideName;
      data.metaPixelId = metaPixelId.trim() || null;
    }
    try {
      await onSave(data);
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.error || "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Edit product</h2>
            <p className="text-[11px] text-gray-500">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-gray-500 hover:text-white">
            ×
          </button>
        </div>

        {err && (
          <div className="mb-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-2.5 text-xs text-rose-200">
            {err}
          </div>
        )}

        <div className="space-y-3.5">
          <div>
            <label className={label}>{showLoop ? "Drift name" : "Product name"}</label>
            <input
              className={`${field} mt-1`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Internal product name"
            />
          </div>
          <div>
            <label className={label}>{showLoop ? "Headline 1 (start)" : "Title"}</label>
            <input className={`${field} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional display title" />
          </div>
          {showLoop && (
            <div>
              <label className={label}>Headline 2 (end)</label>
              <input
                className={`${field} mt-1`}
                value={titleEnd}
                onChange={(e) => setTitleEnd(e.target.value)}
                placeholder="Crossfades in as you drag to the end"
              />
            </div>
          )}
          {showLoop && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Helper — forward (start)</label>
                <input
                  className={`${field} mt-1`}
                  value={helperStart}
                  onChange={(e) => setHelperStart(e.target.value)}
                  placeholder="e.g. Drift to Hatch"
                />
              </div>
              <div>
                <label className={label}>Helper — reverse (end)</label>
                <input
                  className={`${field} mt-1`}
                  value={helperEnd}
                  onChange={(e) => setHelperEnd(e.target.value)}
                  placeholder="e.g. Drift to Start"
                />
              </div>
            </div>
          )}
          <div>
            <label className={label}>{showLoop ? "Description 1 (start)" : "Description"}</label>
            <textarea
              className={`${field} mt-1 min-h-[60px] resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional blurb shown under the headline"
            />
          </div>
          {showLoop && (
            <div>
              <label className={label}>Description 2 (end)</label>
              <textarea
                className={`${field} mt-1 min-h-[60px] resize-y`}
                value={descriptionEnd}
                onChange={(e) => setDescriptionEnd(e.target.value)}
                placeholder="Dissolves in with headline 2 at the end"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Primary CTA label</label>
              <input className={`${field} mt-1`} value={ctaPLabel} onChange={(e) => setCtaPLabel(e.target.value)} placeholder="Buy now" />
            </div>
            <div>
              <label className={label}>Primary CTA link</label>
              <input className={`${field} mt-1`} value={ctaPUrl} onChange={(e) => setCtaPUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div>
              <label className={label}>Secondary CTA label</label>
              <input className={`${field} mt-1`} value={ctaSLabel} onChange={(e) => setCtaSLabel(e.target.value)} placeholder="Next" />
            </div>
            <div>
              <label className={label}>Secondary CTA link</label>
              <input className={`${field} mt-1`} value={ctaSUrl} onChange={(e) => setCtaSUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>

          {showLoop && forms && (
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-gray-800 bg-gray-950/40 p-2.5">
              <div className="col-span-2 text-[11px] text-gray-500">
                Attach a lead form to a CTA — it opens in-player instead of a link.
              </div>
              <div>
                <label className={label}>Primary CTA → form</label>
                <select className={`${field} mt-1`} value={ctaPForm} onChange={(e) => setCtaPForm(e.target.value)}>
                  <option value="">No form (use link)</option>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Secondary CTA → form</label>
                <select className={`${field} mt-1`} value={ctaSForm} onChange={(e) => setCtaSForm(e.target.value)}>
                  <option value="">No form (use link)</option>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className={label}>Start frame ({defaultFrame} / {frameMax})</label>
            <input
              type="range"
              min={0}
              max={frameMax}
              value={Math.min(defaultFrame, frameMax)}
              onChange={(e) => setDefaultFrame(Number(e.target.value))}
              className="mt-1 w-full accent-brand-accent"
            />
          </div>

          <div>
            <label className={label}>Product link</label>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="font-mono text-xs text-gray-500">/{"{brand}"}/</span>
              <input className={field} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="product-name" />
            </div>
          </div>

          {showLoop && (
            <div>
              <label className={label}>Player background</label>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {BG_SWATCHES.map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    onClick={() => setBackground(bg)}
                    title={bg}
                    className={`h-7 w-7 rounded-md border ${
                      background === bg ? "border-brand-accent ring-2 ring-brand-accent/40" : "border-gray-600"
                    }`}
                    style={
                      bg === "transparent"
                        ? {
                            backgroundImage:
                              "linear-gradient(45deg,#555 25%,transparent 25%),linear-gradient(-45deg,#555 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#555 75%),linear-gradient(-45deg,transparent 75%,#555 75%)",
                            backgroundSize: "8px 8px",
                            backgroundPosition: "0 0,0 4px,4px -4px,-4px 0",
                          }
                        : { background: bg }
                    }
                  />
                ))}
                <input
                  type="color"
                  value={background === "transparent" ? "#000000" : background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="h-7 w-9 cursor-pointer rounded-md border border-gray-600 bg-transparent p-0"
                  title="Custom color"
                />
                <span className="font-mono text-[11px] text-gray-500">{background}</span>
              </div>
            </div>
          )}

          {showLoop && (
            <div>
              <label className={label}>Meta Pixel ID (this drift — overrides brand default)</label>
              <input
                className={`${field} mt-1`}
                value={metaPixelId}
                onChange={(e) => setMetaPixelId(e.target.value)}
                placeholder="e.g. 1234567890 — leave blank to use the brand default"
                inputMode="numeric"
              />
            </div>
          )}

          {showLoop && (
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input type="checkbox" checked={hideLogo} onChange={(e) => setHideLogo(e.target.checked)} className="h-4 w-4 accent-brand-accent" />
                Hide brand logo in player
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input type="checkbox" checked={hideName} onChange={(e) => setHideName(e.target.checked)} className="h-4 w-4 accent-brand-accent" />
                Hide brand name in player
              </label>
            </div>
          )}

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4 accent-brand-accent" />
              Published (live)
            </label>
            {showLoop && (
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input type="checkbox" checked={loopEnabled} onChange={(e) => setLoopEnabled(e.target.checked)} className="h-4 w-4 accent-brand-accent" />
                Loop (drag wraps end → start)
              </label>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-700 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-800">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg border border-brand-accent/40 bg-brand-accent/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-brand-accent hover:bg-brand-accent/25 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
