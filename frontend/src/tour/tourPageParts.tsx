import { useState } from "react";
import type { Page } from "./types";
import { EnquirySheet } from "./EnquirySheet";

/** The page's contact button — "Contact {page}". Its own link when it set one; otherwise the page's
 *  message form (the enquiry sheet, sent to its team); "Contact PicDrift" when it has neither. */
export function ContactButton({ page, flowId = null, className = "d-btn" }: { page: Page; flowId?: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const url = page.contact.url;
  if (!url) {
    if (!page.slug || !page.enquiries?.enabled) return null;
    return (
      <>
        <button type="button" className={className} onClick={() => setOpen(true)}>
          {page.contact.label}
        </button>
        {open && <EnquirySheet page={page} flowId={flowId} title={page.contact.label} via="contact" onClose={() => setOpen(false)} />}
      </>
    );
  }
  const web = /^https?:/i.test(url);
  return (
    <a
      className={className}
      href={url}
      target={web ? "_blank" : undefined}
      rel={web ? "noreferrer" : undefined}
      style={{ textDecoration: "none" }}
    >
      {page.contact.label}
    </a>
  );
}

// Hero art: a straight, horizontal route — the line inks in, a traveller rides it,
// and each stop pops out (labels alternate above and below) as the line reaches it.
const H_Y = 110;
const H_LINE = `M 34 ${H_Y} L 396 ${H_Y}`;
const H_STOPS = [
  { x: 112, label: "Living Room", up: true },
  { x: 198, label: "Kitchen", up: false },
  { x: 284, label: "Terrace", up: true },
  { x: 370, label: "Garden", up: false },
] as const;

export function PathArtH({ labels }: { labels?: string[] } = {}) {
  return (
    <svg className="th-route-h" viewBox="0 0 430 220" aria-hidden>
      <path className="th-route-under" d={H_LINE} />
      <path className="th-route-line" d={H_LINE} pathLength={1000} />
      <g>
        <rect className="th-start" x={4} y={H_Y - 10} width={58} height={20} rx={10} />
        <text className="th-start-text" x={33} y={H_Y + 4} textAnchor="middle">
          START
        </text>
      </g>
      {H_STOPS.map((stop, i) => {
        const s = { ...stop, label: labels?.[i] || stop.label };
        const tagW = Math.round(s.label.length * 6.6 + 22);
        const tagY = s.up ? H_Y - 46 : H_Y + 24;
        return (
          <g key={s.label} className={`th-stop th-stop-${i + 1}`} style={{ transformOrigin: `${s.x}px ${H_Y}px` }}>
            <line className="th-stem" x1={s.x} y1={s.up ? tagY + 22 : H_Y + 9} x2={s.x} y2={s.up ? H_Y - 9 : tagY} />
            <circle className="halo" cx={s.x} cy={H_Y} r={16} />
            <circle className="pin" cx={s.x} cy={H_Y} r={9} />
            <circle className="dot" cx={s.x} cy={H_Y} r={3.5} />
            <rect className="tag" x={s.x - tagW / 2} y={tagY} width={tagW} height={22} rx={11} />
            <text x={s.x} y={tagY + 15} textAnchor="middle">
              {s.label}
            </text>
          </g>
        );
      })}
      <circle className="th-traveler" r={5.5} style={{ offsetPath: `path("${H_LINE}")` }} />
    </svg>
  );
}
