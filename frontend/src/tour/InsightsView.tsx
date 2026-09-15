import type { DriftInsight, TourInsights } from "./types";

/**
 * Tour Insights, drawn: the period's visits, how long people stay and how far they get, and
 * per drift a filmstrip with a heat strip under it (where people linger), the share of visits
 * that reach it, drag back and end there, and pin taps. Shared by the builder's Insights
 * sheet (team) and the owner report (/report/{code}). Self-contained: React + types only.
 */

export const INSIGHT_RANGES = [7, 30, 90] as const;

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
};

// One warm colour at rising strength: more time on that part of the footage → stronger.
const heatColor = (h: number) => (h > 0 ? `rgba(249,115,22,${(0.2 + 0.8 * h).toFixed(2)})` : "var(--surface-3)");

export const INSIGHTS_CSS = `
.ti-overlay{z-index:70}
.t-sheet-card.ti-card{max-width:900px;max-height:94dvh;overflow:auto}
.ti-head{padding-right:36px}
.ti-range{justify-self:start;max-width:100%;overflow-x:auto}
.ti{display:grid;gap:20px;min-width:0}
.ti-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.ti-tile{padding:14px 16px;border-radius:16px;border:1px solid var(--border);background:var(--surface-2);display:grid;gap:3px;min-width:0}
.ti-tile small{font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.ti-tile b{font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.15;color:var(--text)}
.ti-tile span{font-size:12px;color:var(--muted);line-height:1.35}
.ti-block{display:grid;gap:10px;min-width:0}
.ti-label{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
.ti-chart{height:84px;display:flex;align-items:flex-end;padding-top:6px;border-bottom:1px solid var(--border)}
.ti-bar{flex:1 1 0;min-width:1px;border-radius:3px 3px 0 0;background:var(--accent)}
.ti-bar[data-zero]{background:var(--surface-3)}
.ti-axis{display:flex;justify-content:space-between;font-size:11.5px;color:var(--faint)}
.ti-notes{margin:0;padding:12px 16px 12px 32px;border-radius:14px;background:var(--accent-soft);border:1px solid var(--accent-border);display:grid;gap:6px;font-size:13.5px;line-height:1.45;color:var(--text)}
.ti-legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:12px;color:var(--muted)}
.ti-legend i{display:inline-grid;grid-template-columns:repeat(5,14px);gap:2px}
.ti-legend i span{height:8px;border-radius:2px}
.ti-drifts{list-style:none;margin:0;padding:0;display:grid;gap:12px}
.ti-drift{padding:14px;border-radius:18px;border:1px solid var(--border);background:var(--surface);display:grid;gap:10px;min-width:0}
.ti-drift-head{display:flex;align-items:center;gap:10px;min-width:0}
.ti-n{width:24px;height:24px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:800;background:var(--surface-3);color:var(--muted)}
.ti-name{flex:1;min-width:0;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.ti-reach{font-size:12.5px;color:var(--muted);white-space:nowrap}
.ti-film{display:grid;gap:5px;min-width:0}
.ti-frames{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:3px}
.ti-frames img{width:100%;aspect-ratio:4/3;object-fit:cover;display:block;border-radius:6px;background:var(--surface-3)}
.ti-frames img.top{outline:2px solid #f97316;outline-offset:1px}
.ti-heat{display:grid;grid-template-columns:repeat(20,minmax(0,1fr));gap:2px}
.ti-heat span{height:10px;border-radius:3px}
.ti-stats{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--muted)}
.ti-stats b{color:var(--text);font-weight:750}
.ti-pins{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;color:var(--muted)}
.ti-empty{padding:28px 16px;border-radius:18px;border:1px dashed var(--border-strong);text-align:center;display:grid;gap:6px;justify-items:center}
.ti-empty h3{margin:0;font-size:16px;color:var(--text)}
.ti-empty p{margin:0;max-width:48ch;font-size:13px;line-height:1.5;color:var(--muted)}
.ti-foot{font-size:12px;line-height:1.5;color:var(--faint)}
@media(max-width:520px){.ti-frames{grid-template-columns:repeat(5,minmax(0,1fr))}.ti-frames img:nth-child(even){display:none}.ti-tile b{font-size:22px}.ti-reach{font-size:12px}}
`;

