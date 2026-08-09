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
  description?: string | null;
  status?: string;
  defaultFrame?: number;
  loopEnabled?: boolean;
  ctaPrimary?: { label?: string; url?: string } | null;
  ctaSecondary?: { label?: string; url?: string } | null;
  spin?: { frameCount?: number } | null;
};

const field =
  "w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white outline-none focus:border-brand-accent";
const label = "block text-[11px] font-semibold uppercase tracking-wider text-gray-400";

export default function BrandProductEditModal({
  product,
  showLoop,
  onSave,
  onClose,
}: {
  product: EditProduct;
  showLoop?: boolean;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const frameMax = Math.max(0, (product.spin?.frameCount || 1) - 1);
  const [title, setTitle] = useState(product.title || "");
  const [description, setDescription] = useState(product.description || "");
  const [ctaPLabel, setCtaPLabel] = useState(product.ctaPrimary?.label || "");
  const [ctaPUrl, setCtaPUrl] = useState(product.ctaPrimary?.url || "");
  const [ctaSLabel, setCtaSLabel] = useState(product.ctaSecondary?.label || "");
  const [ctaSUrl, setCtaSUrl] = useState(product.ctaSecondary?.url || "");
  const [defaultFrame, setDefaultFrame] = useState(product.defaultFrame ?? 0);
  const [slug, setSlug] = useState(product.slug || "");
  const [publish, setPublish] = useState(product.status === "PUBLISHED");
  const [loopEnabled, setLoopEnabled] = useState(product.loopEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setSaving(true);
    setErr("");
    const data: Record<string, unknown> = {
      title: title.trim() || null,
      description: description.trim() || null,
      ctaPrimary: ctaPLabel.trim() && ctaPUrl.trim() ? { label: ctaPLabel.trim(), url: ctaPUrl.trim() } : null,
      ctaSecondary: ctaSLabel.trim() && ctaSUrl.trim() ? { label: ctaSLabel.trim(), url: ctaSUrl.trim() } : null,
      defaultFrame,
      publish,
    };
    if (slug.trim()) data.slug = slug.trim();
    if (showLoop) data.loopEnabled = loopEnabled;
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
            <label className={label}>Title</label>
            <input className={`${field} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional display title" />
          </div>
          <div>
            <label className={label}>Description</label>
            <textarea
              className={`${field} mt-1 min-h-[60px] resize-y`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional blurb shown beside the player"
            />
          </div>

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

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-xs text-gray-300">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4 accent-brand-accent" />
              Published (live)
            </label>
            {showLoop && (
              <label className="flex items-center gap-2 text-xs text-gray-300">
                <input type="checkbox" checked={loopEnabled} onChange={(e) => setLoopEnabled(e.target.checked)} className="h-4 w-4 accent-brand-accent" />
                Loop enabled
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
