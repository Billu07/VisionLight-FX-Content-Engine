import { useEffect, useId, useRef, useState } from "react";

/**
 * The guide film that sits directly under the hero on drift.li and on /tour (client,
 * 2026-10-15). One component for both pages: they speak different class dialects
 * (`dh-*` on the home, `tl-*` on /tour) but share the design tokens, so this carries its
 * own `.gv-*` sheet and reads as native under either shell.
 *
 * **Why it plays by itself.** The four films the client sent are 13–16 seconds of real
 * footage carrying their own burned-in captions ("Take a Video" → … → "Live Interactive"),
 * and their audio is digital silence (-91 dB, measured). A film that short, that quiet and
 * that self-explaining is a product loop, not a lecture: putting a play button in front of
 * it asks for a decision before it has said anything. So it plays muted, loops, and is
 * pausable — the arrangement every browser permits without a gesture, precisely because
 * there is no sound to intrude.
 *
 * **It plays once and rests on its own end card.** Both films close on the drift.li mark over
 * black — they are finished pieces, not loops, and looping one cut from that logo back to the
 * opening sunset every fifteen seconds (the first and last frames share almost nothing: SSIM
 * 0.014). So `loop` is off and the control becomes Replay when it ends.
 *
 * **It starts with the page.** There is NO viewport gating here, and that
 * is a decision, not an omission: the first version played it on an IntersectionObserver and
 * paused it whenever the frame fell below a quarter visible. Scrolling anywhere near it then
 * stopped and restarted playback, which the client reported as the film "pausing every
 * second" and as loading slowly — both were that. A fifteen-second silent loop is cheaper
 * than the stuttering was. Do not reintroduce it.
 *
 * The rest:
 *
 * - **The poster is the film's own frame 0**, so the still and the first frame of playback
 *   are the same picture and nothing jumps when it starts.
 * - **The frame takes the film's own shape**, read off `videoWidth/videoHeight` rather than
 *   assumed, so the portrait mobile cut and the wide desktop one are both drawn whole.
 * - **A missing file removes the section** rather than leaving a broken player under the
 *   hero.
 *
 * **Where it does NOT play by itself**: `prefers-reduced-motion`, the browser's data-saver
 * flag and a 2G `effectiveType` each hold it on its poster behind a play button, and keep
 * `preload` at "metadata" so nothing but the header is fetched until someone asks. And
 * because motion that starts on its own and runs past five seconds has to be stoppable
 * (WCAG 2.2.2), the pause control is always present — quiet at rest, full on hover or
 * focus, and always visible on a touch screen.
 */

export type GuideSource = {
  /** The H.264 mp4: the universal fallback, and what Safari plays. */
  src: string;
  /** AV1 in a WebM container — a better picture than the mp4 at 43% of its bytes, where taken. */
  webm?: string;
  /** The film's own frame 0. */
  poster?: string;
};

type Props = {
  kicker: string;
  title: string;
  lead?: string;
  /** The wide cut, and the one a phone gets. Without `mobile`, every device plays `desktop`. */
  desktop: GuideSource;
  mobile?: GuideSource;
  /** Names the film for a screen reader. */
  label?: string;
  className?: string;
};

const PHONE = "(max-width: 820px)";

const useMedia = (query: string) => {
  const [on, setOn] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const read = () => setOn(mq.matches);
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, [query]);
  return on;
};

/**
 * Someone who has ASKED for less data gets the poster and a play button. That is `saveData`
 * and the two 2G classes, and nothing else.
 *
 * It briefly also held a link Chrome reports as `"3g"`, which looked reasonable and was not:
 * `effectiveType` is a round-trip-time estimate as much as a throughput one, so a distant
 * server, a VPN or simply the first navigation of a session reports "3g" on connections that
 * are nothing of the sort — and the film then sat on its poster and never played, which is
 * what the client hit. A browser already knows how to buffer a slow link; second-guessing it
 * from a coarse hint costs more than it saves.
 */
const SPARING_LINKS = ["slow-2g", "2g"];
const sparing = () => {
  try {
    const c = (navigator as any)?.connection;
    return c?.saveData === true || SPARING_LINKS.includes(c?.effectiveType);
  } catch {
    return false;
  }
};

