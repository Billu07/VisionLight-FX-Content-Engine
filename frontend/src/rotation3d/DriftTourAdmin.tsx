import { useEffect, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { isDriftHost } from "../lib/branding";

/**
 * Superadmin → drift.li → Tour. The creator suite's back office: every tour page
 * (owners, General / Pro, the managing Pro, tours, drifts, payments) with its limits,
 * the public demo tour, checkout orders and the View / Memory / Path wait list.
 * "Open page" opens the page itself — there a superadmin gets "Manage this page" and
 * works in it exactly like its owner.
 */

type PageRow = {
  id: string;
  name: string;
  slug: string | null;
  path: string | null;
  accountType: string;
  managedBy: { id: string; name: string | null } | null;
  freeDrifts: number;
  maxClipSeconds: number;
  createdAt: string;
  admins: string[];
  tours: number;
  drifts: number;
  paid: string;
};

type PageDetail = {
  page: {
    id: string;
    name: string;
    slug: string | null;
    path: string | null;
    accountType: string;
    managedBy: { id: string; name: string; path: string | null } | null;
    freeDrifts: number;
    maxClipSeconds: number;
    createdAt: string;
    paid: string;
  };
  users: { id: string; email: string; name: string | null; role: string; pageRole?: string; createdAt: string }[];
  flows: {
    id: string;
    name: string;
    status: string;
    isDemo: boolean;
    hidden: boolean;
    publicPath: string;
    thumb: string | null;
    counts: { steps: number; ready: number; processing: number; failed: number; awaiting: number };
    updatedAt: string;
  }[];
  orders: {
    id: string;
    status: string;
    quantity: number;
    amount: string;
    tour: string | null;
    createdAt: string;
    paidAt: string | null;
    /** The payment in Stripe — its invoice, its card, its refund button. Null until it's paid. */
    stripeUrl: string | null;
  }[];
  clientPages: { id: string; name: string; path: string | null }[];
  invites: InviteRow[];
};

/** A one-time link asking someone onto a page. `url` is null once it has been used. */
type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
  url: string | null;
};

type DemoRow = {
  id: string;
  name: string;
  isDemo: boolean;
  page: string | null;
  publicPath: string;
  drifts: number;
  /** lives on the Drift channel (featured, or in its library) */
  onChannel: boolean;
  featured: boolean;
  /** the creator it is credited to, when the channel shows someone else's tour */
  credit: string | null;
};
type OrderRow = {
  id: string;
  status: string;
  quantity: number;
  amount: string;
  createdAt: string;
  paidAt: string | null;
  page: string | null;
  pagePath: string | null;
  tour: string | null;
  tourPath: string | null;
  stripeUrl: string | null;
};
type WaitRow = { id: string; email: string; product: string; source: string | null; createdAt: string };
type Msg = { kind: "ok" | "err"; text: string } | null;

const pill = (s: string) =>
  s === "PAID" || s === "PUBLISHED" ? "ok" : s === "PENDING" || s === "DRAFT" ? "warn" : s === "FAILED" || s === "CANCELED" ? "err" : "";
const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
// Tour pages live on drift.li; the admin panel usually runs on the studio domain.
const DRIFT_ORIGIN = "https://drift.li";
const onDrift = (path: string) =>
  typeof window !== "undefined" && isDriftHost(window.location.hostname) ? path : `${DRIFT_ORIGIN}${path}`;
const errText = (e: any, fallback: string) => e?.message || fallback;

/** An invite link, and a button that puts it on the clipboard. */
function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="d-btn ghost sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          window.prompt("Copy this invite link:", url);
        }
      }}
      title={url}
    >
      {done ? "Copied" : label}
    </button>
  );
}

