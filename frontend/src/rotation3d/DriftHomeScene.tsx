import { useEffect, useRef, useState, type ReactNode } from "react";
import { DriftStage, ICONS, useReducedMotion } from "./driftSite";

/**
 * The drift.li home's hero scene — the parent of /tour, /view, /memory and /path, so it
 * shows all four in one movement: a Drift standing on the shared grid floor, with the four
 * worlds side by side inside it (a space with stops · a viewpoint · moments kept private ·
 * a connected path), each drawn in its own product colour. A playhead travels the rail
 * below the frame and scrubs between them, and on a mouse or pen the pointer takes the
 * playhead over — "You Control the Movement", not as a caption but as the thing itself.
 * Touch is left alone (the page must still scroll), reduced motion holds the first world,
 * and the loop stops while the tab is hidden or the hero is off screen.
 *
 * Drawn, not photographed: it matches the product landings and needs no demo tour. The
 * "Take a Tour" link over the scene is passed in by the page (`action`).
 */

type Tone = "cyan" | "violet" | "emerald";
export type HomeWorld = { key: string; name: string; title: string; live?: boolean; tone: Tone };

/** The four products, in the client's words (the same names + titles as the cards below). */
export const HOME_WORLDS: HomeWorld[] = [
  { key: "TOUR", name: "Tour", title: "Show Any Space", live: true, tone: "cyan" },
  { key: "VIEW", name: "View", title: "Share What You See", tone: "cyan" },
  { key: "MEMORY", name: "Memory", title: "Keep the Moments That Matter", tone: "violet" },
  { key: "PATH", name: "Path", title: "Connect the Experience", tone: "emerald" },
];

// ── geometry (view box 480 × 330; the floor's horizon is at 70%) ──
const CELL = 340; // one world, the width of the window
const WIN = { x: 70, y: 48, w: CELL, h: 210 };
const RAIL = { x: 92, y: 294, w: 296 };
const LAST = HOME_WORLDS.length - 1;
const railX = (at: number) => RAIL.x + (RAIL.w * at) / LAST;

