import { useEffect, useRef, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
import type { Enquiry, Page } from "./types";
import { apiError } from "./tourUi";
import { timeAgo } from "./timeAgo";

/**
 * The page team's enquiry inbox (Editors and Admins): newest first, each with where it
 * came from — the button, the tour, the drift and the personal link if there was one.
 * The enquiry email's "See all enquiries" (?enquiries=1) scrolls here.
 */
export function PageEnquiries({ page, canDelete, onSetUp }: { page: Page; canDelete: boolean; onSetUp?: () => void }) {
  const [items, setItems] = useState<Enquiry[] | null>(null);
  const ref = useRef<HTMLElement>(null);
  const loaded = items !== null;
  const on = !!page.enquiries?.enabled;
  const label = page.enquiries?.label || "Book a viewing";

  useEffect(() => {
    let alive = true;
    apiEndpoints
      .driftPageEnquiries()
      .then((r) => alive && setItems(r.data.enquiries || []))
      .catch((e) => {
        if (!alive) return;
        setItems((cur) => cur ?? []);
        notify.error(apiError(e));
      });
    return () => {
      alive = false;
    };
  }, [page.id]);

  useEffect(() => {
    if (!loaded || new URLSearchParams(window.location.search).get("enquiries") !== "1") return;
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded]);

  const remove = async (q: Enquiry) => {
    if (!(await confirmAction(`Delete the enquiry from ${q.name}? This can't be undone.`))) return;
    try {
      await apiEndpoints.driftDeleteEnquiry(q.id);
      setItems((cur) => (cur || []).filter((x) => x.id !== q.id));
      notify.success("Enquiry deleted");
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  // An Editor with the button off and nothing received: nothing to show them.
  if (loaded && !items!.length && !on && !onSetUp) return null;

  return (
    <section className="tpg-section" ref={ref} id="enquiries">
      <div className="tpg-bar">
        <h2>Enquiries{items && items.length ? ` · ${items.length}` : ""}</h2>
        {on && <span className="d-faint">From your "{label}" button</span>}
      </div>
      {!loaded ? (
        <div className="d-faint" style={{ fontSize: 13 }}>
          Loading…
        </div>
      ) : items!.length === 0 ? (
        <div className="tpg-empty">
          {on ? (
            <>
              <h3>No enquiries yet</h3>
              <p className="d-sub" style={{ margin: 0, maxWidth: "48ch" }}>
                When someone uses your "{label}" button, their message shows up here and in your email.
              </p>
            </>
          ) : (
            <>
              <h3>Let visitors get in touch</h3>
              <p className="d-sub" style={{ margin: 0, maxWidth: "48ch" }}>
                Add a "Book a viewing" or "Ask a question" button to your page, your tours and every drift. Messages land
                here and in your email.
              </p>
              {onSetUp && (
                <button className="d-btn primary" onClick={onSetUp}>
                  Set it up
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="tpg-enquiries">
          {items!.map((q) => (
            <article key={q.id} className="tpg-enquiry">
              <div className="tpg-enquiry-top">
                <b>{q.name}</b>
                <span className="d-faint" title={new Date(q.createdAt).toLocaleString()}>
                  {timeAgo(q.createdAt)}
                </span>
              </div>
              <div className="tpg-enquiry-contact">
                <a href={`mailto:${q.email}`}>{q.email}</a>
                {q.phone && <a href={`tel:${q.phone.replace(/[^\d+]/g, "")}`}>{q.phone}</a>}
              </div>
              {q.message && <p className="tpg-enquiry-msg">{q.message}</p>}
              <div className="tpg-enquiry-meta">
                <span>{[q.button, q.tour, q.drift].filter(Boolean).join(" · ")}</span>
                {q.via && <span className="d-pill accent">via {q.via}'s link</span>}
                {canDelete && (
                  <button className="d-btn ghost sm" style={{ marginLeft: "auto" }} onClick={() => void remove(q)}>
                    Delete
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
