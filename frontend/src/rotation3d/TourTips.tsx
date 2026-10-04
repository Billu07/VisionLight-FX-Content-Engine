import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The tips a visitor meets before their first tour drift.
 *
 * This is the client's own guide, ported — not a design of ours. They built it for drift.li (its
 * noscript fallback points at /tour/drift/45-birch-f7d4/main-area) and sent the HTML, so the beats,
 * the copy, the artwork, the easings and the millisecond timings are all theirs. Sources kept in
 * the scratchpad: zip.link/drift-tour-instructions (phone, five tips) and zip.link/drift-desktop
 * (desktop, three — no rotate-phone beats, a wider viewer).
 *
 * The shape: an intro that auto-advances, the tips, and an outro that hands over to the tour. Each
 * screen slides in from the right behind a cyan flash; the heading comes in word by word with the
 * accent words shimmering; Next appears a beat into each screen; the progress dots are clickable.
 * Tip one plays one automatic drag and then hands the pano to the visitor, its title moving from
 * "Drag To Look Around" to "Try It Here Now" to "You Got It".
 *
 * Ours only in the plumbing: it ends by calling `onDone()` instead of navigating to a tour URL, it
 * is shown once per browser (`drift-tips-seen`), and the whole sheet is scoped under `.r3d-tips`
 * so names as common as `.stage`, `.w` and `.skip` cannot touch the player around it.
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

type Word = { t: string; b?: boolean };

/** Their own timings, kept to the millisecond. */
const STAGE1_MS = 1850;
const ENTER_MS = 900;
const TRY_AT = 1340; // "Try It Here Now" lands before the hand finishes its loop
const HANDOVER_AT = 1840; // ...then the pano becomes the visitor's
const GOT_IT_AT = 250; // after they take hold

const words = (list: Word[], step = 0.09, from = 0.08) =>
  list.map((w, i) => (
    <span key={`${w.t}${i}`} className={`w${w.b ? " b" : ""}`} style={{ ["--d" as string]: `${(from + i * step).toFixed(2)}s` }}>
      {w.t}{" "}
    </span>
  ));

