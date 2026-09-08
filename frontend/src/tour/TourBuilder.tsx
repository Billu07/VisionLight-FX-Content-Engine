import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
import { useAuth } from "../hooks/useAuth";
import type { Flow, FlowStep, Quota } from "./types";
import { isReady } from "./types";
import { CREATOR_HOME } from "./tourSession";
import {
  Spinner,
  StatusPill,
  TourShell,
  UpgradeCard,
  apiError,
  copyText,
  publicUrl,
  readClipDuration,
} from "./tourUi";

/**
 * /tour/:id/edit — the builder. A vertical "map" of numbered stops (each a
 * drift): upload a clip → it builds in the background while you write the
 * title, headline and button → reorder with arrows → publish. The path links
 * itself: every stop's Next button is derived from the order, so reordering
 * never breaks it. Desktop shows a live preview of the selected stop (the real
 * player in an iframe) plus the link chain.
 */

type LinkOption = { label: string; url: string };
type PreviewDraft = { placement: string; btnLabel: string; hasCustom: boolean };

const DIRECTIONS = [
  { value: "LTR", glyph: "→", short: "L→R", title: "Left to right — the camera pans right" },
  { value: "RTL", glyph: "←", short: "R→L", title: "Right to left" },
  { value: "TTB", glyph: "↓", short: "T→B", title: "Top to bottom" },
  { value: "BTT", glyph: "↑", short: "B→T", title: "Bottom to top" },
] as const;
const PLACEMENTS = [
  { value: "CENTER", label: "Centre · Next left" },
  { value: "CENTER_REV", label: "Centre · Next right" },
  { value: "LEFT", label: "Bottom left" },
  { value: "RIGHT", label: "Bottom right" },
  { value: "SPLIT", label: "Spread · Next right" },
  { value: "SPLIT_REV", label: "Spread · Next left" },
] as const;

const DEFAULT_NEXT = "Next stop";
const DEFAULT_END = "Restart tour";
const CUSTOM = "__custom__";
const NONE = "";

const stepName = (s: FlowStep, i: number) => s.product?.name || `Stop ${i + 1}`;

// ─────────────────────────── link picker ───────────────────────────