export function RangeTabs({ value, onChange }: { value: number; onChange: (days: number) => void }) {
  return (
    <div className="d-tabs ti-range" role="tablist" aria-label="Period">
      {INSIGHT_RANGES.map((d) => (
        <button key={d} type="button" role="tab" aria-selected={value === d} className={`d-tab ${value === d ? "active" : ""}`} onClick={() => onChange(d)}>
          Last {d} days
        </button>
      ))}
    </div>
  );
}

/** A few plain-language takeaways (only the ones the numbers support). */
function takeaways(i: TourInsights, noun: string): string[] {
  const out: string[] = [];
  const seen = i.drifts.filter((d) => d.views > 0);
  if (seen.length > 1) {
    const longest = seen.reduce((a, b) => (b.avgMs > a.avgMs ? b : a));
    out.push(`People spend the longest in ${longest.name} — ${fmtDuration(longest.avgMs)} on average.`);
  }
  const beforeLast = i.drifts.slice(0, -1).filter((d) => d.exits > 0 && d.visitors >= 3);
  if (beforeLast.length) {
    const stop = beforeLast.reduce((a, b) => (b.exitPct > a.exitPct ? b : a));
    if (stop.exitPct >= 20) out.push(`${stop.exitPct}% of the visits that reach ${stop.name} end there.`);
  }
  const pins = i.drifts.flatMap((d) => d.pins.map((p) => ({ ...p, drift: d.name })));
  if (pins.length) {
    const top = pins.reduce((a, b) => (b.taps > a.taps ? b : a));
    out.push(`The most-tapped pin is ${top.title} in ${top.drift} (${top.taps} ${top.taps === 1 ? "tap" : "taps"}).`);
  }
  if (out.length < 3 && i.driftCount > 1 && i.visits >= 3) out.push(`${i.sawAllPct}% of visits reach every ${noun}.`);
  return out.slice(0, 3);
}

