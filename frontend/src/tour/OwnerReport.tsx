import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { apiEndpoints } from "../lib/api";
import { DriftThemeStyles } from "../rotation3d/driftUiTheme";
import type { OwnerReport as Report } from "./types";
import { TOUR_STYLES } from "./tourUi";
import { INSIGHTS_CSS, InsightsView, RangeTabs } from "./InsightsView";

/**
 * The owner report: drift.li/report/{code} — a live, read-only page of a tour's Insights for
 * the owner or client the page team shared it with. No login; counts only (no names,
 * messages or personal links). Kept out of search engines; printable.
 */

const REPORT_CSS = `
.or-wrap{max-width:920px;margin:0 auto;width:100%}
.or-hero{display:grid;gap:18px;margin:6px 0 24px}
@media(min-width:720px){.or-hero.has-cover{grid-template-columns:240px minmax(0,1fr);align-items:center}}
.or-cover{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:18px;display:block;background:var(--surface-3)}
.or-brand{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:var(--muted)}
.or-brand img{height:28px;max-width:120px;object-fit:contain}
.or-title{margin:4px 0 12px;font-size:clamp(24px,4.4vw,34px);font-weight:800;letter-spacing:-.02em;line-height:1.1;color:var(--text);overflow-wrap:anywhere}
.or-meta{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.or-state{min-height:50vh;display:grid;place-items:center;text-align:center;color:var(--muted)}
.or-state h1{margin:0 0 6px;font-size:20px;color:var(--text)}
.or-state p{margin:0}
@media print{.d-topbar .t-topactions,.ti-range{display:none!important}.ti-drift,.ti-tile{break-inside:avoid}}
`;

export default function OwnerReport() {
  const { code = "" } = useParams();
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "error">("loading");

  useEffect(() => {
    let alive = true;
    apiEndpoints
      .driftOwnerReport(code, days)
      .then((r) => {
        if (!alive) return;
        setReport(r.data.report);
        setState("ok");
      })
      .catch((e) => {
        if (alive) setState(e?.response?.status === 404 ? "missing" : "error");
      });
    return () => {
      alive = false;
    };
  }, [code, days]);

  // A private page: keep it out of search results.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    if (report) document.title = `${report.tour.title} · Tour report`;
  }, [report]);

  let body: ReactNode;
  if (state === "missing") {
    body = (
      <div className="or-state">
        <div>
          <h1>This report isn't available</h1>
          <p>The link may have been turned off. Ask whoever shared it for a new one.</p>
        </div>
      </div>
    );
  } else if (!report) {
    body =
      state === "error" ? (
        <div className="or-state">
          <div>
            <h1>Couldn't load the report</h1>
            <p>Please try again in a moment.</p>
          </div>
        </div>
      ) : (
        <div className="or-state">
          <span className="t-spin" aria-label="Loading" />
        </div>
      );
  } else {
    body = (
      <>
        <section className={`or-hero ${report.tour.thumb ? "has-cover" : ""}`}>
          {report.tour.thumb && <img className="or-cover" src={report.tour.thumb} alt="" />}
          <div style={{ minWidth: 0 }}>
            {(report.page.logoUrl || report.page.name) && (
              <div className="or-brand">
                {report.page.logoUrl && <img src={report.page.logoUrl} alt="" />}
                <span>{report.page.name}</span>
              </div>
            )}
            <div className="d-eyebrow" style={{ marginTop: 10 }}>
              Tour report
            </div>
            <h1 className="or-title">{report.tour.title}</h1>
            <div className="or-meta">
              <RangeTabs value={days} onChange={setDays} />
              <span className="d-faint" style={{ fontSize: 12.5 }}>
                Updated live
              </span>
            </div>
          </div>
        </section>
        <InsightsView insights={report.insights} audience="owner" />
      </>
    );
  }

  return (
    <div className="drift-ui d-page t-page" data-theme="dark">
      <DriftThemeStyles />
      <style>{TOUR_STYLES + INSIGHTS_CSS + REPORT_CSS}</style>
      <header className="d-topbar">
        <span className="d-wordmark">
          drift<i>.li</i>
          <span className="t-kind">report</span>
        </span>
        <div className="t-topactions">
          {report && (
            <button type="button" className="d-btn ghost sm" onClick={() => window.print()}>
              Print
            </button>
          )}
        </div>
      </header>
      <main className="d-main">
        <div className="or-wrap">{body}</div>
      </main>
      <footer className="t-foot">
        <span>
          <b>Tour</b> · Powered by <b>Drift Live Interactive</b>
        </span>
      </footer>
    </div>
  );
}
