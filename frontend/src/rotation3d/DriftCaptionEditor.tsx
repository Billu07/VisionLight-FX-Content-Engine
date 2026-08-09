import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";

/**
 * Drift caption editor — a modal opened from the Drift admin panel for a READY
 * drift. Scrub to a frame, drop styled text on it, and set the frame range it's
 * visible for. Saves the whole set via PUT /api/drift/my/products/:id/captions
 * (superadmin-capable). The player renders these the same way (canvas overlay).
 */

type Caption = {
  clip: string;
  startFrame: number;
  endFrame: number;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  fontWeight: number;
  background: string | null;
  align: "left" | "center" | "right";
};

const newCaption = (frame: number): Caption => ({
  clip: "A",
  startFrame: frame,
  endFrame: frame,
  text: "New text",
  x: 0.5,
  y: 0.5,
  color: "#ffffff",
  fontSize: 0.06,
  fontWeight: 600,
  background: null,
  align: "center",
});

const normalize = (raw: any, frameMax: number): Caption => ({
  clip: raw?.clip === "B" ? "B" : "A",
  startFrame: Math.max(0, Math.min(frameMax, Math.floor(Number(raw?.startFrame) || 0))),
  endFrame: Math.max(0, Math.min(frameMax, Math.floor(Number(raw?.endFrame) || 0))),
  text: String(raw?.text ?? ""),
  x: Number.isFinite(Number(raw?.x)) ? Number(raw.x) : 0.5,
  y: Number.isFinite(Number(raw?.y)) ? Number(raw.y) : 0.5,
  color: typeof raw?.color === "string" ? raw.color : "#ffffff",
  fontSize: Number.isFinite(Number(raw?.fontSize)) ? Number(raw.fontSize) : 0.06,
  fontWeight: Number(raw?.fontWeight) || 600,
  background: typeof raw?.background === "string" && raw.background ? raw.background : null,
  align: raw?.align === "left" || raw?.align === "right" ? raw.align : "center",
});

const field = "w-full rounded-lg border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-accent";

