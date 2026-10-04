import { useEffect, useRef, useState } from "react";
import { createDragCoach, type DragCoach } from "./dragCoach";

/**
 * The tips a visitor meets before their first tour drift.
 *
 * Built to the guide the client sent (2026-10-05) — their mobile and desktop versions both walked
 * end to end, not guessed at. Its shape: a screen of its own BEFORE the tour (never a card over
 * the footage, which is what it replaces); a two-line heading whose accent half shimmers in word
 * by word; one piece of animated line art per step; a pill that reads **Enter Tour** on the last
 * step; a connected stepper rail that fills as you go; **Skip Tips** in the corner throughout.
 * Five steps on a phone, three on a desktop — there the device drawn is a monitor and there is no
 * phone to turn.
 *
 * What it teaches is this player, not theirs: a drift has one axis, but a TOUR can mix rooms that
 * pan with rooms that tilt, so those two steps appear only when this tour really holds both.
 * Step one is live — the strip is dragged for real, and `dragCoach` judges it in the same pixels
 * as the player, which is where the client's earlier "drag back and forth, so all learned" lives.
 */

const KEY = "drift-tips-seen";

export const tipsSeen = (): boolean => {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false; // private mode → they meet it again; better than never
  }
};
const remember = () => {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* nothing to do: the tips simply come back next time */
  }
};

/** The px of dragging a whole drift takes (0.006 rad/px, 2π a drift) — see dragCoach. */
const DRIFT_PX = 1047;

export type Axis = "x" | "y";
type StepKind = "drag" | "turn" | "turnback" | "pan" | "tilt";
interface Step {
  kind: StepKind;
  lead: string;
  accent: string;
}

const LEARN: Record<Axis, string> = { x: "Drag Left and Right", y: "Drag Up and Down" };

const HAND = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-2.5-4a2 2 0 0 1 3.4-2L8 14" />
  </svg>
);

/** A phone, or a desktop screen — whichever the visitor is actually holding. */
const Device = ({ monitor, wide }: { monitor: boolean; wide?: boolean }) =>
  monitor ? (
    <svg viewBox="0 0 64 56" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round">
      <rect x="4" y="4" width="56" height="38" rx="5" />
      <path d="M26 48h12M32 42v6" strokeLinecap="round" />
    </svg>
  ) : wide ? (
    <svg viewBox="0 0 64 40" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round">
      <rect x="2" y="6" width="60" height="28" rx="6" />
    </svg>
  ) : (
    <svg viewBox="0 0 40 64" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinejoin="round">
      <rect x="6" y="2" width="28" height="60" rx="6" />
    </svg>
  );

/**
 * The arrow that says "turn it": a long arc sweeping around the device, the way the client's
 * guide draws it. A short hook over one corner reads as decoration; this reads as rotation.
 */
const TurnArrow = ({ back }: { back?: boolean }) => (
  <svg className={`tt-turnarrow${back ? " tt-back" : ""}`} viewBox="0 0 140 140" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M24 86A48 48 0 1 1 112 62" />
    <path d="M112 36v28H84" />
  </svg>
);

