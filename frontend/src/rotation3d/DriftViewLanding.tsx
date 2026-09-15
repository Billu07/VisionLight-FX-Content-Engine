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
  useReducedMotion,
} from "./driftSite";

/**
 * drift.li/view — Drift View (coming soon). The scene is a 180° field of view standing on
 * the grid: a viewer on the horizon, a sightline sweeping side to side across the arc,
 * and the places it finds (the client's Sunsets · Cities · Cafés · Nature · Events)
 * lighting up. Drift cyan. Text left, scene right.
 */

const PRODUCT = { key: "VIEW", name: "View" };
const TAGS = ["Sunsets", "Cities", "Cafés", "Nature", "Events"];

const STYLES = `
.vw-svg{overflow:visible}
.vw-arc{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-dasharray:4 7;opacity:.75}
.vw-arc-in{fill:none;stroke:var(--border-strong);stroke-width:1}
.vw-beam{transform-box:view-box;transform-origin:240px 238px;animation:vw-sweep 6.5s ease-in-out infinite alternate}
@keyframes vw-sweep{from{transform:rotate(-72deg)}to{transform:rotate(72deg)}}
.vw-cone{fill:var(--accent);opacity:.14}
.drift-ui[data-theme="dark"] .vw-cone{opacity:.22}
.vw-sight{stroke:var(--accent);stroke-width:2;stroke-linecap:round}
.vw-mark .pin{fill:var(--surface);stroke:var(--accent);stroke-width:2}
.vw-mark .ring{fill:none;stroke:var(--accent);stroke-width:1.5;transform-box:fill-box;transform-origin:center;animation:vw-ping 3.4s ease-out infinite}
@keyframes vw-ping{0%{transform:scale(1);opacity:.75}70%,100%{transform:scale(1.9);opacity:0}}
.vw-mark .glyph{fill:none;stroke:var(--accent);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.vw-mark .tag{fill:var(--surface);stroke:var(--border-strong)}
.vw-mark text{fill:var(--text);font-size:11px;font-weight:700}
.vw-eye .halo{fill:var(--accent);opacity:.18}
.vw-eye .core{fill:var(--surface);stroke:var(--accent);stroke-width:2.5}
.vw-eye .dot{fill:var(--accent)}
.drift-ui[data-theme="dark"] .vw-sight,.drift-ui[data-theme="dark"] .vw-eye .core{filter:drop-shadow(0 0 6px color-mix(in srgb,var(--accent) 70%,transparent))}
@media(max-width:480px){.vw-mark .tag,.vw-mark text{display:none}}
@media(prefers-reduced-motion:reduce){.vw-beam{animation:none;transform:rotate(-24deg)}.vw-mark .ring{animation:none;opacity:0}}
`;

const CX = 240;
const CY = 238; // on the horizon (72% of the 330-high view box)
const R = 186;
const CONE = 6; // half-angle of the sightline's cone, degrees

const PLACES = [
  { deg: 160, label: "Sunsets", icon: ["M3 17h18", "M7 17a5 5 0 0 1 10 0", "M12 5v3", "M4.9 9.9l1.4 1.4", "M19.1 9.9l-1.4 1.4"] },
  { deg: 125, label: "Cities", icon: ["M3 21h18", "M5 21V10h5v11", "M10 21V4h7v17", "M17 21v-8h3v8"] },
  { deg: 90, label: "Cafés", icon: ["M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z", "M16 10h2a2 2 0 0 1 0 4h-2", "M8 3v2", "M12 3v2"] },
  { deg: 55, label: "Nature", icon: ["M12 3l6 9H6z", "M12 8l7 10H5z", "M12 18v3"] },
  { deg: 20, label: "Events", icon: ["M12 3l2.3 5.6 6 .5-4.6 3.9 1.4 5.9L12 15.8 6.9 18.9l1.4-5.9L3.7 9.1l6-.5z"] },
];

