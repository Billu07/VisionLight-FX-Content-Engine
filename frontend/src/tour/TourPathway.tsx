import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import type { Page, PublicFlow } from "./types";
import { TourShell } from "./tourUi";
import { TOUR_PAGE_STYLES } from "./tourPageStyles";
import { ContactButton } from "./tourPageParts";
import { usePageAdmin } from "./usePageAdmin";
import TourBuilder from "./TourBuilder";

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
  return (
    <div className="tpw t-rise">
      <div className="tpw-top">
        <Link className="t-back" to={home}>
          ← {page.name} Tours
        </Link>
        <ContactButton page={page} className="d-btn sm" />
      </div>
      <Link to={home} className="tpw-brand">
        {page.logoUrl ? <img src={page.logoUrl} alt="" /> : null}
        <span>{page.name}</span>
      </Link>
      <div className="d-eyebrow">Tour</div>
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
            <Link className="tpw-strip" to={s.playerPath}>
              <span className="tpw-thumb">{s.thumb ? <img src={s.thumb} alt="" loading="lazy" /> : null}</span>
              <span className="tpw-name">{s.name}</span>
              <span className="tpw-go" aria-hidden>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="tpw-foot">
        <ContactButton page={page} />
      </div>
    </div>
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

  const shell = (body: React.ReactNode) => (
    <TourShell>
      <style>{TOUR_PAGE_STYLES}</style>
      {body}
    </TourShell>
  );

  if (pageMissing) {
    return shell(
      <div className="d-empty">
        This page doesn't exist.{" "}
        <Link to="/tour" style={{ color: "var(--accent)" }}>
          drift.li tour
        </Link>
      </div>,
    );
  }
  if (!page || admin.loading) return shell(<Loading />);

  if (admin.isAdmin && mode === "edit") {
    if (adminFlowId) {
      return (
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
      );
    }
    if (lookup !== "none") return shell(<Loading label="Opening the tour…" />);
  }

  if (flowState === "loading") return shell(<Loading />);

  return shell(
    <>
      {admin.canManage && (
        <div className="tpg-note tpw">
          <span>
            You're viewing <b>{page.name}</b> as a visitor.
          </span>
          <button
            className="d-btn sm"
            onClick={() => {
              admin.setManage(true);
              setMode("edit");
            }}
          >
            Manage this tour
          </button>
        </div>
      )}
      {admin.isAdmin && mode === "public" && (
        <div className="tpg-note tpw">
          <span>This is what visitors see.</span>
          <button className="d-btn sm" onClick={() => setMode("edit")}>
            Back to editing
          </button>
        </div>
      )}
      {flowState === "missing" || !flow ? (
        <div className="tpw">
          <Link className="t-back" to={page.path || "/tour"}>
            ← {page.name} Tours
          </Link>
          <div className="d-card d-card-pad" style={{ marginTop: 16, display: "grid", gap: 10 }}>
            <div className="d-h2" style={{ fontSize: 19 }}>
              This tour isn't live yet
            </div>
            <p className="d-sub">The link may be unpublished, renamed, or still being built.</p>
            <div className="t-actions">
              <Link className="d-btn" to={page.path || "/tour"} style={{ textDecoration: "none" }}>
                See {page.name}'s tours
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