function DriftRow({ d, n, noun }: { d: DriftInsight; n: number; noun: string }) {
  const topThumb = d.topPart === null ? -1 : Math.min(9, Math.floor(d.topPart / 2));
  return (
    <li className="ti-drift">
      <div className="ti-drift-head">
        <span className="ti-n">{n + 1}</span>
        <b className="ti-name" title={d.name}>
          {d.name}
        </b>
        <span className="ti-reach">{d.visitors ? `${d.reachedPct}% of visits` : "Not reached"}</span>
      </div>
      {d.strip.length > 0 && (
        <div className="ti-film">
          <div className="ti-frames">
            {d.strip.map((src, j) => (
              <img key={j} src={src} alt="" loading="lazy" decoding="async" className={j === topThumb ? "top" : undefined} />
            ))}
          </div>
          <div className="ti-heat" aria-hidden>
            {d.heat.map((h, j) => (
              <span key={j} style={{ background: heatColor(h) }} />
            ))}
          </div>
        </div>
      )}
      {d.views > 0 ? (
        <div className="ti-stats">
          <span>
            <b>{fmtDuration(d.avgMs)}</b> average
          </span>
          <span>
            <b>{d.explored}%</b> explored
          </span>
          <span>
            <b>{d.lookedBackPct}%</b> dragged back
          </span>
          <span>
            <b>{d.exitPct}%</b> ended their visit here
          </span>
        </div>
      ) : (
        <div className="ti-stats">No visits reached this {noun} in this period.</div>
      )}
      {d.pins.length > 0 && (
        <div className="ti-pins">
          <span>Pins tapped</span>
          {d.pins.map((p, k) => (
            <span key={`${p.title}-${k}`} className="d-pill">
              {p.title} · {p.taps}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}

export function InsightsView({ insights: i, audience }: { insights: TourInsights; audience: "team" | "owner" }) {
  const noun = audience === "owner" ? "space" : "drift";
  const since = i.countingSince
    ? new Date(i.countingSince).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  if (!i.visits) {
    return (
      <div className="ti-empty">
        <h3>No visits in the last {i.days} days</h3>
        <p>
          {audience === "owner"
            ? "This report fills in as people walk through the tour."
            : "Share the tour — as soon as people walk through it, you'll see where they spend their time."}
          {since ? ` Counting since ${since}.` : ""}
        </p>
      </div>
    );
  }

  const peak = Math.max(1, ...i.series.map((d) => d.visits));
  const notes = takeaways(i, noun);
  const src = i.sources;
  const visitsSub =
    src && (src.personal || src.unbranded)
      ? [src.personal ? `${src.personal} via personal links` : "", src.unbranded ? `${src.unbranded} via the unbranded link` : ""]
          .filter(Boolean)
          .join(" · ")
      : `in the last ${i.days} days`;

  return (
    <div className="ti">
      <div className="ti-tiles">
        <div className="ti-tile">
          <small>Visits</small>
          <b>{i.visits}</b>
          <span>{visitsSub}</span>
        </div>
        <div className="ti-tile">
          <small>Average visit</small>
          <b>{fmtDuration(i.avgVisitMs)}</b>
          <span>{fmtDuration(i.totalMs)} in total</span>
        </div>
        <div className="ti-tile">
          <small>Saw it all</small>
          <b>{i.sawAllPct}%</b>
          <span>
            {i.avgDriftsSeen} of {i.driftCount} {noun}s on average
          </span>
        </div>
        <div className="ti-tile">
          <small>Enquiries</small>
          <b>{i.enquiries}</b>
          <span>from this tour</span>
        </div>
      </div>

      <div className="ti-block">
        <div className="ti-label">Visits per day</div>
        <div
          className="ti-chart"
          style={{ gap: i.series.length > 40 ? 1 : 3 }}
          role="img"
          aria-label={`Visits per day, ${dayLabel(i.from)} to ${dayLabel(i.to)}`}
        >
          {i.series.map((d) => (
            <span
              key={d.date}
              className="ti-bar"
              data-zero={d.visits ? undefined : ""}
              style={{ height: `${d.visits ? Math.max(6, (d.visits / peak) * 100) : 3}%` }}
              title={`${dayLabel(d.date)}: ${d.visits} ${d.visits === 1 ? "visit" : "visits"}`}
            />
          ))}
        </div>
        <div className="ti-axis">
          <span>{dayLabel(i.from)}</span>
          <span>{dayLabel(i.to)}</span>
        </div>
      </div>

      {notes.length > 0 && (
        <ul className="ti-notes">
          {notes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}

      <div className="ti-block">
        <div className="ti-label">{noun === "space" ? "Space by space" : "Drift by drift"}</div>
        <div className="ti-legend">
          <span>Under each {noun}: where people linger</span>
          <i aria-hidden>
            {[0.1, 0.3, 0.55, 0.8, 1].map((h) => (
              <span key={h} style={{ background: heatColor(h) }} />
            ))}
          </i>
          <span>less → more</span>
        </div>
        <ol className="ti-drifts">
          {i.drifts.map((d, n) => (
            <DriftRow key={d.stepId} d={d} n={n} noun={noun} />
          ))}
        </ol>
      </div>

      <div className="ti-foot">
        {audience === "owner"
          ? "Anonymous visit counts, updated live."
          : `Anonymous — no cookies or personal data. Visits by your own team count too.${since ? ` Counting since ${since}.` : ""}`}
      </div>
    </div>
  );
}
