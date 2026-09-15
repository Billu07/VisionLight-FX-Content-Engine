import { useState } from "react";
import {
  Card,
  ClosingCall,
  DriftSiteShell,
  DriftStage,
  ICONS,
  ProductHero,
  SiteIcon,
  Steps,
  WaitlistDialog,
} from "./driftSite";

/**
 * drift.li/path — Drift Path (coming soon). A centred hero over a wide scene: a winding
 * path drawn across the grid floor, linking the client's building blocks — Drifts,
 * images, video, information and links — while a traveller rides it and each block
 * pulses as it's reached. Emerald accent.
 */

const PRODUCT = { key: "PATH", name: "Path" };

// A winding route across the floor (the view box is 800 × 350; horizon at 34%).
const ROUTE =
  "M70 300 C 150 300, 170 205, 250 205 C 330 205, 330 268, 410 268 C 490 268, 490 178, 570 178 C 650 178, 650 236, 730 236";
const CYCLE_S = 9;
const DRAWN_AT = 0.7; // the line reaches the last block at 70% of the cycle

const BLOCKS = [
  { x: 70, y: 300, label: "Drifts", icon: ICONS.drift },
  { x: 250, y: 205, label: "Images", icon: ICONS.image },
  { x: 410, y: 268, label: "Video", icon: ICONS.video },
  { x: 570, y: 178, label: "Information", icon: ICONS.info },
  { x: 730, y: 236, label: "Links", icon: ICONS.link },
];

const STYLES = `
.pt-svg{overflow:visible}
.pt-under{fill:none;stroke:var(--border-strong);stroke-width:8;stroke-linecap:round;opacity:.6}
.pt-line{fill:none;stroke:var(--accent);stroke-width:3.5;stroke-linecap:round;stroke-dasharray:1000;stroke-dashoffset:1000;animation:pt-draw ${CYCLE_S}s cubic-bezier(.45,.05,.25,1) infinite}
.drift-ui[data-theme="dark"] .pt-line{filter:drop-shadow(0 0 6px color-mix(in srgb,var(--accent) 60%,transparent))}
@keyframes pt-draw{0%{stroke-dashoffset:1000;opacity:1}${DRAWN_AT * 100}%{stroke-dashoffset:0;opacity:1}90%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
.pt-traveler{fill:#fff;stroke:var(--accent);stroke-width:3;offset-rotate:0deg;animation:pt-travel ${CYCLE_S}s cubic-bezier(.45,.05,.25,1) infinite}
@keyframes pt-travel{0%{offset-distance:0%;opacity:0}5%{opacity:1}${DRAWN_AT * 100}%{offset-distance:100%;opacity:1}90%{offset-distance:100%;opacity:1}100%{offset-distance:100%;opacity:0}}
.pt-node .halo{fill:var(--accent);opacity:.14;transform-box:fill-box;transform-origin:center;animation:pt-hit ${CYCLE_S}s ease-out infinite}
@keyframes pt-hit{0%,100%{transform:scale(1);opacity:.14}4%{transform:scale(1.55);opacity:.42}14%{transform:scale(1);opacity:.14}}
.pt-node .pin{fill:var(--surface);stroke:var(--accent);stroke-width:2.5}
.pt-node .glyph{fill:none;stroke:var(--accent);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.pt-node .tag{fill:var(--surface);stroke:var(--border-strong)}
.pt-node text{fill:var(--text);font-size:13px;font-weight:700}
@media(max-width:700px){.pt-node .tag,.pt-node text{display:none}}
@media(prefers-reduced-motion:reduce){.pt-line{animation:none;stroke-dashoffset:0}.pt-traveler{display:none}.pt-node .halo{animation:none}}
`;

function PathScene() {
  return (
    <DriftStage horizon="34%">
      <svg className="pt-svg" viewBox="0 0 800 350">
        <path className="pt-under" d={ROUTE} />
        <path className="pt-line" d={ROUTE} pathLength={1000} />
        {BLOCKS.map((b, i) => {
          const tagW = Math.round(b.label.length * 7.6 + 26);
          return (
            <g key={b.label} className="pt-node">
              <circle
                className="halo"
                cx={b.x}
                cy={b.y}
                r={27}
                style={{ animationDelay: `${((i / (BLOCKS.length - 1)) * DRAWN_AT * CYCLE_S).toFixed(2)}s` }}
              />
              <circle className="pin" cx={b.x} cy={b.y} r={19} />
              <g className="glyph" transform={`translate(${b.x - 10} ${b.y - 10}) scale(.84)`}>
                {b.icon.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
              <rect className="tag" x={b.x - tagW / 2} y={b.y - 58} width={tagW} height={26} rx={13} />
              <text x={b.x} y={b.y - 40} textAnchor="middle">
                {b.label}
              </text>
            </g>
          );
        })}
        <circle className="pt-traveler" r={7} style={{ offsetPath: `path("${ROUTE}")` }} />
      </svg>
    </DriftStage>
  );
}

export default function DriftPathLanding() {
  const [joining, setJoining] = useState(false);
  const join = () => setJoining(true);
  return (
    <DriftSiteShell className="ds-emerald">
      <style>{STYLES}</style>

      <ProductHero
        layout="stack"
        kicker="Drift Path"
        title={
          <>
            Connect the <em>Experience</em>
          </>
        }
        lead="Connect Drifts, images, video, information and links into an Interactive Path."
        note="Tell a story. Explain a process. Guide someone step by step."
        scene={<PathScene />}
        onJoin={join}
      />

      <section className="ds-section">
        <div className="ds-center">
          <div className="ds-kicker">Everything Connects</div>
          <h2 className="ds-h2">Mix what you already have.</h2>
        </div>
        <div className="ds-chips">
          {BLOCKS.map((b) => (
            <span key={b.label} className="ds-chip">
              <SiteIcon d={b.icon} size={20} />
              {b.label}
            </span>
          ))}
        </div>
      </section>

      <section className="ds-section ds-cards">
        <Card icon={ICONS.book} title="Tell a Story">
          <p>Take people through it, one moment at a time.</p>
        </Card>
        <Card icon={ICONS.steps} title="Explain a Process">
          <p>Show every step, in order, exactly as it happens.</p>
        </Card>
        <Card icon={ICONS.compass} title="Guide Someone">
          <p>Lead the way step by step, with a link at every turn.</p>
        </Card>
      </section>

      <section className="ds-section ds-glass ds-band">
        <div style={{ minWidth: 0 }}>
          <div className="ds-kicker">Build a Path</div>
          <h2 className="ds-h2">
            Add. Connect. <em>Share.</em>
          </h2>
          <p className="ds-p">Bring the pieces together in any order and share the whole journey with one link.</p>
        </div>
        <Steps
          label="Add, connect, share"
          steps={[
            { icon: ICONS.plus, title: "Add", sub: "drifts, images, video" },
            { icon: ICONS.link, title: "Connect", sub: "in any order" },
            { icon: ICONS.send, title: "Share", sub: "one link" },
          ]}
        />
      </section>

      <ClosingCall title="Be the first to build a Path." onJoin={join} />

      {joining && <WaitlistDialog product={PRODUCT} source="path" onClose={() => setJoining(false)} />}
    </DriftSiteShell>
  );
}
