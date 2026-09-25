import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import type { Page, PublicFlow } from "./types";
import { TourShell, type ShellView } from "./tourUi";
import { TOUR_PAGE_STYLES } from "./tourPageStyles";
import { ContactButton } from "./tourPageParts";
import { usePageAdmin } from "./usePageAdmin";
import { prefetchDriftPath } from "../rotation3d/driftNav";
import { captureShareLink } from "../rotation3d/personalLink";
import { EnquiryButton } from "./EnquirySheet";
import { lazyRoute } from "../lib/lazyRoute";

/** drift.li's own page: the Drift channel (backend services/driftChannel.ts). */
const CHANNEL_SLUG = "drift";

// The builder is for page admins only — visitors never download it.
const TourBuilder = lazyRoute(() => import("./TourBuilder"));

/**
 * drift.li/tour/{page}/{tour} — a tour's main link: its pathway menu. Visitors see the
 * page, the tour title, Start Tour above #1 and every drift as a strip on a straight
 * line (tap any strip to open that drift), with the page's contact button. Page admins
 * get the builder here instead (with a "Public view" switch to see what visitors see).
 */

function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div style={{ minHeight: "50vh", display: "grid", placeItems: "center" }}>
      <div className="d-faint" style={{ fontSize: 13 }}>
        {label}
      </div>
    </div>
  );
}