export default function DriftCaptionEditor({
  productId,
  productName,
  onClose,
}: {
  productId: string;
  productName: string;
  onClose: () => void;
}) {
  const [frames, setFrames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [sel, setSel] = useState<number>(-1);
  const [frame, setFrame] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [exporting, setExporting] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageH, setStageH] = useState(360);
  const dragRef = useRef<{ i: number } | null>(null);

  const frameMax = Math.max(0, frames.length - 1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiEndpoints
      .driftPublicProduct(productId)
      .then((r) => {
        if (!alive) return;
        const p = r.data.product;
        const m = p?.manifest || {};
        const fr: string[] = Array.isArray(m.frames) ? m.frames : [];
        setFrames(fr);
        const fmax = Math.max(0, fr.length - 1);
        setCaptions((Array.isArray(p?.captions) ? p.captions : []).map((c: any) => normalize(c, fmax)));
        setFrame(0); // drift starts at the beginning — match the player/export
      })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.error || "Could not load this drift");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [productId]);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageH(el.clientHeight || 360));
    ro.observe(el);
    setStageH(el.clientHeight || 360);
    return () => ro.disconnect();
  }, [loading]);

  const update = (i: number, patch: Partial<Caption>) =>
    setCaptions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const addCaption = () => {
    setCaptions((prev) => [...prev, newCaption(frame)]);
    setSel(captions.length);
  };
  const removeCaption = (i: number) => {
    setCaptions((prev) => prev.filter((_, idx) => idx !== i));
    setSel(-1);
  };

  // Drag a caption over the preview to set its normalized position.
  const onStagePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !stageRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    update(dragRef.current.i, { x, y });
  };
  const endDrag = () => (dragRef.current = null);

  const save = async () => {
    setSaving(true);
    setSavedMsg("");
    try {
      await apiEndpoints.driftSaveCaptions(
        productId,
        captions.map((c, i) => ({ ...c, order: i })),
      );
      setSavedMsg("Saved");
      setTimeout(() => setSavedMsg(""), 1500);
    } catch (e: any) {
      setSavedMsg(e?.response?.data?.error || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Save the current captions, then download the ZIP (original + captioned +
  // captioned-2x MP4s). Saving first guarantees the export matches what's shown.
  const exportZip = async () => {
    setExporting(true);
    setSavedMsg("Rendering video… this can take a moment");
    try {
      await apiEndpoints.driftSaveCaptions(
        productId,
        captions.map((c, i) => ({ ...c, order: i })),
      );
      const res = await apiEndpoints.driftExportZip(productId);
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${productName.replace(/[^a-z0-9-_]+/gi, "-") || "drift"}-export.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSavedMsg("Downloaded");
      setTimeout(() => setSavedMsg(""), 2000);
    } catch {
      setSavedMsg("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const activeOnFrame = (c: Caption) => frame >= c.startFrame && frame <= c.endFrame;
  const current = sel >= 0 ? captions[sel] : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onPointerUp={endDrag}>
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-white">Captions</h2>
            <p className="text-[11px] text-gray-500">{productName}</p>
          </div>
          <div className="flex items-center gap-2">
            {savedMsg && <span className="text-[11px] text-emerald-300">{savedMsg}</span>}
            <button
              onClick={exportZip}
              disabled={exporting || saving || loading || !!error}
              title="Save + download original, captioned, and 2× MP4s (ZIP)"
              className="rounded-lg border border-gray-600 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-gray-200 hover:bg-gray-800 disabled:opacity-50"
            >
              {exporting ? "Rendering…" : "⬇ Download ZIP"}
            </button>
            <button
              onClick={save}
              disabled={saving || exporting || loading || !!error}
              className="rounded-lg border border-brand-accent/40 bg-brand-accent/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-accent hover:bg-brand-accent/25 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save captions"}
            </button>
            <button onClick={onClose} className="px-2 text-2xl leading-none text-gray-500 hover:text-white">
              ×
            </button>
          </div>
        </div>

        {loading ? (
          <div className="grid place-items-center py-24">
            <LoadingSpinner size="sm" />
          </div>
        ) : error ? (
          <div className="grid place-items-center py-24 text-sm text-rose-300">{error}</div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[1fr_300px]">
            {/* Preview + scrubber */}
            <div className="flex min-h-0 flex-col gap-3 p-5">
              <div
                ref={stageRef}
                onPointerMove={onStagePointerMove}
                className="relative flex-1 select-none overflow-hidden rounded-xl border border-gray-800 bg-gray-950"
                style={{ minHeight: 260 }}
              >
                {frames[frame] && (
                  <img src={frames[frame]} alt="" className="h-full w-full object-contain" draggable={false} />
                )}
                {captions.map((c, i) =>
                  activeOnFrame(c) ? (
                    <div
                      key={i}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setSel(i);
                        dragRef.current = { i };
                      }}
                      className={`absolute cursor-move whitespace-pre px-1.5 py-0.5 ${
                        sel === i ? "outline outline-2 outline-brand-accent" : ""
                      }`}
                      style={{
                        left: `${c.x * 100}%`,
                        top: `${c.y * 100}%`,
                        transform: "translate(-50%,-50%)",
                        color: c.color,
                        fontWeight: c.fontWeight,
                        fontSize: Math.max(9, c.fontSize * stageH),
                        textAlign: c.align,
                        background: c.background || "transparent",
                        borderRadius: c.background ? 6 : 0,
                        textShadow: c.background ? "none" : "0 1px 6px rgba(0,0,0,.7)",
                        fontFamily: '"Bai Jamjuree", ui-sans-serif, system-ui, sans-serif',
                        lineHeight: 1.25,
                      }}
                    >
                      {c.text || " "}
                    </div>
                  ) : null,
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-[11px] text-gray-400">Frame {frame}</span>
                <input
                  type="range"
                  min={0}
                  max={frameMax}
                  value={frame}
                  onChange={(e) => setFrame(Number(e.target.value))}
                  className="flex-1 accent-brand-accent"
                />
              </div>
              <p className="text-[11px] text-gray-500">
                Drag a caption to position it. It shows on frames {current ? `${current.startFrame}–${current.endFrame}` : "its range"}.
              </p>
            </div>

            {/* Caption list + properties */}
            <div className="flex min-h-0 flex-col border-t border-gray-800 md:border-l md:border-t-0">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-gray-300">
                  Captions ({captions.length})
                </span>
                <button
                  onClick={addCaption}
                  className="rounded-lg border border-gray-600 px-2.5 py-1 text-[11px] font-semibold text-gray-200 hover:bg-gray-800"
                >
                  + Add
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
                {captions.length === 0 && (
                  <p className="py-6 text-center text-[11px] text-gray-500">
                    No captions yet. Scrub to a frame and click “+ Add”.
                  </p>
                )}
                {captions.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => setSel(i)}
                    className={`block w-full truncate rounded-lg border px-3 py-2 text-left text-xs ${
                      sel === i
                        ? "border-brand-accent/50 bg-brand-accent/10 text-white"
                        : "border-gray-700/60 bg-gray-950/50 text-gray-300 hover:bg-gray-800/60"
                    }`}
                  >
                    <span className="text-gray-500">{c.startFrame}–{c.endFrame}:</span>{" "}
                    {c.text.split("\n")[0] || "(empty)"}
                  </button>
                ))}

                {current && (
                  <div className="space-y-2.5 rounded-xl border border-gray-700/60 bg-gray-950/60 p-3">
                    <textarea
                      className={`${field} min-h-[54px] resize-y`}
                      placeholder="Caption text (Enter for a new line)"
                      value={current.text}
                      onChange={(e) => update(sel, { text: e.target.value })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] text-gray-400">
                        From frame
                        <div className="mt-1 flex gap-1">
                          <input
                            type="number"
                            min={0}
                            max={frameMax}
                            value={current.startFrame}
                            onChange={(e) => update(sel, { startFrame: Number(e.target.value) })}
                            className={field}
                          />
                          <button
                            onClick={() => update(sel, { startFrame: frame })}
                            className="shrink-0 rounded-md border border-gray-700 px-2 text-[10px] text-gray-300 hover:bg-gray-800"
                            title="Use current frame"
                          >
                            ⇐
                          </button>
                        </div>
                      </label>
                      <label className="text-[10px] text-gray-400">
                        To frame
                        <div className="mt-1 flex gap-1">
                          <input
                            type="number"
                            min={0}
                            max={frameMax}
                            value={current.endFrame}
                            onChange={(e) => update(sel, { endFrame: Number(e.target.value) })}
                            className={field}
                          />
                          <button
                            onClick={() => update(sel, { endFrame: frame })}
                            className="shrink-0 rounded-md border border-gray-700 px-2 text-[10px] text-gray-300 hover:bg-gray-800"
                            title="Use current frame"
                          >
                            ⇐
                          </button>
                        </div>
                      </label>
                    </div>
                    <label className="block text-[10px] text-gray-400">
                      Size
                      <input
                        type="range"
                        min={0.02}
                        max={0.2}
                        step={0.005}
                        value={current.fontSize}
                        onChange={(e) => update(sel, { fontSize: Number(e.target.value) })}
                        className="mt-1 w-full accent-brand-accent"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] text-gray-400">
                        Color
                        <input
                          type="color"
                          value={current.color}
                          onChange={(e) => update(sel, { color: e.target.value })}
                          className="mt-1 h-8 w-full rounded-md border border-gray-700 bg-gray-950"
                        />
                      </label>
                      <label className="text-[10px] text-gray-400">
                        Weight
                        <select
                          value={current.fontWeight}
                          onChange={(e) => update(sel, { fontWeight: Number(e.target.value) })}
                          className={`${field} mt-1`}
                        >
                          {[400, 500, 600, 700, 800].map((w) => (
                            <option key={w} value={w}>
                              {w}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] text-gray-400">
                        Align
                        <select
                          value={current.align}
                          onChange={(e) => update(sel, { align: e.target.value as Caption["align"] })}
                          className={`${field} mt-1`}
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </label>
                      <label className="text-[10px] text-gray-400">
                        Background
                        <div className="mt-1 flex gap-1">
                          <input
                            type="color"
                            value={current.background || "#000000"}
                            onChange={(e) => update(sel, { background: e.target.value })}
                            className="h-8 flex-1 rounded-md border border-gray-700 bg-gray-950"
                          />
                          <button
                            onClick={() => update(sel, { background: current.background ? null : "#000000" })}
                            className="shrink-0 rounded-md border border-gray-700 px-2 text-[10px] text-gray-300 hover:bg-gray-800"
                            title="Toggle background"
                          >
                            {current.background ? "On" : "Off"}
                          </button>
                        </div>
                      </label>
                    </div>
                    <button
                      onClick={() => removeCaption(sel)}
                      className="w-full rounded-lg border border-rose-500/30 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10"
                    >
                      Delete caption
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