export default function TourTips({
  touch,
  axis = "x",
  tourAxes = [],
  roomName,
  onDone,
}: {
  touch: boolean;
  /** The way the room about to open is dragged, so the strip matches what they will touch. */
  axis?: Axis;
  /** The way every room of this tour is dragged. */
  tourAxes?: Axis[];
  /** The room they are about to enter — it names the strip, the way their "180°" names a pano. */
  roomName?: string | null;
  onDone: () => void;
}) {
  // A drift has ONE axis; a tour can mix them. Only teach an axis this tour actually uses, and
  // only as a separate step when it is not the one they are about to drag.
  const other: Axis = axis === "x" ? "y" : "x";
  const mixed = tourAxes.includes(other);
  const steps: Step[] = [
    { kind: "drag", lead: "Try It", accent: "Here Now" },
    ...(touch
      ? ([
          { kind: "turn", lead: "For Wide Rooms", accent: "Turn Your Phone" },
          { kind: "turnback", lead: "For Tall Rooms", accent: "Turn It Back" },
        ] as Step[])
      : []),
    ...(mixed
      ? ([other === "x"
          ? { kind: "pan", lead: "Some Rooms", accent: "Pan Left and Right" }
          : { kind: "tilt", lead: "Some Rooms", accent: "Tilt Up and Down" }] as Step[])
      : []),
  ];

  const [i, setI] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [held, setHeld] = useState(false); // they have taken the strip over
  const [done, setDone] = useState(false); // ...and dragged it both ways
  const step = steps[Math.min(i, steps.length - 1)];
  const last = i >= steps.length - 1;
  const stepAxis: Axis = step.kind === "tilt" ? "y" : step.kind === "pan" ? "x" : axis;

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    remember();
    window.setTimeout(onDone, 440);
  };

  // ── step one is live: the strip is really dragged ──
  const stripRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef(0);
  const coachRef = useRef<DragCoach | null>(null);
  useEffect(() => {
    const el = stripRef.current;
    if (!el || step.kind !== "drag") return;
    let dragging = false;
    let last0 = 0;
    const along = (e: PointerEvent) => (stepAxis === "y" ? e.clientY : e.clientX);
    const paint = () => {
      const d = shiftRef.current;
      if (stepAxis === "y") el.style.backgroundPositionY = `${d}px`;
      else el.style.backgroundPositionX = `${d}px`;
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      last0 = along(e);
      el.setPointerCapture?.(e.pointerId);
      setHeld(true);
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      shiftRef.current += along(e) - last0;
      last0 = along(e);
      paint();
      // Judged by the player's own rules, in the player's own pixels.
      const c = (coachRef.current ||= createDragCoach(performance.now()));
      if (c.update(shiftRef.current / DRIFT_PX, performance.now()).step === "done") setDone(true);
    };
    const up = () => {
      dragging = false;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [step.kind, stepAxis]);

  return (
    <div className={`r3d-tips${leaving ? " tt-out" : ""}`} role="dialog" aria-label="Quick tour tips">
      <style>{CSS}</style>

      {/* The heading comes in word by word, and the half that carries the instruction shimmers. */}
      <h2 className="tt-head" key={`h${i}`}>
        <span className="tt-lead">
          {step.lead.split(" ").map((w, n, a) => (
            <span key={`${w}${n}`} className="tt-w" style={{ animationDelay: `${n * 0.075}s` }}>
              {/* the space lives INSIDE the word, so the heading still reads as a sentence to
                  anything that takes the text rather than the picture */}
              {n < a.length - 1 ? `${w} ` : w}
            </span>
          ))}
        </span>
        <span className="tt-accent">
          {step.accent.split(" ").map((w, n, a) => (
            <span key={`${w}${n}`} className="tt-w tt-b" style={{ animationDelay: `${(step.lead.split(" ").length + n) * 0.075}s` }}>
              {n < a.length - 1 ? `${w} ` : w}
            </span>
          ))}
        </span>
      </h2>

      <div className="tt-art" key={`a${i}`}>
        {step.kind === "drag" && (
          <>
            <div
              className={`tt-strip${stepAxis === "y" ? " tt-vert" : ""}${held ? " tt-held" : ""}${done ? " tt-done" : ""}`}
              ref={stripRef}
              aria-hidden
            >
              <span className="tt-badge">{done ? "That's It" : roomName || "Drag"}</span>
              <span className="tt-grab">
                <span className="tt-hand">{HAND}</span>
                <span className="tt-dragrow">
                  <i>{stepAxis === "y" ? "⌃⌃" : "‹‹"}</i>
                  <em>{done ? "You've Got It" : "DRAG"}</em>
                  <i>{stepAxis === "y" ? "⌄⌄" : "››"}</i>
                </span>
              </span>
            </div>
            <p className="tt-note">{LEARN[stepAxis]} to Look Around</p>
          </>
        )}

        {(step.kind === "turn" || step.kind === "turnback") && (
          <div className="tt-dev" aria-hidden>
            <span className={step.kind === "turn" ? "tt-turning" : "tt-turningback"}>
              <Device monitor={false} wide={step.kind === "turnback"} />
            </span>
            <TurnArrow back={step.kind === "turnback"} />
          </div>
        )}

        {step.kind === "pan" && (
          <div className="tt-dev tt-stack" aria-hidden>
            <span className="tt-screen">
              <Device monitor={!touch} wide={touch} />
            </span>
            <span className="tt-lr">
              <svg viewBox="0 0 120 20" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 10h96" />
                <path d="M20 4l-8 6 8 6M100 4l8 6-8 6" />
              </svg>
              <span className="tt-slide tt-slide-x">{HAND}</span>
            </span>
          </div>
        )}

        {step.kind === "tilt" && (
          <div className="tt-dev tt-stack" aria-hidden>
            <span className="tt-screen">
              <Device monitor={!touch} />
            </span>
            <span className="tt-ud">
              <svg viewBox="0 0 20 90" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 10v70" />
                <path d="M4 18l6-8 6 8M4 72l6 8 6-8" />
              </svg>
              <span className="tt-slide tt-slide-y">{HAND}</span>
            </span>
          </div>
        )}
      </div>

      <div className="tt-foot">
        <button type="button" className="tt-next" onClick={() => (last ? close() : setI(i + 1))}>
          {last ? "Enter Tour" : "Next"}
        </button>
        <div className="tt-rail" aria-hidden>
          {steps.map((s, n) => (
            <span key={s.kind} className={`tt-node${n < i ? " tt-past" : ""}${n === i ? " tt-now" : ""}`} />
          ))}
        </div>
      </div>

      <button type="button" className="tt-skip" onClick={close}>
        Skip Tips
      </button>
    </div>
  );
}

const CSS = `
.r3d-tips{position:absolute;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:clamp(20px,4.6vh,40px);padding:max(18px,env(safe-area-inset-top)) 18px max(18px,env(safe-area-inset-bottom));
  background:radial-gradient(90% 60% at 50% 42%,rgba(13,20,32,.97),rgba(6,9,15,.985));
  -webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);
  color:#eef2f8;font-family:inherit;text-align:center;animation:ttIn .42s ease both}
.r3d-tips.tt-out{animation:ttOut .42s ease both;pointer-events:none}
@keyframes ttIn{from{opacity:0}to{opacity:1}}
@keyframes ttOut{from{opacity:1}to{opacity:0}}

/* ── the heading: word by word, the instruction half shimmering ── */
.tt-head{display:flex;flex-direction:column;gap:4px;margin:0;font-size:clamp(20px,5.2vmin,29px);font-weight:700;
  letter-spacing:-.015em;line-height:1.22}
.tt-lead,.tt-accent{display:block}
.tt-w{display:inline-block;white-space:pre;opacity:0;animation:ttWordIn .5s cubic-bezier(.2,.7,.3,1) both}
@keyframes ttWordIn{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}
.tt-b{color:var(--r3d-primary);background:linear-gradient(100deg,var(--r3d-primary) 20%,#eaffff 50%,var(--r3d-primary) 80%);
  background-size:260% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  animation:ttWordIn .5s cubic-bezier(.2,.7,.3,1) both,ttShimmer 3.4s linear .6s infinite}
@keyframes ttShimmer{from{background-position:140% 0}to{background-position:-140% 0}}

.tt-art{display:flex;flex-direction:column;align-items:center;gap:16px;min-height:clamp(150px,27vh,220px);justify-content:center;
  animation:ttWordIn .5s .12s cubic-bezier(.2,.7,.3,1) both}
.tt-note{margin:0;font-size:clamp(12px,3vmin,14px);font-weight:600;letter-spacing:.04em;color:#8da0b6}

/* ── step one: a room reduced to its bands, and really dragged ── */
.tt-strip{position:relative;width:min(430px,86vw);height:clamp(120px,21vh,170px);border-radius:16px;cursor:grab;touch-action:none;
  border:1px solid rgba(125,211,252,.3);overflow:hidden;
  background-image:repeating-linear-gradient(90deg,rgba(125,211,252,.04) 0 56px,rgba(125,211,252,.14) 56px 112px);
  background-size:224px 100%;
  box-shadow:0 0 70px -20px rgba(34,211,238,.75),inset 0 0 46px -16px rgba(34,211,238,.55)}
.tt-strip.tt-vert{background-image:repeating-linear-gradient(0deg,rgba(125,211,252,.04) 0 56px,rgba(125,211,252,.14) 56px 112px);
  background-size:100% 224px}
.tt-strip.tt-held{cursor:grabbing;border-color:rgba(125,211,252,.5)}
.tt-strip.tt-done{border-color:var(--r3d-primary)}
.tt-badge{position:absolute;left:11px;top:11px;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  padding:5px 12px;border-radius:999px;background:var(--r3d-primary);color:var(--r3d-accent-ink,#04121a);
  font-size:11.5px;font-weight:700;letter-spacing:.02em}
.tt-grab{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;gap:7px;
  animation:ttHandSlide 3.2s ease-in-out infinite}
.tt-strip.tt-held .tt-grab,.tt-strip.tt-done .tt-grab{animation:none}
@keyframes ttHandSlide{0%,100%{transform:translate(-26px,-50%)}50%{transform:translate(26px,-50%)}}
.tt-vert .tt-grab{animation-name:ttHandSlideY}
@keyframes ttHandSlideY{0%,100%{transform:translate(0,calc(-50% - 20px))}50%{transform:translate(0,calc(-50% + 20px))}}
.tt-hand{width:34px;height:34px;color:#fff;display:block;filter:drop-shadow(0 3px 10px rgba(0,0,0,.65))}
.tt-hand svg{width:100%;height:100%}
.tt-dragrow{display:flex;align-items:center;gap:9px;color:var(--r3d-primary);font-size:12px;font-weight:700;letter-spacing:.2em}
.tt-dragrow i{font-style:normal;font-size:16px;opacity:.85}
.tt-dragrow em{font-style:normal;color:#dbe6f2;letter-spacing:.16em}

/* ── the device steps: line art that shows the move ── */
.tt-dev{position:relative;display:grid;place-items:center;color:var(--r3d-primary);width:min(300px,76vw);height:clamp(140px,24vh,190px)}
.tt-dev.tt-stack{display:flex;flex-direction:column;gap:12px;justify-content:center}
.tt-dev svg{display:block;overflow:visible}
.tt-screen svg,.tt-turning svg,.tt-turningback svg{width:clamp(50px,13vmin,70px);height:auto;color:#dbe6f2}
.tt-turning{display:block;animation:ttTurn 3.2s ease-in-out infinite}
.tt-turningback{display:block;animation:ttTurnBack 3.2s ease-in-out infinite}
@keyframes ttTurn{0%,16%{transform:rotate(0)}44%,76%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
@keyframes ttTurnBack{0%,16%{transform:rotate(-90deg)}44%,76%{transform:rotate(0)}100%{transform:rotate(-90deg)}}
.tt-turnarrow{position:absolute;width:clamp(132px,34vmin,172px);height:auto;opacity:.95;pointer-events:none}
.tt-turnarrow.tt-back{transform:scaleX(-1)}
.tt-lr,.tt-ud{position:relative;display:grid;place-items:center;color:var(--r3d-primary)}
.tt-lr svg{width:clamp(96px,26vmin,130px)}
.tt-ud svg{height:clamp(66px,16vh,92px);width:auto}
.tt-slide{position:absolute;width:26px;height:26px;color:#fff}
.tt-slide svg{width:100%;height:100%}
.tt-slide-x{animation:ttSlideX 2.6s ease-in-out infinite}
.tt-slide-y{animation:ttSlideY 2.6s ease-in-out infinite}
@keyframes ttSlideX{0%,100%{transform:translate(-30px,9px)}50%{transform:translate(30px,9px)}}
@keyframes ttSlideY{0%,100%{transform:translate(16px,-24px)}50%{transform:translate(16px,24px)}}

/* ── the way on, and how far along ── */
.tt-foot{display:flex;flex-direction:column;align-items:center;gap:15px}
.tt-next{appearance:none;border:0;cursor:pointer;font-family:inherit;padding:12px 38px;border-radius:999px;
  background:var(--r3d-primary);color:var(--r3d-accent-ink,#04121a);font-size:13px;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;box-shadow:0 0 34px -8px rgba(34,211,238,.9);transition:filter .2s,transform .12s}
.tt-next:hover{filter:brightness(1.08)}
.tt-next:active{transform:translateY(1px)}
.tt-rail{display:flex;align-items:center;gap:0}
.tt-node{width:9px;height:9px;border-radius:50%;border:1.6px solid rgba(125,211,252,.5);flex:none;transition:background .3s,box-shadow .3s}
.tt-node + .tt-node{margin-left:34px;position:relative}
.tt-node + .tt-node::before{content:"";position:absolute;right:100%;top:50%;width:34px;height:1.6px;margin-top:-.8px;
  background:rgba(125,211,252,.3)}
.tt-node.tt-past,.tt-node.tt-now{background:var(--r3d-primary);border-color:var(--r3d-primary)}
.tt-node.tt-now{box-shadow:0 0 14px rgba(34,211,238,.95)}
.tt-node.tt-past + .tt-node::before,.tt-node.tt-now + .tt-node::before{background:var(--r3d-primary)}

.tt-skip{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));
  appearance:none;cursor:pointer;font-family:inherit;padding:10px 18px;border-radius:999px;font-size:11.5px;font-weight:700;
  letter-spacing:.12em;text-transform:uppercase;color:#a9bbcd;background:rgba(125,211,252,.05);
  border:1px solid rgba(125,211,252,.3)}
.tt-skip:hover{color:#eef2f8;border-color:rgba(125,211,252,.55)}

@media (prefers-reduced-motion:reduce){
  .tt-w,.tt-b,.tt-art,.tt-grab,.tt-turning,.tt-turningback,.tt-slide{animation:none;opacity:1}
  .tt-b{-webkit-text-fill-color:var(--r3d-primary)}
  .r3d-tips,.r3d-tips.tt-out{animation-duration:.01s}
}
`;