export const GUIDE_VIDEO_STYLES = `
.gv{margin-top:clamp(30px,5vw,56px)}
.gv-head{display:grid;justify-items:center;text-align:center;gap:6px;margin-bottom:clamp(18px,2.6vw,28px)}
.gv-kicker{display:inline-flex;align-items:center;gap:12px;font-size:12px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:var(--accent)}
.gv-kicker::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px var(--accent-soft)}
.gv-h2{margin:12px 0 0;font-size:clamp(27px,4vw,44px);line-height:1.06;letter-spacing:-.035em;font-weight:800;color:var(--text)}
.gv-lead{margin:12px 0 0;font-size:clamp(15px,1.7vw,17.5px);line-height:1.55;color:var(--muted);max-width:48ch}

/* The frame takes the film's own shape (--gv-ar), set when the metadata lands. The portrait
   cut is held to a column a phone-shaped film can fill without taking over a desktop page. */
.gv-frame{position:relative;margin:0 auto;width:100%;max-width:var(--gv-max,1080px);aspect-ratio:var(--gv-ar,16/9);
  border-radius:clamp(16px,2vw,24px);overflow:hidden;background:var(--bg-soft,#0b1016);border:1px solid var(--border);box-shadow:var(--shadow-sm)}
.gv-frame.tall{max-width:min(420px,92vw)}
.drift-ui[data-theme="dark"] .gv-frame{border-color:color-mix(in srgb,var(--accent) 26%,transparent);
  box-shadow:0 40px 90px -42px rgba(0,0,0,.85), 0 0 90px -46px color-mix(in srgb,var(--accent) 70%,transparent)}
/* the inset hairline every glass surface on these pages carries */
.gv-frame::after{content:"";position:absolute;inset:0;z-index:4;pointer-events:none;border-radius:inherit;box-shadow:inset 0 1px 0 color-mix(in srgb,#fff 11%,transparent)}
.gv-video{display:block;width:100%;height:100%;object-fit:cover;background:var(--bg-soft,#0b1016)}

/* The loop's progress: a hairline along the bottom that says this comes round again. */
.gv-rail{position:absolute;left:0;right:0;bottom:0;z-index:3;height:2px;background:rgba(255,255,255,.14)}
.gv-rail i{display:block;height:100%;width:100%;transform-origin:0 50%;transform:scaleX(0);background:var(--accent);box-shadow:0 0 12px color-mix(in srgb,var(--accent) 70%,transparent)}

/* Pause / play. Always present, because motion that starts on its own and runs past five
   seconds has to be stoppable by anyone who wants it stopped (WCAG 2.2.2) — a control that
   only exists on hover is a control a trackpad user has to go hunting for. It sits quiet
   until the frame is hovered or it takes focus. */
.gv-toggle{position:absolute;right:clamp(10px,1.4vw,16px);bottom:clamp(12px,1.6vw,18px);z-index:4;
  width:40px;height:40px;border-radius:50%;display:grid;place-items:center;cursor:pointer;
  color:#fff;background:rgba(8,14,22,.5);border:1px solid rgba(255,255,255,.22);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  opacity:.5;transition:opacity .22s,background .18s,transform .18s}
.gv-frame:hover .gv-toggle,.gv-toggle:focus-visible,.gv-frame.held .gv-toggle{opacity:1}
.gv-toggle:hover{background:rgba(8,14,22,.72);transform:scale(1.06)}
.gv-toggle:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(hover:none){.gv-toggle{opacity:.85}}

/* Held on its poster (reduced motion, data saver, or paused before it ever ran): the whole
   frame offers to start it, the way a film that is not already moving should. */
.gv-start{position:absolute;inset:0;z-index:4;appearance:none;border:0;margin:0;padding:0;cursor:pointer;display:grid;place-items:center;
  background:linear-gradient(to top,rgba(4,8,16,.6),rgba(4,8,16,.12) 45%,rgba(4,8,16,.22));transition:background .2s}
.gv-start:hover{background:linear-gradient(to top,rgba(4,8,16,.66),rgba(4,8,16,.08) 45%,rgba(4,8,16,.18))}
.gv-start:focus-visible{outline:3px solid var(--accent);outline-offset:-6px}
.gv-start span{width:clamp(58px,8vw,78px);height:clamp(58px,8vw,78px);border-radius:50%;display:grid;place-items:center;
  background:var(--accent);color:var(--accent-ink,#04121a);box-shadow:0 18px 40px -16px color-mix(in srgb,var(--accent) 80%,transparent);transition:transform .22s}
.gv-start span svg{margin-left:4px}
.gv-start:hover span{transform:scale(1.06)}

@media(prefers-reduced-motion:reduce){
  .gv-start:hover span,.gv-toggle:hover{transform:none}
  .gv-rail i{transition:none}
}
`;

