import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
import { useAuth } from "../hooks/useAuth";
import type { Creator, Flow, PublicFlow, Quota } from "./types";
import { StatusPill, TourShell, UpgradeCard, apiError, copyText, publicUrl, timeAgo } from "./tourUi";

/**
 * /tour — the creator's studio. A calm hero (greeting, one clear action, the demo),
 * plan usage, then the tours as a shelf of portrait cards, and a first-tour panel
 * when there's nothing yet. Polls while a tour is still building.
 */

const DEMO_HIDDEN_KEY = "drift_demo_hidden";

// Illustrated fallbacks for the hero phones (until the creator has stops of their own).
const SCENES = [
  {
    name: "Living room",
    svg: (
      <svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="s1a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b2b46" /><stop offset="1" stopColor="#0c1424" /></linearGradient>
          <linearGradient id="s1b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffd9a0" /><stop offset="1" stopColor="#f59e8b" /></linearGradient>
        </defs>
        <rect width="90" height="160" fill="url(#s1a)" />
        <rect x="14" y="22" width="40" height="52" rx="3" fill="url(#s1b)" opacity=".9" />
        <rect x="14" y="22" width="40" height="52" rx="3" fill="none" stroke="#ffffff" strokeOpacity=".35" />
        <path d="M34 22v52M14 48h40" stroke="#ffffff" strokeOpacity=".3" />
        <rect x="8" y="98" width="74" height="26" rx="8" fill="#3b4a6b" />
        <rect x="12" y="90" width="24" height="16" rx="6" fill="#4b5d85" />
        <rect x="54" y="90" width="24" height="16" rx="6" fill="#4b5d85" />
        <ellipse cx="45" cy="140" rx="34" ry="6" fill="#0a1120" opacity=".7" />
        <circle cx="70" cy="40" r="6" fill="#ffe8b8" opacity=".9" />
      </svg>
    ),
  },
  {
    name: "Kitchen",
    svg: (
      <svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="s2a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f2a2e" /><stop offset="1" stopColor="#081418" /></linearGradient>
        </defs>
        <rect width="90" height="160" fill="url(#s2a)" />
        <rect x="0" y="86" width="90" height="10" fill="#1f3c42" />
        <rect x="6" y="96" width="78" height="40" rx="4" fill="#173137" />
        <path d="M18 96v40M34 96v40M50 96v40M66 96v40" stroke="#0e2226" />
        <rect x="8" y="34" width="30" height="24" rx="3" fill="#1f3c42" />
        <rect x="52" y="34" width="30" height="24" rx="3" fill="#1f3c42" />
        <rect x="24" y="72" width="42" height="6" rx="3" fill="#22d3ee" opacity=".75" />
        <circle cx="45" cy="52" r="10" fill="#22d3ee" opacity=".16" />
        <circle cx="45" cy="52" r="4" fill="#9ff3ff" opacity=".9" />
      </svg>
    ),
  },
  {
    name: "Terrace",
    svg: (
      <svg viewBox="0 0 90 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="s3a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a2a6e" /><stop offset=".55" stopColor="#f0846a" /><stop offset="1" stopColor="#1a1030" /></linearGradient>
        </defs>
        <rect width="90" height="160" fill="url(#s3a)" />
        <circle cx="30" cy="70" r="14" fill="#ffd27a" />
        <rect x="0" y="86" width="90" height="74" fill="#1a1030" />
        <path d="M0 86 L14 70 L26 86 L40 62 L56 86 L70 74 L90 86 Z" fill="#2a1d52" />
        <rect x="10" y="118" width="70" height="4" rx="2" fill="#5b4a9a" />
        <rect x="16" y="122" width="4" height="26" fill="#5b4a9a" /><rect x="70" y="122" width="4" height="26" fill="#5b4a9a" />
        <rect x="30" y="130" width="30" height="10" rx="3" fill="#7c6bc0" />
      </svg>
    ),
  },
];

const HandGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-2.5-4a2 2 0 0 1 3.4-2L8 14" />
  </svg>
);

