import { useEffect, useMemo, useRef, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
import { pinPlacement, type PinKey, type PinTrack, type SpinPin } from "../rotation3d/pins";
import type { Flow, FlowStep } from "./types";
import { Spinner, apiError } from "./tourUi";

/**
 * Pins for one tour drift: press "+ Add pin", tap a spot and give it a label (and an
 * optional note). The pin follows that spot as the view moves — the server measures how
 * the footage moves the first time this opens — and shows only while its spot is in
 * view. Dragging a pin on another frame fine-tunes it there. Saved as a set; live on the
 * drift right away.
 */

type EditorPin = SpinPin & { key: string; note: string };

const TITLE_MAX = 40;
const NOTE_MAX = 160;
const PLAY_FPS = 45;
let seq = 0;
const newKey = () => `pin-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const STYLES = `
.pe-sheet{z-index:70}
.t-sheet-card.pe-card{max-width:1040px;max-height:94vh;overflow:auto;gap:14px}
@media(max-width:639px){.t-sheet-card.pe-card{max-height:96dvh}}
.pe-head{padding-right:36px;display:grid;gap:2px;min-width:0}
.pe-title{font-size:19px;font-weight:800;letter-spacing:-.01em;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pe-head .d-sub{margin:4px 0 0;font-size:13px}
.pe-state{display:grid;justify-items:center;gap:10px;padding:56px 12px;color:var(--muted);font-size:13px;text-align:center}
.pe-body{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
@media(min-width:860px){.pe-body{grid-template-columns:minmax(0,1fr) 300px}}
.pe-main{display:grid;gap:10px;min-width:0;align-content:start}
.pe-stage{position:relative;width:100%;max-height:min(58vh,560px);border-radius:16px;overflow:hidden;background:#05070b;touch-action:none;user-select:none;-webkit-user-select:none;outline:none}
.pe-stage:focus-visible{box-shadow:0 0 0 2px var(--accent)}
.pe-stage.placing{cursor:crosshair}
.pe-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}
.pe-hint{position:absolute;left:50%;top:12px;transform:translateX(-50%);padding:6px 12px;border-radius:999px;background:rgba(10,14,22,.82);color:#fff;font-size:12.5px;font-weight:650;pointer-events:none;white-space:nowrap}
.pe-loading{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.12)}
.pe-loading i{display:block;height:100%;background:var(--accent);transition:width .2s}
.pe-pin{position:absolute;transform:translate(-50%,-50%);display:block;padding:0;border:0;background:none;cursor:grab;touch-action:none;color:#fff;font:inherit}
.pe-pin:active{cursor:grabbing}
.pe-pin-dot{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;background:#fff;color:#0b1220;box-shadow:0 0 0 3px var(--accent),0 4px 14px rgba(0,0,0,.5)}
.pe-pin.on .pe-pin-dot{background:var(--accent);color:var(--accent-ink);box-shadow:0 0 0 3px #fff,0 0 0 6px var(--accent),0 4px 14px rgba(0,0,0,.5)}
.pe-pin-label{position:absolute;left:calc(100% + 8px);top:50%;transform:translateY(-50%);padding:4px 9px;border-radius:8px;background:rgba(10,14,22,.82);font-size:12px;font-weight:650;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
.pe-pin.flip .pe-pin-label{left:auto;right:calc(100% + 8px)}
.pe-scrub{display:flex;align-items:center;gap:10px}
.pe-scrub input[type=range]{flex:1;min-width:0;accent-color:var(--accent)}
.pe-frame{font-size:11.5px;color:var(--faint);min-width:64px;text-align:right;font-variant-numeric:tabular-nums}
.pe-help{font-size:12px;line-height:1.45}
.pe-side{display:grid;gap:10px;align-content:start;min-width:0}
.pe-side-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.pe-empty{font-size:12.5px;color:var(--muted);padding:14px;border-radius:12px;border:1.5px dashed var(--border-strong);line-height:1.45}
.pe-list{display:grid;gap:6px}
.pe-item{appearance:none;display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font:inherit;text-align:left;cursor:pointer}
.pe-item.on{border-color:var(--accent-border);background:var(--accent-soft)}
.pe-item.missing{border-color:var(--err-border)}
.pe-num{width:22px;height:22px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:800;background:var(--surface-3);color:var(--muted)}
.pe-item.on .pe-num{background:var(--accent);color:var(--accent-ink)}
.pe-item-t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:650}
.pe-edit{display:grid;gap:8px;padding:12px;border-radius:14px;border:1px solid var(--border);background:var(--surface-2)}
.pe-edit .d-label{margin:0}
.pe-meta{display:flex;flex-wrap:wrap;gap:6px}
.pe-offview{font-size:12px;color:var(--warn);display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.pe-foot{justify-content:flex-end;border-top:1px solid var(--border);padding-top:12px}
`;

export function PinEditor({
  flowId,
  step,
  driftName,
  onSaved,
  onClose,
}: {
  flowId: string;
  step: FlowStep;
  driftName: string;
  onSaved: (flow: Flow) => void;
  onClose: () => void;
}) {
  const [frames, setFrames] = useState<string[]>([]);
  const [track, setTrack] = useState<PinTrack>(null);
  const [pins, setPins] = useState<EditorPin[]>([]);
  const [maxPins, setMaxPins] = useState(12);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(0);
  const [frame, setFrame] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [missing, setMissing] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dragKey = useRef<string | null>(null);
  const playFrom = useRef(0);
  const cache = useRef<HTMLImageElement[]>([]);
  const last = Math.max(0, frames.length - 1);

  // ── load the drift's frames, track and pins ──
  useEffect(() => {
    let alive = true;
    apiEndpoints
      .driftStepPins(flowId, step.id)
      .then((r) => {
        if (!alive) return;
        const fr: string[] = Array.isArray(r.data?.frames) ? r.data.frames : [];
        setFrames(fr);
        const t = r.data?.track;
        setTrack(t && Array.isArray(t.shift) && t.shift.length === fr.length ? { axis: t.axis === "y" ? "y" : "x", shift: t.shift } : null);
        setMaxPins(Number(r.data?.maxPins) || 12);
        setPins((Array.isArray(r.data?.pins) ? r.data.pins : []).map((p: SpinPin) => ({ ...p, note: p.note || "", key: newKey() })));
      })
      .catch((e) => alive && setLoadError(apiError(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [flowId, step.id]);

  // ── preload every frame so scrubbing and play-through are instant ──
  useEffect(() => {
    if (!frames.length) return;
    let alive = true;
    let cursor = 0;
    let done = 0;
    cache.current = [];
    const worker = async () => {
      while (alive && cursor < frames.length) {
        const i = cursor++;
        const im = new Image();
        im.decoding = "async";
        im.src = frames[i];
        cache.current[i] = im;
        try {
          await im.decode();
        } catch {
          /* a broken frame just shows blank */
        }
        if (!alive) return;
        if (i === 0 && im.naturalWidth && im.naturalHeight) setAspect(im.naturalWidth / im.naturalHeight);
        done++;
        if (done % 8 === 0 || done === frames.length) setLoaded(done);
      }
    };
    for (let w = 0; w < 6; w++) void worker();
    return () => {
      alive = false;
    };
  }, [frames]);

  // ── the frame's rendered rect inside the stage (object-fit: contain) ──
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [loading, loadError]);
  const rect = useMemo(() => {
    const { w, h } = box;
    if (!w || !h) return { x: 0, y: 0, w: 0, h: 0 };
    if (aspect > w / h) {
      const fh = w / aspect;
      return { x: 0, y: (h - fh) / 2, w, h: fh };
    }
    const fw = h * aspect;
    return { x: (w - fw) / 2, y: 0, w: fw, h };
  }, [box, aspect]);

  // ── play-through: check every pin follows its spot ──
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    let raf = 0;
    let prev = performance.now();
    let pos = playFrom.current;
    const tick = (t: number) => {
      pos += ((t - prev) / 1000) * PLAY_FPS;
      prev = t;
      if (pos >= frames.length - 1) {
        setFrame(frames.length - 1);
        setPlaying(false);
        return;
      }
      setFrame(Math.floor(pos));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, frames.length]);

  const close = async () => {
    if (dirty && !(await confirmAction("Close without saving your pin changes?"))) return;
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (placing) setPlacing(false);
      else void close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selPin = pins.find((p) => p.key === sel) || null;

  const update = (key: string, patch: Partial<EditorPin>) => {
    setPins((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
    setDirty(true);
  };

  const pointFor = (clientX: number, clientY: number) => {
    const r = stageRef.current?.getBoundingClientRect();
    if (!r || !rect.w) return null;
    return { x: clamp01((clientX - r.left - rect.x) / rect.w), y: clamp01((clientY - r.top - rect.y) / rect.h) };
  };

  // Dragging on the frame it was placed on moves the pin; on any other frame it
  // fine-tunes that frame (the player blends between fine-tuned frames).
  const movePin = (key: string, pt: { x: number; y: number }) => {
    setPins((prev) =>
      prev.map((p) => {
        if (p.key !== key) return p;
        if (frame === p.frame) return { ...p, x: pt.x, y: pt.y };
        const keys: PinKey[] = (p.keys || []).filter((k) => Math.abs(k.f - frame) > 1);
        keys.push({ f: frame, x: pt.x, y: pt.y });
        keys.sort((a, b) => a.f - b.f);
        return { ...p, keys };
      }),
    );
    setDirty(true);
  };

  const onStageDown = (e: React.PointerEvent) => {
    if (!placing) {
      setSel(null);
      return;
    }
    const pt = pointFor(e.clientX, e.clientY);
    if (!pt) return;
    setPlaying(false);
    const pin: EditorPin = { key: newKey(), frame, x: pt.x, y: pt.y, keys: null, title: "", note: "" };
    setPins((prev) => [...prev, pin]);
    setSel(pin.key);
    setPlacing(false);
    setDirty(true);
    setTimeout(() => titleRef.current?.focus(), 60);
  };

  const onStageKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPlaying(false);
    const by = (e.shiftKey ? 10 : 1) * (e.key === "ArrowLeft" ? -1 : 1);
    setFrame((f) => Math.max(0, Math.min(last, f + by)));
  };

  const togglePlay = () => {
    if (playing) return setPlaying(false);
    playFrom.current = frame >= last ? 0 : frame;
    if (frame >= last) setFrame(0);
    setPlacing(false);
    setPlaying(true);
  };

  const remove = async (key: string) => {
    const p = pins.find((x) => x.key === key);
    if (p?.title.trim() && !(await confirmAction(`Delete the pin "${p.title.trim()}"?`))) return;
    setPins((prev) => prev.filter((x) => x.key !== key));
    setSel(null);
    setDirty(true);
  };

  const save = async () => {
    const untitled = pins.find((p) => !p.title.trim());
    if (untitled) {
      setSel(untitled.key);
      setFrame(untitled.frame);
      setMissing(untitled.key);
      notify.error("Give every pin a label");
      setTimeout(() => titleRef.current?.focus(), 60);
      return;
    }
    setSaving(true);
    try {
      const keys = pins.map((p) => p.key);
      const r = await apiEndpoints.driftSaveStepPins(
        flowId,
        step.id,
        pins.map((p) => ({ frame: p.frame, x: p.x, y: p.y, keys: p.keys || null, title: p.title.trim(), note: p.note.trim() || null })),
      );
      const saved: SpinPin[] = Array.isArray(r.data?.pins) ? r.data.pins : [];
      setPins(saved.map((p, i) => ({ ...p, note: p.note || "", key: keys[i] || newKey() })));
      setDirty(false);
      setMissing(null);
      if (r.data?.flow) onSaved(r.data.flow);
      notify.success(saved.length ? "Pins saved — they're live on this drift" : "Pins removed");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const selPlacement = selPin && frames.length ? pinPlacement(selPin, frame, track, frames.length) : null;

  return (
    <div className="t-sheet pe-sheet" role="dialog" aria-modal aria-label={`Pins for ${driftName}`}>
      <style>{STYLES}</style>
      <div className="t-sheet-card pe-card">
        <button type="button" className="t-sheet-x" onClick={() => void close()} aria-label="Close">
          ×
        </button>
        <div className="pe-head">
          <div className="d-eyebrow">Pins</div>
          <div className="pe-title">{driftName}</div>
          <p className="d-sub">Label the spots worth noticing. Each pin follows its spot as people drag, and shows only while that spot is in view.</p>
        </div>

        {loading ? (
          <div className="pe-state">
            <Spinner />
            <span>Getting this drift ready for pins — the first time takes a few seconds…</span>
          </div>
        ) : loadError ? (
          <div className="d-banner err">{loadError}</div>
        ) : (
          <div className="pe-body">
            <div className="pe-main">
              <div
                ref={stageRef}
                className={`pe-stage ${placing ? "placing" : ""}`}
                style={{ aspectRatio: String(aspect) }}
                tabIndex={0}
                onPointerDown={onStageDown}
                onKeyDown={onStageKey}
                aria-label="Drift frame — use the arrow keys to move through it"
              >
                {frames[frame] && <img className="pe-img" src={frames[frame]} alt="" draggable={false} />}
                {rect.w > 0 &&
                  pins.map((p, i) => {
                    const pl = pinPlacement(p, frame, track, frames.length);
                    if (!pl.visible) return null;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        className={`pe-pin ${sel === p.key ? "on" : ""} ${pl.x > 0.6 ? "flip" : ""}`}
                        style={{ left: rect.x + pl.x * rect.w, top: rect.y + pl.y * rect.h, opacity: Math.max(0.4, pl.fade) }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setPlaying(false);
                          setPlacing(false);
                          setSel(p.key);
                          dragKey.current = p.key;
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          if (dragKey.current !== p.key) return;
                          const pt = pointFor(e.clientX, e.clientY);
                          if (pt) movePin(p.key, pt);
                        }}
                        onPointerUp={() => {
                          dragKey.current = null;
                        }}
                        onPointerCancel={() => {
                          dragKey.current = null;
                        }}
                        aria-label={p.title.trim() || `Pin ${i + 1}`}
                      >
                        <span className="pe-pin-dot">{i + 1}</span>
                        {p.title.trim() && <span className="pe-pin-label">{p.title.trim()}</span>}
                      </button>
                    );
                  })}
                {placing && <div className="pe-hint">Tap the spot you want to label</div>}
                {frames.length > 0 && loaded < frames.length && (
                  <div className="pe-loading" aria-hidden>
                    <i style={{ width: `${Math.round((loaded / frames.length) * 100)}%` }} />
                  </div>
                )}
              </div>
              <div className="pe-scrub">
                <button type="button" className="d-btn sm" onClick={togglePlay} aria-label={playing ? "Pause" : "Play through the drift"}>
                  {playing ? "❚❚ Pause" : "▶ Play"}
                </button>
                <input
                  type="range"
                  min={0}
                  max={last}
                  value={frame}
                  onChange={(e) => {
                    setPlaying(false);
                    setFrame(Number(e.target.value));
                  }}
                  aria-label="Move through the drift"
                />
                <span className="pe-frame">
                  {frame + 1} / {frames.length}
                </span>
              </div>
              <div className="pe-help d-faint">
                {track
                  ? "Pins follow their spot as the view moves. If one slips, drag it back into place on that part of the drift."
                  : "We couldn't map how this drift moves, so pins stay where you put them. Move along and drag a pin to guide it."}
              </div>
            </div>

            <div className="pe-side">
              <div className="pe-side-head">
                <span className="d-label" style={{ margin: 0 }}>
                  Pins ({pins.length}/{maxPins})
                </span>
                <button
                  type="button"
                  className={`d-btn sm ${placing ? "soft" : "primary"}`}
                  onClick={() => {
                    setPlaying(false);
                    setPlacing((v) => !v);
                  }}
                  disabled={!placing && pins.length >= maxPins}
                >
                  {placing ? "Cancel" : "+ Add pin"}
                </button>
              </div>

              {pins.length === 0 && !placing && (
                <div className="pe-empty">No pins yet. Press "+ Add pin", then tap a spot — a kitchen island, a new window, the view.</div>
              )}

              {pins.length > 0 && (
                <div className="pe-list">
                  {pins.map((p, i) => (
                    <button
                      key={p.key}
                      type="button"
                      className={`pe-item ${sel === p.key ? "on" : ""} ${missing === p.key && !p.title.trim() ? "missing" : ""}`}
                      onClick={() => {
                        setPlaying(false);
                        setPlacing(false);
                        setSel(p.key);
                        setFrame(p.frame);
                      }}
                    >
                      <span className="pe-num">{i + 1}</span>
                      <span className="pe-item-t">{p.title.trim() || "Untitled pin"}</span>
                    </button>
                  ))}
                </div>
              )}

              {selPin && (
                <div className="pe-edit">
                  <label className="d-label" htmlFor="pe-title">
                    Label
                  </label>
                  <input
                    id="pe-title"
                    ref={titleRef}
                    className="d-input"
                    value={selPin.title}
                    maxLength={TITLE_MAX}
                    placeholder="e.g. Quartz island"
                    onChange={(e) => update(selPin.key, { title: e.target.value })}
                  />
                  <label className="d-label" htmlFor="pe-note">
                    Note <span className="d-faint">(optional)</span>
                  </label>
                  <textarea
                    id="pe-note"
                    className="d-textarea"
                    rows={2}
                    value={selPin.note}
                    maxLength={NOTE_MAX}
                    placeholder="Shown when someone taps the pin"
                    onChange={(e) => update(selPin.key, { note: e.target.value })}
                  />
                  {selPlacement && !selPlacement.visible && (
                    <div className="pe-offview">
                      Not in view on this part of the drift.
                      <button type="button" className="d-btn ghost sm" onClick={() => setFrame(selPin.frame)}>
                        Show it
                      </button>
                    </div>
                  )}
                  <div className="pe-meta">
                    {selPin.keys && selPin.keys.length > 0 && (
                      <button type="button" className="d-btn ghost sm" onClick={() => update(selPin.key, { keys: null })}>
                        Undo fine-tuning
                      </button>
                    )}
                    <button type="button" className="d-btn danger sm" onClick={() => void remove(selPin.key)}>
                      Delete pin
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="t-actions pe-foot">
          <button type="button" className="d-btn ghost" onClick={() => void close()}>
            {dirty ? "Cancel" : "Done"}
          </button>
          <button type="button" className="d-btn primary" onClick={save} disabled={saving || loading || !!loadError || !dirty}>
            {saving ? "Saving…" : "Save pins"}
          </button>
        </div>
      </div>
    </div>
  );
}