const PlayGlyph = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14z" />
  </svg>
);

const ReplayGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 12a9 9 0 1 0 2.64-6.36" />
    <path d="M3 4.5V10h5.5" />
  </svg>
);

const PauseGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="6" y="4.5" width="4.4" height="15" rx="1.4" />
    <rect x="13.6" y="4.5" width="4.4" height="15" rx="1.4" />
  </svg>
);

export default function GuideVideo({ kicker, title, lead, desktop, mobile, label = "How it works", className = "" }: Props) {
  const phone = useMedia(PHONE);
  const still = useMedia("(prefers-reduced-motion: reduce)");
  const headingId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const lastSrc = useRef<string | null>(null);
  const [gone, setGone] = useState(false);
  const [ratio, setRatio] = useState<string | undefined>();
  const [tall, setTall] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  // Held = waiting on a person: reduced motion, a sparing connection, or they pressed pause.
  // Nothing else ever pauses this film — see the note on the element below.
  const [held, setHeld] = useState(() => still || sparing());

  const pick = (phone && mobile) || desktop;

  // The film's own shape, and whether it is a portrait cut. Read from the ELEMENT rather
  // than waited for: with `preload="metadata"` the header can be in before React finishes
  // attaching a handler — media events do not bubble, so they are bound on the node during
  // commit, and a file already in cache (or on a fast local disk) can beat that. The event
  // then never arrives to be heard, and the frame keeps the 16:9 it started with — which is
  // invisible on the wide cut, whose shape that already is, and wrong on every portrait one
  // (caught in the probe: a 900x1600 film drawn 379x213).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const read = () => {
      if (!v.videoWidth || !v.videoHeight) return;
      setRatio(`${v.videoWidth}/${v.videoHeight}`);
      setTall(v.videoHeight > v.videoWidth);
    };
    const fail = () => setGone(true);
    // A new source is a new film: its shape belongs to it, not to the one before.
    setRatio(undefined);
    setTall(false);
    // The film is chosen by <source> children now, and swapping those does NOTHING on its own
    // — the element has to be told to run resource selection again, or a window dragged across
    // the 820px line keeps playing the cut it started with. Only on a real change: load() on
    // mount would throw away the fetch the browser has already begun.
    if (lastSrc.current && lastSrc.current !== pick.src) v.load();
    lastSrc.current = pick.src;
    read(); // already known?
    v.addEventListener("loadedmetadata", read);
    v.addEventListener("error", fail);
    return () => {
      v.removeEventListener("loadedmetadata", read);
      v.removeEventListener("error", fail);
    };
  }, [pick.src]);

  // Autoplay is a REQUEST, and on a phone it is one the browser can refuse. The `autoplay`
  // attribute gets exactly one attempt at the moment the element is ready; if that attempt is
  // turned down — and mobile Safari and Chrome turn it down more readily, especially the first
  // one of a page session — nothing ever asks again and the film sits on its poster for good.
  // That is what "should autoplay on mobile as well" was (client, 2026-10-16).
  //
  // So ask here too, and ask again each time the film becomes playable. `play()` on something
  // already playing is a no-op, so the repeats cost nothing.
  //
  // `muted` is set on the NODE first, every time: React sets it as a property and never writes
  // the attribute, and an unmuted film is refused everywhere. Setting it immediately before the
  // request removes any question of ordering between the two.
  //
  // This is not the viewport gating coming back — nothing here looks at where the frame is.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || held) return; // held = they asked for it to wait; don't fight that
    const go = () => {
      v.muted = true;
      void v.play().catch((err: unknown) => {
        // Only a refusal puts the big play button up. An AbortError is just load() or a
        // source swap interrupting the request, and the next `canplay` will try again.
        if ((err as { name?: string })?.name === "NotAllowedError") setHeld(true);
      });
    };
    go();
    v.addEventListener("loadeddata", go);
    v.addEventListener("canplay", go);
    return () => {
      v.removeEventListener("loadeddata", go);
      v.removeEventListener("canplay", go);
    };
  }, [pick.src, held]);

  // The loop's hairline. Driven by rAF only while it is actually running, so a paused or
  // off-screen film costs nothing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const step = () => {
      const v = videoRef.current;
      const rail = railRef.current;
      if (v && rail && v.duration > 0) rail.style.transform = `scaleX(${v.currentTime / v.duration})`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const replay = () => {
    const v = videoRef.current;
    if (!v) return;
    setEnded(false);
    setHeld(false);
    v.currentTime = 0;
    void v.play().catch(() => undefined);
  };

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      setHeld(false);
      if (v.preload !== "auto") v.preload = "auto"; // held until now: fetch the rest
      void v.play().catch(() => undefined);
    } else {
      setHeld(true);
      v.pause();
    }
  };

  if (gone) return null;

  return (
    <section className={`gv ${className}`} aria-labelledby={headingId}>
      <div className="gv-head">
        <div className="gv-kicker">{kicker}</div>
        <h2 className="gv-h2" id={headingId}>
          {title}
        </h2>
        {lead && <p className="gv-lead">{lead}</p>}
      </div>
      <div
        ref={frameRef}
        className={`gv-frame ${tall ? "tall" : ""} ${held && !playing ? "held" : ""}`}
        style={ratio ? ({ "--gv-ar": ratio } as React.CSSProperties) : undefined}
      >
        {/*
          NOT looped. Both films close on the drift.li brand card over black, so they are
          finished pieces, not loops: looping one cuts from that logo straight back to the
          opening sunset every fifteen seconds. Measured, the first and last frames share
          almost nothing (SSIM 0.014 and 0.0006), which is what that cut looks like
          numerically. It plays once, rests on the brand card, and offers Replay.

          It autoplays. There is deliberately NO viewport gating here: an
          earlier pass played it on an IntersectionObserver and paused it whenever the frame
          fell below a quarter visible, which meant scrolling anywhere near it stopped and
          restarted playback — reported by the client as the film "pausing every second", and
          it was. A fifteen-second silent loop costs less than the stuttering did. The only
          things that stop it are the pause button, and a visitor who asked for less motion or
          less data (`held`), who also gets `preload="metadata"` so nothing but the header is
          fetched until they press play.
        */}
        <video
          ref={videoRef}
          className="gv-video"
          poster={pick.poster}
          preload={held ? "metadata" : "auto"}
          autoPlay={!held}
          muted
          playsInline
          aria-label={label}
          onPlay={() => {
            setPlaying(true);
            setEnded(false);
          }}
          onPause={() => setPlaying(false)}
          onEnded={() => setEnded(true)}
        >
          {/*
            AV1 first, in a WebM container. Measured against the master with VMAF — the metric
            the streaming industry actually tunes against, and the one that does not punish a
            modern codec for the perceptual smoothing it does on purpose — AV1 CRF 32 scores
            94.73 where the H.264 CRF 23 beneath it scores 94.35, at 43% of the bytes. Better
            picture, less than half the weight, which is the whole reason this is here.

            The container is the fallback mechanism, and deliberately so: Safari's AV1 support
            is MP4-only, so `type="video/webm"` makes it skip this source without fetching a
            byte and take the mp4 — no guessing at an `av01.0.08M.08` codec string that, got
            wrong, either hides a playable source or hands over an unplayable one.

            (VP9 was measured twice and lost both times — 82 VMAF even two-pass. Don't retry it.)
          */}
          {pick.webm && <source src={pick.webm} type="video/webm" />}
          <source src={pick.src} type="video/mp4" />
        </video>
        <div className="gv-rail" aria-hidden>
          <i ref={railRef as React.RefObject<HTMLElement>} />
        </div>
        {ended || (held && !playing) ? (
          <button
            type="button"
            className="gv-start"
            onClick={ended ? replay : toggle}
            aria-label={`${ended ? "Replay" : "Play"}: ${label}`}
          >
            <span aria-hidden>{ended ? <ReplayGlyph /> : <PlayGlyph />}</span>
          </button>
        ) : (
          <button type="button" className="gv-toggle" onClick={toggle} aria-label={playing ? `Pause: ${label}` : `Play: ${label}`}>
            {playing ? <PauseGlyph /> : <PlayGlyph size={16} />}
          </button>
        )}
      </div>
    </section>
  );
}