// ── the journey (auto): hold on a world, glide to the next, turn around at the ends ──
const HOLD_MS = 2600;
const GLIDE_MS = 1150;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export const HOME_SCENE_STYLES = `
.dh-visual{position:relative;min-width:0;isolation:isolate}
.dh-svg{--w-cyan:var(--accent);--w-violet:#7c3aed;--w-emerald:#047857;overflow:visible}
.drift-ui[data-theme="dark"] .dh-svg{--w-violet:#a78bfa;--w-emerald:#34d399}
.w-cyan{color:var(--w-cyan)}
.w-violet{color:var(--w-violet)}
.w-emerald{color:var(--w-emerald)}

/* The Drift itself: a frame standing on the floor, the worlds passing through it. */
.dh-pane{fill:url(#dh-pane);stroke:none}
.pane-a{stop-color:#ffffff}
.pane-b{stop-color:#eef2f7}
.drift-ui[data-theme="dark"] .pane-a{stop-color:#12203a}
.drift-ui[data-theme="dark"] .pane-b{stop-color:#070d19}
.dh-frame{fill:none;stroke:var(--border-strong);stroke-width:2}
.drift-ui[data-theme="dark"] .dh-frame{stroke:color-mix(in srgb,var(--accent) 45%,transparent);filter:drop-shadow(0 0 16px color-mix(in srgb,var(--accent) 30%,transparent))}
.dh-inner{fill:none;stroke:var(--border);stroke-width:1;opacity:.7}
.dh-cast{fill:url(#dh-cast)}

/* World parts — every world draws in its own colour (currentColor). */
.dh-svg .ln{fill:none;stroke:var(--border-strong);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;opacity:.75}
.dh-svg .ac{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dh-svg .soft{fill:currentColor;opacity:.16}
.dh-svg .solid{fill:currentColor}
.dh-svg .pin{fill:var(--surface);stroke:currentColor;stroke-width:2}
.dh-svg .glyph{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.dh-svg .dash{stroke-dasharray:5 7}
.dh-svg .label{fill:var(--muted);font-size:11px;font-weight:700;letter-spacing:.02em}

/* In-world motion (the big movement is the scrub; these are the small signs of life). */
.dh-rove{fill:var(--surface);stroke:currentColor;stroke-width:2.5;offset-rotate:0deg;animation:dh-rove 6s ease-in-out infinite alternate}
@keyframes dh-rove{from{offset-distance:0%}to{offset-distance:100%}}
.dh-ping{fill:none;stroke:currentColor;stroke-width:1.5;transform-box:fill-box;transform-origin:center;animation:dh-ping 3.2s ease-out infinite}
@keyframes dh-ping{0%{transform:scale(1);opacity:.7}70%,100%{transform:scale(1.9);opacity:0}}
.dh-sweep{transform-box:fill-box;transform-origin:50% 100%;animation:dh-sweep 6.5s ease-in-out infinite alternate}
@keyframes dh-sweep{from{transform:rotate(-34deg)}to{transform:rotate(34deg)}}
.dh-lift{animation:dh-lift 6s ease-in-out infinite}
@keyframes dh-lift{0%,100%{transform:translateY(0)}45%{transform:translateY(-12px)}}
.dh-beat{transform-box:fill-box;transform-origin:center;animation:dh-beat 3.4s ease-in-out infinite}
@keyframes dh-beat{0%,100%{transform:scale(1);opacity:.9}45%{transform:scale(1.14);opacity:1}}
.dh-draw{stroke-dasharray:520;stroke-dashoffset:520;animation:dh-draw 7s cubic-bezier(.45,.05,.25,1) infinite}
@keyframes dh-draw{0%{stroke-dashoffset:520}55%,100%{stroke-dashoffset:0}}

/* The rail under the frame: where the movement is, and what it is passing through. */
.dh-rail{stroke:var(--border-strong);stroke-width:3;stroke-linecap:round}
.dh-done{stroke:currentColor;stroke-width:3;stroke-linecap:round}
.dh-stop{fill:var(--surface);stroke:var(--border-strong);stroke-width:2;transition:stroke .35s}
.dh-stop.on{stroke:currentColor}
.dh-head .halo{fill:currentColor;opacity:.2}
.dh-head .core{fill:currentColor}
.drift-ui[data-theme="dark"] .dh-head{filter:drop-shadow(0 0 7px color-mix(in srgb,currentColor 75%,transparent))}
.dh-name{fill:var(--faint);font-size:12px;font-weight:700;letter-spacing:.06em;transition:fill .35s}
.dh-name.on{fill:var(--text)}
@media(max-width:560px){.dh-name{font-size:14px}.dh-svg .nlabel{display:none}}

/* What is on screen right now (the card copy, so the hero says what the products are). */
.dh-now{position:absolute;left:0;top:0;z-index:4;padding:9px 14px;border-radius:14px;max-width:100%;
  background:color-mix(in srgb,var(--surface) 82%,transparent);border:1px solid var(--border);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.dh-now b{font-size:13px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
.dh-now span{font-size:13.5px;font-weight:650;color:var(--text)}
.dh-now em{font-style:normal;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;
  padding:5px 9px;border-radius:999px;color:var(--accent);background:var(--accent-soft);border:1px solid var(--accent-border)}
.dh-now em.on{color:var(--ok);background:var(--ok-soft);border-color:var(--ok-border)}
.dh-now.violet{--accent:var(--w-violet)}
.dh-now.emerald{--accent:var(--w-emerald)}
.dh-now-in{display:flex;align-items:center;gap:10px;flex-wrap:wrap;animation:dh-fade .5s ease}
@keyframes dh-fade{from{opacity:0}to{opacity:1}}
@media(max-width:560px){.dh-now-t{display:none}}

@media(prefers-reduced-motion:reduce){
  .dh-rove,.dh-ping,.dh-sweep,.dh-lift,.dh-beat,.dh-draw,.dh-now-in{animation:none}
  .dh-draw{stroke-dashoffset:0}
}
`;

/** One of the shared 24px line icons, placed in the scene. */
const Glyph = ({ d, x, y, size = 18 }: { d: readonly string[]; x: number; y: number; size?: number }) => (
  <g className="glyph" transform={`translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`}>
    {d.map((p) => (
      <path key={p} d={p} />
    ))}
  </g>
);

// ── the four worlds (each drawn in its own 340 × 210 cell) ──