function Banner({ msg, onClose }: { msg: Msg; onClose: () => void }) {
  if (!msg) return null;
  return (
    <div className={`d-banner ${msg.kind === "ok" ? "ok" : "err"}`}>
      <span>{msg.text}</span>
      <button className="d-x" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

/**
 * Who has been asked onto this page and hasn't arrived yet. The link is shown beside each one:
 * an invite that never turns up in an inbox shouldn't be the end of it — the superadmin can
 * send it by hand.
 */
function InvitesCard({ detail, onChanged }: { detail: PageDetail; onChanged: (d: PageDetail) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("ADMIN");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const invites = detail.invites || [];

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiEndpoints.driftTourAdminInviteToPage(detail.page.id, { email: email.trim(), role });
      onChanged(r.data);
      setEmail("");
      setMsg({ kind: "ok", text: `Invite sent to ${r.data.invite.email}.` });
    } catch (e) {
      setMsg({ kind: "err", text: errText(e, "Couldn't send that invite") });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiEndpoints.driftTourAdminRevokeInvite(detail.page.id, id);
      onChanged(r.data);
    } catch (e) {
      setMsg({ kind: "err", text: errText(e, "Couldn't withdraw that invite") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="d-card d-card-pad">
      <div className="d-eyebrow" style={{ marginBottom: 10 }}>
        Invites
      </div>
      <Banner msg={msg} onClose={() => setMsg(null)} />
      {invites.length > 0 && (
        <div className="d-list" style={{ marginBottom: 12 }}>
          {invites.map((i) => (
            <div key={i.id} className="d-row">
              <div className="d-row-main">
                <div className="d-name">{i.email}</div>
                <div className="d-meta">
                  <span className={`d-pill ${pill(i.status)}`}>{i.status === "ACCEPTED" ? "Joined" : i.status}</span>
                  <span>{i.role === "ADMIN" ? "Admin" : i.role === "EDITOR" ? "Editor" : "Viewer"}</span>
                  <span>{i.status === "ACCEPTED" ? `Joined ${when(i.acceptedAt)}` : `Sent ${when(i.createdAt)}`}</span>
                </div>
              </div>
              <div className="d-actions">
                {i.url && <CopyLink url={i.url} />}
                {i.status === "PENDING" && (
                  <button className="d-btn ghost sm" onClick={() => void revoke(i.id)} disabled={busy}>
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="d-actions">
        <input
          className="d-input"
          style={{ flex: "1 1 220px", minWidth: 0 }}
          type="email"
          placeholder="someone@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select className="d-select" style={{ flex: "0 1 140px" }} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="ADMIN">Admin</option>
          <option value="EDITOR">Editor</option>
          <option value="VIEWER">Viewer</option>
        </select>
        <button className="d-btn" onClick={() => void send()} disabled={busy || !email.trim()}>
          {busy ? "Sending…" : "Send Invite"}
        </button>
      </div>
      <span className="d-note" style={{ marginTop: 6, display: "block" }}>
        A one-time link, good for 14 days.
      </span>
    </div>
  );
}

function PageDetailView({ detail, onSaved }: { detail: PageDetail; onSaved: (d: PageDetail) => void }) {
  const p = detail.page;
  const [freeDrifts, setFreeDrifts] = useState(String(p.freeDrifts));
  const [maxClip, setMaxClip] = useState(String(p.maxClipSeconds));
  const [accountType, setAccountType] = useState(p.accountType || "GENERAL");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  // Copy a tour into the Drift channel's library (drift.li/tour/drift).
  const [savingId, setSavingId] = useState<string | null>(null);
  const [tourMsg, setTourMsg] = useState<Msg>(null);
  const saveToLibrary = async (flowId: string) => {
    setSavingId(flowId);
    setTourMsg(null);
    try {
      const r = await apiEndpoints.driftTourAdminSaveToChannel(flowId);
      setTourMsg({
        kind: "ok",
        text: r.data.existing ? "Already in the Drift Library." : "Saved to the Drift Library — feature it from the channel (Drift Channel tab).",
      });
    } catch (e) {
      setTourMsg({ kind: "err", text: errText(e, "Couldn't save the tour") });
    } finally {
      setSavingId(null);
    }
  };
  const dirty = freeDrifts !== String(p.freeDrifts) || maxClip !== String(p.maxClipSeconds) || accountType !== (p.accountType || "GENERAL");

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const r = await apiEndpoints.driftTourAdminUpdatePage(p.id, {
        freeDrifts: Number(freeDrifts),
        maxClipSeconds: Number(maxClip),
        accountType,
      });
      onSaved(r.data);
      setMsg({ kind: "ok", text: "Saved." });
    } catch (e) {
      setMsg({ kind: "err", text: errText(e, "Couldn't save") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div className="d-head">
        <div style={{ minWidth: 0 }}>
          <div className="d-eyebrow">Tour page</div>
          <div className="d-h1">{p.name}</div>
          <div className="d-meta">
            <span className={`d-pill ${p.accountType === "PRO" ? "violet" : "accent"}`}>{p.accountType === "PRO" ? "Pro" : "General"}</span>
            {p.managedBy && <span>Managed by {p.managedBy.name}</span>}
            <span>Since {when(p.createdAt)}</span>
            <span>Paid {p.paid}</span>
          </div>
        </div>
        <div className="d-actions">
          {p.path && (
            <a className="d-btn soft sm" href={onDrift(p.path)} target="_blank" rel="noopener noreferrer" title="Opens the page — use “Manage this page” there">
              Open page ↗
            </a>
          )}
        </div>
      </div>

      <Banner msg={msg} onClose={() => setMsg(null)} />

      <div className="d-card d-card-pad">
        <div className="d-eyebrow">Limits &amp; account</div>
        <div className="d-grid-2" style={{ marginTop: 12 }}>
          <div className="d-field">
            <label className="d-label">Free drifts</label>
            <input className="d-input" type="number" min={0} max={1000} value={freeDrifts} onChange={(e) => setFreeDrifts(e.target.value)} />
            <span className="d-note" style={{ marginTop: 5 }}>
              Drifts this page builds before checkout (default 3).
            </span>
          </div>
          <div className="d-field">
            <label className="d-label">Longest clip (seconds)</label>
            <input className="d-input" type="number" min={1} max={600} value={maxClip} onChange={(e) => setMaxClip(e.target.value)} />
            <span className="d-note" style={{ marginTop: 5 }}>
              Default 5.
            </span>
          </div>
          <div className="d-field">
            <label className="d-label">Account type</label>
            <select className="d-select" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
              <option value="GENERAL">General — realtors, brands, venues</option>
              <option value="PRO">Pro — photographers, videographers</option>
            </select>
          </div>
        </div>
        <div className="d-actions" style={{ marginTop: 12 }}>
          <button className="d-btn primary" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="d-card d-card-pad">
        <div className="d-head" style={{ marginBottom: 10 }}>
          <div className="d-eyebrow">Tours</div>
          <span className="d-faint" style={{ fontSize: 12 }}>
            {detail.flows.length}
          </span>
        </div>
        <Banner msg={tourMsg} onClose={() => setTourMsg(null)} />
        {detail.flows.length === 0 ? (
          <p className="d-faint" style={{ fontSize: 12.5, margin: 0 }}>
            No tours yet.
          </p>
        ) : (
          <div className="d-list">
            {detail.flows.map((f) => (
              <div key={f.id} className="d-row">
                <div className="d-row-main">
                  <div className="d-name">{f.name}</div>
                  <div className="d-meta">
                    <span className={`d-pill ${pill(f.status)}`}>{f.status === "PUBLISHED" ? "Live" : f.status}</span>
                    <span>{plural(f.counts.steps, "drift")}</span>
                    {f.counts.awaiting > 0 && <span className="d-pill warn">{f.counts.awaiting} to check out</span>}
                    {f.counts.failed > 0 && <span className="d-pill err">{f.counts.failed} failed</span>}
                    {f.isDemo && <span className="d-pill accent">Demo</span>}
                    {f.hidden && <span className="d-pill">Hidden</span>}
                  </div>
                </div>
                <div className="d-actions">
                  {p.slug !== "drift" && f.counts.ready > 0 && (
                    <button className="d-btn sm" onClick={() => void saveToLibrary(f.id)} disabled={savingId === f.id} title="Copy it into the Drift channel's library">
                      {savingId === f.id ? "Saving…" : "Save to Library"}
                    </button>
                  )}
                  <a className="d-btn sm" href={onDrift(f.publicPath)} target="_blank" rel="noopener noreferrer">
                    Open ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="d-card d-card-pad">
        <div className="d-eyebrow" style={{ marginBottom: 10 }}>
          People
        </div>
        <div className="d-list">
          {detail.users.map((u) => (
            <div key={u.id} className="d-item static">
              <span className="grow">
                <span className="d-name" style={{ display: "block", fontSize: 13 }}>
                  {u.email}
                </span>
                <span className="sub">
                  {u.name || "—"} · since {when(u.createdAt)}
                </span>
              </span>
              <span className="d-pill">{u.pageRole || u.role}</span>
            </div>
          ))}
        </div>
      </div>

      <InvitesCard detail={detail} onChanged={onSaved} />

      {detail.clientPages.length > 0 && (
        <div className="d-card d-card-pad">
          <div className="d-eyebrow" style={{ marginBottom: 10 }}>
            Client pages
          </div>
          <div className="d-actions">
            {detail.clientPages.map((c) =>
              c.path ? (
                <a key={c.id} className="d-btn sm" href={onDrift(c.path)} target="_blank" rel="noopener noreferrer">
                  {c.name} ↗
                </a>
              ) : (
                <span key={c.id} className="d-pill">
                  {c.name}
                </span>
              ),
            )}
          </div>
        </div>
      )}

      <div className="d-card d-card-pad">
        <div className="d-eyebrow" style={{ marginBottom: 10 }}>
          Orders
        </div>
        {detail.orders.length === 0 ? (
          <p className="d-faint" style={{ fontSize: 12.5, margin: 0 }}>
            No checkouts yet.
          </p>
        ) : (
          <div className="d-list">
            {detail.orders.map((o) => (
              <div key={o.id} className="d-item static">
                <span className="grow">
                  <span className="d-name" style={{ display: "block", fontSize: 13 }}>
                    {o.amount} · {plural(o.quantity, "drift")}
                  </span>
                  <span className="sub">
                    {o.tour || "—"} · {when(o.paidAt || o.createdAt)}
                  </span>
                </span>
                {o.stripeUrl && (
                  <a className="d-btn ghost sm" href={o.stripeUrl} target="_blank" rel="noopener noreferrer" title="The payment in Stripe — receipt, card, refund">
                    Stripe ↗
                  </a>
                )}
                <span className={`d-pill ${pill(o.status)}`}>{o.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Make a page for someone and send them the way in. The page is real from the moment this is
 * submitted — with the limits set here — so it can be opened, edited and filled in before they
 * ever sign in; the invite is the same one-time link a page admin sends.
 */
function InviteCreator({ onCreated }: { onCreated: (d: PageDetail) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [pageName, setPageName] = useState("");
  const [accountType, setAccountType] = useState("GENERAL");
  const [freeDrifts, setFreeDrifts] = useState("3");
  const [maxClip, setMaxClip] = useState("5");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [link, setLink] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    setLink(null);
    try {
      const r = await apiEndpoints.driftTourAdminInviteCreator({
        email: email.trim(),
        pageName: pageName.trim() || undefined,
        accountType,
        freeDrifts: Number(freeDrifts),
        maxClipSeconds: Number(maxClip),
      });
      onCreated(r.data);
      setLink(r.data.invite?.url || null);
      setMsg({ kind: "ok", text: `"${r.data.page.name}" is ready — the invite is on its way to ${r.data.invite.email}.` });
      setEmail("");
      setPageName("");
    } catch (e) {
      setMsg({ kind: "err", text: errText(e, "Couldn't create that page") });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="d-card d-card-pad">
        <div className="d-head">
          <div style={{ minWidth: 0 }}>
            <div className="d-h2">Invite a creator</div>
            <p className="d-sub" style={{ fontSize: 12.5, margin: "4px 0 0" }}>
              Make their page, set its limits and send them the link.
            </p>
          </div>
          <button className="d-btn primary sm" onClick={() => setOpen(true)}>
            + Invite
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="d-card d-card-pad">
      <div className="d-head" style={{ marginBottom: 10 }}>
        <div className="d-h2">Invite a creator</div>
        <button className="d-btn ghost sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <Banner msg={msg} onClose={() => setMsg(null)} />
      {link && (
        <div className="d-actions" style={{ marginBottom: 10 }}>
          <span className="d-note" style={{ flex: "1 1 160px", minWidth: 0 }}>
            Their link, if you'd rather pass it on yourself:
          </span>
          <CopyLink url={link} label="Copy invite link" />
        </div>
      )}
      <div className="d-field">
        <label className="d-label">Their email</label>
        <input className="d-input" type="email" placeholder="someone@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="d-field" style={{ marginTop: 10 }}>
        <label className="d-label">Page name</label>
        <input className="d-input" placeholder="Harbour Homes" value={pageName} onChange={(e) => setPageName(e.target.value)} />
        <span className="d-note" style={{ marginTop: 5 }}>
          What visitors see, and the page's link. Left empty, it's taken from their email.
        </span>
      </div>
      <div className="d-grid-2" style={{ marginTop: 10 }}>
        <div className="d-field">
          <label className="d-label">Free drifts</label>
          <input className="d-input" type="number" min={0} max={1000} value={freeDrifts} onChange={(e) => setFreeDrifts(e.target.value)} />
          <span className="d-note" style={{ marginTop: 5 }}>
            Before they check out (default 3).
          </span>
        </div>
        <div className="d-field">
          <label className="d-label">Longest clip (seconds)</label>
          <input className="d-input" type="number" min={1} max={600} value={maxClip} onChange={(e) => setMaxClip(e.target.value)} />
          <span className="d-note" style={{ marginTop: 5 }}>
            Default 5.
          </span>
        </div>
        <div className="d-field">
          <label className="d-label">Account type</label>
          <select className="d-select" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
            <option value="GENERAL">General — realtors, brands, venues</option>
            <option value="PRO">Pro — photographers, videographers</option>
          </select>
        </div>
      </div>
      <div className="d-actions" style={{ marginTop: 12 }}>
        <button className="d-btn primary" onClick={() => void submit()} disabled={busy || !email.trim()}>
          {busy ? "Creating…" : "Create the Page & Send the Invite"}
        </button>
      </div>
    </div>
  );
}

function Pages() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PageRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PageDetail | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = async (query: string) => {
    try {
      const r = await apiEndpoints.driftTourAdminPages(query.trim() || undefined);
      setRows(r.data.pages || []);
    } catch (e) {
      setMsg({ kind: "err", text: errText(e, "Couldn't load the pages") });
      setRows([]);
    }
  };
  useEffect(() => {
    const t = setTimeout(() => load(q), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  const open = async (id: string) => {
    setSelected(id);
    setDetail(null);
    try {
      const r = await apiEndpoints.driftTourAdminPage(id);
      setDetail(r.data);
    } catch (e) {
      setMsg({ kind: "err", text: errText(e, "Couldn't load that page") });
    }
  };

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <Banner msg={msg} onClose={() => setMsg(null)} />
      <InviteCreator
        onCreated={(d) => {
          setSelected(d.page.id);
          setDetail(d);
          void load(q);
        }}
      />
      <div className={`d-split ${selected ? "has-detail" : ""}`}>
        <aside className="d-split-side">
          <div className="d-card d-card-pad">
            <div className="d-h2">Tour pages</div>
            <p className="d-sub" style={{ fontSize: 12.5 }}>
              Every creator page on drift.li/tour.
            </p>
            <input className="d-input" style={{ marginTop: 12 }} placeholder="Search a name, link or email…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="d-list d-scroll" style={{ marginTop: 12, maxHeight: 620 }}>
              {rows === null ? (
                <div className="py-6 text-center">
                  <LoadingSpinner size="sm" />
                </div>
              ) : rows.length === 0 ? (
                <p className="d-faint py-6 text-center" style={{ fontSize: 12.5 }}>
                  {q ? "No pages match." : "No tour pages yet."}
                </p>
              ) : (
                rows.map((p) => (
                  <button key={p.id} className={`d-item ${selected === p.id ? "active" : ""}`} onClick={() => open(p.id)}>
                    <span className="grow">
                      <span className="d-name" style={{ display: "block", fontSize: 13.5 }}>
                        {p.name}
                      </span>
                      <span className="sub">
                        {p.admins[0] || "no admin"} · {plural(p.tours, "tour")} · {plural(p.drifts, "drift")}
                      </span>
                    </span>
                    {p.accountType === "PRO" && <span className="d-pill violet">Pro</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>
        <section style={{ minWidth: 0 }}>
          {!selected ? (
            <div className="d-empty">Select a page to see its tours, people, limits and payments.</div>
          ) : (
            <>
              <button
                className="d-btn ghost sm d-mobile-back"
                onClick={() => {
                  setSelected(null);
                  setDetail(null);
                }}
              >
                ← All pages
              </button>
              {!detail ? (
                <div className="py-10 text-center">
                  <LoadingSpinner size="sm" />
                </div>
              ) : (
                <PageDetailView
                  key={detail.page.id}
                  detail={detail}
                  onSaved={(d) => {
                    setDetail(d);
                    load(q);
                  }}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function DemoTour() {
  const [rows, setRows] = useState<DemoRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  // The demo belongs on the channel: pointing it at a creator's own tour makes the demo rule
  // strip that page's branding from their real tour (client, 2026-09-26). Everything else is
  // still reachable, just not the first thing offered.
  const [all, setAll] = useState(false);
  const load = async () => {
    try {
      const r = await apiEndpoints.driftTourAdminDemo();
      setRows(r.data.flows || []);
    } catch (e) {
      setMsg({ kind: "err", text: errText(e, "Couldn't load the tours") });
      setRows([]);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const set = async (flowId: string | null) => {
    setBusy(true);
    setMsg(null);
    try {
      await apiEndpoints.driftTourAdminSetDemo(flowId);
      await load();
      setMsg({ kind: "ok", text: flowId ? "Demo tour updated." : "No demo tour set." });
    } catch (e) {
      setMsg({ kind: "err", text: errText(e, "Couldn't set the demo") });
    } finally {
      setBusy(false);
    }
  };
  const current = rows?.find((r) => r.isDemo) || null;
  // The current demo always stays in view, whatever it is, so it can be seen and changed.
  const shown = (rows || []).filter((r) => all || r.onChannel || r.isDemo);
  return (
    <div className="d-card d-card-pad">
      <div className="d-head">
        <div style={{ minWidth: 0 }}>
          <div className="d-h2">Demo tour</div>
          <p className="d-sub" style={{ fontSize: 12.5, maxWidth: "62ch" }}>
            "Take a Tour" on the Tour landing, and every page's "View Demo" (unless the page picks its own), open this tour.
            Pick one the Drift Channel features — a demo carries no page branding, so pointing it at a creator's own tour
            takes the branding off their real tour too.
          </p>
        </div>
        {current && (
          <button className="d-btn ghost sm" onClick={() => set(null)} disabled={busy}>
            Clear demo
          </button>
        )}
      </div>
      <Banner msg={msg} onClose={() => setMsg(null)} />
      {rows !== null && rows.length > 0 && (
        <div className="d-actions" style={{ marginTop: 12 }}>
          <button className={`d-tab ${all ? "" : "active"}`} onClick={() => setAll(false)}>
            On the Drift Channel
          </button>
          <button className={`d-tab ${all ? "active" : ""}`} onClick={() => setAll(true)}>
            Every Published Tour
          </button>
        </div>
      )}
      <div className="d-list" style={{ marginTop: 12 }}>
        {rows === null ? (
          <div className="py-6 text-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : shown.length === 0 ? (
          <p className="d-faint" style={{ fontSize: 12.5 }}>
            {rows.length === 0
              ? "No published tours yet."
              : "Nothing on the Drift Channel yet — feature a tour from the Drift Channel tab, or look at every published tour."}
          </p>
        ) : (
          shown.map((r) => (
            <div key={r.id} className={`d-item static ${r.isDemo ? "active" : ""}`}>
              <span className="grow">
                <span className="d-name" style={{ display: "block", fontSize: 13.5 }}>
                  {r.name}
                </span>
                <span className="sub">
                  {r.credit ? `Captured by ${r.credit}` : r.page || "—"} · {plural(r.drifts, "drift")}
                </span>
              </span>
              {r.onChannel && <span className={`d-pill ${r.featured ? "ok" : ""}`}>{r.featured ? "Featured" : "Library"}</span>}
              {r.isDemo ? (
                <span className="d-pill ok">Demo</span>
              ) : (
                <button className="d-btn sm" onClick={() => set(r.id)} disabled={busy}>
                  Use as demo
                </button>
              )}
              <a className="d-btn ghost sm" href={onDrift(r.publicPath)} target="_blank" rel="noopener noreferrer">
                Open ↗
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Orders() {
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    apiEndpoints
      .driftTourAdminOrders()
      .then((r) => setRows(r.data.orders || []))
      .catch((e) => {
        setMsg({ kind: "err", text: errText(e, "Couldn't load orders") });
        setRows([]);
      });
  }, []);
  return (
    <div className="d-card d-card-pad">
      <div className="d-h2">Orders</div>
      <p className="d-sub" style={{ fontSize: 12.5 }}>
        Tour checkouts, newest first. Receipts and refunds live in your Stripe dashboard.
      </p>
      <Banner msg={msg} onClose={() => setMsg(null)} />
      <div className="d-list" style={{ marginTop: 12 }}>
        {rows === null ? (
          <div className="py-6 text-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : rows.length === 0 ? (
          <p className="d-faint" style={{ fontSize: 12.5 }}>
            No checkouts yet.
          </p>
        ) : (
          rows.map((o) => (
            <div key={o.id} className="d-row">
              <div className="d-row-main">
                <div className="d-name">
                  {o.amount} · {plural(o.quantity, "drift")}
                </div>
                <div className="d-meta">
                  <span className={`d-pill ${pill(o.status)}`}>{o.status}</span>
                  <span>{when(o.paidAt || o.createdAt)}</span>
                  <span>
                    {o.page || "—"}
                    {o.tour ? ` → ${o.tour}` : ""}
                  </span>
                </div>
              </div>
              <div className="d-actions">
                {/* Straight to the payment: its invoice (the buyer's receipt), card and refund. */}
                {o.stripeUrl && (
                  <a className="d-btn ghost sm" href={o.stripeUrl} target="_blank" rel="noopener noreferrer" title="The payment in Stripe — receipt, card, refund">
                    Stripe ↗
                  </a>
                )}
                {o.tourPath && (
                  <a className="d-btn sm" href={onDrift(o.tourPath)} target="_blank" rel="noopener noreferrer">
                    Tour ↗
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Waitlist() {
  const [rows, setRows] = useState<WaitRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"ALL" | "VIEW" | "MEMORY" | "PATH">("ALL");
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => {
    apiEndpoints
      .driftAdminWaitlist()
      .then((r) => {
        setRows(r.data.entries || []);
        setCounts(r.data.counts || {});
      })
      .catch((e) => {
        setMsg({ kind: "err", text: errText(e, "Couldn't load the wait list") });
        setRows([]);
      });
  }, []);
  const visible = (rows || []).filter((r) => filter === "ALL" || r.product === filter);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText([...new Set(visible.map((r) => r.email))].join(", "));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const label = (p: string) => (p === "ALL" ? "All" : p.charAt(0) + p.slice(1).toLowerCase());
  return (
    <div className="d-card d-card-pad">
      <div className="d-head">
        <div>
          <div className="d-h2">Wait list</div>
          <p className="d-sub" style={{ fontSize: 12.5 }}>
            People who want to hear when View, Memory and Path open.
          </p>
        </div>
        <button className="d-btn sm" onClick={copy} disabled={!visible.length}>
          {copied ? "Copied!" : "Copy emails"}
        </button>
      </div>
      <Banner msg={msg} onClose={() => setMsg(null)} />
      <div className="d-tabs" style={{ marginTop: 12 }}>
        {(["ALL", "VIEW", "MEMORY", "PATH"] as const).map((p) => (
          <button key={p} className={`d-tab ${filter === p ? "active" : ""}`} onClick={() => setFilter(p)}>
            {label(p)}
            {p !== "ALL" ? ` · ${counts[p] || 0}` : ""}
          </button>
        ))}
      </div>
      <div className="d-list d-scroll" style={{ marginTop: 12, maxHeight: 560 }}>
        {rows === null ? (
          <div className="py-6 text-center">
            <LoadingSpinner size="sm" />
          </div>
        ) : visible.length === 0 ? (
          <p className="d-faint" style={{ fontSize: 12.5 }}>
            Nobody yet.
          </p>
        ) : (
          visible.map((r) => (
            <div key={r.id} className="d-item static">
              <span className="grow">
                <span className="d-name" style={{ display: "block", fontSize: 13 }}>
                  {r.email}
                </span>
                <span className="sub">{when(r.createdAt)}</span>
              </span>
              <span className="d-pill accent">{label(r.product)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type ChannelInfo = { channel: { id: string; name: string; slug: string; path: string } | null; featured: number; library: number };

/** drift.li/tour/drift: drift.li's own page for demos and tours saved from creators. */
function DriftChannel() {
  const [data, setData] = useState<ChannelInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const load = async () => {
    try {
      const r = await apiEndpoints.driftTourAdminChannel();
      setData(r.data);
    } catch (e) {
      setMsg({ kind: "err", text: errText(e, "Couldn't load the channel") });
      setData({ channel: null, featured: 0, library: 0 });
    }
  };
  useEffect(() => {
    load();
  }, []);
  const setUp = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiEndpoints.driftTourAdminSetupChannel();
      setData(r.data);
      setMsg({ kind: "ok", text: "The Drift channel is ready." });
    } catch (e) {
      setMsg({ kind: "err", text: errText(e, "Couldn't set up the channel") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="d-card d-card-pad">
      <div className="d-head">
        <div style={{ minWidth: 0 }}>
          <div className="d-h2">Drift Channel</div>
          <p className="d-sub" style={{ fontSize: 12.5, maxWidth: "64ch" }}>
            drift.li/tour/drift — drift.li's own page for demos and tours saved from creators. A saved tour is a copy: the creator
            can change or delete theirs, and the channel's stays as it was, credited to them.
          </p>
        </div>
        {data?.channel && (
          <a className="d-btn primary sm" href={onDrift(data.channel.path)} target="_blank" rel="noopener noreferrer">
            Open the Channel ↗
          </a>
        )}
      </div>
      <Banner msg={msg} onClose={() => setMsg(null)} />
      {data === null ? (
        <div className="py-6 text-center">
          <LoadingSpinner size="sm" />
        </div>
      ) : data.channel ? (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {/* The counts are the quickest way to the thing they count (client, 2026-09-24). */}
          <div className="d-meta">
            <a className="d-pill ok" href={onDrift(data.channel.path)} target="_blank" rel="noopener noreferrer" title="Open the channel's Featured Tours">
              {data.featured} Featured ↗
            </a>
            <a className="d-pill" href={onDrift(data.channel.path)} target="_blank" rel="noopener noreferrer" title="Open the channel — the Library is its Hidden Tours, in Admin View">
              {data.library} in the Library ↗
            </a>
          </div>
          <ol className="d-sub" style={{ fontSize: 12.5, margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            <li>Save a tour: Pages → a page → its tours → Save to Library (or in the tour's Tour Settings).</li>
            <li>Feature it: open the channel → Manage This Page → Library → Feature.</li>
            <li>Order the Featured Tours there with ↑ ↓ — visitors see that order.</li>
          </ol>
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <button className="d-btn primary" onClick={() => void setUp()} disabled={busy}>
            {busy ? "Setting Up…" : "Set Up the Drift Channel"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function DriftTourAdmin() {
  const [tab, setTab] = useState<"pages" | "channel" | "demo" | "orders" | "waitlist">("pages");
  const [status, setStatus] = useState<{
    payments: boolean;
    webhook: boolean;
    price: string;
    queue?: { active: number; waiting: number; concurrency: number };
  } | null>(null);
  // Conversions are the one thing here that a creator waits on, so the strip keeps up with
  // them: every 10s while this panel is open.
  useEffect(() => {
    let alive = true;
    const read = () =>
      apiEndpoints
        .driftTourAdminStatus()
        .then((r) => alive && setStatus(r.data))
        .catch(() => undefined);
    void read();
    const t = setInterval(read, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const tabs = [
    ["pages", "Pages"],
    ["channel", "Drift Channel"],
    ["demo", "Demo tour"],
    ["orders", "Orders"],
    ["waitlist", "Wait list"],
  ] as const;
  return (
    <div className="d-rise" style={{ display: "grid", gap: 14, minWidth: 0 }}>
      <div className="d-head">
        <div className="d-tabs" role="tablist" aria-label="Tour back office">
          {tabs.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`d-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {status?.queue && (status.queue.active > 0 || status.queue.waiting > 0) && (
          <span
            className={`d-pill ${status.queue.waiting > 0 ? "warn" : ""}`}
            title={`This server converts ${status.queue.concurrency} drift${status.queue.concurrency === 1 ? "" : "s"} at a time. A drift takes about 16-19 CPU-seconds to build.`}
          >
            {status.queue.active} Converting
            {status.queue.waiting > 0 ? ` · ${status.queue.waiting} Waiting` : ""}
          </span>
        )}
        {status && (
          <span
            className={`d-pill ${status.payments && status.webhook ? "ok" : "warn"}`}
            title={status.payments ? (status.webhook ? "Stripe is configured" : "STRIPE_WEBHOOK_SECRET is missing on the server") : "STRIPE_SECRET_KEY is missing on the server"}
          >
            {status.payments ? (status.webhook ? `Checkout on · ${status.price} / drift` : "Checkout on · webhook missing") : "Checkout off"}
          </span>
        )}
      </div>
      {tab === "pages" ? <Pages /> : tab === "channel" ? <DriftChannel /> : tab === "demo" ? <DemoTour /> : tab === "orders" ? <Orders /> : <Waitlist />}
    </div>
  );
}