function PublicPathway({ page, flow }: { page: Page; flow: PublicFlow }) {
  const first = flow.steps[0];
  const home = page.path || "/tour";
  // The likeliest next tap is Start Tour: fetch drift #1 and warm its first frames
  // now (strips warm on touch / hover), so opening it is instant.
  useEffect(() => {
    if (first) prefetchDriftPath(first.playerPath, { full: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.playerPath]);
  // Opened through a personal link (?to=…): note it for this visit.
  useEffect(() => {
    captureShareLink();
  }, []);
  return (
    <div className="tpw t-rise">
      {/* A demo tour carries no page branding or messages — it stands on its own — but it still
          needs a way out, and that way is drift.li's own page of tours (client, 2026-09-23). */}
      {flow.isDemo && page.slug !== CHANNEL_SLUG && (
        <div className="tpw-top">
          <Link className="t-back" to={`/tour/${CHANNEL_SLUG}`}>
            ← Drift Tours
          </Link>
        </div>
      )}
      {(!flow.isDemo || page.slug === CHANNEL_SLUG) && (
        <>
          <div className="tpw-top">
            <Link className="t-back" to={home}>
              ← {page.name} Tours
            </Link>
            <span className="t-inline">
              {flow.credit &&
                (flow.credit.path ? (
                  <Link className="d-btn sm tpw-credit" to={flow.credit.path} title={`See more from ${flow.credit.name}`}>
                    Captured by <b>{flow.credit.name}</b>
                  </Link>
                ) : (
                  <span className="d-pill tpw-credit">Captured by {flow.credit.name}</span>
                ))}
              <EnquiryButton page={page} flowId={flow.id} className="d-btn primary sm" />
              <ContactButton page={page} flowId={flow.id} className="d-btn sm" />
            </span>
          </div>
          <Link to={home} className="tpw-brand">
            {page.logoUrl ? <img src={page.logoUrl} alt="" /> : null}
            <span>{page.name}</span>
          </Link>
        </>
      )}
      {/* No kind line here: the header already reads "drift.li TOUR", the way back reads
          "Drift Tours", and the tour's own name is the next thing on the page. A fourth
          "tour" in the same corner is what the client saw (issue33, 2026-09-26). */}
      <h1 className="tpw-title">{flow.title || flow.name}</h1>
      {flow.description && <p className="tpw-desc">{flow.description}</p>}

      <ol className="tpw-rail">
        {first && (
          <li className="tpw-item tpw-start">
            <span className="tpw-pin" aria-hidden>
              ▶
            </span>
            <Link className="d-btn primary tpw-startbtn" to={first.playerPath}>
              Start Tour
            </Link>
          </li>
        )}
        {flow.steps.map((s, i) => (
          <li key={s.id} className="tpw-item">
            <span className="tpw-pin" aria-hidden>
              {i + 1}
            </span>
            <Link
              className="tpw-strip"
              to={s.playerPath}
              onPointerEnter={() => prefetchDriftPath(s.playerPath)}
              onTouchStart={() => prefetchDriftPath(s.playerPath)}
            >
              <span className="tpw-thumb">{s.thumb ? <img src={s.thumb} alt="" loading="lazy" decoding="async" /> : null}</span>
              <span className="tpw-name">{s.name}</span>
              <span className="tpw-go" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {(!flow.isDemo || page.slug === CHANNEL_SLUG) && (
        <div className="tpw-foot">
          <EnquiryButton page={page} flowId={flow.id} />
          <ContactButton page={page} flowId={flow.id} />
        </div>
      )}
      {/* Every tour ends the same way: what this is, and how to pass it on. */}
      <div className="tpw-foot tpw-foot-end">
        <Link className="d-btn" to="/tour" style={{ textDecoration: "none" }}>
          Learn More
        </Link>
        <ShareTourButton path={flow.publicPath} />
      </div>
    </div>
  );
}

/** Share Tour: copies this tour's menu address — the link a visitor should be handed. */
function ShareTourButton({ path }: { path: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // No clipboard permission (or an older browser): fall back to a hidden selection.
      const el = document.createElement("textarea");
      el.value = url;
      el.setAttribute("readonly", "");
      el.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand("copy");
      } catch {
        /* nothing else to try — the address is in the bar either way */
      }
      el.remove();
    }
    setDone(true);
    window.setTimeout(() => setDone(false), 1800);
  };
  return (
    <button type="button" className="d-btn" onClick={copy}>
      {done ? "Link Copied" : "Share Tour"}
    </button>
  );
}

export default function TourPathway() {
  const { page: pageSlug = "", tour: tourSlug = "" } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState<Page | null>(null);
  const [pageMissing, setPageMissing] = useState(false);
  const [flow, setFlow] = useState<PublicFlow | null>(null);
  const [flowState, setFlowState] = useState<"loading" | "ok" | "missing">("loading");
  const [mode, setMode] = useState<"edit" | "public">("edit");
  const [reload, setReload] = useState(0);
  const [adminFlowId, setAdminFlowId] = useState<string | null>(null);
  const [lookup, setLookup] = useState<"idle" | "loading" | "none">("idle");
  const admin = usePageAdmin(page?.id);

  useEffect(() => {
    let alive = true;
    setPageMissing(false);
    apiEndpoints
      .driftPublicPage(pageSlug)
      .then((r) => alive && setPage(r.data.page))
      .catch(() => alive && setPageMissing(true));
    return () => {
      alive = false;
    };
  }, [pageSlug]);

  useEffect(() => {
    let alive = true;
    setFlowState("loading");
    apiEndpoints
      .driftPublicPageFlow(pageSlug, tourSlug)
      .then((r) => {
        if (!alive) return;
        setFlow(r.data.flow);
        setFlowState("ok");
      })
      .catch(() => {
        if (!alive) return;
        setFlow(null);
        setFlowState("missing");
      });
    return () => {
      alive = false;
    };
  }, [pageSlug, tourSlug, reload]);

  // Admins: the flow behind this link (drafts included).
  useEffect(() => {
    if (!admin.isAdmin) {
      setLookup("idle");
      return;
    }
    let alive = true;
    if (!adminFlowId) setLookup("loading");
    apiEndpoints
      .driftMyFlowsBySlug(tourSlug)
      .then((r) => {
        if (!alive) return;
        const f = (r.data.flows || [])[0];
        if (f) {
          setAdminFlowId(f.id);
          setLookup("idle");
        } else {
          setAdminFlowId(null);
          setLookup("none");
        }
      })
      .catch(() => alive && setLookup("none"));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin.isAdmin, tourSlug]);

  // The page's team: Admin View (the builder) / Public View in the header.
  const shellView: ShellView | undefined = admin.isAdmin
    ? {
        value: mode === "edit" ? "admin" : "public",
        onChange: (v) => {
          if (v === "public") setReload((n) => n + 1);
          setMode(v === "public" ? "public" : "edit");
        },
      }
    : admin.canManage
      ? {
          value: "public",
          onChange: () => {
            admin.setManage(true);
            setMode("edit");
          },
        }
      : undefined;
  const shell = (body: React.ReactNode) => (
    <TourShell view={shellView}>
      <style>{TOUR_PAGE_STYLES}</style>
      {body}
    </TourShell>
  );

  if (pageMissing) {
    return shell(
      <div className="d-empty">
        This Page Doesn't Exist.{" "}
        <Link to="/tour" style={{ color: "var(--accent)" }}>
          drift.li Tour
        </Link>
      </div>,
    );
  }
  if (!page || admin.loading) return shell(<Loading />);

  if (admin.isAdmin && mode === "edit") {
    if (adminFlowId) {
      return (
        <Suspense fallback={shell(<Loading label="Opening the Tour…" />)}>
        <TourBuilder
          key={adminFlowId}
          flowId={adminFlowId}
          page={page}
          onPublicView={() => {
            setReload((n) => n + 1);
            setMode("public");
          }}
          onSlugChange={(slug) => navigate(`${page.path || `/tour/${pageSlug}`}/${slug}`, { replace: true })}
        />
        </Suspense>
      );
    }
    if (lookup !== "none") return shell(<Loading label="Opening the Tour…" />);
  }

  if (flowState === "loading") return shell(<Loading />);

  return shell(
    <>
      {flowState === "missing" || !flow ? (
        <div className="tpw">
          <Link className="t-back" to={page.path || "/tour"}>
            ← {page.name} Tours
          </Link>
          <div className="d-card d-card-pad" style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <div className="d-h2" style={{ fontSize: 19 }}>
              This Tour Isn't Live Yet
            </div>
            <p className="d-sub">The Link May Be Unpublished, Renamed, or Still Being Built.</p>
            <div className="t-actions">
              <Link className="d-btn" to={page.path || "/tour"} style={{ textDecoration: "none" }}>
                See {page.name}'s Tours
              </Link>
              <ContactButton page={page} className="d-btn ghost" />
            </div>
          </div>
        </div>
      ) : (
        <PublicPathway page={page} flow={flow} />
      )}
    </>,
  );
}
