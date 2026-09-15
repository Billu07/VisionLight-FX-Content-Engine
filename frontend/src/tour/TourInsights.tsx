import { useEffect, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
import type { Flow, TourInsights as Insights } from "./types";
import { apiError, copyText, publicUrl } from "./tourUi";
import { INSIGHTS_CSS, InsightsView, RangeTabs } from "./InsightsView";

/**
 * The builder's Insights sheet (everyone on the page): where visitors spend their time in the
 * tour, over the last 7 / 30 / 90 days — and the owner report link, a live read-only page of
 * the same numbers for the owner or client (Editors and Admins make or turn it off).
 */
export function TourInsights({
  flow,
  canManage,
  onClose,
  onReportPath,
}: {
  flow: Flow;
  canManage: boolean;
  onClose: () => void;
  onReportPath: (path: string | null) => void;
}) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reportPath, setReportPath] = useState<string | null>(flow.reportPath ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    apiEndpoints
      .driftTourInsights(flow.id, days)
      .then((r) => {
        if (alive) setData(r.data.insights);
      })
      .catch((e) => {
        if (!alive) return;
        setFailed(true);
        notify.error(apiError(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [flow.id, days]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setPath = (path: string | null) => {
    setReportPath(path);
    onReportPath(path);
  };

  const copyReport = async () => {
    let path = reportPath;
    if (!path) {
      setBusy(true);
      try {
        const r = await apiEndpoints.driftCreateReportLink(flow.id);
        path = typeof r.data?.path === "string" ? (r.data.path as string) : null;
        if (path) setPath(path);
      } catch (e) {
        notify.error(apiError(e));
      } finally {
        setBusy(false);
      }
      if (!path) return;
    }
    const ok = await copyText(publicUrl(path));
    notify[ok ? "success" : "error"](ok ? "Owner report link copied" : "Couldn't copy the link");
  };

  const turnOff = async () => {
    if (!(await confirmAction("Turn off the owner report link? Anyone who has it won't be able to open it. You can make a new link any time."))) return;
    setBusy(true);
    try {
      await apiEndpoints.driftDeleteReportLink(flow.id);
      setPath(null);
      notify.success("Owner report link turned off");
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="t-sheet ti-overlay" onClick={onClose} role="dialog" aria-modal aria-label="Tour insights">
      <style>{INSIGHTS_CSS}</style>
      <div className="t-sheet-card ti-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="t-sheet-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="ti-head">
          <div className="d-eyebrow">Insights</div>
          <div className="t-sheet-title">{flow.title || flow.name}</div>
          <div className="d-sub" style={{ fontSize: 12.5 }}>
            Where visitors spend their time, how far they get and where they leave.
          </div>
        </div>
        <RangeTabs value={days} onChange={setDays} />
        {data ? (
          <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .2s" }} aria-busy={loading}>
            <InsightsView insights={data} audience="team" />
          </div>
        ) : failed ? (
          <div className="ti-empty">
            <h3>Couldn't load the insights</h3>
            <p>Please try again in a moment.</p>
          </div>
        ) : (
          <div className="d-faint" style={{ fontSize: 13 }}>
            Loading…
          </div>
        )}
        <div className="t-share-more">
          <div className="t-share-row">
            <span className="grow">
              <b>Owner report</b>
              <small>A live, read-only page of these numbers for the owner or your client. No login, and no names, messages or personal links on it.</small>
            </span>
            {reportPath ? (
              <>
                <button type="button" className="d-btn sm primary" onClick={() => void copyReport()} disabled={busy}>
                  Copy link
                </button>
                <a className="d-btn sm" href={reportPath} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                  Open
                </a>
                {canManage && (
                  <button type="button" className="d-btn sm ghost" onClick={() => void turnOff()} disabled={busy}>
                    Turn off
                  </button>
                )}
              </>
            ) : canManage ? (
              <button type="button" className="d-btn sm" onClick={() => void copyReport()} disabled={busy}>
                {busy ? "Making…" : "Get link"}
              </button>
            ) : (
              <small className="d-faint">An editor on this page can make one.</small>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
