import { useEffect, useRef, useState } from "react";
import { createDragCoach, type DragCoach } from "./dragCoach";

/**
 * The tips a visitor meets before their first tour drift.
 *
 * Modelled on the guide the client sent (2026-10-05): its own screen BEFORE the tour rather
 * than a card over the footage — which is the whole point, because the card we had covered the
 * drift's own title and caption. One gesture per step, a strip to try it on, Next, dots, and a
 * way out at any time.
 *
 * What it teaches is what this player actually does: drag, turn the phone, and the row that
 * moves you through the tour. No pan or tilt — a drift has one axis, and promising two would be
 * a lie the first room exposes.
 *
 * Shown once per browser; `TourTips.seen()` is the gate so the player can ask before mounting.
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

type StepKind = "drag" | "turn" | "nav";
interface Step {
  kind: StepKind;
  lead: string;
  accent: string;
  under: string;
}

const HAND = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-2.5-4a2 2 0 0 1 3.4-2L8 14" />
  </svg>
);

export default function TourTips({ touch, onDone }: { touch: boolean; onDone: () => void }) {
  // A phone can be turned; a desktop cannot, so that step would be nonsense there.
  const steps: Step[] = [
    { kind: "drag", lead: "Try It", accent: "Here Now", under: "Drag the Room to Look Around" },
    ...(touch ? [{ kind: "turn" as const, lead: "For the Full View", accent: "Turn Your Phone", under: "Wide Rooms Fill the Screen Sideways" }] : []),
    { kind: "nav", lead: "Move Through", accent: "the Tour", under: "Prev · Menu · Next, on Every Room" },
  ];

  const [i, setI] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [done, setDone] = useState(false); // they dragged it, both ways
  const step = steps[i];
  const last = i === steps.length - 1;

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    remember();
    window.setTimeout(onDone, 420);
  };

  // ── the strip you can actually drag ──
  const stripRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef(0);
  const coachRef = useRef<DragCoach | null>(null);
  useEffect(() => {
    const el = stripRef.current;
    if (!el || step.kind !== "drag") return;
    if (!coachRef.current) coachRef.current = createDragCoach(performance.now());
    let dragging = false;
    let lastX = 0;
    const paint = () => {
      el.style.backgroundPositionX = `${shiftRef.current}px`;
      const hand = el.querySelector(".tt-hand") as HTMLElement | null;
      if (hand) hand.style.transform = `translateX(${Math.max(-54, Math.min(54, shiftRef.current * 0.42))}px)`;
    };
    const down = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      el.setPointerCapture?.(e.pointerId);
      el.classList.add("tt-held");
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      shiftRef.current += e.clientX - lastX;
      lastX = e.clientX;
      paint();
      // Same rules as the player's coach, in the same pixels: forward, then back, and the
      // gesture is theirs (the client's "back and forth, so all learned", 2026-10-02).
      const v = coachRef.current!.update(shiftRef.current / DRIFT_PX, performance.now());
      if (v.step === "done") setDone(true);
    };
    const up = () => {
      dragging = false;
      el.classList.remove("tt-held");
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
  }, [step.kind]);

  return (
    <div className={`r3d-tips${leaving ? " tt-out" : ""}`} role="dialog" aria-label="Quick tour tips">
      <style>{CSS}</style>

      <div className="tt-body">
        <div className="tt-head">
          {step.lead} <b>{step.accent}</b>
        </div>

        {step.kind === "drag" && (
          <>
            <div className="tt-strip" ref={stripRef} aria-hidden>
              <span className="tt-pill">{done ? "That's It" : "Drag"}</span>
              <span className="tt-hand">{HAND}</span>
              <span className="tt-arrows">
                <i>‹‹</i> <em>DRAG</em> <i>››</i>
              </span>
            </div>
            <div className={`tt-under${done ? " tt-good" : ""}`}>{done ? "You've Got It" : step.under}</div>
          </>
        )}

        {step.kind === "turn" && (
          <>
            <div className="tt-stage" aria-hidden>
              <span className="tt-phone tt-turning" />
            </div>
            <div className="tt-under">{step.under}</div>
          </>
        )}

        {step.kind === "nav" && (
          <>
            <div className="tt-stage tt-nav" aria-hidden>
              <span className="tt-btn">‹ Prev</span>
              <span className="tt-btn">Menu</span>
              <span className="tt-btn tt-go">Next ›</span>
            </div>
            <div className="tt-under">{step.under}</div>
          </>
        )}
      </div>

      <div className="tt-foot">
        <button type="button" className="tt-next" onClick={() => (last ? close() : setI(i + 1))}>
          {last ? "Start the Tour" : "Next"}
        </button>
        <div className="tt-dots" aria-hidden>
          {steps.map((s, n) => (
            <span key={s.kind} className={n === i ? "on" : ""} />
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
  gap:clamp(22px,5vh,46px);padding:max(18px,env(safe-area-inset-top)) 18px max(18px,env(safe-area-inset-bottom));
  background:rgba(8,11,18,.93);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
  color:#eef2f8;font-family:inherit;text-align:center;animation:ttIn .4s ease both}
.r3d-tips.tt-out{animation:ttOut .4s ease both;pointer-events:none}
@keyframes ttIn{from{opacity:0}to{opacity:1}}
@keyframes ttOut{from{opacity:1}to{opacity:0}}

.tt-body{display:flex;flex-direction:column;align-items:center;gap:clamp(16px,3.4vh,26px);width:min(520px,92%)}
.tt-head{font-size:clamp(21px,5.4vmin,30px);font-weight:700;letter-spacing:-.02em;line-height:1.15}
.tt-head b{color:var(--r3d-primary);font-weight:700}
.tt-under{font-size:clamp(12.5px,3.1vmin,15px);font-weight:600;color:#9fb0c4;letter-spacing:.01em;transition:color .25s}
.tt-under.tt-good{color:var(--r3d-primary)}

/* The strip: a room reduced to its bands, so the drag is the whole idea and nothing else. */
.tt-strip{position:relative;width:min(420px,88vw);height:clamp(112px,20vh,168px);border-radius:18px;cursor:grab;touch-action:none;
  border:1px solid rgba(125,211,252,.22);overflow:hidden;
  background-image:repeating-linear-gradient(90deg,rgba(125,211,252,.05) 0 54px,rgba(125,211,252,.13) 54px 108px);
  background-size:216px 100%;box-shadow:0 0 60px -22px rgba(34,211,238,.6),inset 0 0 40px -18px rgba(34,211,238,.5)}
