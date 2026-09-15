import { useState } from "react";
import {
  Card,
  ClosingCall,
  DriftSiteShell,
  DriftStage,
  ICONS,
  ProductHero,
  Steps,
  WaitlistDialog,
} from "./driftSite";

/**
 * drift.li/memory — Drift Memory (coming soon). The scene is a small gathering of
 * moments standing on the grid: upright frames for the client's Family · Friends ·
 * Places · Milestones · Everyday Life, back ones smaller and softer, the front frame
 * lifting gently over its shadow with a "Private" badge. Violet accent. Scene left.
 */

const PRODUCT = { key: "MEMORY", name: "Memory" };
const TAGS = ["Family", "Friends", "Places", "Milestones", "Everyday Life"];

const STYLES = `
.mm-svg{overflow:visible}
.mm-card .frame{fill:var(--surface);stroke:var(--border-strong);stroke-width:1}
.drift-ui[data-theme="dark"] .mm-card .frame{fill:var(--surface-2);stroke:color-mix(in srgb,var(--accent) 38%,transparent)}
.mm-card .photo{fill:var(--accent-soft);stroke:var(--accent-border);stroke-width:1}
.mm-card .glyph{fill:none;stroke:var(--accent);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.mm-card .cap{fill:var(--text);font-weight:700}
.mm-card{animation:mm-bob 8s ease-in-out infinite}
.mm-card.front{animation-name:mm-lift}
@keyframes mm-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes mm-lift{0%,100%{transform:translateY(0)}40%,62%{transform:translateY(-16px)}}
.mm-shadow{fill:rgba(15,23,42,.16)}
.drift-ui[data-theme="dark"] .mm-shadow{fill:rgba(0,0,0,.55)}
.mm-shadow.front{transform-box:fill-box;transform-origin:center;animation:mm-shade 8s ease-in-out infinite}
@keyframes mm-shade{0%,100%{transform:scale(1);opacity:1}40%,62%{transform:scale(.8);opacity:.6}}
.mm-badge rect{fill:var(--surface);stroke:var(--accent-border)}
.mm-badge path{fill:none;stroke:var(--accent);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.mm-badge text{fill:var(--accent);font-size:11px;font-weight:800;letter-spacing:.06em}
.drift-ui[data-theme="dark"] .mm-card.front .frame{filter:drop-shadow(0 0 16px color-mix(in srgb,var(--accent) 45%,transparent))}
@media(max-width:480px){.mm-card:not(.front) .cap{display:none}}
@media(prefers-reduced-motion:reduce){.mm-card,.mm-shadow.front{animation:none}}
`;

type Moment = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  icon: readonly string[];
  depth: "back" | "mid" | "front";
  delay: number;
};

// Upright frames in depth: the back row is smaller with its base nearer the horizon
// (205 of the 330-high view box), the front frame's base lowest on the floor.
const MOMENTS: Moment[] = [
  { x: 52, y: 94, w: 96, h: 116, label: "Places", icon: ["M3 19l6-7 4 5 3-3 5 5", "M15.5 5.5a2 2 0 1 0 .01 0"], depth: "back", delay: -1.4 },
  { x: 332, y: 90, w: 96, h: 116, label: "Milestones", icon: ["M5 21V4", "M5 4h11l-2 4 2 4H5"], depth: "back", delay: -4.2 },
  { x: 96, y: 100, w: 118, h: 142, label: "Friends", icon: ICONS.users, depth: "mid", delay: -2.6 },
  { x: 266, y: 96, w: 118, h: 142, label: "Everyday Life", icon: ICONS.cup, depth: "mid", delay: -5.6 },
  { x: 165, y: 112, w: 150, h: 180, label: "Family", icon: ICONS.heart, depth: "front", delay: 0 },
];