export default function TourHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [demo, setDemo] = useState<PublicFlow | null>(null);
  const [demoHidden, setDemoHidden] = useState(() => {
    try {
      return localStorage.getItem(DEMO_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await apiEndpoints.driftMyFlows("TOUR");
      setFlows(r.data.flows || []);
      setQuota(r.data.quota || null);
      setCreator(r.data.creator || null);
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setLoading(false);
    }
    apiEndpoints
      .driftPublicFlow("tour", "demo")
      .then((r) => setDemo(r.data.flow || null))
      .catch(() => setDemo(null));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep cards fresh while any tour is still building its stops.
  const building = flows.some((f) => f.counts.processing > 0);
  useEffect(() => {
    if (!building) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building]);

  const atQuota = !!quota && quota.usedFlows >= quota.maxFlows;
  const firstName = (creator?.name || user?.name || "").trim().split(/\s+/)[0] || "";
  const showDemo = !!demo && !demoHidden;

  // Hero phones: the creator's own stops first, then the demo's, then illustrations.
  const shots: { thumb: string | null; label: string }[] = [];
  for (const f of flows) {
    for (const s of f.steps) {
      if (s.product?.thumb && shots.length < 3) shots.push({ thumb: s.product.thumb, label: s.product.name });
    }
  }
  if (demo) {
    for (const s of demo.steps) {
      if (s.thumb && shots.length < 3) shots.push({ thumb: s.thumb, label: s.name });
    }
  }
  const phones = [0, 1, 2].map((i) => shots[i] ?? { thumb: null, label: SCENES[i].name });

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await apiEndpoints.driftCreateFlow({ kind: "TOUR", name });
      navigate(`/tour/${r.data.flow.id}/edit`);
    } catch (e: any) {
      notify.error(apiError(e));
      if (e?.code === "PLAN_LIMIT" || e?.details?.upgrade) {
        setCreating(false);
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (f: Flow) => {
    const ok = await confirmAction(`Delete "${f.name}" and its stops? This can't be undone.`);
    if (!ok) return;
    try {
      await apiEndpoints.driftDeleteFlow(f.id);
      notify.success("Tour deleted");
      load();
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  const copy = async (f: Flow) => {
    const ok = await copyText(publicUrl(f.publicPath));
    if (ok) notify.success("Link copied");
    else notify.error("Couldn't copy — long-press the link to copy it");
  };

  const hideDemo = () => {
    setDemoHidden(true);
    try {
      localStorage.setItem(DEMO_HIDDEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const startCreate = () => {
    setCreating(true);
    setTimeout(() => document.getElementById("new-tour-name")?.focus(), 50);
  };

  return (
    <TourShell>
      {/* Hero */}
      <section className="th-hero t-rise">
        <div className="th-copy">
          <div className="d-eyebrow">
            <span className="t-eyebrow-dot" />
            Creator studio
          </div>
          <h1 className="th-title">
            {firstName ? `Hi, ${firstName}.` : "Welcome."}
            <span>Make something people can hold.</span>
          </h1>
          <p className="d-sub">
            Film a few short clips on your phone. We turn them into a guided, interactive tour with a single
            link to share.
          </p>
          <div className="t-actions" style={{ marginTop: 18 }}>
            {atQuota ? (
              <a
                className="d-btn primary th-cta"
                href="mailto:web@drift.li?subject=Upgrade%20my%20drift.li%20plan"
                style={{ textDecoration: "none" }}
              >
                Talk to us about more tours
              </a>
            ) : (
              <button className="d-btn primary th-cta" onClick={startCreate}>
                + Create a tour
              </button>
            )}
            {demo?.entryPath && (
              <a className="d-btn th-ghost" href={demo.entryPath} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                ▶ Watch the demo
              </a>
            )}
          </div>
          {quota && (
            <div className="th-meta">
              <span className="t-chip">
                Tours <b>{quota.usedFlows}/{quota.maxFlows}</b>
              </span>
              <span className="t-chip">
                Stops per tour <b>{quota.maxStepsPerFlow}</b>
              </span>
              <span className="t-chip">
                Clips up to <b>{quota.maxClipSeconds}s</b>
              </span>
              <span className="d-pill accent">Free plan</span>
            </div>
          )}
        </div>
        <div className="th-art" aria-hidden>
          {phones.map((ph, i) => (
            <span key={i} className={`th-phone th-phone-${i + 1}`}>
              <i className="th-shot" style={ph.thumb ? { backgroundImage: `url("${ph.thumb}")` } : undefined}>
                {!ph.thumb && SCENES[i].svg}
              </i>
              <em>{ph.label}</em>
              <b className="th-hand">
                <HandGlyph />
              </b>
              <span className="th-arrow" />
              <u>{i === 2 ? "Restart tour" : "Next stop"}</u>
            </span>
          ))}
        </div>
      </section>

      {/* Inline create */}
      {creating && (
        <div className="d-card d-card-pad th-create t-rise">
          <div className="d-eyebrow">New tour</div>
          <label className="d-label" htmlFor="new-tour-name">
            What is this tour of?
          </label>
          <div className="t-inline">
            <input
              id="new-tour-name"
              className="d-input"
              style={{ flex: "1 1 260px" }}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="e.g. 14 Harbour Lane, penthouse"
              maxLength={80}
            />
            <button className="d-btn primary" onClick={create} disabled={busy || !newName.trim()}>
              {busy ? "Creating…" : "Create"}
            </button>
            <button className="d-btn ghost" onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </button>
          </div>
          <div className="d-faint" style={{ fontSize: 12 }}>
            You'll add the clips next. The name becomes the public link and can be changed later.
          </div>
        </div>
      )}

      {/* First tour */}
      {!loading && flows.length === 0 && !creating && (
        <section className="d-card th-first t-rise t-rise-2">
          <div>
            <div className="d-eyebrow">Your first tour</div>
            <h2>About five minutes, start to finish</h2>
          </div>
          <ol className="th-steps">
            <li>
              <b>1</b>
              <div>
                Name your tour
                <span>a home, a venue, a walk</span>
              </div>
            </li>
            <li>
              <b>2</b>
              <div>
                Upload up to {quota?.maxStepsPerFlow ?? 3} clips
                <span>{quota?.maxClipSeconds ?? 5} seconds each, straight from your phone</span>
              </div>
            </li>
            <li>
              <b>3</b>
              <div>
                Add a headline and a button per stop
                <span>publish, then share one link</span>
              </div>
            </li>
          </ol>
          {!atQuota && (
            <button className="d-btn primary th-cta" onClick={startCreate}>
              + Create a tour
            </button>
          )}
        </section>
      )}

      {/* Shelf */}
      {(flows.length > 0 || showDemo) && (
        <section className="th-shelf t-rise t-rise-3">
          <div className="th-shelf-head">
            <h2 className="d-h2">Your tours</h2>
            {quota && (
              <span className="d-faint" style={{ fontSize: 12.5 }}>
                {quota.usedFlows} of {quota.maxFlows} on the free plan
              </span>
            )}
          </div>
          <div className="th-grid">
            {flows.map((f) => (
              <article key={f.id} className="th-item" onClick={() => navigate(`/tour/${f.id}/edit`)}>
                <div className="th-thumb">
                  {f.thumb ? <img src={f.thumb} alt="" loading="lazy" /> : <div className="ph">No stops yet — add your first clip</div>}
                  <div className="th-glass">
                    <span className="th-name" title={f.name}>
                      {f.name}
                    </span>
                    <StatusPill status={f.status} flow />
                  </div>
                </div>
                <div className="th-body">
                  <div className="t-muted-row">
                    <span>
                      {f.counts.ready}/{f.counts.steps} stops ready
                    </span>
                    {f.counts.processing > 0 && <span className="d-pill warn">building {f.counts.processing}</span>}
                    {f.counts.failed > 0 && <span className="d-pill err">{f.counts.failed} failed</span>}
                    <span className="d-faint">· {timeAgo(f.updatedAt)}</span>
                  </div>
                  <div className="t-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="d-btn soft sm" onClick={() => navigate(`/tour/${f.id}/edit`)}>
                      Edit
                    </button>
                    {f.entryPath && (
                      <a className="d-btn sm" href={f.entryPath} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                        Play
                      </a>
                    )}
                    {f.status === "PUBLISHED" && (
                      <button className="d-btn sm" onClick={() => copy(f)}>
                        Copy link
                      </button>
                    )}
                    <button className="d-btn ghost sm" onClick={() => remove(f)} title="Delete tour">
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}

            {showDemo && demo && (
              <article className="th-item" onClick={() => demo.entryPath && window.open(demo.entryPath, "_blank")}>
                <div className="th-thumb">
                  {demo.thumb ? <img src={demo.thumb} alt="" loading="lazy" /> : <div className="ph">Demo tour</div>}
                  <span className="th-play" aria-hidden>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  </span>
                  <div className="th-glass">
                    <span className="th-name">See a finished tour</span>
                    <span className="d-pill accent">Demo</span>
                  </div>
                </div>
                <div className="th-body">
                  <div className="t-muted-row">
                    <span>{demo.name}</span>
                    <span className="d-faint">· {demo.steps.length} stops</span>
                  </div>
                  <div className="t-card-actions" onClick={(e) => e.stopPropagation()}>
                    {demo.entryPath && (
                      <a className="d-btn soft sm" href={demo.entryPath} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                        Play demo
                      </a>
                    )}
                    <button className="d-btn ghost sm" onClick={hideDemo}>
                      Hide
                    </button>
                  </div>
                </div>
              </article>
            )}

            {!loading && flows.length > 0 && !atQuota && !creating && (
              <button className="th-new" onClick={startCreate}>
                <span>+</span>
                New tour
              </button>
            )}
          </div>
        </section>
      )}

      {atQuota && flows.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <UpgradeCard
            title="You've used your free tour"
            body={`The free plan includes ${quota?.maxFlows} tour with ${quota?.maxStepsPerFlow} stops. More tours, more stops and longer clips come with a paid plan.`}
          />
        </div>
      )}

      {loading && (
        <div className="d-faint" style={{ fontSize: 13, marginTop: 12 }}>
          Loading your tours…
        </div>
      )}
    </TourShell>
  );
}
