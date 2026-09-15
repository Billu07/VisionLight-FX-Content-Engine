import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
import { useAuth } from "../hooks/useAuth";
import type { Billing, Flow, FlowStep, Page, PageRole, Quota } from "./types";
import { canEditPage } from "./pageRoles";
import { isReady } from "./types";
import { ShareSheet } from "./ShareSheet";
import { PinEditor } from "./PinEditor";
import { CAPTURE_GUIDE_SEEN_KEY, CaptureGuideSheet } from "./CaptureGuide";
import { Spinner, StatusPill, TourShell, apiError, copyText, publicUrl, readClipDuration } from "./tourUi";
import { TOUR_PAGE_STYLES } from "./tourPageStyles";

/**
 * The admin view of a tour's pathway (drift.li/tour/{page}/{tour} for page admins):
 * the drifts on a straight, numbered path. Upload a clip — it builds in the background
 * — name it, set its background and drift direction, reorder, publish. Every drift's
 * buttons are fixed and derived from the order (Home + the next drift's name; the last
 * one loops back to #1), so nothing here can break the path. Desktop shows a live
 * preview of the selected drift. A page Viewer gets the same view without the controls.
 */

const DIRECTIONS = [
  { value: "LTR", glyph: "→", short: "L→R", title: "Left to right — the camera pans right" },
  { value: "RTL", glyph: "←", short: "R→L", title: "Right to left" },
  { value: "TTB", glyph: "↓", short: "T→B", title: "Top to bottom" },
  { value: "BTT", glyph: "↑", short: "B→T", title: "Bottom to top" },
] as const;
const COVER_LABELS = ["Start", "Middle", "End"];
const money = (cents: number, currency = "usd") => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)}`;
  }
};

const driftName = (s: FlowStep, i: number) => s.product?.name || `Drift ${i + 1}`;
// Pin state on the rail (colour + halo come from CSS).
const stateClass = (st?: string | null) =>
  st === "PROCESSING" ? "is-processing" : st === "FAILED" ? "is-failed" : isReady(st) ? "is-ready" : "";

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/**
 * The rail as a straight inked line: a dotted trail through every pin (the upload slot
 * included — that's "what's next"), the accent line drawing itself in through the
 * drifts, and a rider that travels it once whenever the path changes.
 */
function RouteInk({ host, dep }: { host: RefObject<HTMLDivElement | null>; dep: string }) {
  const [paths, setPaths] = useState<{ ink: string; under: string } | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const items = Array.from(el.querySelectorAll<HTMLElement>(":scope > .t-route-item"));
      const pts = items.map((it) => ({ y: it.offsetTop + 33, drop: it.classList.contains("is-drop") }));
      const build = (list: { y: number }[]) =>
        list.length < 2 ? "" : list.slice(1).reduce((acc, p) => `${acc} L 13 ${p.y}`, `M 13 ${list[0].y}`);
      const ink = build(pts.filter((p) => !p.drop));
      const under = build(pts);
      setPaths((prev) => (prev && prev.ink === ink && prev.under === under ? prev : { ink, under }));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [host, dep]);
  if (!paths || !paths.under) return null;
  return (
    <svg className="t-route-svg" aria-hidden>
      <path className="t-route-under" d={paths.under} />
      {paths.ink && <path key={dep} className="t-route-ink" d={paths.ink} pathLength={1000} />}
      {paths.ink && (
        <circle key={"r" + dep} className="t-route-rider" r={5} style={{ offsetPath: `path("${paths.ink}")` }} />
      )}
    </svg>
  );
}

// ─────────────────────────── one drift ───────────────────────────

function StepCard({
  flow,
  step,
  index,
  selected,
  onSelect,
  onChanged,
  maxClip,
  readOnly = false,
  onPins,
}: {
  flow: Flow;
  step: FlowStep;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onChanged: (flow: Flow) => void;
  maxClip: number | null;
  readOnly?: boolean;
  /** open the pin editor for this drift */
  onPins?: () => void;
}) {
  const p = step.product;
  const [name, setName] = useState(p?.name || "");
  const [bg, setBg] = useState(p?.background || "");
  const [direction, setDirection] = useState(p?.driftDirection || "LTR");
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Re-sync a field from the server ONLY while it isn't being edited locally (the poll
  // and every relink refresh the server copy; typing must never be thrown away).
  const serverRef = useRef({ name: p?.name || "", bg: p?.background || "", direction: p?.driftDirection || "LTR" });
  useEffect(() => {
    const next = { name: p?.name || "", bg: p?.background || "", direction: p?.driftDirection || "LTR" };
    const prev = serverRef.current;
    setName((v) => (v === prev.name ? next.name : v));
    setBg((v) => (v === prev.bg ? next.bg : v));
    setDirection((v) => (v === prev.direction ? next.direction : v));
    serverRef.current = next;
  }, [p?.name, p?.background, p?.driftDirection]);

  const dirty = name !== (p?.name || "") || bg !== (p?.background || "") || direction !== (p?.driftDirection || "LTR");

  const save = async () => {
    if (!name.trim()) return notify.error("Give this drift a name");
    setSaving(true);
    try {
      const r = await apiEndpoints.driftUpdateFlowStep(flow.id, step.id, {
        name: name.trim(),
        background: bg,
        driftDirection: direction,
      });
      onChanged(r.data.flow);
      notify.success("Drift saved");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const move = async (dir: -1 | 1) => {
    const ids = flow.steps.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    try {
      const r = await apiEndpoints.driftReorderFlowSteps(flow.id, ids);
      onChanged(r.data.flow);
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  const remove = async () => {
    const ok = await confirmAction(`Remove "${driftName(step, index)}" from the tour?`);
    if (!ok) return;
    try {
      const r = await apiEndpoints.driftDeleteFlowStep(flow.id, step.id);
      onChanged(r.data.flow);
      notify.success("Drift removed");
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  const replaceClip = async (file: File) => {
    const d = await readClipDuration(file);
    if (maxClip && d && d > maxClip + 0.5) return notify.error(`Clips must be ${maxClip}s or shorter — this one is ${d.toFixed(1)}s.`);
    const fd = new FormData();
    fd.append("video", file);
    setReplacing(0);
    try {
      const r = await apiEndpoints.driftReplaceFlowStepClip(flow.id, step.id, fd, (e) => {
        if (e.total) setReplacing(Math.round((e.loaded / e.total) * 100));
      });
      onChanged(r.data.flow);
      notify.success("New clip uploaded — building it now");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setReplacing(null);
    }
  };

  const status = p?.status || "DRAFT";

  return (
    <div
      className={`d-card t-step t-route-item ${selected ? "is-selected" : ""} ${stateClass(p?.status)}`}
      data-n={index + 1}
      style={{ ["--n" as any]: index }}
      onClickCapture={onSelect}
    >
      <div className="t-step-media">
        <div className="t-step-thumb">
          <span className="t-num">{index + 1}</span>
          {p?.thumb ? (
            <img src={p.thumb} alt="" />
          ) : status === "PROCESSING" ? (
            <div className="t-building">
              <Spinner />
              <span>Building your drift…</span>
            </div>
          ) : status === "AWAITING_PAYMENT" ? (
            <span>Clip saved · converts after checkout</span>
          ) : status === "FAILED" ? (
            <span>Couldn't build this clip</span>
          ) : (
            <span>No preview yet</span>
          )}
          {selected && isReady(status) && <span className="t-previewing">Previewing</span>}
        </div>
        <div className="t-step-meta">
          <StatusPill status={status} />
          {p?.frameCount ? <span className="d-faint">{p.frameCount} frames</span> : null}
        </div>
        {p?.hostingExpiresAt && (
          <div className="d-faint t-tip">Hosted until {new Date(p.hostingExpiresAt).toLocaleDateString()}</div>
        )}
        {!readOnly && (status === "FAILED" || status === "AWAITING_PAYMENT" || isReady(status)) && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) replaceClip(f);
              }}
            />
            {replacing !== null ? (
              <div className="t-progress">
                <i style={{ width: `${replacing}%` }} />
              </div>
            ) : (
              <button className={`d-btn sm ${status === "FAILED" ? "primary" : "ghost"}`} onClick={() => fileRef.current?.click()}>
                {status === "FAILED" ? "Try another clip" : "Replace clip"}
              </button>
            )}
          </div>
        )}
        {status === "PROCESSING" && <div className="d-faint t-tip">You can keep going — this drift updates itself when it's ready.</div>}
      </div>

      <div className="t-step-body">
        <div className="t-step-head">
          <div className="t-step-title">
            <span className="d-eyebrow">Drift {index + 1}</span>
            <div className="t-name-row">
              <input
                ref={nameRef}
                className="t-title-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && dirty && save()}
                placeholder={`Drift ${index + 1}`}
                maxLength={120}
                aria-label="Drift name"
                readOnly={readOnly}
              />
              {!readOnly && (
                <button
                  type="button"
                  className="t-pencil"
                  title="Rename this drift"
                  aria-label="Rename this drift"
                  onClick={() => {
                    nameRef.current?.focus();
                    nameRef.current?.select();
                  }}
                >
                  <PencilIcon />
                </button>
              )}
            </div>
          </div>
          <div className="t-actions">
            {!readOnly && (
              <span className="t-arrows">
                <button className="d-btn sm" onClick={() => move(-1)} disabled={index === 0} title="Move up" aria-label="Move up">
                  ↑
                </button>
                <button className="d-btn sm" onClick={() => move(1)} disabled={index === flow.steps.length - 1} title="Move down" aria-label="Move down">
                  ↓
                </button>
              </span>
            )}
            {p?.playerPath && isReady(status) && (
              <a className="d-btn ghost sm" href={p.playerPath} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                Open
              </a>
            )}
            {!readOnly && onPins && isReady(status) && (
              <button className="d-btn ghost sm" onClick={onPins} title="Label spots in this drift — each pin follows its spot as people drag">
                Pins{p?.pinCount ? ` · ${p.pinCount}` : ""}
              </button>
            )}
            {!readOnly && (
              <button className="d-btn ghost sm" onClick={remove}>
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="t-fields fluid">
          <div className="t-field">
            <label className="d-label">Background</label>
            <div className="t-color">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(bg) ? bg : "#101418"}
                onChange={(e) => setBg(e.target.value)}
                aria-label="Background colour"
                disabled={readOnly}
              />
              <button className={`d-btn sm ${bg === "transparent" ? "soft" : ""}`} onClick={() => setBg(bg === "transparent" ? "" : "transparent")} disabled={readOnly}>
                Transparent
              </button>
              {bg && (
                <button className="d-btn ghost sm" onClick={() => setBg("")} disabled={readOnly}>
                  Auto
                </button>
              )}
            </div>
          </div>
          <div className="t-field">
            <label className="d-label">Drift direction</label>
            <div className="t-seg" role="radiogroup" aria-label="Drift direction">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={direction === d.value}
                  className={`t-seg-btn ${direction === d.value ? "on" : ""}`}
                  onClick={() => setDirection(d.value)}
                  title={d.title}
                  disabled={readOnly}
                >
                  {d.glyph}
                  <small>{d.short}</small>
                </button>
              ))}
            </div>
          </div>
        </div>

        {!readOnly && (
          <div className="t-step-foot">
            <span className={`t-unsaved ${dirty ? "on" : ""}`}>{dirty ? "Unsaved changes" : "All changes saved"}</span>
            <button className="d-btn primary" onClick={save} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save Drift"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── + Add to Tour ───────────────────────────

function UploadSlot({
  flow,
  index,
  maxClip,
  billing,
  onAdded,
}: {
  flow: Flow;
  index: number;
  maxClip: number | null;
  billing: Billing | null;
  onAdded: (flow: Flow, stepId: string | null, billing?: Billing) => void;
}) {
  const [progress, setProgress] = useState<{ n: number; total: number; pct: number } | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Clips wait in a queue: pick or drop more at any time — even mid-upload — and they
  // upload one after another in the order chosen (phones stay responsive, drift order
  // stays right). Each becomes a drift: building right away while free drifts last,
  // otherwise saved for checkout. The server builds them one at a time.
  const queueRef = useRef<File[]>([]);
  const runningRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      queueRef.current = [];
    };
  }, []);

  // Closing the tab mid-upload would drop the clips still in line — ask first.
  const uploading = progress !== null;
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const run = async () => {
    runningRef.current = true;
    let done = 0;
    let added = 0;
    let waiting = 0;
    let nextNum = index + 1;
    while (aliveRef.current && queueRef.current.length) {
      const file = queueRef.current.shift()!;
      done++;
      const n = done;
      setProgress({ n, total: n + queueRef.current.length, pct: 0 });
      const d = await readClipDuration(file);
      if (maxClip && d && d > maxClip + 0.5) {
        notify.error(`"${file.name}" is ${d.toFixed(1)}s — clips must be ${maxClip}s or shorter.`);
        continue;
      }
      const fd = new FormData();
      fd.append("video", file);
      fd.append("name", `Drift ${nextNum}`);
      try {
        const r = await apiEndpoints.driftAddFlowStep(flow.id, fd, (e) => {
          if (e.total) setProgress({ n, total: n + queueRef.current.length, pct: Math.round((e.loaded / e.total) * 100) });
        });
        added++;
        nextNum = (r.data.flow?.steps?.length ?? nextNum) + 1;
        if (r.data.step?.product?.status === "AWAITING_PAYMENT") waiting++;
        onAdded(r.data.flow, r.data.step?.id || null, r.data.billing);
      } catch (e) {
        if ((e as any)?.response?.data?.code === "PLAN_LIMIT") {
          // Out of room on this tour: stop, instead of failing every clip still in line.
          const skipped = queueRef.current.length;
          queueRef.current = [];
          notify.error(`${apiError(e)}${skipped ? ` ${skipped} more clip${skipped === 1 ? " wasn't" : "s weren't"} uploaded.` : ""}`);
          break;
        }
        notify.error(`${file.name}: ${apiError(e)}`);
      }
    }
    runningRef.current = false;
    if (!aliveRef.current) return;
    setProgress(null);
    if (!added) return;
    const building = added - waiting;
    if (waiting) {
      notify.success(
        `${added} clip${added === 1 ? "" : "s"} saved${building ? ` — ${building} building now` : ""}. ${waiting} ${waiting === 1 ? "is" : "are"} waiting for checkout.`,
      );
    } else {
      notify.success(`${added} clip${added === 1 ? "" : "s"} uploaded — building your drift${added === 1 ? "" : "s"}`);
    }
  };

  const enqueue = (list: File[]) => {
    const files = list.filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
    if (!files.length) {
      notify.error("Please choose video clips (MP4 or MOV)");
      return;
    }
    queueRef.current.push(...files);
    if (runningRef.current) {
      setProgress((p) => (p ? { ...p, total: p.n + queueRef.current.length } : p));
      notify.success(`${files.length} more clip${files.length === 1 ? "" : "s"} added to the queue`);
      return;
    }
    void run();
  };

  const pick = () => inputRef.current?.click();
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick();
    }
  };
  const drop = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const list = Array.from(e.dataTransfer.files || []);
      if (list.length) enqueue(list);
    },
  };
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="video/*"
      multiple
      hidden
      onChange={(e) => {
        const list = Array.from(e.target.files || []);
        e.target.value = "";
        if (list.length) enqueue(list);
      }}
    />
  );

  const note =
    !billing || billing.unlimited
      ? ""
      : billing.freeLeft && billing.freeLeft > 0
        ? `${billing.freeLeft} free drift${billing.freeLeft === 1 ? "" : "s"} left, then ${billing.price} each`
        : `${billing.price} per drift — you check out before they're built`;

  if (progress) {
    const inLine = progress.total - progress.n;
    return (
      <div className="d-card d-card-pad t-route-item is-drop" data-n={index + 1} style={{ display: "grid", gap: 10, ["--n" as any]: index }}>
        {input}
        <div className="t-inline" style={{ justifyContent: "space-between" }}>
          <div className="d-h2">
            Uploading {progress.total > 1 ? `clip ${progress.n} of ${progress.total}` : "your clip"}
          </div>
          <span className="d-faint">{progress.pct}%</span>
        </div>
        <div className="t-progress">
          <i style={{ width: `${progress.pct}%` }} />
        </div>
        <div className="d-faint" style={{ fontSize: 12 }}>
          {progress.pct >= 100 ? "Checking the clip…" : "Keep this page open until the uploads finish."}
          {inLine > 0 && ` ${inLine} more in line.`}
        </div>
        <div className={`t-drop t-drop-more ${over ? "over" : ""}`} onClick={pick} onKeyDown={onKey} role="button" tabIndex={0} {...drop}>
          <span className="big">+ Add more clips</span>
          <span className="d-faint" style={{ fontSize: 12 }}>
            They upload next, in the order you pick them
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`t-drop t-route-item is-drop ${over ? "over" : ""}`}
      data-n={index + 1}
      style={{ ["--n" as any]: index }}
      onClick={pick}
      onKeyDown={onKey}
      role="button"
      tabIndex={0}
      {...drop}
    >
      {input}
      <div className="ico" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
      </div>
      <div className="d-eyebrow">Drift {index + 1}</div>
      <div className="big">{index === 0 ? "Upload your clips" : "+ Add more clips"}</div>
      <div className="d-sub" style={{ fontSize: 13 }}>
        Select several at once · {maxClip ? `up to ${maxClip}s each · ` : ""}each clip becomes a drift, in order
      </div>
      <span className="d-btn primary sm t-drop-pick" aria-hidden>
        Select clips
      </span>
      {note && <div className="t-drop-note">{note}</div>}
    </div>
  );
}