function LinkPicker({
  value,
  options,
  onChange,
  allowNone,
  placeholder,
}: {
  value: string;
  options: LinkOption[];
  onChange: (url: string) => void;
  allowNone?: boolean;
  placeholder?: string;
}) {
  const known = options.some((o) => o.url === value);
  const [mode, setMode] = useState<string>(!value ? (allowNone ? NONE : CUSTOM) : known ? value : CUSTOM);
  useEffect(() => {
    if (value && options.some((o) => o.url === value)) setMode(value);
    else if (value) setMode(CUSTOM);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select
        className="d-select"
        value={mode}
        onChange={(e) => {
          const v = e.target.value;
          setMode(v);
          if (v === CUSTOM) onChange(value && !known ? value : "");
          else onChange(v);
        }}
      >
        {allowNone && <option value={NONE}>No button</option>}
        {options.length > 0 && (
          <optgroup label="Your stops">
            {options.map((o) => (
              <option key={o.url} value={o.url}>
                {o.label}
              </option>
            ))}
          </optgroup>
        )}
        <option value={CUSTOM}>A drift.li or picdrift.com link…</option>
      </select>
      {mode === CUSTOM && (
        <input
          className="d-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "https://drift.li/… or https://picdrift.com/…"}
          inputMode="url"
        />
      )}
    </div>
  );
}

// ─────────────────────────── one stop ───────────────────────────

function StepCard({
  flow,
  step,
  index,
  options,
  selected,
  onSelect,
  onChanged,
  maxClip,
  onPreview,
}: {
  flow: Flow;
  step: FlowStep;
  index: number;
  options: LinkOption[];
  selected: boolean;
  onSelect: () => void;
  onChanged: (flow: Flow) => void;
  maxClip: number;
  onPreview: (draft: PreviewDraft) => void;
}) {
  const p = step.product;
  const [name, setName] = useState(p?.name || "");
  const [title, setTitle] = useState(p?.title || "");
  const [btnLabel, setBtnLabel] = useState(step.customCta?.label || "");
  const [btnUrl, setBtnUrl] = useState(step.customCta?.url || "");
  const [bg, setBg] = useState(p?.background || "");
  const [loop, setLoop] = useState(!!p?.loopEnabled);
  const [direction, setDirection] = useState(p?.driftDirection || "LTR");
  const [placement, setPlacement] = useState(p?.ctaPlacement || "CENTER");
  const [saving, setSaving] = useState(false);
  // Live preview: the selected card's unsaved placement + button labels.
  useEffect(() => {
    if (!selected) return;
    onPreview({ placement, btnLabel: btnLabel.trim(), hasCustom: !!(btnLabel.trim() && btnUrl.trim()) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, placement, btnLabel, btnUrl]);
  const [replacing, setReplacing] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-sync a field from the server ONLY while it isn't being edited locally. The 3s
  // poll and every relink refresh the server copy; typing must never be thrown away.
  const serverRef = useRef({
    name: p?.name || "",
    title: p?.title || "",
    btnLabel: step.customCta?.label || "",
    btnUrl: step.customCta?.url || "",
    bg: p?.background || "",
    loop: !!p?.loopEnabled,
    direction: p?.driftDirection || "LTR",
    placement: p?.ctaPlacement || "CENTER",
  });
  useEffect(() => {
    const next = {
      name: p?.name || "",
      title: p?.title || "",
      btnLabel: step.customCta?.label || "",
      btnUrl: step.customCta?.url || "",
      bg: p?.background || "",
      loop: !!p?.loopEnabled,
      direction: p?.driftDirection || "LTR",
      placement: p?.ctaPlacement || "CENTER",
    };
    const prev = serverRef.current;
    setName((v) => (v === prev.name ? next.name : v));
    setTitle((v) => (v === prev.title ? next.title : v));
    setBtnLabel((v) => (v === prev.btnLabel ? next.btnLabel : v));
    setBtnUrl((v) => (v === prev.btnUrl ? next.btnUrl : v));
    setBg((v) => (v === prev.bg ? next.bg : v));
    setLoop((v) => (v === prev.loop ? next.loop : v));
    setDirection((v) => (v === prev.direction ? next.direction : v));
    setPlacement((v) => (v === prev.placement ? next.placement : v));
    serverRef.current = next;
  }, [p?.name, p?.title, step.customCta?.label, step.customCta?.url, p?.background, p?.loopEnabled, p?.driftDirection, p?.ctaPlacement]);

  const dirty =
    name !== (p?.name || "") ||
    title !== (p?.title || "") ||
    btnLabel !== (step.customCta?.label || "") ||
    btnUrl !== (step.customCta?.url || "") ||
    bg !== (p?.background || "") ||
    loop !== !!p?.loopEnabled ||
    direction !== (p?.driftDirection || "LTR") ||
    placement !== (p?.ctaPlacement || "CENTER");

  const save = async () => {
    if (!name.trim()) return notify.error("Give this stop a title");
    if ((btnLabel.trim() && !btnUrl.trim()) || (!btnLabel.trim() && btnUrl.trim())) {
      return notify.error("A button needs both a label and a link");
    }
    setSaving(true);
    try {
      const r = await apiEndpoints.driftUpdateFlowStep(flow.id, step.id, {
        name: name.trim(),
        title: title.trim(),
        background: bg,
        loopEnabled: loop,
        driftDirection: direction,
        ctaPlacement: placement,
        customCta: btnLabel.trim() && btnUrl.trim() ? { label: btnLabel.trim(), url: btnUrl.trim() } : null,
      });
      onChanged(r.data.flow);
      notify.success("Stop saved");
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
    const ok = await confirmAction(`Remove "${stepName(step, index)}" from the tour?`);
    if (!ok) return;
    try {
      const r = await apiEndpoints.driftDeleteFlowStep(flow.id, step.id);
      onChanged(r.data.flow);
      notify.success("Stop removed");
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  const replaceClip = async (file: File) => {
    const d = await readClipDuration(file);
    if (d && d > maxClip + 0.5) return notify.error(`Clips must be ${maxClip}s or shorter — this one is ${d.toFixed(1)}s.`);
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
  const next = flow.steps[index + 1];
  const nextLabel = flow.settings.nextLabel || DEFAULT_NEXT;

  const autoLink = next
    ? `${nextLabel} → ${stepName(next, index + 1)}`
    : flow.endCta
      ? `${flow.endCta.label} → ${flow.endCta.url}`
      : flow.steps.length > 1
        ? `${DEFAULT_END} → ${stepName(flow.steps[0], 0)}`
        : "add a second stop to link this one on";

  return (
    <div
      className={`d-card t-step t-route-item ${selected ? "is-selected" : ""}`}
      data-n={index + 1}
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
        {(status === "FAILED" || isReady(status)) && (
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
        {status === "PROCESSING" && (
          <div className="d-faint t-tip">You can keep writing — this stop updates itself when it's ready.</div>
        )}
      </div>

      <div className="t-step-body">
        <div className="t-step-head">
          <div className="t-step-title">
            <span className="d-eyebrow">Stop {index + 1}</span>
            <input
              className="t-title-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Give this stop a title"
              maxLength={120}
              aria-label="Stop title"
            />
          </div>
          <div className="t-actions">
            <span className="t-arrows">
              <button className="d-btn sm" onClick={() => move(-1)} disabled={index === 0} title="Move up" aria-label="Move up">
                ↑
              </button>
              <button className="d-btn sm" onClick={() => move(1)} disabled={index === flow.steps.length - 1} title="Move down" aria-label="Move down">
                ↓
              </button>
            </span>
            {p?.playerPath && isReady(status) && (
              <a className="d-btn ghost sm" href={p.playerPath} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                Open
              </a>
            )}
            <button className="d-btn ghost sm" onClick={remove}>
              Remove
            </button>
          </div>
        </div>

        <div className="t-fields fluid">
          <div className="t-field">
            <label className="d-label">Headline</label>
            <input className="d-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Morning light, garden views" maxLength={120} />
          </div>
          <div className="t-field">
            <label className="d-label">Button label</label>
            <input className="d-input" value={btnLabel} onChange={(e) => setBtnLabel(e.target.value)} placeholder="e.g. Book a viewing" maxLength={40} />
          </div>
          <div className="t-field">
            <label className="d-label">Button link</label>
            <LinkPicker value={btnUrl} options={options.filter((o) => o.url !== p?.playerPath)} onChange={setBtnUrl} allowNone />
          </div>
          <div className="t-field">
            <label className="d-label">Background</label>
            <div className="t-color">
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(bg) ? bg : "#101418"}
                onChange={(e) => setBg(e.target.value)}
                aria-label="Background colour"
              />
              <button className={`d-btn sm ${bg === "transparent" ? "soft" : ""}`} onClick={() => setBg(bg === "transparent" ? "" : "transparent")}>
                Transparent
              </button>
              {bg && (
                <button className="d-btn ghost sm" onClick={() => setBg("")}>
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
                >
                  {d.glyph}
                  <small>{d.short}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="t-field">
            <label className="d-label">Buttons</label>
            <div className="t-chips" role="radiogroup" aria-label="Button placement">
              {PLACEMENTS.map((pl) => (
                <button
                  key={pl.value}
                  type="button"
                  role="radio"
                  aria-checked={placement === pl.value}
                  className={`t-chip-btn ${placement === pl.value ? "on" : ""}`}
                  onClick={() => setPlacement(pl.value)}
                >
                  {pl.label}
                </button>
              ))}
            </div>
          </div>
          <div className="t-field t-field-row">
            <label className="t-switch">
              <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
              <i />
              <span>
                Loop
                <small>dragging wraps end → start</small>
              </span>
            </label>
          </div>
          <div className="t-field t-field-row">
            <div className="t-next">
              <span className="d-faint">Auto link:</span>
              <b>{autoLink}</b>
            </div>
          </div>
        </div>

        <div className="t-step-foot">
          <span className={`t-unsaved ${dirty ? "on" : ""}`}>{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <button className="d-btn primary" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save stop"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── upload slot ───────────────────────────

function UploadSlot({
  flow,
  index,
  maxClip,
  onAdded,
}: {
  flow: Flow;
  index: number;
  maxClip: number;
  onAdded: (flow: Flow, stepId: string | null) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
      return notify.error("Please choose a video clip (MP4 or MOV)");
    }
    const d = await readClipDuration(file);
    if (d && d > maxClip + 0.5) {
      return notify.error(`Clips must be ${maxClip} seconds or shorter — this one is ${d.toFixed(1)}s. Trim it and try again.`);
    }
    const fd = new FormData();
    fd.append("video", file);
    fd.append("name", `Stop ${index + 1}`);
    setProgress(0);
    try {
      const r = await apiEndpoints.driftAddFlowStep(flow.id, fd, (e) => {
        if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
      });
      onAdded(r.data.flow, r.data.step?.id || null);
      notify.success("Clip uploaded — building your drift");
    } catch (e: any) {
      notify.error(apiError(e));
      if (e?.code === "PLAN_LIMIT" || e?.details?.upgrade) onAdded(flow, null);
    } finally {
      setProgress(null);
    }
  };

  if (progress !== null) {
    return (
      <div className="d-card d-card-pad t-route-item is-drop" data-n={index + 1} style={{ display: "grid", gap: 10 }}>
        <div className="t-inline" style={{ justifyContent: "space-between" }}>
          <div className="d-h2">Stop {index + 1} · uploading</div>
          <span className="d-faint">{progress}%</span>
        </div>
        <div className="t-progress">
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="d-faint" style={{ fontSize: 12 }}>
          {progress >= 100 ? "Checking the clip…" : "Keep this page open until the upload finishes."}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`t-drop t-route-item is-drop ${over ? "over" : ""}`}
      data-n={index + 1}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) upload(f);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) upload(f);
        }}
      />
      <div className="ico" aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="M6 10l6-6 6 6" /><path d="M4 20h16" /></svg>
      </div>
      <div className="d-eyebrow">Stop {index + 1}</div>
      <div className="big">{index === 0 ? "Upload your first clip" : "Add the next clip"}</div>
      <div className="d-sub" style={{ fontSize: 13 }}>
        Up to {maxClip} seconds · shot on your phone is perfect · tap to choose or drop it here
      </div>
    </div>
  );
}

// ─────────────────────────── the page ───────────────────────────

export default function TourBuilder() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [demoSaving, setDemoSaving] = useState(false);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [allOptions, setAllOptions] = useState<LinkOption[]>([]);
  const [missing, setMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewDraft, setPreviewDraft] = useState<PreviewDraft | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onPreview = (d: PreviewDraft) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPreviewDraft(d), 300);
  };
  const [name, setName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [nextLabel, setNextLabel] = useState("");
  const [endLabel, setEndLabel] = useState("");
  const [endUrl, setEndUrl] = useState("");
  const [description, setDescription] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Tour-level fields follow the server copy only while they're not being edited.
  const flowServerRef = useRef<{ name: string; nextLabel: string; endLabel: string; endUrl: string; description: string } | null>(null);
  const applyFlow = (f: Flow) => {
    setFlow(f);
    const next = {
      name: f.name,
      nextLabel: f.settings.nextLabel || "",
      endLabel: f.endCta?.label || "",
      endUrl: f.endCta?.url || "",
      description: f.description || "",
    };
    const prev = flowServerRef.current;
    setName((v) => (!prev || v === prev.name ? next.name : v));
    setNextLabel((v) => (!prev || v === prev.nextLabel ? next.nextLabel : v));
    setEndLabel((v) => (!prev || v === prev.endLabel ? next.endLabel : v));
    setEndUrl((v) => (!prev || v === prev.endUrl ? next.endUrl : v));
    setDescription((v) => (!prev || v === prev.description ? next.description : v));
    flowServerRef.current = next;
    setSelectedId((cur) => (cur && f.steps.some((s) => s.id === cur) ? cur : f.steps[0]?.id || null));
  };

  const load = async () => {
    try {
      const r = await apiEndpoints.driftFlow(id);
      applyFlow(r.data.flow);
      setQuota(r.data.quota);
    } catch (e: any) {
      if (e?.status === 404) setMissing(true);
      else notify.error(apiError(e));
    }
  };
  useEffect(() => {
    load();
    apiEndpoints
      .driftMyFlows()
      .then((r) => {
        const opts: LinkOption[] = [];
        for (const f of (r.data.flows || []) as Flow[]) {
          for (const s of f.steps) {
            if (s.product && isReady(s.product.status)) opts.push({ label: `${f.name} · ${s.product.name}`, url: s.product.playerPath });
          }
        }
        setAllOptions(opts);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Poll while any stop is building.
  const processing = flow?.counts.processing || 0;
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing, id]);

  // Options for pickers: this tour's stops first (fresh), then everything else.
  const options = useMemo(() => {
    if (!flow) return allOptions;
    const mine: LinkOption[] = flow.steps
      .filter((s) => s.product && isReady(s.product.status))
      .map((s, i) => ({ label: `Stop ${i + 1} · ${s.product!.name}`, url: s.product!.playerPath }));
    const seen = new Set(mine.map((o) => o.url));
    return [...mine, ...allOptions.filter((o) => !seen.has(o.url))];
  }, [flow, allOptions]);

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
    if ((endLabel.trim() && !endUrl.trim()) || (!endLabel.trim() && endUrl.trim())) {
      return notify.error("The last-stop button needs both a label and a link");
    }
    setSettingsSaving(true);
    try {
      const r = await apiEndpoints.driftUpdateFlow(flow.id, {
        nextLabel: nextLabel.trim() || null,
        endCta: endLabel.trim() && endUrl.trim() ? { label: endLabel.trim(), url: endUrl.trim() } : null,
        description: description.trim() || null,
      });
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
        const link = publicUrl(r.data.flow.publicPath);
        const copied = await copyText(link);
        notify.success(copied ? "Your tour is live — link copied" : "Your tour is live");
      } else notify.success("Tour unpublished");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setPublishing(false);
    }
  };

  const copyLink = async () => {
    if (!flow) return;
    const ok = await copyText(publicUrl(flow.publicPath));
    notify[ok ? "success" : "error"](ok ? "Link copied" : "Couldn't copy the link");
  };

  if (missing) {
    return (
      <TourShell>
        <div className="d-empty">
          This tour doesn't exist (or isn't yours).{" "}
          <Link to={CREATOR_HOME} style={{ color: "var(--accent)" }}>
            Back to your tours
          </Link>
        </div>
      </TourShell>
    );
  }
  if (!flow || !quota) {
    return (
      <TourShell>
        <div className="d-faint" style={{ fontSize: 13 }}>Loading…</div>
      </TourShell>
    );
  }

  const canPublish = flow.counts.steps > 0 && flow.counts.processing === 0 && flow.counts.failed === 0;
  const atStepQuota = flow.steps.length >= quota.maxStepsPerFlow;
  const selected = flow.steps.find((s) => s.id === selectedId) || null;
  const selectedProduct = selected?.product || null;
  const settingsDirty =
    nextLabel !== (flow.settings.nextLabel || "") ||
    endLabel !== (flow.endCta?.label || "") ||
    endUrl !== (flow.endCta?.url || "") ||
    description !== (flow.description || "");

  return (
    <TourShell>
      <Link to={CREATOR_HOME} className="t-back" style={{ marginBottom: 12 }}>
        ← Your tours
      </Link>

      <div className="t-head t-rise" style={{ marginTop: 6 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div className="d-eyebrow" style={{ marginBottom: 6 }}>
            Tour · <StatusPill status={flow.status} flow />
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
            />
            {nameSaving && <Spinner />}
          </div>
          <div className="t-muted-row" style={{ marginTop: 8 }}>
            <span>
              {flow.counts.ready}/{flow.counts.steps} stops ready
            </span>
            <span className="d-faint">· up to {quota.maxStepsPerFlow} stops</span>
            {flow.status === "PUBLISHED" && (
              <span className="t-link" style={{ padding: "4px 8px" }}>
                <code>{publicUrl(flow.publicPath).replace(/^https?:\/\//, "")}</code>
                <button className="d-btn ghost sm" onClick={copyLink}>
                  Copy
                </button>
              </span>
            )}
          </div>
        </div>
        <div className="t-actions">
          {flow.entryPath && (
            <a className="d-btn" href={flow.entryPath} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              Preview
            </a>
          )}
          <button className="d-btn" onClick={() => setShowSettings((v) => !v)}>
            {showSettings ? "Hide settings" : "Tour settings"}
          </button>
          {flow.status === "PUBLISHED" ? (
            <button className="d-btn" onClick={() => publish(false)} disabled={publishing}>
              Unpublish
            </button>
          ) : (
            <button
              className="d-btn primary"
              onClick={() => publish(true)}
              disabled={publishing || !canPublish}
              title={!canPublish ? "Every stop needs to finish building first" : undefined}
            >
              {publishing ? "Publishing…" : "Publish"}
            </button>
          )}
        </div>
      </div>

      {showSettings && (
        <div className="d-card d-card-pad" style={{ marginBottom: 18 }}>
          <div className="d-eyebrow" style={{ marginBottom: 12 }}>Tour settings</div>
          <div className="t-fields two">
            <div>
              <label className="d-label">"Next" button label</label>
              <input className="d-input" value={nextLabel} onChange={(e) => setNextLabel(e.target.value)} placeholder={DEFAULT_NEXT} maxLength={40} />
              <div className="d-faint" style={{ fontSize: 11.5, marginTop: 5 }}>
                Shown on every stop except the last; it always points at the following stop.
              </div>
            </div>
            <div>
              <label className="d-label">Description</label>
              <input className="d-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional — for the share preview" maxLength={600} />
            </div>
            <div>
              <label className="d-label">Last stop button — label</label>
              <input className="d-input" value={endLabel} onChange={(e) => setEndLabel(e.target.value)} placeholder={DEFAULT_END} maxLength={40} />
            </div>
            <div>
              <label className="d-label">Last stop button — link</label>
              <LinkPicker value={endUrl} options={options} onChange={setEndUrl} allowNone placeholder="Leave empty to restart the tour" />
            </div>
          </div>
          <div className="t-actions" style={{ marginTop: 12 }}>
            <button className="d-btn primary" onClick={saveSettings} disabled={settingsSaving || !settingsDirty}>
              {settingsSaving ? "Saving…" : "Save settings"}
            </button>
            <span className="d-faint" style={{ fontSize: 12 }}>
              Empty = "{DEFAULT_END}" back to stop 1.
            </span>
          </div>
          {user?.role === "SUPERADMIN" && (
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
                      notify.success(on ? "This tour is now the public demo (/tour/demo)" : "No longer the demo tour");
                    } catch (err) {
                      notify.error(apiError(err));
                    } finally {
                      setDemoSaving(false);
                    }
                  }}
                />
                <span className="d-sub">
                  Use as the public demo tour (<code className="d-code">/tour/demo</code>) — superadmin only. Publish it
                  and point its buttons at <code className="d-code">/tour/start</code>.
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      <div className="t-builder">
        <div className="t-steps t-route">
          {flow.steps.map((s, i) => (
            <StepCard
              key={s.id}
              flow={flow}
              step={s}
              index={i}
              options={options}
              selected={s.id === selectedId}
              onSelect={() => {
                if (s.id !== selectedId) setPreviewDraft(null);
                setSelectedId(s.id);
              }}
              onChanged={applyFlow}
              maxClip={quota.maxClipSeconds}
              onPreview={onPreview}
            />
          ))}

          {atStepQuota ? (
            <UpgradeCard
              title={`This tour is at ${quota.maxStepsPerFlow} stops`}
              body="Longer tours with more stops (and longer clips) come with a paid plan."
            />
          ) : (
            <UploadSlot
              flow={flow}
              index={flow.steps.length}
              maxClip={quota.maxClipSeconds}
              onAdded={(f, stepId) => {
                applyFlow(f);
                if (stepId) setSelectedId(stepId);
              }}
            />
          )}

          {flow.steps.length === 0 && (
            <div className="d-faint" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              Tip: hold your phone steady and move slowly through the space for 3–5 seconds. Every clip becomes a
              stop people can scrub with a finger; we link the stops in order automatically.
            </div>
          )}
        </div>

        <aside className="t-preview">
          <div className="d-eyebrow">Preview</div>
          <div className="t-frame">
            {selectedProduct && isReady(selectedProduct.status) ? (
              <iframe
                key={selectedProduct.id + selectedProduct.updatedAt}
                src={`/embed/${selectedProduct.id}?ctaPlacement=${encodeURIComponent(previewDraft?.placement || selectedProduct.ctaPlacement || "CENTER")}&previewPrimary=${encodeURIComponent(nextLabel.trim() || DEFAULT_NEXT)}${previewDraft?.hasCustom ? `&previewSecondary=${encodeURIComponent(previewDraft.btnLabel)}` : ""}`}
                title={`Preview of ${selectedProduct.name}`}
                allow="fullscreen"
              />
            ) : selectedProduct?.status === "PROCESSING" ? (
              <div style={{ display: "grid", gap: 10, justifyItems: "center", padding: 20 }}>
                <Spinner />
                <span>Building {selectedProduct.name}…</span>
              </div>
            ) : (
              <span style={{ padding: 20 }}>Upload a clip to preview it here</span>
            )}
          </div>
          {flow.steps.length > 0 && (
            <div className="d-card d-card-pad" style={{ display: "grid", gap: 8 }}>
              <div className="d-eyebrow">The path</div>
              <div className="t-chain">
                {flow.steps.map((s, i) => (
                  <span key={s.id} className="t-chain">
                    <b>{stepName(s, i)}</b>
                    <span className="arr">→</span>
                  </span>
                ))}
                <span>{flow.endCta ? flow.endCta.label : flow.steps.length > 1 ? DEFAULT_END : "end"}</span>
              </div>
              <div className="d-faint" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                Reorder with the arrows — the buttons re-link themselves.
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
          <button className="d-btn sm" onClick={copyLink}>
            Copy link
          </button>
        </div>
      )}
      <div style={{ height: 24 }} />
      <button className="d-btn ghost sm" onClick={() => navigate(CREATOR_HOME)}>
        ← Back to your tours
      </button>
    </TourShell>
  );
}