const TOUR_WALK = "M40 192 C 96 172, 136 164, 170 164 C 204 164, 244 172, 300 192";
const TOUR_STOPS = [
  { x: 40, y: 192 },
  { x: 170, y: 164 },
  { x: 300, y: 192 },
];

/** Tour — a space you walk through: a room, and the stops of a tour across its floor. */
const TourWorld = () => (
  <>
    <path className="ln" d="M96 52 L8 4" />
    <path className="ln" d="M244 52 L332 4" />
    <path className="ln" d="M96 148 L8 206" />
    <path className="ln" d="M244 148 L332 206" />
    <rect className="ln" x={96} y={52} width={148} height={96} rx={3} />
    <path className="ln" d="M96 148 H244" />
    <rect className="ln" x={112} y={72} width={34} height={26} rx={3} />
    <rect className="ln" x={194} y={72} width={34} height={26} rx={3} />
    <path className="soft" d="M156 148 V114 a14 14 0 0 1 28 0 V148 Z" />
    <path className="ac" d="M156 148 V114 a14 14 0 0 1 28 0 V148" />
    <path className="ac dash" d={TOUR_WALK} opacity={0.85} />
    {TOUR_STOPS.map((s, i) => (
      <g key={`${s.x}`}>
        <circle className="dh-ping" cx={s.x} cy={s.y} r={11} style={{ animationDelay: `${i * 0.9}s` }} />
        <circle className="pin" cx={s.x} cy={s.y} r={9} />
        <circle className="solid" cx={s.x} cy={s.y} r={3.4} />
      </g>
    ))}
    <circle className="dh-rove" r={6} style={{ offsetPath: `path("${TOUR_WALK}")` }} />
  </>
);

/** View — what someone sees from where they stand: a horizon, and a sightline sweeping it. */
const ViewWorld = () => (
  <>
    <path className="ln" d="M0 132 H340" />
    <circle className="soft" cx={170} cy={104} r={34} />
    <circle className="ac" cx={170} cy={104} r={21} />
    <path className="ln" d="M22 132 V110 h20 v22" />
    <path className="ln" d="M48 132 V96 h16 v36" />
    <path className="ln" d="M262 132 V102 h18 v30" />
    <path className="ln" d="M286 132 V114 h16 v18" />
    <path className="ln dash" d="M36 152 H150" />
    <path className="ln dash" d="M198 168 H304" />
    <path className="ln dash" d="M70 184 H262" />
    <g className="dh-sweep">
      <path className="soft" d="M170 196 L128 128 A 84 84 0 0 1 212 128 Z" />
      <path className="ac" d="M170 196 V120" />
    </g>
    <circle className="pin" cx={170} cy={196} r={10} />
    <circle className="solid" cx={170} cy={196} r={3.6} />
    {[
      { x: 84, y: 132, d: ICONS.sun },
      { x: 252, y: 132, d: ICONS.cup },
    ].map((p) => (
      <g key={p.x}>
        <circle className="dh-ping" cx={p.x} cy={p.y} r={13} />
        <circle className="pin" cx={p.x} cy={p.y} r={13} />
        <Glyph d={p.d} x={p.x} y={p.y} size={15} />
      </g>
    ))}
  </>
);

/** Memory — moments you keep: frames standing together, one lifting, and a private badge. */
const MemoryWorld = () => (
  <>
    <ellipse className="ln" cx={94} cy={162} rx={36} ry={4} />
    <ellipse className="ln" cx={170} cy={168} rx={40} ry={4} />
    <ellipse className="ln" cx={248} cy={162} rx={36} ry={4} />
    <g opacity={0.9}>
      <rect className="ln" x={58} y={64} width={72} height={94} rx={8} />
      <path className="ac" d="M70 138 l18-22 14 16 12-14 16 20" opacity={0.8} />
    </g>
    <g className="dh-lift">
      <rect className="soft" x={130} y={44} width={80} height={120} rx={9} />
      <rect className="ac" x={130} y={44} width={80} height={120} rx={9} />
      <circle className="ac" cx={170} cy={82} r={13} />
      <path className="ac" d="M146 132 a24 24 0 0 1 48 0" />
    </g>
    <g opacity={0.9}>
      <rect className="ln" x={212} y={64} width={72} height={94} rx={8} />
      <path className="ac dh-beat" d="M256 130 l-14-13.5a8.4 8.4 0 0 1 12-11.8l2 1.9 2-1.9a8.4 8.4 0 0 1 12 11.8z" opacity={0.85} />
    </g>
    <g>
      <rect className="pin" x={122} y={176} width={96} height={24} rx={12} />
      <Glyph d={ICONS.lock} x={140} y={188} size={13} />
      <text className="label" x={154} y={192} style={{ fill: "currentColor" }}>
        Private
      </text>
    </g>
  </>
);