// ─────────────────────────── the pathway (admin) ───────────────────────────

export default function TourBuilder({
  flowId,
  page,
  onPublicView,
  onSlugChange,
}: {
  flowId: string;
  page: Page;
  onPublicView: () => void;
  onSlugChange: (slug: string) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const superAdmin = user?.role === "SUPERADMIN";
  const [flow, setFlow] = useState<Flow | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [search, setSearch] = useSearchParams();
  const [missing, setMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // The share sheet: "celebrate" right after publishing, "open" from the Share button.
  const [share, setShare] = useState<"none" | "open" | "celebrate">("none");
  const [showGuide, setShowGuide] = useState(false);
  // The caller's page role (from the API): Viewers get the builder without its controls.
  const [role, setRole] = useState<PageRole | null>(null);
  // The drift whose pins are being edited.
  const [pinStep, setPinStep] = useState<FlowStep | null>(null);
  // "Path" = compact rows you expand one at a time (default); "Cards" = every drift open.
  const [viewMode, setViewMode] = useState<"path" | "cards">(() => {
    try {
      return localStorage.getItem("drift_builder_view") === "cards" ? "cards" : "path";
    } catch {
      return "path";
    }
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [demoSaving, setDemoSaving] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const slugRef = useRef<string | null>(null);
  const switchView = (m: "path" | "cards") => {
    setViewMode(m);
    try {
      localStorage.setItem("drift_builder_view", m);
    } catch {
      /* ignore */
    }
  };

  // Tour-level fields follow the server copy only while they're not being edited.
  const flowServerRef = useRef<{ name: string; description: string } | null>(null);
  const applyFlow = (f: Flow) => {
    setFlow(f);
    const next = { name: f.name, description: f.description || "" };
    const prev = flowServerRef.current;
    setName((v) => (!prev || v === prev.name ? next.name : v));
    setDescription((v) => (!prev || v === prev.description ? next.description : v));
    flowServerRef.current = next;
    setSelectedId((cur) => (cur && f.steps.some((s) => s.id === cur) ? cur : f.steps[0]?.id || null));
    // An unpublished tour's link follows its name: keep the address bar in step.
    if (slugRef.current && slugRef.current !== f.slug) onSlugChange(f.slug);
    slugRef.current = f.slug;
  };

  const load = async () => {
    try {
      const r = await apiEndpoints.driftFlow(flowId);
      applyFlow(r.data.flow);
      setQuota(r.data.quota);
      setBilling(r.data.billing || null);
      setRole((r.data.role as PageRole) || "ADMIN");
    } catch (e: any) {
      if (e?.status === 404) setMissing(true);
      else notify.error(apiError(e));
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  // A creator's first tour: open the Capture Guide once, before the first clip goes up.
  const emptyTour = !!flow && flow.steps.length === 0;
  useEffect(() => {
    if (!emptyTour || !canEditPage(role)) return;
    try {
      if (localStorage.getItem(CAPTURE_GUIDE_SEEN_KEY)) return;
      localStorage.setItem(CAPTURE_GUIDE_SEEN_KEY, "1");
    } catch {
      /* storage blocked → still show it this once */
    }
    setShowGuide(true);
  }, [emptyTour, role]);

  // Poll while any drift is building.
  const processing = flow?.counts.processing || 0;
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, flowId]);

  // Back from Stripe Checkout: confirm the session right away (the webhook may still
  // be on its way), then refresh; a cancel just says the clips are kept.
  useEffect(() => {
    const state = search.get("checkout");
    if (!state) return;
    const sessionId = search.get("session_id") || "";
    const next = new URLSearchParams(search);
    next.delete("checkout");
    next.delete("session_id");
    setSearch(next, { replace: true });
    if (state === "success" && sessionId) {
      apiEndpoints
        .driftConfirmCheckout(sessionId)
        .then((r) => {
          notify.success(
            r.data?.status === "paid"
              ? "Payment received — your drifts are building now"
              : "Your payment is processing — your drifts start building as soon as it clears",
          );
          load();
        })
        .catch((e) => notify.error(apiError(e)));
    } else if (state === "cancel") {
      notify.info("Checkout canceled — your clips are saved for later");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkout = async () => {
    if (!flow) return;
    setCheckingOut(true);
    try {
      const r = await apiEndpoints.driftCheckoutFlow(flow.id);
      if (r.data?.url) {
        window.location.assign(r.data.url);
        return;
      }
      notify.error("We couldn't open checkout. Please try again.");
    } catch (e: any) {
      // An earlier checkout already paid (or is still clearing): say so and refresh.
      const code = e?.response?.data?.code;
      if (code === "ALREADY_PAID") {
        notify.success(apiError(e));
        load();
      } else if (code === "CHECKOUT_IN_PROGRESS") {
        notify.info(apiError(e));
        load();
      } else {
        notify.error(apiError(e));
      }
    }
    setCheckingOut(false);
  };

  const saveName = async () => {
    if (!flow || !name.trim() || name.trim() === flow.name) return;
    setNameSaving(true);
    try {
      const r = await apiEndpoints.driftUpdateFlow(flow.id, { name: name.trim() });
      applyFlow(r.data.flow);
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setNameSaving(false);
    }
  };

  const saveSettings = async () => {
    if (!flow) return;
    setSettingsSaving(true);
    try {
      const r = await apiEndpoints.driftUpdateFlow(flow.id, { description: description.trim() || null });
      applyFlow(r.data.flow);
      notify.success("Tour settings saved");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setSettingsSaving(false);
    }
  };

  const publish = async (on: boolean) => {
    if (!flow) return;
    setPublishing(true);
    try {
      const r = on ? await apiEndpoints.driftPublishFlow(flow.id) : await apiEndpoints.driftUnpublishFlow(flow.id);
      applyFlow(r.data.flow);
      if (on) {
        const copied = await copyText(publicUrl(r.data.flow.publicPath));
        notify.success(copied ? "Your tour is live — link copied" : "Your tour is live");
        setShare("celebrate");
      } else notify.success("Tour unpublished");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setPublishing(false);
    }
  };

  const reorderTo = async (from: number, to: number) => {
    if (!flow || from === to || to < 0 || to >= flow.steps.length) return;
    const ids = flow.steps.map((s) => s.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    try {
      const r = await apiEndpoints.driftReorderFlowSteps(flow.id, ids);
      applyFlow(r.data.flow);
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  const setCover = async (url: string | null) => {
    if (!flow) return;
    setCoverBusy(true);
    try {
      const r = await apiEndpoints.driftUpdateFlow(flow.id, { coverUrl: url || "" });
      applyFlow(r.data.flow);
      notify.success(url ? "Cover updated" : "Cover back to the first drift");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setCoverBusy(false);
    }
  };

  const uploadCover = async (file: File) => {
    if (!flow) return;
    if (!file.type.startsWith("image/")) return notify.error("Please choose an image (JPG, PNG or WebP)");
    const fd = new FormData();
    fd.append("image", file);
    setCoverBusy(true);
    try {
      const r = await apiEndpoints.driftUploadFlowCover(flow.id, fd);
      applyFlow(r.data.flow);
      notify.success("Cover uploaded");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setCoverBusy(false);
    }
  };

  const copyLink = async () => {
    if (!flow) return;
    const ok = await copyText(publicUrl(flow.publicPath));
    notify[ok ? "success" : "error"](ok ? "Link copied" : "Couldn't copy the link");
  };

  const shell = (body: React.ReactNode) => (
    <TourShell>
      <style>{TOUR_PAGE_STYLES}</style>
      {body}
    </TourShell>
  );
  const homePath = page.path || "/tour/dashboard";

  if (missing) {
    return shell(
      <div className="d-empty">
        This tour doesn't exist (or isn't on this page).{" "}
        <Link to={homePath} style={{ color: "var(--accent)" }}>
          Back to {page.name}
        </Link>
      </div>,
    );
  }
  if (!flow || !quota) {
    return shell(
      <div style={{ display: "grid", placeItems: "center", minHeight: "40vh", gap: 10 }}>
        <Spinner />
      </div>,
    );
  }

  const canPublish = flow.counts.steps > 0 && flow.counts.processing === 0 && flow.counts.failed === 0 && !flow.counts.awaiting;
  const maxClip = superAdmin ? null : quota.maxClipSeconds;
  // Viewers see the whole tour but none of the controls (the API refuses their changes too).
  const readOnly = !canEditPage(role);
  const selected = flow.steps.find((s) => s.id === selectedId) || null;
  const selectedProduct = selected?.product || null;
  // Anything that moves a pin re-inks the rail.
  const routeDep = [viewMode, expandedId, flow.counts.awaiting, ...flow.steps.map((s) => `${s.id}:${s.product?.status || ""}`)].join("|");
  const renderCard = (s: FlowStep, i: number) => (
    <StepCard
      key={s.id}
      flow={flow}
      step={s}
      index={i}
      selected={s.id === selectedId}
      onSelect={() => setSelectedId(s.id)}
      onChanged={applyFlow}
      maxClip={maxClip}
      readOnly={readOnly}
      onPins={() => setPinStep(s)}
    />
  );

  return shell(
    <>
      <div className="t-inline" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <Link to={homePath} className="t-back">
          ← {page.name} Tours
        </Link>
        {!readOnly && (
          <button className="d-btn ghost sm" onClick={() => navigate(`${homePath}?new=1`)} title="Start a separate tour on this page">
            + New Tour
          </button>
        )}
      </div>

      {readOnly && (
        <div className="tpg-note">
          <span>View only — you can look through this tour, but not change it.</span>
        </div>
      )}

      <div className="t-head t-rise" style={{ marginTop: 6 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div className="d-eyebrow" style={{ marginBottom: 6 }}>
            Tour · <StatusPill status={flow.status} flow />
            {flow.hidden && <span className="d-pill" style={{ marginLeft: 6 }}>Hidden</span>}
          </div>
          <div className="t-inline">
            <input
              className="d-input t-name-input"
              style={{ flex: "1 1 260px" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              maxLength={80}
              aria-label="Tour name"
              readOnly={readOnly}
            />
            {nameSaving && <Spinner />}
          </div>
          <div className="t-muted-row" style={{ marginTop: 8 }}>
            <span>
              {flow.counts.ready}/{flow.counts.steps} drifts ready
            </span>
            <span className="t-link" style={{ padding: "4px 8px" }}>
              <code>{publicUrl(flow.publicPath).replace(/^https?:\/\//, "")}</code>
              {flow.status === "PUBLISHED" && (
                <button className="d-btn ghost sm" onClick={copyLink}>
                  Copy
                </button>
              )}
            </span>
          </div>
        </div>
        <div className="t-actions">
          <button className="d-btn t-guide" onClick={() => setShowGuide(true)} title="How to film a great drift">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
            Capture Guide
          </button>
          {flow.entryPath && (
            <a className="d-btn" href={flow.entryPath} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              ▶ Start Tour
            </a>
          )}
          <button className="d-btn" onClick={onPublicView} title="See this pathway the way visitors do">
            Public view
          </button>
          <div className="d-tabs" role="tablist" aria-label="Builder view">
            <button role="tab" aria-selected={viewMode === "path"} className={`d-tab ${viewMode === "path" ? "active" : ""}`} onClick={() => switchView("path")}>
              Path
            </button>
            <button role="tab" aria-selected={viewMode === "cards"} className={`d-tab ${viewMode === "cards" ? "active" : ""}`} onClick={() => switchView("cards")}>
              Cards
            </button>
          </div>
          {!readOnly && (
            <button className="d-btn" onClick={() => setShowSettings((v) => !v)}>
              {showSettings ? "Hide settings" : "Tour settings"}
            </button>
          )}
          {flow.status === "PUBLISHED" ? (
            <>
              <button className="d-btn primary" onClick={() => setShare("open")}>
                Share
              </button>
              {!readOnly && (
                <button className="d-btn" onClick={() => publish(false)} disabled={publishing}>
                  Unpublish
                </button>
              )}
            </>
          ) : !readOnly ? (
            <button
              className="d-btn primary"
              onClick={() => publish(true)}
              disabled={publishing || !canPublish}
              title={!canPublish ? (flow.counts.awaiting ? "Check out the new drifts first" : "Every drift needs to finish building first") : undefined}
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          ) : null}
        </div>
      </div>

      {showSettings && !readOnly && (
        <div className="d-card d-card-pad" style={{ marginBottom: 18 }}>
          <div className="d-eyebrow" style={{ marginBottom: 12 }}>Tour settings</div>
          <div className="t-cover">
            <div className="t-cover-current">{flow.thumb ? <img src={flow.thumb} alt="" /> : <span>No cover yet</span>}</div>
            <div className="t-cover-controls">
              <div className="d-label">Cover image</div>
              <div className="d-sub" style={{ fontSize: 12.5 }}>
                The picture on your page and in share previews. Pick a frame from the first drift — its start, middle or
                end — or upload your own.
              </div>
              {flow.coverFrames.length > 0 && (
                <div className="t-cover-picks" aria-label="Use a frame from the first drift">
                  {flow.coverFrames.map((url, i) => (
                    <button
                      key={url + i}
                      type="button"
                      className={`t-cover-pick ${flow.coverUrl === url ? "on" : ""}`}
                      onClick={() => setCover(url)}
                      title={`Use the ${COVER_LABELS[i]?.toLowerCase() || "frame"} of the first drift`}
                      disabled={coverBusy}
                    >
                      <img src={url} alt="" />
                      <span className="lbl">{COVER_LABELS[i] || i + 1}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="t-actions">
                <input
                  ref={coverRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) uploadCover(f);
                  }}
                />
                <button className="d-btn sm" onClick={() => coverRef.current?.click()} disabled={coverBusy}>
                  {coverBusy ? "Working…" : "Upload image"}
                </button>
                {flow.coverUrl && (
                  <button className="d-btn ghost sm" onClick={() => setCover(null)} disabled={coverBusy}>
                    Use first drift
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="t-fields">
            <div>
              <label className="d-label">Description</label>
              <input
                className="d-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional — shown under the tour title and in share previews"
                maxLength={600}
              />
            </div>
          </div>
          <div className="t-actions" style={{ marginTop: 12 }}>
            <button className="d-btn primary" onClick={saveSettings} disabled={settingsSaving || description === (flow.description || "")}>
              {settingsSaving ? "Saving…" : "Save settings"}
            </button>
            <span className="d-faint" style={{ fontSize: 12 }}>
              Buttons are automatic: Home, and the next drift's name. The last drift loops back to #1.
            </span>
          </div>
          {superAdmin && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <label className="t-inline" style={{ gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={flow.isDemo}
                  disabled={demoSaving}
                  onChange={async (e) => {
                    const on = e.target.checked;
                    setDemoSaving(true);
                    try {
                      const r = await apiEndpoints.driftUpdateFlow(flow.id, { isDemo: on });
                      applyFlow(r.data.flow);
                      notify.success(on ? "This tour is now drift.li's demo tour" : "No longer the demo tour");
                    } catch (err) {
                      notify.error(apiError(err));
                    } finally {
                      setDemoSaving(false);
                    }
                  }}
                />
                <span className="d-sub">Use as drift.li's demo tour (every page's "View Demo" by default) — superadmin only.</span>
              </label>
            </div>
          )}
        </div>
      )}

      {flow.counts.awaiting > 0 && billing && !readOnly && (
        <div className="t-checkout t-rise">
          <div style={{ minWidth: 0 }}>
            <div className="d-h2">
              {flow.counts.awaiting} new drift{flow.counts.awaiting === 1 ? "" : "s"} ready for checkout
            </div>
            <p className="d-sub" style={{ fontSize: 13 }}>
              {billing.price} per drift · conversion + 1 year of hosting included. Nothing is built until checkout.
            </p>
            {!billing.paymentsEnabled && (
              <p className="d-sub" style={{ fontSize: 12.5, color: "var(--warn)" }}>
                Checkout isn't switched on yet — contact us to activate paid drifts.
              </p>
            )}
          </div>
          <button className="d-btn primary" onClick={checkout} disabled={checkingOut || !billing.paymentsEnabled}>
            {checkingOut ? "Opening checkout…" : `Checkout · ${money(billing.priceCents * flow.counts.awaiting, billing.currency)}`}
          </button>
        </div>
      )}

      <div className="t-builder">
        <div className="t-steps t-route has-ink" ref={routeRef}>
          <RouteInk host={routeRef} dep={routeDep} />
          {viewMode === "cards"
            ? flow.steps.map((s, i) => renderCard(s, i))
            : flow.steps.map((s, i) => {
                const open = expandedId === s.id;
                const st = s.product?.status || "DRAFT";
                return (
                  <div
                    key={s.id}
                    className={`t-path-item t-route-item ${open ? "is-open" : ""} ${stateClass(st)}`}
                    data-n={i + 1}
                    style={{ ["--n" as any]: i }}
                  >
                    <div
                      className={`t-path-row ${dragIdx === i ? "dragging" : ""} ${overIdx === i && dragIdx !== null && dragIdx !== i ? "over" : ""} ${s.id === selectedId ? "is-selected" : ""}`}
                      draggable={!readOnly}
                      onDragStart={() => !readOnly && setDragIdx(i)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (overIdx !== i) setOverIdx(i);
                      }}
                      onDragLeave={() => overIdx === i && setOverIdx(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!readOnly && dragIdx !== null && dragIdx !== i) reorderTo(dragIdx, i);
                        setDragIdx(null);
                        setOverIdx(null);
                      }}
                      onDragEnd={() => {
                        setDragIdx(null);
                        setOverIdx(null);
                      }}
                      onClick={() => {
                        setExpandedId((cur) => (cur === s.id ? null : s.id));
                        setSelectedId(s.id);
                      }}
                    >
                      <div className="t-path-thumb">
                        {s.product?.thumb ? <img src={s.product.thumb} alt="" /> : st === "PROCESSING" ? <Spinner /> : <span>—</span>}
                      </div>
                      <div className="t-path-main">
                        <div className="t-path-name">{driftName(s, i)}</div>
                        <div className="t-muted-row">
                          <StatusPill status={st} />
                          <span className="d-faint">Drift {i + 1}</span>
                        </div>
                      </div>
                      <div className="t-path-side" onClick={(e) => e.stopPropagation()}>
                        {!readOnly && (
                          <span className="t-arrows">
                            <button className="d-btn sm" onClick={() => reorderTo(i, i - 1)} disabled={i === 0} title="Move up" aria-label="Move up">
                              ↑
                            </button>
                            <button className="d-btn sm" onClick={() => reorderTo(i, i + 1)} disabled={i === flow.steps.length - 1} title="Move down" aria-label="Move down">
                              ↓
                            </button>
                          </span>
                        )}
                        <span className={`t-chevron ${open ? "open" : ""}`} aria-hidden>
                          ▾
                        </span>
                      </div>
                    </div>
                    {open && <div className="t-path-expand">{renderCard(s, i)}</div>}
                  </div>
                );
              })}

          {readOnly ? (
            flow.steps.length === 0 && <div className="d-empty">No drifts in this tour yet.</div>
          ) : (
            <UploadSlot
              key={flow.id}
              flow={flow}
              index={flow.steps.length}
              maxClip={maxClip}
              billing={billing}
              onAdded={(f, stepId, b) => {
                applyFlow(f);
                if (b) setBilling(b);
                if (stepId) setSelectedId(stepId);
              }}
            />
          )}
        </div>

        <aside className="t-preview">
          <div className="d-eyebrow">Preview</div>
          <div className="t-frame">
            {selectedProduct && isReady(selectedProduct.status) ? (
              <iframe key={selectedProduct.id + selectedProduct.updatedAt} src={`/embed/${selectedProduct.id}`} title={`Preview of ${selectedProduct.name}`} allow="fullscreen" />
            ) : selectedProduct?.status === "AWAITING_PAYMENT" ? (
              <span style={{ padding: 20 }}>{selectedProduct.name} converts after checkout</span>
            ) : selectedProduct?.status === "PROCESSING" ? (
              <div style={{ display: "grid", gap: 10, justifyItems: "center", padding: 20 }}>
                <Spinner />
                <span>Building {selectedProduct.name}…</span>
              </div>
            ) : (
              <span style={{ padding: 20 }}>{readOnly ? "Pick a drift to preview it here" : "Upload a clip to preview it here"}</span>
            )}
          </div>
          {flow.steps.length > 0 && (
            <div className="d-card d-card-pad" style={{ display: "grid", gap: 8 }}>
              <div className="d-eyebrow">The path</div>
              <div className="t-chain">
                {flow.steps.map((s, i) => (
                  <span key={s.id} className="t-chain">
                    <b>{driftName(s, i)}</b>
                    <span className="arr">→</span>
                  </span>
                ))}
                <span className="loop">↺ {driftName(flow.steps[0], 0)}</span>
              </div>
              <div className="d-faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                Every drift has Home and the next drift's name. Reorder freely — the buttons re-link themselves.
              </div>
            </div>
          )}
        </aside>
      </div>

      {flow.status === "PUBLISHED" && (
        <div className="d-banner ok" style={{ marginTop: 20 }}>
          <span>
            Live at <strong>{publicUrl(flow.publicPath).replace(/^https?:\/\//, "")}</strong> — changes you save show up right away.
          </span>
          <button className="d-btn sm" onClick={() => setShare("open")}>
            Share
          </button>
          <button className="d-btn ghost sm" onClick={copyLink}>
            Copy link
          </button>
        </div>
      )}
      {share !== "none" && (
        <ShareSheet flow={flow} page={page} celebrate={share === "celebrate"} onClose={() => setShare("none")} canManageLinks={!readOnly} />
      )}
      {pinStep && (
        <PinEditor
          key={pinStep.id}
          flowId={flow.id}
          step={pinStep}
          driftName={pinStep.product?.name || "Drift"}
          onSaved={applyFlow}
          onClose={() => setPinStep(null)}
        />
      )}
      {showGuide && <CaptureGuideSheet onClose={() => setShowGuide(false)} />}
    </>,
  );
}
