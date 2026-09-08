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

// Hero art: a route with stops that pop out as the line reaches them.
const ROUTE_D = "M 36 244 C 70 244 90 214 120 210 S 170 150 196 132 S 246 102 270 96 S 312 60 328 44";
const ROUTE_STOPS = [
  { x: 120, y: 210, label: "Living room", side: "right" },
  { x: 196, y: 132, label: "Kitchen", side: "left" },
  { x: 270, y: 96, label: "Terrace", side: "right" },
  { x: 328, y: 44, label: "Garden", side: "left" },
] as const;

function PathArt() {
  return (
    <svg className="th-route" viewBox="0 0 380 280" aria-hidden>
      <path className="th-route-under" d={ROUTE_D} />
      <path className="th-route-line" d={ROUTE_D} pathLength={1000} />
      <g>
        <rect className="th-start" x={8} y={234} width={56} height={20} rx={10} />
        <text className="th-start-text" x={36} y={248} textAnchor="middle">
          START
        </text>
      </g>
      {ROUTE_STOPS.map((s, i) => {
        const tagW = Math.round(s.label.length * 6.6 + 22);
        const tagX = s.side === "right" ? s.x + 16 : s.x - 16 - tagW;
        return (
          <g key={s.label} className={`th-stop th-stop-${i + 1}`} style={{ transformOrigin: `${s.x}px ${s.y}px` }}>
            <circle className="halo" cx={s.x} cy={s.y} r={16} />
            <circle className="pin" cx={s.x} cy={s.y} r={9} />
            <circle className="dot" cx={s.x} cy={s.y} r={3.5} />
            <rect className="tag" x={tagX} y={s.y - 11} width={tagW} height={22} rx={11} />
            <text x={tagX + tagW / 2} y={s.y + 4} textAnchor="middle">
              {s.label}
            </text>
          </g>
        );
      })}
      <circle className="th-traveler" r={5.5} style={{ offsetPath: `path("${ROUTE_D}")` }} />
    </svg>
  );
}

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
          <PathArt />
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