.tt-strip.tt-held{cursor:grabbing;border-color:rgba(125,211,252,.4)}
.tt-pill{position:absolute;left:12px;top:12px;padding:5px 12px;border-radius:999px;background:var(--r3d-primary);
  color:var(--r3d-accent-ink,#04121a);font-size:12px;font-weight:700;letter-spacing:.02em}
.tt-hand{position:absolute;left:50%;top:38%;margin-left:-16px;width:32px;height:32px;color:#fff;
  filter:drop-shadow(0 3px 10px rgba(0,0,0,.6));transition:transform .08s linear}
.tt-hand svg{width:100%;height:100%}
.tt-arrows{position:absolute;left:0;right:0;bottom:22%;display:flex;align-items:center;justify-content:center;gap:12px;
  color:var(--r3d-primary);font-size:13px;font-weight:700;letter-spacing:.22em}
.tt-arrows i{font-style:normal;font-size:17px;opacity:.9}
.tt-arrows em{font-style:normal;color:#dce6f1}

/* The other two steps are drawn, not photographed: they are about the device and the buttons. */
.tt-stage{display:grid;place-items:center;width:min(420px,88vw);height:clamp(112px,20vh,168px);border-radius:18px;
  border:1px solid rgba(125,211,252,.18);background:rgba(125,211,252,.05)}
.tt-phone{width:58px;height:104px;border-radius:12px;border:2px solid #dce6f1;position:relative;display:block}
.tt-phone::after{content:"";position:absolute;inset:7px;border-radius:5px;background:linear-gradient(160deg,rgba(34,211,238,.5),rgba(56,189,248,.18))}
.tt-turning{animation:ttTurn 2.8s ease-in-out infinite}
@keyframes ttTurn{0%,22%{transform:rotate(0)}48%,74%{transform:rotate(-90deg)}100%{transform:rotate(0)}}
.tt-nav{display:flex;gap:9px;align-items:center;justify-content:center;flex-wrap:wrap}
.tt-btn{padding:9px 15px;border-radius:12px;font-size:13px;font-weight:600;color:#e8edf4;
  background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14)}
.tt-btn.tt-go{background:var(--r3d-primary);color:var(--r3d-accent-ink,#04121a);border-color:transparent;font-weight:700}

.tt-foot{display:flex;flex-direction:column;align-items:center;gap:16px}
.tt-next{appearance:none;border:0;cursor:pointer;font-family:inherit;padding:13px 40px;border-radius:999px;
  background:var(--r3d-primary);color:var(--r3d-accent-ink,#04121a);font-size:15px;font-weight:700;letter-spacing:.02em;
  box-shadow:0 14px 34px -16px rgba(34,211,238,.8);transition:filter .2s,transform .12s}
.tt-next:hover{filter:brightness(1.07)}
.tt-next:active{transform:translateY(1px)}
.tt-dots{display:flex;align-items:center;gap:10px}
.tt-dots span{width:9px;height:9px;border-radius:50%;border:1.5px solid rgba(125,211,252,.45);transition:background .25s,box-shadow .25s}
.tt-dots span.on{background:var(--r3d-primary);border-color:var(--r3d-primary);box-shadow:0 0 12px rgba(34,211,238,.8)}
.tt-skip{position:absolute;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));
  appearance:none;cursor:pointer;font-family:inherit;padding:10px 18px;border-radius:999px;font-size:12.5px;font-weight:600;
  letter-spacing:.08em;text-transform:uppercase;color:#9fb0c4;background:transparent;border:1px solid rgba(255,255,255,.18)}
.tt-skip:hover{color:#eef2f8;border-color:rgba(255,255,255,.34)}

@media (prefers-reduced-motion:reduce){.tt-turning{animation:none}.r3d-tips,.r3d-tips.tt-out{animation-duration:.01s}}
`;
