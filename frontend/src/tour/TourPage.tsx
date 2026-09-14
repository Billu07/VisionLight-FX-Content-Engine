import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
import type { Demo, Flow, Page, PublicFlow } from "./types";
import { isReady } from "./types";
import { StatusPill, TourShell, apiError, copyText, publicUrl } from "./tourUi";
import { TOUR_PAGE_STYLES } from "./tourPageStyles";
import { ContactButton, PathArtH } from "./tourPageParts";
import { usePageAdmin } from "./usePageAdmin";

/**
 * drift.li/tour/{page} — a page is both its admin and its public view. Visitors see the
 * page (logo, name, View Demo, Contact) and its Featured Tours as cards or as a path.
 * Page admins also get Create New Tour, hide / unhide (Hidden Tours are theirs alone),
 * links, and the page settings (name, logo, contact button, demo tour).
 */

type TourItem = {
  id: string;
  name: string;
  thumb: string | null;
  path: string;
  startPath: string | null;
  total: number;
  drifts: { id: string; name: string; thumb: string | null; path: string }[];
  status?: string;
  building?: number;
  failed?: number;
  flow?: Flow;
};

const VIEW_KEY = "drift_page_view";

const fromPublic = (f: PublicFlow): TourItem => ({
  id: f.id,
  name: f.title || f.name,
  thumb: f.thumb,
  path: f.publicPath,
  startPath: f.entryPath,
  total: f.steps.length,
  drifts: f.steps.map((s) => ({ id: s.id, name: s.name, thumb: s.thumb, path: s.playerPath })),
});