function MemoryScene() {
  return (
    <DriftStage horizon="62%">
      <svg className="mm-svg" viewBox="0 0 480 330">
        <defs>
          <filter id="mm-soft" x="-50%" y="-200%" width="200%" height="500%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {MOMENTS.map((m) => (
          <ellipse
            key={`s-${m.label}`}
            className={`mm-shadow ${m.depth === "front" ? "front" : ""}`}
            cx={m.x + m.w / 2}
            cy={m.y + m.h + 7}
            rx={m.w * 0.42}
            ry={m.depth === "front" ? 8 : 5}
            filter="url(#mm-soft)"
          />
        ))}
        {MOMENTS.map((m) => {
          const opacity = m.depth === "back" ? 0.55 : m.depth === "mid" ? 0.86 : 1;
          const inset = m.depth === "front" ? 10 : 8;
          const photoH = m.h * 0.66;
          const iconSize = Math.min(m.w - inset * 2, photoH) * 0.42;
          const s = iconSize / 24;
          const cx = m.x + m.w / 2;
          const cy = m.y + inset + photoH / 2;
          const capSize = m.depth === "front" ? 13 : m.depth === "mid" ? 11.5 : 10;
          return (
            <g
              key={m.label}
              className={`mm-card ${m.depth === "front" ? "front" : ""}`}
              style={{ opacity, animationDelay: `${m.delay}s` }}
            >
              <rect className="frame" x={m.x} y={m.y} width={m.w} height={m.h} rx={10} />
              <rect className="photo" x={m.x + inset} y={m.y + inset} width={m.w - inset * 2} height={photoH} rx={6} />
              <g className="glyph" transform={`translate(${cx - iconSize / 2} ${cy - iconSize / 2}) scale(${s})`}>
                {m.icon.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
              <text className="cap" x={cx} y={m.y + m.h - (m.h - inset - photoH) / 2 + capSize * 0.35} textAnchor="middle" style={{ fontSize: capSize }}>
                {m.label}
              </text>
              {m.depth === "front" && (
                <g className="mm-badge" transform={`translate(${m.x + m.w - 58} ${m.y - 14})`}>
                  <rect width={84} height={26} rx={13} />
                  <g transform="translate(10 6) scale(.58)">
                    {ICONS.lock.map((d) => (
                      <path key={d} d={d} />
                    ))}
                  </g>
                  <text x={30} y={17.5}>
                    Private
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </DriftStage>
  );
}

export default function DriftMemoryLanding() {
  const [joining, setJoining] = useState(false);
  const join = () => setJoining(true);
  return (
    <DriftSiteShell className="ds-violet">
      <style>{STYLES}</style>

      <ProductHero
        layout="flip"
        kicker="Drift Memory"
        title={
          <>
            Keep the Moments <em>That Matter</em>
          </>
        }
        lead="Turn a few seconds of life into something you can return to and explore."
        tags={TAGS}
        scene={<MemoryScene />}
        onJoin={join}
      />

      <section className="ds-section ds-glass ds-band">
        <div style={{ minWidth: 0 }}>
          <div className="ds-ico">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS.lock.map((d) => (
                <path key={d} d={d} />
              ))}
            </svg>
          </div>
          <h2 className="ds-h2">
            Private. <em>Yours to remember.</em>
          </h2>
          <p className="ds-p">A few seconds of a real moment, kept the way it felt — ready to step back into whenever you want.</p>
        </div>
        <Steps
          label="Capture, keep, return"
          steps={[
            { icon: ICONS.camera, title: "Capture", sub: "a few seconds" },
            { icon: ICONS.heart, title: "Keep", sub: "just for you" },
            { icon: ICONS.replay, title: "Return", sub: "and explore again" },
          ]}
        />
      </section>

      <section className="ds-section ds-cards">
        <Card icon={ICONS.users} title="Family & Friends">
          <p>The people who matter, just as they were.</p>
        </Card>
        <Card icon={ICONS.pin} title="Places & Milestones">
          <p>The places and the days you never want to forget.</p>
        </Card>
        <Card icon={ICONS.cup} title="Everyday Life">
          <p>The small moments that turn out to be the big ones.</p>
        </Card>
      </section>

      <ClosingCall title="Be the first to keep your moments." onJoin={join} />

      {joining && <WaitlistDialog product={PRODUCT} source="memory" onClose={() => setJoining(false)} />}
    </DriftSiteShell>
  );
}