/** The hand that drags the pano. */
const HandCenter = () => (
  <svg className="handcenter" viewBox="0 0 24 24" fill="none" stroke="#a5f3fc" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 21V13L4.6 11.4a1.5 1.5 0 0 1 2.1-2.1L9 10.8V5.4a1.5 1.5 0 0 1 2.9 0V11" />
    <path d="M11.9 11V6.6a1.5 1.5 0 0 1 2.9 0v5" />
    <path d="M14.8 11.6V8a1.5 1.5 0 0 1 2.9 0v4.4" />
    <path d="M17.7 12.4v-2.2a1.4 1.4 0 0 1 2.8 0v3.4a6 6 0 0 1-6 6L7 21" />
  </svg>
);
const Chev = () => (
  <svg viewBox="0 0 26 18" fill="none" aria-hidden>
    <path d="M8 2 L2 9 L8 16 M18 2 L24 9 L18 16" stroke="#a5f3fc" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
/** The little hand inside the pan / tilt drawings. */
const HandGlyph = () => (
  <path
    d="M9 11.5V6.5a1.5 1.5 0 0 1 3 0v4m0-1.5a1.5 1.5 0 0 1 3 0v1.5m0 0a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.8a6 6 0 0 1-4.7-2.3L3.6 15a1.6 1.6 0 0 1 2.4-2.1L9 15.5"
    stroke="#baf3ff"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
  />
);

export default function TourTips({ touch, onDone }: { touch: boolean; onDone: () => void }) {
  // Their page sends a visitor who asked for less motion straight into the tour.
  const reduce = typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);

  const [title, setTitle] = useState<Word[] | null>(null); // null = the opening words
  const [titleHidden, setTitleHidden] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [cur, setCur] = useState(0);
  const [prev, setPrev] = useState(-1);
  const [flash, setFlash] = useState(0);

  const panoRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef(0);
  const dragRef = useRef<{ x: number; bg: number } | null>(null);
  const gotRef = useRef<number | null>(null);

  // Five tips on a phone, three on a desktop — the two files the client sent.
  const kinds = touch ? (["drag", "horiz", "vert", "pan", "tilt"] as const) : (["drag", "pan", "tilt"] as const);
  const N = kinds.length + 2; // the intro and the outro
  const NEXT_DELAY = touch ? [0, 1265, 1265, 1265, 265, 265] : [0, 1265, 265, 265];
  const BAND = touch ? 69 : 100; // how far the auto demo leaves the pano pushed

  const finish = useCallback(() => {
    remember();
    onDone();
  }, [onDone]);

  const go = useCallback((n: number) => {
    setPrev(n === 0 ? -1 : (p) => p);
    setCur((c) => {
      setPrev(c === n ? -1 : c);
      return n;
    });
    setShowNext(false);
    setInteractive(false);
    setTitle(null);
    setTitleHidden(false);
    bgRef.current = 0;
    dragRef.current = null;
    if (panoRef.current) panoRef.current.style.backgroundPosition = "";
    setFlash((f) => f + 1);
  }, []);

  useEffect(() => {
    if (reduce) finish();
  }, [reduce, finish]);

  const next = useCallback(() => (cur < N - 1 ? go(cur + 1) : finish()), [cur, N, go, finish]);

  // Every timer on a screen, exactly as their script sets them.
  useEffect(() => {
    if (reduce) return;
    const timers: number[] = [];
    if (cur === 0) {
      timers.push(window.setTimeout(() => go(1), STAGE1_MS));
    } else if (cur === N - 1) {
      timers.push(window.setTimeout(finish, ENTER_MS));
    } else {
      timers.push(window.setTimeout(() => setShowNext(true), NEXT_DELAY[cur] ?? 265));
    }
    if (cur === 1) {
      timers.push(window.setTimeout(() => setTitle([{ t: "Try" }, { t: "It" }, { t: "Here", b: true }, { t: "Now", b: true }]), TRY_AT));
      timers.push(
        window.setTimeout(() => {
          bgRef.current = -BAND;
          if (panoRef.current) panoRef.current.style.backgroundPosition = `0 0, ${-BAND}px 0`;
          setInteractive(true);
        }, HANDOVER_AT),
      );
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, reduce]);

  // The slide out only lasts a beat.
  useEffect(() => {
    if (prev < 0) return;
    const t = window.setTimeout(() => setPrev(-1), 600);
    return () => clearTimeout(t);
  }, [prev]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [finish, next]);

  useEffect(() => () => void (gotRef.current && clearTimeout(gotRef.current)), []);

  // ── the pano, once the demo hands it over ──
  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return;
    setTitleHidden(true);
    if (gotRef.current) clearTimeout(gotRef.current);
    gotRef.current = window.setTimeout(() => {
      setTitle([{ t: "You" }, { t: "Got", b: true }, { t: "It", b: true }]);
      setTitleHidden(false);
    }, GOT_IT_AT);
    dragRef.current = { x: e.clientX, bg: bgRef.current };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    bgRef.current = dragRef.current.bg + (e.clientX - dragRef.current.x);
    if (panoRef.current) panoRef.current.style.backgroundPosition = `0 0, ${bgRef.current}px 0`;
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  if (reduce) return null;

  const tipIndex = cur - 1;
  const outro = cur === N - 1;

  /** Next, the progress rail and the tick — their script moves this block into the live screen. */
  const Ctl = (
    <div className={`ctl${outro ? " outro" : ""}`} style={{ display: cur === 0 ? "none" : "flex" }}>
      {!outro && (
        <button type="button" className={`nextbtn${showNext ? " show" : ""}`} onClick={next}>
          {cur === N - 2 ? "Enter Tour" : "Next"}
        </button>
      )}
      {!outro && (
        <div className="stepper show">
          {kinds.map((k, i) => (
            <span className="srow" key={k}>
              {i > 0 && <span className={`sline${i <= tipIndex ? " done" : ""}`} />}
              <span
                className={`sdot${i < tipIndex ? " done" : i === tipIndex ? " now" : ""}`}
                onClick={() => go(i + 1)}
                role="button"
                tabIndex={-1}
                aria-label={`Tip ${i + 1}`}
              />
            </span>
          ))}
        </div>
      )}
      {outro && (
        <div className="donecheck show" aria-hidden>
          <svg viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="24" />
            <path d="M15 27l8 8 15-16" />
          </svg>
        </div>
      )}
    </div>
  );

  const screens: React.ReactNode[] = [];
  const stage = (body: React.ReactNode) => {
    const n = screens.length;
    screens.push(
      <section className={`stage${n === cur ? " on" : ""}${n === prev && prev !== cur ? " leaving" : ""}`} key={n}>
        {body}
        {n === cur && Ctl}
      </section>,
    );
  };

  // beat 1 — quick tour tips
  stage(
    <>
      <div className="t2">{words([{ t: "Quick" }, { t: "Tour" }, { t: "Tips", b: true }], 0.1, 0.1)}</div>
      <div className="turn180">
        <svg viewBox="0 0 200 130" fill="none" aria-hidden>
          <defs>
            <path id="tt-arc180" d="M 30 112 A 70 70 0 0 1 170 112" />
          </defs>
          <use href="#tt-arc180" stroke="#22d3ee" strokeWidth={3} strokeDasharray="6 8" opacity=".5" />
          <circle r="6" fill="#a5f3fc">
            <animateMotion dur="2.6s" repeatCount="indefinite" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear">
              <mpath href="#tt-arc180" />
            </animateMotion>
          </circle>
          <g className="phoneflip">
            <rect x="72" y="70" width="56" height="28" rx="7" stroke="#a5f3fc" strokeWidth={3} fill="rgba(34,211,238,.08)" />
            <circle cx="120" cy="84" r="2.5" fill="#a5f3fc" />
          </g>
        </svg>
      </div>
    </>,
  );

  for (const kind of kinds) {
    if (kind === "drag") {
      stage(
        <>
          <div className="t2 dragtitle" style={titleHidden ? { opacity: 0, visibility: "hidden", transition: "opacity .35s ease" } : undefined}>
            {title ? words(title, 0.09, 0.08) : words([{ t: "Drag" }, { t: "To" }, { t: "Look", b: true }, { t: "Around", b: true }], 0.1, 0.1)}
          </div>
          <div
            className={`viewer${interactive ? " interactive" : ""}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <div className="badge180">180&deg;</div>
            <div className="pano" ref={panoRef} />
            <HandCenter />
            <div className="draghint">
              <div className="dragrow">
                <Chev />
                <span>Drag</span>
                <Chev />
              </div>
            </div>
          </div>
        </>,
      );
    } else if (kind === "horiz" || kind === "vert") {
      const back = kind === "vert";
      stage(
        <>
          <div className="t2">
            {words(back ? [{ t: "For" }, { t: "Vertical" }, { t: "Views" }] : [{ t: "For" }, { t: "Horizontal" }, { t: "Views" }], 0.08, 0.05)}
            <br />
            {words(
              back
                ? [{ t: "Rotate", b: true }, { t: "Phone", b: true }, { t: "Back", b: true }]
                : [{ t: "Rotate", b: true }, { t: "Phone", b: true }],
              0.1,
              0.45,
            )}
          </div>
          <div className="rotphone">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <g className={back ? "tiltback" : "tilt"}>
                {back ? (
                  <>
                    <path d="M 102 60 A 42 42 0 0 0 18 60" stroke="#22d3ee" strokeWidth={3.5} strokeLinecap="round" fill="none" opacity=".85" />
                    <path d="M10 58 L26 58 L18 70 Z" fill="#22d3ee" />
                  </>
                ) : (
                  <>
                    <path d="M 18 60 A 42 42 0 0 1 102 60" stroke="#22d3ee" strokeWidth={3.5} strokeLinecap="round" fill="none" opacity=".85" />
                    <path d="M94 56 L110 56 L102 68 Z" fill="#22d3ee" />
                  </>
                )}
                <rect x="48" y="34" width="24" height="52" rx="6" stroke="#a5f3fc" strokeWidth={3} />
                <circle cx="60" cy="78" r="2.5" fill="#a5f3fc" />
              </g>
            </svg>
          </div>
        </>,
      );
    } else if (kind === "pan") {
      stage(
        <>
          <div className="t2">
            {words([{ t: "Some" }, { t: "Views" }], 0.08, 0.05)}
            <br />
            {words([{ t: "Pan", b: true }, { t: "Left", b: true }, { t: "Right", b: true }], 0.08, 0.35)}
          </div>
          <div className="pananim">
            <svg viewBox="0 0 120 90" fill="none" aria-hidden>
              <rect x="34" y="14" width="52" height="24" rx="6" stroke="#a5f3fc" strokeWidth={3} />
              <circle cx="78" cy="26" r="2.5" fill="#a5f3fc" />
              <g className="lrslide">
                <path d="M28 66 H92" stroke="#22d3ee" strokeWidth={3.5} strokeLinecap="round" />
                <path d="M28 66 l11 -7 v14 Z" fill="#22d3ee" />
                <path d="M92 66 l-11 -7 v14 Z" fill="#22d3ee" />
                <g transform="translate(50.4,43) scale(0.8)">
                  <HandGlyph />
                </g>
              </g>
            </svg>
          </div>
        </>,
      );
    } else {
      stage(
        <>
          <div className="t2">
            {words([{ t: "Some" }, { t: "Views" }], 0.08, 0.05)}
            <br />
            {words([{ t: "Tilt", b: true }, { t: "Up", b: true }, { t: "Down", b: true }], 0.08, 0.35)}
          </div>
          <div className="tiltanim">
            <svg viewBox="0 0 120 120" fill="none" aria-hidden>
              <rect x="48" y="12" width="24" height="52" rx="6" stroke="#a5f3fc" strokeWidth={3} />
              <circle cx="60" cy="56" r="2.5" fill="#a5f3fc" />
              <g className="udslide">
                <path d="M60 76 V104" stroke="#22d3ee" strokeWidth={3.5} strokeLinecap="round" />
                <path d="M60 76 l-7 11 h14 Z" fill="#22d3ee" />
                <path d="M60 104 l-7 -11 h14 Z" fill="#22d3ee" />
                <g transform="translate(74,79) scale(1.05)">
                  <HandGlyph />
                </g>
              </g>
            </svg>
          </div>
        </>,
      );
    }
  }

  // the last beat — entering tour now
  stage(<div className="t2">{words([{ t: "Entering" }, { t: "Tour" }, { t: "Now", b: true }], 0.07, 0.05)}</div>);

  return (
    <div className={`r3d-tips${touch ? "" : " tt-dk"}`} role="dialog" aria-label="Quick tour tips">
      <style>{CSS}</style>
      <div className="flash go" key={flash} />
      <button type="button" className={`skip${cur === 0 ? "" : " show"}`} onClick={finish}>
        Skip Tips
      </button>
      <div className="stagewrap">{screens}</div>
    </div>
  );
}

/* The client's own stylesheet, scoped under .r3d-tips and with the keyframes renamed so nothing
   here can reach the player around it. The values are theirs. */
const CSS = `
.r3d-tips{position:absolute;inset:0;z-index:40;overflow:hidden;
  background:radial-gradient(ellipse 90% 70% at 50% 42%,#0e1626 0%,#0b0f19 62%,#070b13 100%);
  color:#f2f7ff;-webkit-font-smoothing:antialiased;font-family:inherit}
.r3d-tips *{box-sizing:border-box;margin:0;padding:0}
.r3d-tips .stagewrap{position:relative;width:100%;height:100%}
.r3d-tips .ctl{position:absolute;top:calc(50% + clamp(130px,24%,190px));left:0;right:0;
  display:flex;flex-direction:column;align-items:center;gap:14px}
.r3d-tips .ctl.outro{top:calc(50% + clamp(36px,8%,64px))}

.r3d-tips .stepper{display:flex;align-items:center;z-index:60;opacity:0;transition:opacity .45s ease}
.r3d-tips .stepper.show{opacity:1}
.r3d-tips .srow{display:flex;align-items:center}
.r3d-tips .sdot{width:12px;height:12px;border-radius:50%;border:2px solid rgba(34,211,238,.4);
  background:transparent;transition:all .3s ease;cursor:pointer;position:relative}
.r3d-tips .sdot::after{content:'';position:absolute;inset:-8px}
.r3d-tips .sdot.done{background:#22d3ee;border-color:#22d3ee;box-shadow:0 0 10px rgba(34,211,238,.7)}
.r3d-tips .sdot.now{border-color:#22d3ee;box-shadow:0 0 10px rgba(34,211,238,.8);transform:scale(1.3)}
.r3d-tips .sline{width:44px;height:2px;background:rgba(34,211,238,.25);transition:background .3s ease}
.r3d-tips .sline.done{background:#22d3ee;box-shadow:0 0 8px rgba(34,211,238,.6)}
.r3d-tips .donecheck{line-height:0;opacity:0;transition:opacity .45s ease}
.r3d-tips .donecheck.show{opacity:1}
.r3d-tips .donecheck svg{width:36px;height:36px;filter:drop-shadow(0 0 8px rgba(34,211,238,.6))}
.r3d-tips .donecheck circle{fill:rgba(34,211,238,.08);stroke:#22d3ee;stroke-width:2.5;stroke-dasharray:151;stroke-dashoffset:151}
.r3d-tips .donecheck path{fill:none;stroke:#22d3ee;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;
  stroke-dasharray:36;stroke-dashoffset:36}
.r3d-tips .donecheck.show svg{animation:ttPop .45s ease}
.r3d-tips .donecheck.show circle{animation:ttDraw .5s ease forwards}
.r3d-tips .donecheck.show path{animation:ttDraw .35s .35s ease forwards}
@keyframes ttDraw{to{stroke-dashoffset:0}}
@keyframes ttPop{0%{transform:scale(.5)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
.r3d-tips .nextbtn{z-index:55;font-family:inherit;font-size:.85rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:#062a33;background:#22d3ee;border:none;padding:12px 34px;border-radius:99px;cursor:pointer;
  box-shadow:0 0 18px rgba(34,211,238,.45);opacity:0;pointer-events:none;transition:opacity .4s ease}
.r3d-tips .nextbtn.show{opacity:1;pointer-events:auto}
.r3d-tips .nextbtn:active{transform:scale(.96)}

.r3d-tips .flash{position:absolute;inset:0;z-index:35;pointer-events:none;opacity:0;
  background:radial-gradient(ellipse 62% 46% at 50% 50%,rgba(165,243,252,.85) 0%,rgba(34,211,238,.28) 52%,rgba(0,0,0,0) 76%)}
.r3d-tips .flash.go{animation:ttFlash .7s ease-out}
@keyframes ttFlash{0%{opacity:0}22%{opacity:1}100%{opacity:0}}

.r3d-tips .stage{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:24px;text-align:center;opacity:0;pointer-events:none;z-index:10;transform:translateX(100%);
  transition:opacity .53s ease,transform .53s cubic-bezier(.3,.7,.3,1)}
.r3d-tips .stage.on{opacity:1;pointer-events:auto;z-index:20;transform:translateX(0)}
.r3d-tips .stage.leaving{opacity:0;transform:translateX(-100%);z-index:15}
.r3d-tips .stage.leaving .w{animation:none;opacity:1;transform:none}
.r3d-tips .stage.leaving .turn180 .phoneflip{animation:none;opacity:1}
.r3d-tips .stage.on .dragtitle,.r3d-tips .stage.on .viewer{transform:translateY(-40px)}

.r3d-tips .pananim{margin-top:4px;width:min(150px,40vw)}
.r3d-tips .pananim svg{display:block;width:100%;height:auto;filter:drop-shadow(0 0 14px rgba(34,211,238,.4))}
.r3d-tips .stage.on .pananim .lrslide{animation:ttLr 2.2s ease-in-out infinite}
@keyframes ttLr{0%,100%{transform:translateX(-8px)}50%{transform:translateX(8px)}}
.r3d-tips .tiltanim{margin-top:4px;width:min(130px,36vw)}
.r3d-tips .tiltanim svg{display:block;width:100%;height:auto;filter:drop-shadow(0 0 14px rgba(34,211,238,.4))}
.r3d-tips .stage.on .tiltanim .udslide{animation:ttUd 2.2s ease-in-out infinite}
@keyframes ttUd{0%,100%{transform:translateY(-7px)}50%{transform:translateY(7px)}}

.r3d-tips .w{display:inline-block;opacity:0;transform:translateY(14px);white-space:pre}
.r3d-tips .stage.on .w{animation:ttWordIn .55s cubic-bezier(.2,.7,.3,1) var(--d,0s) forwards}
@keyframes ttWordIn{to{opacity:1;transform:none}}
.r3d-tips .t2{font-size:clamp(1.5rem,6.6vw,2.3rem);font-weight:800;letter-spacing:-0.015em;line-height:1.35;
  text-shadow:0 0 26px rgba(34,211,238,.45)}
.r3d-tips .t2 .b{background:linear-gradient(110deg,#67e8f9 20%,#ffffff 50%,#67e8f9 80%);background-size:220% 100%;
  -webkit-background-clip:text;background-clip:text;color:transparent;
  text-shadow:0 0 12px rgba(34,211,238,.75),0 0 34px rgba(34,211,238,.3)}
.r3d-tips .stage.on .w.b{animation:ttWordIn .55s cubic-bezier(.2,.7,.3,1) var(--d,0s) forwards,ttShimmer 2.2s linear infinite}
@keyframes ttShimmer{to{background-position:-220% 0}}

.r3d-tips .skip{position:absolute;bottom:30px;right:14px;z-index:55;font-family:inherit;font-size:.8rem;font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;color:#d9f6fd;text-decoration:none;cursor:pointer;
  background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.45);padding:10px 20px;border-radius:99px;
  opacity:0;pointer-events:none;transition:opacity .45s ease}
.r3d-tips .skip.show{opacity:1;pointer-events:auto}
.r3d-tips .skip:hover{background:rgba(34,211,238,.22)}

.r3d-tips .viewer{margin-top:4px;width:min(520px,88vw);border-radius:18px;overflow:hidden;position:relative;
  border:1px solid rgba(34,211,238,.35);box-shadow:0 0 44px rgba(34,211,238,.22)}
.r3d-tips .pano{height:clamp(140px,32vw,200px);
  background:linear-gradient(180deg,rgba(34,211,238,.10) 0%,transparent 30%),
    repeating-linear-gradient(90deg,#123043 0 60px,#16405a 60px 110px,#0f2a3d 110px 170px,#1a4a63 170px 210px,#123043 210px 280px);
  background-size:100% 100%,560px 100%}
.r3d-tips .stage.on .pano{animation:ttPanDrag 1.84s ease-in-out infinite}
@keyframes ttPanDrag{0%,100%{background-position:0 0,-69px 0}50%{background-position:0 0,69px 0}}
.r3d-tips .badge180{position:absolute;top:12px;left:12px;font-size:.72rem;font-weight:800;letter-spacing:.14em;
  color:#062a33;background:#22d3ee;border-radius:99px;padding:5px 12px}
.r3d-tips .draghint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;align-items:center;
  color:#a5f3fc;font-weight:800;font-size:.8rem;letter-spacing:.2em;text-transform:uppercase;text-shadow:0 2px 10px rgba(0,0,0,.7)}
.r3d-tips .dragrow{display:flex;align-items:center;gap:14px}
.r3d-tips .dragrow svg{width:26px;height:18px}
.r3d-tips .stage.on .draghint{animation:ttDragHint 1.84s ease-in-out infinite}
.r3d-tips .handcenter{position:absolute;left:50%;top:50%;width:46px;height:46px;transform:translate(-50%,-50%);
  filter:drop-shadow(0 3px 12px rgba(0,0,0,.65));opacity:0}
.r3d-tips .stage.on .handcenter{opacity:1;animation:ttHandSlide 1.84s ease-in-out infinite}
@keyframes ttHandSlide{0%,100%{transform:translate(-200%,-50%)}50%{transform:translate(100%,-50%)}}
@keyframes ttDragHint{0%,100%{transform:translateX(-62%)}50%{transform:translateX(-38%)}}
.r3d-tips .viewer.interactive{cursor:grab;touch-action:none}
.r3d-tips .viewer.interactive .pano{animation:none}

.r3d-tips .turn180{margin-top:12px;width:min(220px,60vw);perspective:500px}
.r3d-tips .turn180 svg{display:block;width:100%;height:auto;filter:drop-shadow(0 0 12px rgba(34,211,238,.35))}
.r3d-tips .turn180 .phoneflip{transform-box:fill-box;transform-origin:center;opacity:0}
.r3d-tips .stage.on .turn180 .phoneflip{opacity:1;animation:ttSway180 3s ease-in-out infinite}
@keyframes ttSway180{0%,100%{transform:rotateY(-68deg)}50%{transform:rotateY(68deg)}}

.r3d-tips .rotphone{margin-top:4px;width:min(150px,40vw);opacity:0}
.r3d-tips .stage.on .rotphone{opacity:1}
.r3d-tips .rotphone svg{display:block;width:100%;height:auto;filter:drop-shadow(0 0 14px rgba(34,211,238,.4))}
.r3d-tips .rotphone .tilt{transform-box:view-box;transform-origin:60px 60px}
.r3d-tips .stage.on .rotphone .tilt{animation:ttTilt 1.38s cubic-bezier(.65,0,.35,1) .645s both}
@keyframes ttTilt{from{transform:rotate(0deg)}to{transform:rotate(90deg)}}
.r3d-tips .rotphone .tiltback{transform-box:view-box;transform-origin:60px 60px}
.r3d-tips .stage.on .rotphone .tiltback{animation:ttTiltBack 1.38s cubic-bezier(.65,0,.35,1) .645s both}
@keyframes ttTiltBack{from{transform:rotate(90deg)}to{transform:rotate(0deg)}}

/* the desktop file: a wider viewer and a longer band, everything else the same */
.r3d-tips.tt-dk .viewer{width:min(640px,88vw)}
.r3d-tips.tt-dk .pano{height:140px;background-size:100% 100%,840px 100%}
.r3d-tips.tt-dk .stage.on .pano{animation:ttPanDragDk 1.84s ease-in-out infinite}
@keyframes ttPanDragDk{0%,100%{background-position:0 0,-100px 0}50%{background-position:0 0,100px 0}}
`;