const fromAdmin = (f: Flow): TourItem => ({
  id: f.id,
  name: f.name,
  thumb: f.thumb,
  path: f.publicPath,
  startPath: f.entryPath,
  total: f.counts.steps,
  drifts: f.steps
    .filter((s) => s.product && isReady(s.product.status))
    .map((s) => ({ id: s.id, name: s.product!.name, thumb: s.product!.thumb, path: s.product!.playerPath })),
  status: f.status,
  building: f.counts.processing,
  failed: f.counts.failed,
  flow: f,
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function ViewToggle({ view, onChange }: { view: "cards" | "path"; onChange: (v: "cards" | "path") => void }) {
  return (
    <div className="d-tabs" role="tablist" aria-label="How to show the tours">
      <button role="tab" aria-selected={view === "cards"} className={`d-tab ${view === "cards" ? "active" : ""}`} onClick={() => onChange("cards")}>
        Cards
      </button>
      <button role="tab" aria-selected={view === "path"} className={`d-tab ${view === "path" ? "active" : ""}`} onClick={() => onChange("path")}>
        Path
      </button>
    </div>
  );
}

function TourCards({ items, renderActions }: { items: TourItem[]; renderActions?: (it: TourItem) => React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="th-grid">
      {items.map((it) => (
        <article key={it.id} className="th-item" onClick={() => navigate(it.path)}>
          <div className="th-thumb">
            {it.thumb ? <img src={it.thumb} alt="" loading="lazy" /> : <div className="ph">No drifts yet</div>}
            <div className="th-glass">
              <span className="th-name" title={it.name}>
                {it.name}
              </span>
              {it.status && <StatusPill status={it.status} flow />}
            </div>
          </div>
          <div className="th-body">
            <div className="t-muted-row">
              <span>{plural(it.total, "drift")}</span>
              {!!it.building && <span className="d-pill warn">building {it.building}</span>}
              {!!it.failed && <span className="d-pill err">{it.failed} failed</span>}
            </div>
            <div className="t-card-actions" onClick={(e) => e.stopPropagation()}>
              {renderActions
                ? renderActions(it)
                : it.startPath && (
                    <Link className="d-btn soft sm" to={it.startPath} style={{ textDecoration: "none" }}>
                      ▶ Start Tour
                    </Link>
                  )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

// Path view: the tours on one straight rail — each tour is a single step, its drifts
// laid out horizontally on their own straight line.
function TourPathList({ items, renderActions }: { items: TourItem[]; renderActions?: (it: TourItem) => React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <ol className="tpg-rail">
      {items.map((it, i) => (
        <li key={it.id} className="tpg-row" data-n={i + 1}>
          <div
            className="tpg-tour"
            role="link"
            tabIndex={0}
            onClick={() => navigate(it.path)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate(it.path)}
          >
            <div className="tpg-cover">{it.thumb ? <img src={it.thumb} alt="" loading="lazy" /> : null}</div>
            <div className="tpg-meta">
              <div className="tpg-name" title={it.name}>
                {it.name}
              </div>
              <div className="t-muted-row">
                <span>{plural(it.total, "drift")}</span>
                {it.status && <StatusPill status={it.status} flow />}
              </div>
            </div>
          </div>
          <div className="tpg-line" aria-label={`${it.name}: drifts`}>
            {it.drifts.map((d, j) => (
              <Link key={d.id} to={d.path} className="tpg-drift" title={d.name}>
                <span className="tpg-drift-img">
                  {d.thumb ? <img src={d.thumb} alt="" loading="lazy" /> : null}
                  <b>{j + 1}</b>
                </span>
                <span className="tpg-drift-name">{d.name}</span>
              </Link>
            ))}
          </div>
          <div className="tpg-actions">
            {renderActions
              ? renderActions(it)
              : it.startPath && (
                  <Link className="d-btn primary sm" to={it.startPath} style={{ textDecoration: "none" }}>
                    ▶ Start Tour
                  </Link>
                )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function PageSettings({
  page,
  flows,
  onSaved,
  onClose,
}: {
  page: Page;
  flows: Flow[];
  onSaved: (page: Page, demo?: Demo) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(page.name);
  const [contactLabel, setContactLabel] = useState(page.contactLabel || "");
  const [contactUrl, setContactUrl] = useState(page.contactUrl || "");
  const [demoFlowId, setDemoFlowId] = useState(page.demoFlowId || "");
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const published = flows.filter((f) => f.status === "PUBLISHED");
  const dirty =
    name.trim() !== page.name ||
    contactLabel.trim() !== (page.contactLabel || "") ||
    contactUrl.trim() !== (page.contactUrl || "") ||
    demoFlowId !== (page.demoFlowId || "");

  const save = async () => {
    if (!name.trim()) return notify.error("Give your page a name");
    setSaving(true);
    try {
      const r = await apiEndpoints.driftUpdateMyPage({
        name: name.trim(),
        contactLabel: contactLabel.trim() || null,
        contactUrl: contactUrl.trim() || null,
        demoFlowId: demoFlowId || null,
      });
      onSaved(r.data.page, r.data.demo ?? null);
      notify.success("Page saved");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!file.type.startsWith("image/")) return notify.error("Please choose an image (JPG, PNG or WebP)");
    const fd = new FormData();
    fd.append("image", file);
    setLogoBusy(true);
    try {
      const r = await apiEndpoints.driftUploadPageLogo(fd);
      onSaved(r.data.page);
      notify.success("Logo uploaded");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      const r = await apiEndpoints.driftUpdateMyPage({ logoUrl: null });
      onSaved(r.data.page, r.data.demo ?? null);
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <div className="d-card d-card-pad t-rise" style={{ marginBottom: 24 }}>
      <div className="d-head" style={{ marginBottom: 12 }}>
        <div className="d-eyebrow">Page settings</div>
        <button className="d-btn ghost sm" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="t-cover">
        <div className="t-cover-current" style={{ aspectRatio: "1" }}>
          {page.logoUrl ? <img src={page.logoUrl} alt="" style={{ objectFit: "contain", padding: 10 }} /> : <span>No logo</span>}
        </div>
        <div className="t-cover-controls">
          <div className="d-label">Logo</div>
          <div className="d-sub" style={{ fontSize: 12.5 }}>
            Shown on your page, on every tour and in the corner of each drift.
          </div>
          <div className="t-actions">
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) uploadLogo(f);
              }}
            />
            <button className="d-btn sm" onClick={() => logoRef.current?.click()} disabled={logoBusy}>
              {logoBusy ? "Working…" : page.logoUrl ? "Replace logo" : "Upload logo"}
            </button>
            {page.logoUrl && (
              <button className="d-btn ghost sm" onClick={removeLogo} disabled={logoBusy}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="t-fields two">
        <div>
          <label className="d-label">Page name</label>
          <input className="d-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Your name or business name" />
        </div>
        <div>
          <label className="d-label">View Demo</label>
          <select className="d-select" value={demoFlowId} onChange={(e) => setDemoFlowId(e.target.value)}>
            <option value="">drift.li demo tour</option>
            {published.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <div className="d-faint" style={{ fontSize: 11.5, marginTop: 5 }}>
            Pick one of your published tours to show as your demo.
          </div>
        </div>
        <div>
          <label className="d-label">Contact button — label</label>
          <input className="d-input" value={contactLabel} onChange={(e) => setContactLabel(e.target.value)} maxLength={40} placeholder="Contact PicDrift" />
        </div>
        <div>
          <label className="d-label">Contact button — link</label>
          <input
            className="d-input"
            value={contactUrl}
            onChange={(e) => setContactUrl(e.target.value)}
            maxLength={500}
            placeholder="https://…  ·  mailto:you@…  ·  tel:+1…"
            inputMode="url"
          />
        </div>
      </div>
      <div className="t-actions" style={{ marginTop: 14 }}>
        <button className="d-btn primary" onClick={save} disabled={saving || !dirty}>
          {saving ? "Saving…" : "Save page"}
        </button>
        <span className="d-faint" style={{ fontSize: 12 }}>
          Leave the contact fields empty to use "Contact PicDrift".
        </span>
      </div>
    </div>
  );
}

export default function TourPage() {
  const { page: slug = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const [pub, setPub] = useState<{ page: Page; demo: Demo; flows: PublicFlow[] } | null>(null);
  const [missing, setMissing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [view, setViewState] = useState<"cards" | "path">(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "path" ? "path" : "cards";
    } catch {
      return "cards";
    }
  });
  const setView = (v: "cards" | "path") => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const [flows, setFlows] = useState<Flow[]>([]);
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const admin = usePageAdmin(pub?.page.id);
  const editing = admin.isAdmin && !preview;

  const loadPublic = async () => {
    try {
      const r = await apiEndpoints.driftPublicPage(slug);
      setPub(r.data);
      setMissing(false);
    } catch {
      // Legacy links — /tour/{tour-slug} and /tour/demo — go to that tour's pathway.
      try {
        const r = await apiEndpoints.driftPublicFlow("tour", slug);
        const path = r.data?.flow?.publicPath;
        if (path && path !== location.pathname) {
          navigate(path, { replace: true });
          return;
        }
      } catch {
        /* not a tour either */
      }
      setMissing(true);
    }
  };
  useEffect(() => {
    setPub(null);
    setMissing(false);
    loadPublic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // ?new=1 (a pathway's "+ Create New Tour") opens the create form.
  useEffect(() => {
    if (search.get("new") !== "1") return;
    setCreating(true);
    const next = new URLSearchParams(search);
    next.delete("new");
    setSearch(next, { replace: true });
    setTimeout(() => document.getElementById("new-tour-name")?.focus(), 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadAdmin = async () => {
    try {
      const r = await apiEndpoints.driftMyFlows("TOUR");
      setFlows(r.data.flows || []);
      if (r.data.page) setPub((d) => (d ? { ...d, page: r.data.page } : d));
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setAdminLoaded(true);
    }
  };
  useEffect(() => {
    if (admin.isAdmin) loadAdmin();
    else {
      setFlows([]);
      setAdminLoaded(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.isAdmin, pub?.page.id]);

  const building = flows.some((f) => f.counts.processing > 0);
  useEffect(() => {
    if (!editing || !building) return;
    const t = setInterval(loadAdmin, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, building]);

  const startCreate = () => {
    setCreating(true);
    setTimeout(() => document.getElementById("new-tour-name")?.focus(), 60);
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await apiEndpoints.driftCreateFlow({ kind: "TOUR", name });
      navigate(r.data.flow.publicPath);
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const setHidden = async (f: Flow, hidden: boolean) => {
    try {
      await apiEndpoints.driftUpdateFlow(f.id, { hidden });
      notify.success(hidden ? "Moved to Hidden Tours" : "Back in Featured Tours");
      loadAdmin();
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  const remove = async (f: Flow) => {
    const ok = await confirmAction(`Delete "${f.name}" and all of its drifts? This can't be undone.`);
    if (!ok) return;
    try {
      await apiEndpoints.driftDeleteFlow(f.id);
      notify.success("Tour deleted");
      loadAdmin();
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  const copy = async (path: string) => {
    const ok = await copyText(publicUrl(path));
    notify[ok ? "success" : "error"](ok ? "Link copied" : "Couldn't copy the link");
  };

  const shell = (body: React.ReactNode) => (
    <TourShell>
      <style>{TOUR_PAGE_STYLES}</style>
      {body}
    </TourShell>
  );

  if (missing) {
    return shell(
      <div className="d-empty">
        There's no page at this link.{" "}
        <Link to="/tour" style={{ color: "var(--accent)" }}>
          drift.li tour
        </Link>
      </div>,
    );
  }
  if (!pub) {
    return shell(
      <div style={{ minHeight: "50vh", display: "grid", placeItems: "center" }}>
        <div className="d-faint" style={{ fontSize: 13 }}>
          Loading…
        </div>
      </div>,
    );
  }

  const page = pub.page;
  const featured = editing ? flows.filter((f) => !f.hidden).map(fromAdmin) : pub.flows.map(fromPublic);
  const hiddenTours = editing ? flows.filter((f) => f.hidden).map(fromAdmin) : [];
  const initial = (page.name || "?").trim().charAt(0);

  const adminActions = (it: TourItem) => {
    const f = it.flow!;
    return (
      <>
        <Link className="d-btn soft sm" to={it.path} style={{ textDecoration: "none" }}>
          Open
        </Link>
        {f.status === "PUBLISHED" && (
          <button className="d-btn sm" onClick={() => copy(f.publicPath)}>
            Copy link
          </button>
        )}
        <button className="d-btn sm" onClick={() => setHidden(f, !f.hidden)}>
          {f.hidden ? "Unhide" : "Hide"}
        </button>
        <button className="d-btn ghost sm" onClick={() => remove(f)}>
          Delete
        </button>
      </>
    );
  };

  return shell(
    <>
      {admin.canManage && (
        <div className="tpg-note">
          <span>
            You're viewing <b>{page.name}</b> as a visitor.
          </span>
          <button className="d-btn sm" onClick={() => admin.setManage(true)}>
            Manage this page
          </button>
        </div>
      )}
      {admin.isAdmin && (
        <div className="tpg-note">
          <span>{preview ? "This is what visitors see." : "You're editing your page. Visitors never see the admin tools."}</span>
          <button className="d-btn sm" onClick={() => setPreview((v) => !v)}>
            {preview ? "Back to editing" : "View as visitor"}
          </button>
        </div>
      )}

      <section className="tpg-hero t-rise">
        <div style={{ minWidth: 0 }}>
          <div className="tpg-brand">
            {page.logoUrl ? <img className="tpg-logo" src={page.logoUrl} alt="" /> : <span className="tpg-mark">{initial}</span>}
            <div style={{ minWidth: 0 }}>
              <div className="d-eyebrow">Tours</div>
              <h1 className="tpg-title">{page.name}</h1>
            </div>
          </div>
          <p className="tpg-sub">Interactive tours you explore with a finger — pick one to start.</p>
          <div className="tpg-cta">
            {editing && (
              <button className="d-btn primary" onClick={startCreate}>
                + Create New Tour
              </button>
            )}
            {pub.demo && (
              <Link className="d-btn" to={pub.demo.path} style={{ textDecoration: "none" }}>
                ▶ View Demo
              </Link>
            )}
            <ContactButton page={page} />
            {editing && (
              <button className="d-btn ghost" onClick={() => setShowSettings((v) => !v)}>
                {showSettings ? "Close settings" : "Page settings"}
              </button>
            )}
          </div>
          {editing && page.path && (
            <div className="tpg-linkrow">
              <span className="t-link">
                <code>{publicUrl(page.path).replace(/^https?:\/\//, "")}</code>
                <button className="d-btn ghost sm" onClick={() => copy(page.path!)}>
                  Copy
                </button>
              </span>
            </div>
          )}
        </div>
        <div className="tpg-art" aria-hidden>
          <PathArtH />
        </div>
      </section>

      {editing && showSettings && (
        <PageSettings
          key={page.id}
          page={page}
          flows={flows}
          onClose={() => setShowSettings(false)}
          onSaved={(p, demo) => setPub((d) => (d ? { ...d, page: p, demo: demo === undefined ? d.demo : demo } : d))}
        />
      )}

      {editing && creating && (
        <div className="d-card d-card-pad t-rise" style={{ marginBottom: 22, display: "grid", gap: 10 }}>
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
              placeholder="e.g. 45 Birch"
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
            The name becomes the tour's link. You'll add the clips next.
          </div>
        </div>
      )}

      <section className="tpg-section t-rise t-rise-2">
        <div className="tpg-bar">
          <h2>Featured Tours</h2>
          {featured.length > 0 && <ViewToggle view={view} onChange={setView} />}
        </div>
        {editing && !adminLoaded ? (
          <div className="d-faint" style={{ fontSize: 13 }}>
            Loading your tours…
          </div>
        ) : featured.length === 0 ? (
          editing ? (
            <div className="tpg-empty">
              <h3>Build your first tour</h3>
              <p className="d-sub" style={{ margin: 0, maxWidth: "46ch" }}>
                Take a slow pan or tilt video of each space on your phone, upload the clips, and share one link.
              </p>
              {!creating && (
                <button className="d-btn primary" onClick={startCreate}>
                  + Create New Tour
                </button>
              )}
            </div>
          ) : (
            <div className="tpg-empty">No tours here yet — check back soon.</div>
          )
        ) : view === "path" ? (
          <TourPathList items={featured} renderActions={editing ? adminActions : undefined} />
        ) : (
          <TourCards items={featured} renderActions={editing ? adminActions : undefined} />
        )}
      </section>

      {editing && hiddenTours.length > 0 && (
        <section className="tpg-section">
          <div className="tpg-bar">
            <h2>Hidden Tours</h2>
            <span className="d-faint">Only page admins see these. Their links still work.</span>
          </div>
          {view === "path" ? (
            <TourPathList items={hiddenTours} renderActions={adminActions} />
          ) : (
            <TourCards items={hiddenTours} renderActions={adminActions} />
          )}
        </section>
      )}
    </>,
  );
}
