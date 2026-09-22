import { useEffect, useState } from "react";
import { apiEndpoints } from "../lib/api";
import { confirmAction, notify } from "../lib/notifications";
import type { Flow, ShareLink } from "./types";
import { apiError, copyText, publicUrl } from "./tourUi";
import { timeAgo } from "./timeAgo";

/**
 * Personal links for one tour (in the share sheet): a link per person, so the team sees
 * whether they opened it, how much of the tour they explored, and which enquiries came
 * through it. The person sees the same tour as everyone else.
 */
export function PersonalLinks({ flow }: { flow: Flow }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const urlFor = (token: string) => `${publicUrl(flow.publicPath)}?to=${token}`;

  const load = () =>
    apiEndpoints
      .driftFlowLinks(flow.id)
      .then((r) => setLinks(r.data.links || []))
      .catch((e) => {
        setLinks((cur) => cur ?? []);
        notify.error(apiError(e));
      });
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.id]);

  const create = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const name = label.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await apiEndpoints.driftCreateFlowLink(flow.id, name);
      setLabel("");
      const token: string | undefined = r.data?.link?.token;
      await load();
      if (token) {
        const ok = await copyText(urlFor(token));
        notify.success(ok ? `Link for ${name} Copied — Send It to Them` : `Link for ${name} Is Ready`);
      }
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (l: ShareLink) => {
    const ok = await copyText(urlFor(l.token));
    notify[ok ? "success" : "error"](ok ? `Link for ${l.label} Copied` : "Couldn't Copy the Link");
  };

  const remove = async (l: ShareLink) => {
    const ok = await confirmAction(
      `Remove the link for ${l.label}? It still opens the tour, but you'll stop seeing their visits.`,
    );
    if (!ok) return;
    try {
      await apiEndpoints.driftDeleteFlowLink(flow.id, l.id);
      setLinks((cur) => (cur || []).filter((x) => x.id !== l.id));
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  const status = (l: ShareLink) => {
    if (!l.opens) return "Not Opened Yet";
    const parts = [
      `Opened ${l.opens === 1 ? "once" : `${l.opens} times`}`,
      l.lastOpenedAt ? `last ${timeAgo(l.lastOpenedAt)}` : "",
      l.drifts ? `saw ${l.driftsSeen} of ${l.drifts} drift${l.drifts === 1 ? "" : "s"}` : "",
      l.enquiries ? `${l.enquiries} enquir${l.enquiries === 1 ? "y" : "ies"}` : "",
    ];
    return parts.filter(Boolean).join(" · ");
  };

  return (
    <div className="t-links">
      <div>
        <div className="d-label" style={{ margin: 0 }}>
          Send It to Someone
        </div>
        <div className="d-sub" style={{ fontSize: 12.5, margin: "4px 0 0" }}>
          Make a link for one person. You'll see when they open it and how much they explore — they see the same tour.
        </div>
      </div>
      <form className="t-links-form" onSubmit={create}>
        <input
          className="d-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          placeholder="Their Name, e.g. Sam Carter"
          aria-label="Who the link is for"
        />
        <button type="submit" className="d-btn primary" disabled={busy || !label.trim()}>
          {busy ? "Creating…" : "Create Link"}
        </button>
      </form>
      {links === null ? (
        <div className="d-faint" style={{ fontSize: 12.5 }}>
          Loading…
        </div>
      ) : (
        links.map((l) => (
          <div key={l.id} className="t-link-row">
            <span className="grow">
              <b>{l.label}</b>
              <small className={l.opens ? "on" : ""}>{status(l)}</small>
            </span>
            <button type="button" className="d-btn sm" onClick={() => void copy(l)}>
              Copy
            </button>
            <button type="button" className="d-btn ghost sm" onClick={() => void remove(l)}>
              Remove
            </button>
          </div>
        ))
      )}
    </div>
  );
}
