import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiEndpoints, setActiveProfile } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { confirmAction, notify } from "../lib/notifications";
import type { ClientPage, Demo, Flow, Page, PageRef, PageRole, PublicFlow } from "./types";
import { isReady } from "./types";
import { StatusPill, TourShell, apiError, copyText, publicUrl, type ShellView } from "./tourUi";
import { TOUR_PAGE_STYLES } from "./tourPageStyles";
import { ContactButton, PathArtH } from "./tourPageParts";
import { usePageAdmin } from "./usePageAdmin";
import { PagePeople, leavePage } from "./PagePeople";
import { canEditPage, isPageAdmin } from "./pageRoles";
import { invalidateMyPages } from "./myPages";
import { EnquiryButton } from "./EnquirySheet";
import { PageEnquiries } from "./PageEnquiries";

/**
 * drift.li/tour/{page} — a page is both its admin and its public view. Visitors see the
 * page (logo, name, View Demo, Contact) and its Featured Tours as cards or as a path.
 * Its team gets the admin view by role: Viewers see every tour (Hidden and drafts too);
 * Editors also create, hide and build tours; Admins also delete tours and run the page
 * settings (name, logo, contact button, demo tour, People) and a Pro's client pages.
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
  awaiting?: number;
  flow?: Flow;
};

const ENQUIRY_PRESETS = ["Book a viewing", "Ask a question", "Request info", "Get a quote"];

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
  awaiting: f.counts.awaiting,
  flow: f,
});

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const GearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

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
  clientPage,
  onSelfChange,
}: {
  page: Page;
  flows: Flow[];
  onSaved: (page: Page, demo?: Demo) => void;
  onClose: () => void;
  /** a Pro manages this page */
  clientPage: boolean;
  /** the admin changed their own role */
  onSelfChange: () => void;
}) {
  const [name, setName] = useState(page.name);
  const [contactLabel, setContactLabel] = useState(page.contactLabel || "");
  const [contactUrl, setContactUrl] = useState(page.contactUrl || "");
  const [demoFlowId, setDemoFlowId] = useState(page.demoFlowId || "");
  const [enqOn, setEnqOn] = useState(!!page.enquiries?.enabled);
  const [enqLabel, setEnqLabel] = useState(page.enquiries?.label || "Book a viewing");
  const [enqPhone, setEnqPhone] = useState(!!page.enquiries?.askPhone);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const published = flows.filter((f) => f.status === "PUBLISHED");
  const dirty =
    name.trim() !== page.name ||
    contactLabel.trim() !== (page.contactLabel || "") ||
    contactUrl.trim() !== (page.contactUrl || "") ||
    demoFlowId !== (page.demoFlowId || "") ||
    enqOn !== !!page.enquiries?.enabled ||
    (enqLabel.trim() || "Book a viewing") !== (page.enquiries?.label || "Book a viewing") ||
    enqPhone !== !!page.enquiries?.askPhone;

  const save = async () => {
    if (!name.trim()) return notify.error("Give your page a name");
    setSaving(true);
    try {
      const r = await apiEndpoints.driftUpdateMyPage({
        name: name.trim(),
        contactLabel: contactLabel.trim() || null,
        contactUrl: contactUrl.trim() || null,
        demoFlowId: demoFlowId || null,
        enquiries: { enabled: enqOn, label: enqLabel.trim() || "Book a viewing", askPhone: enqPhone },
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
      <div className="tpg-enq">
        <label className="tpg-check">
          <input type="checkbox" checked={enqOn} onChange={(e) => setEnqOn(e.target.checked)} />
          <span>
            <b>Enquiry button</b>
            <small>On your page, your tours and every drift. Visitors send their name, email and a message straight to you.</small>
          </span>
        </label>
        {enqOn && (
          <div className="tpg-enq-body">
            <div className="t-inline">
              {ENQUIRY_PRESETS.map((l) => (
                <button key={l} type="button" className={`d-btn sm ${(enqLabel.trim() || "Book a viewing") === l ? "soft" : ""}`} onClick={() => setEnqLabel(l)}>
                  {l}
                </button>
              ))}
            </div>
            <input className="d-input" value={enqLabel} onChange={(e) => setEnqLabel(e.target.value)} maxLength={28} placeholder="Button label" aria-label="Enquiry button label" />
            <label className="tpg-check sm">
              <input type="checkbox" checked={enqPhone} onChange={(e) => setEnqPhone(e.target.checked)} />
              <span>Ask for a phone number</span>
            </label>
          </div>
        )}
      </div>
      <div style={{ marginTop: 14 }}>
        <div className="d-label">Account type</div>
        <div className="d-actions">
          <span className={`d-pill ${page.accountType === "PRO" ? "violet" : "accent"}`}>
            {page.accountType === "PRO" ? "Pro" : "General"}
          </span>
          <span className="d-faint" style={{ fontSize: 12 }}>
            {page.accountType === "PRO" ? "Photographers · videographers" : "Realtors · brands · venues"}
          </span>
        </div>
        <div className="d-faint" style={{ fontSize: 11.5, marginTop: 6 }}>
          Chosen at signup — contact us if it needs to change.
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
      <PagePeople clientPage={clientPage} onSelfChange={onSelfChange} />
    </div>
  );
}

// A Pro's client pages: one page per client, managed from here.
function ClientPages() {
  const navigate = useNavigate();
  const { checkAuth } = useAuth();
  const [pages, setPages] = useState<ClientPage[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    apiEndpoints
      .driftMyClientPages()
      .then((r) => setPages(r.data.pages || []))
      .catch(() => setPages([]));
  }, []);
  const create = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const r = await apiEndpoints.driftCreateClientPage(n);
      // No profile back when a superadmin made it for the Pro — they keep "Manage this page".
      if (r.data.profileId) {
        setActiveProfile(r.data.profileId, r.data.page?.name);
        await checkAuth();
      }
      invalidateMyPages();
      notify.success(`${r.data.page?.name || "The page"} is ready`);
      navigate(r.data.page?.path || "/tour/dashboard");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="tpg-section">
      <div className="tpg-bar">
        <h2>Client Pages</h2>
        <button className="d-btn sm" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "+ New client page"}
        </button>
      </div>
      {open && (
        <div className="d-card d-card-pad t-rise" style={{ marginBottom: 14, display: "grid", gap: 10 }}>
          <label className="d-label" htmlFor="client-page-name">
            Client's page name
          </label>
          <div className="t-inline">
            <input
              id="client-page-name"
              className="d-input"
              style={{ flex: "1 1 240px" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="e.g. Harbour Homes"
              maxLength={80}
              autoFocus
            />
            <button className="d-btn primary" onClick={create} disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create page"}
            </button>
          </div>
          <div className="d-faint" style={{ fontSize: 12 }}>
            The client's page gets its own link. You manage it — and can invite the client in later.
            Drifts on client pages are paid at checkout; your free drifts are for your own page.
          </div>
        </div>
      )}
      {pages === null ? (
        <div className="d-faint" style={{ fontSize: 13 }}>
          Loading…
        </div>
      ) : pages.length === 0 ? (
        !open && (
          <div className="tpg-empty">
            <h3>Build tours for your clients</h3>
            <p className="d-sub" style={{ margin: 0, maxWidth: "46ch" }}>
              Create a page for each client. Each one has its own link, and you manage them all from here.
            </p>
          </div>
        )
      ) : (
        <div className="tpg-clients">
          {pages.map((p) => (
            <Link key={p.id} to={p.path || "/tour"} className="tpg-client">
              <span className="tpg-mark sm">{(p.name || "?").trim().charAt(0)}</span>
              <span style={{ minWidth: 0 }}>
                <b>{p.name}</b>
                <small>
                  {p.tours} tour{p.tours === 1 ? "" : "s"}
                </small>
              </span>
              <span className="tpw-go" aria-hidden>
                ›
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
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
  const [flows, setFlows] = useState<Flow[]>([]);
  const [manager, setManager] = useState<PageRef | null>(null);
  const [adminLoaded, setAdminLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const admin = usePageAdmin(pub?.page.id);
  const editing = admin.isAdmin && !preview;
  const { user, checkAuth } = useAuth();
  // The caller's role here, from the admin API (a superadmin managing the page is an Admin).
  const [role, setRole] = useState<PageRole | null>(null);
  const canEdit = editing && canEditPage(role);
  const canAdmin = editing && isPageAdmin(role);

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
      setManager(r.data.manager || null);
      setRole((r.data.role as PageRole) || "ADMIN");
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
      setRole(null);
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
    setTimeout(() => {
      const input = document.getElementById("new-tour-name");
      input?.scrollIntoView({ behavior: "smooth", block: "center" });
      input?.focus({ preventScroll: true });
    }, 60);
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

  const leave = async () => {
    if (!pub || !user || user.organizationId !== pub.page.id) return;
    const ok = await confirmAction(`Leave ${pub.page.name}? You'll lose access to this page.`);
    if (!ok) return;
    try {
      await leavePage(user.id, checkAuth, navigate);
      notify.success("You left the page");
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  // The page's team switches between their admin view and what visitors see in the header;
  // a superadmin on someone else's page starts on the public side ("Admin" = manage it).
  const shellView: ShellView | undefined = admin.isAdmin
    ? { value: preview ? "public" : "admin", onChange: (v) => setPreview(v === "public") }
    : admin.canManage
      ? { value: "public", onChange: () => admin.setManage(true) }
      : undefined;
  const shell = (body: React.ReactNode) => (
    <TourShell view={shellView}>
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
        {canEdit && (
          <button className="d-btn sm" onClick={() => setHidden(f, !f.hidden)}>
            {f.hidden ? "Unhide" : "Hide"}
          </button>
        )}
        {canAdmin && (
          <button className="d-btn ghost sm" onClick={() => remove(f)}>
            Delete
          </button>
        )}
      </>
    );
  };

  return shell(
    <>
      <section className="tpg-hero t-rise">
        <div style={{ minWidth: 0 }}>
          <div className="tpg-brand">
            {page.logoUrl ? <img className="tpg-logo" src={page.logoUrl} alt="" /> : <span className="tpg-mark">{initial}</span>}
            <div style={{ minWidth: 0 }}>
              <div className="d-eyebrow">Tours</div>
              <h1 className="tpg-title">{page.name}</h1>
            </div>
          </div>
          {editing ? (
            <>
              {(role === "VIEWER" || (manager && manager.path)) && (
                <p className="tpg-sub tpg-meta-line">
                  {role === "VIEWER" && <span className="d-pill">View Only</span>}
                  {manager && manager.path && (
                    <span>
                      Managed By{" "}
                      <Link to={manager.path} style={{ color: "var(--accent)", fontWeight: 700 }}>
                        {manager.name}
                      </Link>
                    </span>
                  )}
                </p>
              )}
              {(canEdit || canAdmin || (role && role !== "ADMIN" && !admin.managing)) && (
                <div className="tpg-cta">
                  {canEdit && (
                    <button className="d-btn primary" onClick={startCreate}>
                      + Create New Tour
                    </button>
                  )}
                  {canAdmin && (
                    <button
                      className={`d-btn tpg-settings-btn ${showSettings ? "on" : ""}`}
                      onClick={() => setShowSettings((v) => !v)}
                      aria-expanded={showSettings}
                    >
                      <GearIcon />
                      {showSettings ? "Close Settings" : "Page Settings"}
                    </button>
                  )}
                  {role && role !== "ADMIN" && !admin.managing && (
                    <button className="d-btn ghost" onClick={leave}>
                      Leave Page
                    </button>
                  )}
                </div>
              )}
              {page.path && (
                <div className="tpg-linkrow">
                  <span className="t-link">
                    <code>{publicUrl(page.path).replace(/^https?:\/\//, "")}</code>
                    <button className="d-btn ghost sm" onClick={() => copy(page.path!)}>
                      Copy
                    </button>
                  </span>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="tpg-sub">Interactive tours you explore with a finger — pick one to start.</p>
              <div className="tpg-cta">
                {pub.demo && (
                  <Link className="d-btn" to={pub.demo.path} style={{ textDecoration: "none" }}>
                    ▶ View Demo
                  </Link>
                )}
                <EnquiryButton page={page} />
                <ContactButton page={page} />
              </div>
            </>
          )}
        </div>
        <div className="tpg-art" aria-hidden>
          <PathArtH />
        </div>
      </section>

      {canAdmin && showSettings && (
        <PageSettings
          key={page.id}
          page={page}
          flows={flows}
          clientPage={!!manager}
          onSelfChange={() => {
            setShowSettings(false);
            loadAdmin();
          }}
          onClose={() => setShowSettings(false)}
          onSaved={(p, demo) => setPub((d) => (d ? { ...d, page: p, demo: demo === undefined ? d.demo : demo } : d))}
        />
      )}

      {canEdit && creating && (
        <div className="tpg-new t-rise">
          <div className="tpg-new-head">
            <span className="tpg-new-mark" aria-hidden>
              +
            </span>
            <div style={{ minWidth: 0 }}>
              <div className="d-eyebrow">New Tour</div>
              <h2>Name Your Tour</h2>
            </div>
          </div>
          <label className="d-label" htmlFor="new-tour-name">
            What Is This Tour Of?
          </label>
          <input
            id="new-tour-name"
            className="d-input tpg-new-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="e.g. 45 Birch Lane"
            maxLength={80}
          />
          <div className="tpg-new-foot">
            <span className="d-faint">The Name Becomes the Tour's Link — You'll Add the Clips Next.</span>
            <div className="t-actions">
              <button className="d-btn ghost" onClick={() => setCreating(false)} disabled={busy}>
                Cancel
              </button>
              <button className="d-btn primary" onClick={create} disabled={busy || !newName.trim()}>
                {busy ? "Creating…" : "Create Tour"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="tpg-section t-rise t-rise-2">
        <div className="tpg-bar">
          <h2>Featured Tours</h2>
        </div>
        {editing && !adminLoaded ? (
          <div className="d-faint" style={{ fontSize: 13 }}>
            Loading your tours…
          </div>
        ) : featured.length === 0 ? (
          canEdit ? (
            <div className="tpg-empty">
              <h3>Build Your First Tour</h3>
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
        ) : (
          <TourPathList items={featured} renderActions={editing ? adminActions : undefined} />
        )}
      </section>

      {canEdit && (
        <PageEnquiries
          page={page}
          canDelete={canAdmin}
          onSetUp={
            canAdmin
              ? () => {
                  setShowSettings(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }
              : undefined
          }
        />
      )}

      {canAdmin && page.accountType === "PRO" && <ClientPages />}

      {editing && hiddenTours.length > 0 && (
        <section className="tpg-section">
          <div className="tpg-bar">
            <h2>Hidden Tours</h2>
            <span className="d-faint">Only this page's team sees these. Their links still work.</span>
          </div>
          <TourPathList items={hiddenTours} renderActions={adminActions} />
        </section>
      )}
    </>,
  );
}