const PATH_ROUTE = "M26 178 C 78 178, 76 110, 128 110 C 180 110, 178 174, 230 174 C 272 174, 284 132, 314 124";
const PATH_NODES = [
  { x: 26, y: 178, d: ICONS.drift, label: "Drift" },
  { x: 128, y: 110, d: ICONS.image, label: "Image" },
  { x: 230, y: 174, d: ICONS.video, label: "Video" },
  { x: 314, y: 124, d: ICONS.link, label: "Link" },
];

/** Path — pieces joined into one route: drifts, images, video and links along a line. */
const PathWorld = () => (
  <>
    <path className="ln" d={PATH_ROUTE} strokeWidth={7} opacity={0.5} />
    <path className="ac dh-draw" d={PATH_ROUTE} strokeWidth={3} />
    {PATH_NODES.map((n) => (
      <g key={n.label}>
        <circle className="pin" cx={n.x} cy={n.y} r={16} />
        <Glyph d={n.d} x={n.x} y={n.y} size={17} />
        <text className="label nlabel" x={n.x} y={n.y - 26} textAnchor="middle">
          {n.label}
        </text>
      </g>
    ))}
    <circle className="dh-rove" r={6} style={{ offsetPath: `path("${PATH_ROUTE}")`, animationDuration: "7s" }} />
  </>
);

const WORLD_ART = [TourWorld, ViewWorld, MemoryWorld, PathWorld];

