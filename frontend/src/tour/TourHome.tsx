import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
import { useAuth } from "../hooks/useAuth";
import type { Creator, Flow, PublicFlow, Quota } from "./types";
import { StatusPill, TourShell, UpgradeCard, apiError, copyText, publicUrl, timeAgo } from "./tourUi";

/**
 * /tour — the creator's home. Their tours as a gallery of cards, a prominent
 * "Create a tour", the client's demo tour, and plan usage with the upgrade gate.
 */

const DEMO_HIDDEN_KEY = "drift_demo_hidden";

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

  return (
    <TourShell>
      <div className="t-head">
        <div>
          <div className="d-eyebrow">Your creator space</div>
          <h1 className="t-title">{firstName ? `Hi, ${firstName}` : "Your tours"}</h1>
          <p className="d-sub" style={{ marginTop: 6 }}>
            Film short clips on your phone; we turn them into a guided, interactive tour.
          </p>
        </div>
        {quota && (
          <div className="t-usage">
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

      {creating ? (
        <div className="d-card d-card-pad" style={{ marginBottom: 18, display: "grid", gap: 10 }}>
          <div className="d-eyebrow">New tour</div>
          <label className="d-label" htmlFor="new-tour-name">
            What is this tour of?
          </label>
          <div className="t-inline">
            <input
              id="new-tour-name"
              className="d-input"
              style={{ flex: "1 1 240px" }}
              autoFocus
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
            You'll add the clips next. The name is the tour's public link, and you can change it later.
          </div>
        </div>
      ) : atQuota ? (
        <div style={{ marginBottom: 18 }}>
          <UpgradeCard
            title="You've used your free tour"
            body={`The free plan includes ${quota?.maxFlows} tour with ${quota?.maxStepsPerFlow} stops. More tours, more stops and longer clips come with a paid plan.`}
          />
        </div>
      ) : (
        !loading && flows.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <button className="d-btn primary" style={{ padding: "12px 18px", fontSize: 14 }} onClick={() => setCreating(true)}>
              + Create a tour
            </button>
          </div>
        )
      )}

      {!loading && flows.length === 0 && !creating && (
        <div className="d-card t-empty" style={{ marginBottom: 18 }}>
          <div>
            <div className="d-eyebrow" style={{ marginBottom: 8 }}>Start here</div>
            <div className="d-h1" style={{ fontSize: 22 }}>Your first tour takes about five minutes</div>
          </div>
          <div className="steps">
            <div className="step">
              <b>1</b>
              <div>
                Name your tour <span>— a home, a venue, a walk</span>
              </div>
            </div>
            <div className="step">
              <b>2</b>
              <div>
                Upload up to {quota?.maxStepsPerFlow ?? 3} clips <span>— {quota?.maxClipSeconds ?? 5}s each, straight from your phone</span>
              </div>
            </div>
            <div className="step">
              <b>3</b>
              <div>
                Add a headline and a button per stop <span>— then publish and share one link</span>
              </div>
            </div>
          </div>
          {!atQuota && (
            <button className="d-btn primary" style={{ padding: "12px 20px", fontSize: 14 }} onClick={() => setCreating(true)}>
              + Create a tour
            </button>
          )}
        </div>
      )}

      <div className="t-grid">
        {flows.map((f) => (
          <div key={f.id} className="d-card t-card" onClick={() => navigate(`/tour/${f.id}/edit`)}>
            <div className="t-thumb">
              {f.thumb ? <img src={f.thumb} alt="" loading="lazy" /> : <div className="ph">No stops yet — add your first clip</div>}
              <span className="pill">
                <StatusPill status={f.status} flow />
              </span>
            </div>
            <div className="t-card-body">
              <div className="t-card-name" title={f.name}>
                {f.name}
              </div>
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
          </div>
        ))}

        {demo && !demoHidden && (
          <div className="d-card t-card" onClick={() => demo.entryPath && window.open(demo.entryPath, "_blank")}>
            <div className="t-thumb">
              {demo.thumb ? <img src={demo.thumb} alt="" loading="lazy" /> : <div className="ph">Demo tour</div>}
              <span className="pill">
                <span className="d-pill accent">Demo</span>
              </span>
            </div>
            <div className="t-card-body">
              <div className="t-card-name">See a finished tour</div>
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
          </div>
        )}
      </div>

      {loading && (
        <div className="d-faint" style={{ fontSize: 13, marginTop: 12 }}>
          Loading your tours…
        </div>
      )}
    </TourShell>
  );
}