function ViewScene() {
  const reduce = useReducedMotion();
  const coneX = R * Math.sin((CONE * Math.PI) / 180);
  const coneY = CY - R * Math.cos((CONE * Math.PI) / 180);
  return (
    <DriftStage horizon="72%">
      <svg className="vw-svg" viewBox="0 0 480 330">
        <path className="vw-arc" d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} />
        <path className="vw-arc-in" d={`M ${CX - R * 0.6} ${CY} A ${R * 0.6} ${R * 0.6} 0 0 1 ${CX + R * 0.6} ${CY}`} />

        <g className="vw-beam">
          <path className="vw-cone" d={`M ${CX} ${CY} L ${CX - coneX} ${coneY} A ${R} ${R} 0 0 1 ${CX + coneX} ${coneY} Z`} />
          <line className="vw-sight" x1={CX} y1={CY} x2={CX} y2={CY - R} />
        </g>

        {PLACES.map((p, i) => {
          const rad = (p.deg * Math.PI) / 180;
          const x = CX + R * Math.cos(rad);
          const y = CY - R * Math.sin(rad);
          const tagW = Math.round(p.label.length * 6.6 + 22);
          return (
            <g key={p.label} className="vw-mark">
              {!reduce && <circle className="ring" cx={x} cy={y} r={14} style={{ animationDelay: `${i * 0.68}s` }} />}
              <circle className="pin" cx={x} cy={y} r={14} />
              <g className="glyph" transform={`translate(${x - 9} ${y - 9}) scale(.75)`}>
                {p.icon.map((d) => (
                  <path key={d} d={d} />
                ))}
              </g>
              <rect className="tag" x={x - tagW / 2} y={y - 44} width={tagW} height={22} rx={11} />
              <text x={x} y={y - 29} textAnchor="middle">
                {p.label}
              </text>
            </g>
          );
        })}

        <g className="vw-eye">
          <circle className="halo" cx={CX} cy={CY} r={22} />
          <circle className="core" cx={CX} cy={CY} r={10} />
          <circle className="dot" cx={CX} cy={CY} r={4} />
        </g>
      </svg>
    </DriftStage>
  );
}

export default function DriftViewLanding() {
  const [joining, setJoining] = useState(false);
  const join = () => setJoining(true);
  return (
    <DriftSiteShell>
      <style>{STYLES}</style>

      <ProductHero
        layout="split"
        kicker="Drift View"
        title={
          <>
            Share What <em>You See</em>
          </>
        }
        lead="Turn a few seconds of a real place or moment into an Interactive View."
        tags={TAGS}
        scene={<ViewScene />}
        onJoin={join}
      />

      <section className="ds-section ds-glass ds-band">
        <div style={{ minWidth: 0 }}>
          <div className="ds-kicker">A Few Seconds</div>
          <h2 className="ds-h2">Pan it. Share it. Let them look around.</h2>
          <p className="ds-p">Record a few seconds of what's in front of you. We turn it into a View anyone can explore.</p>
        </div>
        <Steps
          label="Point, pan, share"
          steps={[
            { icon: ICONS.eye, title: "Point", sub: "at what you see" },
            { icon: ICONS.pan, title: "Pan", sub: "a few seconds" },
            { icon: ICONS.send, title: "Share", sub: "one link" },
          ]}
        />
      </section>

      <section className="ds-section ds-cards">
        <Card icon={ICONS.eye} title="Natural 180° Views">
          <p>Viewers drag to look side to side, as if they were standing right there.</p>
        </Card>
        <Card icon={ICONS.sun} title="Real Places. Real Moments.">
          <p>Show it the way it really looked — the light, the view, the moment.</p>
        </Card>
        <Card icon={ICONS.link} title="One Link">
          <p>Share it anywhere — a text, a post, an email or a QR code.</p>
        </Card>
      </section>

      <section className="ds-section">
        <p className="ds-quote">
          See the world through <em>someone else's eyes.</em>
        </p>
      </section>

      <ClosingCall title="Be the first to share what you see." onJoin={join} />

      {joining && <WaitlistDialog product={PRODUCT} source="view" onClose={() => setJoining(false)} />}
    </DriftSiteShell>
  );
}