/** The hero scene. `action` (the page's "Take a Tour" link) sits in the top-right corner. */
export function HomeScene({ action }: { action?: ReactNode }) {
  const reduce = useReducedMotion();
  const [at, setAt] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stripRef = useRef<SVGGElement | null>(null);
  const headRef = useRef<SVGGElement | null>(null);
  const doneRef = useRef<SVGLineElement | null>(null);
  // The playhead: where it is (in worlds), where the pointer wants it, and the auto journey.
  const pos = useRef(0);
  const aim = useRef<number | null>(null);
  const trip = useRef({ from: 0, to: 0, since: 0, holding: true, dir: 1 });
  const paintRef = useRef<(p: number) => void>(() => {});

  useEffect(() => {
    const paint = (p: number) => {
      stripRef.current?.setAttribute("transform", `translate(${(-p * CELL).toFixed(2)} 0)`);
      const x = railX(p);
      headRef.current?.setAttribute("transform", `translate(${x.toFixed(2)} ${RAIL.y})`);
      doneRef.current?.setAttribute("x2", x.toFixed(2));
      const world = Math.min(LAST, Math.max(0, Math.round(p)));
      setAt((was) => (was === world ? was : world));
    };
    paintRef.current = paint;
    paint(pos.current);
    if (reduce) return;

    let raf = 0;
    let last = 0;
    let running = false;
    const frame = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      const want = aim.current;
      if (want !== null) {
        // The pointer has it: ease towards the finger's world, never snapping.
        pos.current += (want - pos.current) * (1 - Math.exp(-dt / 90));
      } else {
        const t = trip.current;
        const spent = now - t.since;
        if (t.holding) {
          if (spent >= HOLD_MS) {
            // Walk on to the next world, and turn around at either end.
            const from = Math.round(pos.current);
            const dir = from >= LAST ? -1 : from <= 0 ? 1 : t.dir;
            trip.current = { from, to: from + dir, since: now, holding: false, dir };
          }
        } else if (spent >= GLIDE_MS) {
          pos.current = t.to;
          trip.current = { from: t.to, to: t.to, since: now, holding: true, dir: t.dir };
        } else {
          pos.current = t.from + (t.to - t.from) * ease(spent / GLIDE_MS);
        }
      }
      paint(pos.current);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running || document.hidden) return;
      running = true;
      last = 0;
      trip.current = { ...trip.current, since: performance.now() };
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    // Only while the hero is on screen and the tab is in front.
    let onScreen = true;
    const io = new IntersectionObserver(
      ([e]) => {
        onScreen = e.isIntersecting;
        if (onScreen) start();
        else stop();
      },
      { threshold: 0.05 },
    );
    if (hostRef.current) io.observe(hostRef.current);
    const onVisible = () => (document.hidden || !onScreen ? stop() : start());
    document.addEventListener("visibilitychange", onVisible);
    start();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reduce]);

  // Mouse and pen take the playhead over; touch is left to scroll the page.
  const follow = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width) return;
    const want = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)) * LAST;
    // Reduced motion: no gliding, but the pointer can still step through the worlds.
    if (reduce) {
      pos.current = Math.round(want);
      paintRef.current(pos.current);
      return;
    }
    aim.current = want;
  };
  const release = () => {
    if (aim.current === null) return;
    aim.current = null;
    const from = Math.round(pos.current);
    trip.current = { ...trip.current, from, to: from, since: performance.now(), holding: true };
  };

  const world = HOME_WORLDS[at];

  return (
    <div className="dh-visual" ref={hostRef} onPointerMove={follow} onPointerLeave={release} onPointerCancel={release}>
      <DriftStage horizon="70%">
        <svg className="dh-svg" viewBox="0 0 480 330">
          <defs>
            <clipPath id="dh-window">
              <rect x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} rx={13} />
            </clipPath>
            <radialGradient id="dh-cast" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#020617" stopOpacity="0.5" />
              <stop offset="1" stopColor="#020617" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="dh-pane" x1="0" y1="0" x2="0" y2="1">
              <stop className="pane-a" offset="0" />
              <stop className="pane-b" offset="1" />
            </linearGradient>
          </defs>

          <ellipse className="dh-cast" cx={240} cy={264} rx={158} ry={14} />

          <g clipPath="url(#dh-window)">
            <rect className="dh-pane" x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} rx={13} />
            <g ref={stripRef}>
              {WORLD_ART.map((Art, i) => (
                <g key={HOME_WORLDS[i].key} className={`w-${HOME_WORLDS[i].tone}`} transform={`translate(${WIN.x + i * CELL} ${WIN.y})`}>
                  <Art />
                </g>
              ))}
            </g>
          </g>
          <rect className="dh-inner" x={WIN.x + 6} y={WIN.y + 6} width={WIN.w - 12} height={WIN.h - 12} rx={8} />
          <rect className="dh-frame" x={WIN.x} y={WIN.y} width={WIN.w} height={WIN.h} rx={13} />

          <g className={`w-${world.tone}`}>
            <line className="dh-rail" x1={RAIL.x} y1={RAIL.y} x2={RAIL.x + RAIL.w} y2={RAIL.y} />
            <line className="dh-done" ref={doneRef} x1={RAIL.x} y1={RAIL.y} x2={RAIL.x} y2={RAIL.y} />
            {HOME_WORLDS.map((w, i) => (
              <g key={w.key} className={i === at ? `w-${w.tone}` : ""}>
                <circle className={`dh-stop ${i === at ? "on" : ""}`} cx={railX(i)} cy={RAIL.y} r={6} />
                <text className={`dh-name ${i === at ? "on" : ""}`} x={railX(i)} y={RAIL.y + 24} textAnchor="middle">
                  {w.name}
                </text>
              </g>
            ))}
            <g className="dh-head" ref={headRef} transform={`translate(${RAIL.x} ${RAIL.y})`}>
              <circle className="halo" r={13} />
              <circle className="core" r={6} />
            </g>
          </g>
        </svg>
      </DriftStage>

      <div className={`dh-now ${world.tone}`} aria-hidden>
        <span className="dh-now-in" key={world.key}>
          <b>{world.name}</b>
          <span className="dh-now-t">{world.title}</span>
          <em className={world.live ? "on" : ""}>{world.live ? "Available Now" : "Coming Soon"}</em>
        </span>
      </div>
      {action}
    </div>
  );
}
