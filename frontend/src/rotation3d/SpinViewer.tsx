import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getPlayerBranding } from "../lib/branding";
import DriftFormOverlay, { type OverlayForm } from "./DriftFormOverlay";

/**
 * Rotation3D — reusable interactive 360° spin viewer.
 *
 * Manifest-driven: pass ordered `frames` (transparent WebP cutout URLs) to scrub
 * real product frames, or omit them to render the synthetic demo object. The
 * interaction (drag + inertia rotate, pinch/wheel/double-tap/± zoom, fullscreen,
 * reset, rotation indicator, onboarding hint, keyboard + reduced-motion a11y) is
 * identical in both modes — this is the ported, production shape of the spike.
 *
 * Themed via --primary-brand / --secondary-brand (injected per tenant by
 * BrandContext) with sensible fallbacks, so a brand's colors flow in for free.
 */

export type SpinManifest = {
  /** number of frames around one horizontal axis (single-axis turntable) */
  frameCount: number;
  /** ordered frame image URLs; when omitted the synthetic demo object renders */
  frames?: string[];
  /** lighter, smaller-resolution frames served to phones for fast loading;
   * same order/count as `frames`. Absent on products processed before this. */
  framesMobile?: string[];
  /** frame index shown on load / reset (centered "hero" angle) */
  defaultFrame?: number;
};

export type SpinCta = { label: string; url?: string; newTab?: boolean; formId?: string };

/** On-frame text overlay (Drift). Visible while the current frame is within
 * [startFrame, endFrame]; position/size are normalized to the canvas (0..1). */
export type SpinCaption = {
  clip?: string; // "A" (primary) | "B" (linked clip) — only "A" rendered for now
  startFrame: number;
  endFrame: number;
  text: string;
  x: number; // 0..1 left→right
  y: number; // 0..1 top→bottom
  color?: string;
  fontSize?: number; // 0..1 of canvas height
  fontWeight?: number;
  background?: string | null;
  align?: "left" | "center" | "right";
};

export type SpinViewerProps = {
  manifest: SpinManifest;
  productName?: string;
  brandName?: string;
  ctaPrimary?: SpinCta;
  ctaSecondary?: SpinCta;
  /** lead-forms a CTA may open (keyed by id), + the product id for lead source */
  forms?: Record<string, OverlayForm>;
  productId?: string;
  /** called before navigation so callers can record analytics (CTA_CLICK) */
  onCtaClick?: (which: "primary" | "secondary", cta: SpinCta) => void;
  className?: string;
  /** "full" = full-screen player with chrome; "hero" = contained, chrome-less
   * spinning object that fills its parent (used as a landing/hero visual) */
  variant?: "full" | "hero";
  /** brand player customization (from the brand's BrandConfig) */
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  /** per-product page background (CSS color). Empty → default studio gradient. */
  background?: string | null;
  /** embed chrome toggles (default all shown) */
  showControls?: boolean;
  showCtas?: boolean;
  showBrand?: boolean;
  /** Finer embed toggles (top-left): hide the logo, the profile (brand) name,
   * or the product title independently. Default all shown. */
  showLogo?: boolean;
  showName?: boolean;
  showTitle?: boolean;
  /** hide the top-right tool buttons (reset + fullscreen) — e.g. the landing player */
  showTools?: boolean;
  /** show the +/- zoom controls on mobile (phones). Off by default on drifts;
   * desktop always shows them. */
  mobileZoom?: boolean;
  /** full-page landing takeover: cap the product size on wide screens so it
   * doesn't fill the viewport (leaves clean room for the helper + CTAs below) */
  landing?: boolean;
  /** show the one-time first-visit drag demo (a finger drags across the frame
   * while the content scrubs). Runs once per visitor (localStorage), drift only. */
  introHint?: boolean;
  /** override the initial loader caption (default "Optimizing frames…") */
  loaderLabel?: string;
  /** optional product info shown beside the player (desktop right / mobile top) */
  title?: string | null;
  description?: string | null;
  /** Drift second headline — dissolves in when you reach the end frame. */
  titleEnd?: string | null;
  /** Drift second description — dissolves in with headline 2 at the end. */
  descriptionEnd?: string | null;
  /** Drift drag-helper text: forward (at start) and reverse (at end). The arrow +
   * text swap when you reach the end / return to the start. */
  helperStart?: string | null;
  helperEnd?: string | null;
  /** rendered rotation clip — enables the "Video" tab in the view selector */
  videoUrl?: string | null;
  /** Lab feature (off by default): show the thumbnail view selector (stills) */
  showViewSelector?: boolean;
  /** Drift surface: auto-rotate ("loop") with a play/pause toggle in the chrome */
  enableLoop?: boolean;
  /** Drift player chrome: "drag to drift" + directional arrow under the frame,
   * no bottom scrim, playback starts at the actual first frame (frame 0). */
  driftMode?: boolean;
  /** Drift on-frame text overlays, shown while their frame range is active. */
  captions?: SpinCaption[];
  /** Loop on/off (per drift): true = dragging wraps end→start seamlessly;
   * false = dragging clamps at the first/last frame. Default true (360 spins). */
  loopScrub?: boolean;
};

const clampZoom = (z: number) => Math.max(0.7, Math.min(2.8, z));

// Is the player background a light color? (so we flip text/controls to dark).
const isLightColor = (bg?: string | null): boolean => {
  if (!bg) return false; // empty → default dark studio gradient
  const s = bg.trim().toLowerCase();
  if (s === "white") return true;
  if (s === "black") return false;
  let r: number, g: number, b: number;
  // Auto-matched ("keep") backgrounds arrive as rgb()/rgba(); manual picks as hex.
  const rgb = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (rgb) {
    r = +rgb[1]; g = +rgb[2]; b = +rgb[3];
  } else {
    let hex = s.replace(/^#/, "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}$/.test(hex)) return false;
    const n = parseInt(hex, 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
};

// Progressive load order: an evenly-spread COARSE ring first, then repeatedly
// halve the gaps. Any prefix of the result covers the full 360°, so the spin is
// usable early (at low density) and sharpens seamlessly as more frames arrive —
// nearestLoaded() always draws the best frame available. `start` loads first
// (the hero angle) so the very first painted frame is the intended one.
const progressiveOrder = (n: number, start = 0): number[] => {
  const order: number[] = [];
  const seen = new Array(n).fill(false);
  const add = (raw: number) => {
    const i = ((raw % n) + n) % n;
    if (!seen[i]) { seen[i] = true; order.push(i); }
  };
  add(start);
  let stride = n;
  while (stride > 1) {
    stride = Math.max(1, Math.ceil(stride / 2));
    for (let i = 0; i < n; i += stride) add(start + i);
    if (stride === 1) break;
  }
  for (let i = 0; i < n; i++) add(start + i); // safety: include any remainder
  return order;
};

export default function SpinViewer({
  manifest,
  productName = "Product",
  brandName = "Rotation3D",
  ctaPrimary,
  ctaSecondary,
  forms,
  productId,
  onCtaClick,
  className,
  variant = "full",
  logoUrl,
  primaryColor,
  secondaryColor,
  background,
  showControls = true,
  showCtas = true,
  showBrand = true,
  showLogo = true,
  showName = true,
  showTitle = true,
  showTools = true,
  mobileZoom = true,
  landing = false,
  introHint = false,
  loaderLabel,
  title,
  description,
  titleEnd,
  descriptionEnd,
  helperStart,
  helperEnd,
  showViewSelector = false,
  enableLoop = false,
  driftMode = false,
  captions,
  loopScrub = true,
}: SpinViewerProps) {
  const hero = variant === "hero";
  const playerBrand = getPlayerBranding();
  const lightBg = isLightColor(background);
  const stageStyle: CSSProperties = {
    ...(primaryColor ? { ["--r3d-primary" as any]: primaryColor } : {}),
    ...(secondaryColor ? { ["--r3d-secondary" as any]: secondaryColor } : {}),
    ...(background ? { background } : {}),
  };
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const degRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const headsRef = useRef<HTMLDivElement>(null);
  const head1Ref = useRef<HTMLDivElement>(null);
  const head2Ref = useRef<HTMLDivElement>(null);
  const desc1Ref = useRef<HTMLDivElement>(null);
  const desc2Ref = useRef<HTMLDivElement>(null);
  const helperTextRef = useRef<HTMLSpanElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const introHandRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const pctRef = useRef<HTMLDivElement>(null);
  const fsIconRef = useRef<SVGSVGElement>(null);
  const loopIconRef = useRef<SVGSVGElement>(null);
  // Captions live in a ref so updating them doesn't re-init the render engine.
  const captionsRef = useRef<SpinCaption[] | undefined>(captions);
  useEffect(() => {
    captionsRef.current = captions;
  }, [captions]);
  // E-commerce-style thumbnail selector: box 0 = interactive 360° (default),
  // boxes 1..4 = stills from different angles. Clicking a still box shows it large.
  const [view, setView] = useState(0);
  const galleryFrames = manifest.frames || [];
  const stills =
    galleryFrames.length >= 4
      ? [0, 1, 2, 3].map((k) => galleryFrames[Math.floor((k / 4) * galleryFrames.length)])
      : galleryFrames;
  const poster = galleryFrames.length
    ? galleryFrames[Math.min(manifest.defaultFrame || 0, galleryFrames.length - 1)]
    : undefined;

  const FRAMES = Math.max(2, manifest.frameCount || 36);
  const DEFAULT_FRAME = Math.min(
    FRAMES - 1,
    Math.max(0, manifest.defaultFrame ?? Math.round(FRAMES / 12)),
  );

  useEffect(() => {
    const stage = stageRef.current!;
    const cv = canvasRef.current!;
    const ctx = cv.getContext("2d")!;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const ELEV = (12 * Math.PI) / 180;
    const TWO_PI = Math.PI * 2;

    // --- interaction state (refs, not React state, to keep the loop hot) ---
    // Drift always begins at the actual first frame; Rotation3D at its start frame.
    const START_FRAME = driftMode ? 0 : DEFAULT_FRAME;
    // Drag direction. Drift is a VIDEO: drag right must advance frames (1→2→3→4),
    // so spin=+1. Rotation3D keeps the opposite object-spin the user approved (-1).
    // Everything below (drag, idle, arrows, navigator) is expressed via `spin`.
    const spin = driftMode ? 1 : -1;
    let yaw = (START_FRAME / FRAMES) * TWO_PI;
    let yawVel = 0;
    // Loop off: clamp the drag between the first and last frame (no wrap).
    const endYaw = (FRAMES - 1) * (TWO_PI / FRAMES);
    const clampScrub = () => {
      if (loopScrub) return;
      if (yaw < 0) { yaw = 0; yawVel = 0; }
      else if (yaw > endYaw) { yaw = endYaw; yawVel = 0; }
    };
    let zoom = 1, zoomTarget = 1;
    let panX = 0, panY = 0, panTX = 0, panTY = 0;
    // Start paused — no autoplay. The loop/play button (shown when enableLoop)
    // toggles auto-rotate on demand.
    let loopOn = false;
    let idleSpin = false;
    // Drift drag-helper: direction-aware text + arrow. Flips to "reverse" at the
    // end frame and back to "forward" at the start.
    let helperBack = false;
    const fwdHelper = helperStart || "Drag to drift";
    const backHelper = helperEnd || "Drag to start";
    const syncHelper = () => {
      hintRef.current?.classList.toggle("r3d-back", helperBack);
      if (helperTextRef.current) helperTextRef.current.textContent = helperBack ? backHelper : fwdHelper;
    };
    // Hand sequence: shown at start → hidden on first move → shown again at the end
    // → hidden for good. And headline/description dissolve to #2 AT the end frame.
    // The ARROW + TEXT always stay; only the HAND runs the show/hide sequence.
    let helperPhase = 0; // 0 start-shown, 1 hidden, 2 end-shown, 3 done
    let atEnd = false;
    const hideHand = () => handRef.current?.classList.add("r3d-gone");
    const showHand = () => handRef.current?.classList.remove("r3d-gone");
    const setHeadState = (end: boolean) => {
      if (head1Ref.current) head1Ref.current.style.opacity = end ? "0" : "1";
      if (head2Ref.current) head2Ref.current.style.opacity = end ? "1" : "0";
      if (desc1Ref.current) desc1Ref.current.style.opacity = end ? "0" : "1";
      if (desc2Ref.current) desc2Ref.current.style.opacity = end ? "1" : "0";
    };
    const advanceHelperOnDrag = () => {
      if (!driftMode) return;
      if (helperPhase === 0) { hideHand(); helperPhase = 1; }
      else if (helperPhase === 2) { hideHand(); helperPhase = 3; }
    };
    let dirty = true, lastYaw = NaN, lastZoom = NaN, lastPX = 0, lastPY = 0;
    let touchZoomed = false;
    let scrimHidden = false;
    let interacted = false;
    let raf = 0;
    let alive = true;

    // --- one-time intro gesture ("show, don't tell") ---
    // On a visitor's FIRST drift, a finger drags across the frame while the content
    // scrubs in sync, then eases back — so they realise it's draggable. Runs once
    // ever (localStorage) and cancels the instant they touch it.
    let introActive = false;
    let introStart = 0;
    let introRange = 0;
    const INTRO_IN = 380, INTRO_OUT = 820, INTRO_HOLD = 240, INTRO_BACK = 720, INTRO_FADE = 300;
    const INTRO_TOTAL = INTRO_IN + INTRO_OUT + INTRO_HOLD + INTRO_BACK + INTRO_FADE;
    const introEase = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
    const endIntro = () => {
      if (!introActive) return;
      introActive = false;
      introHandRef.current?.classList.remove("r3d-intro-on");
      stage.classList.remove("r3d-introing");
      yaw = 0; // back to the start frame
      yawVel = 0;
      dirty = true;
    };
    const startIntro = () => {
      if (introActive || !driftMode || !introHint || FRAMES < 4) return;
      // Respect reduced-motion: skip the auto-demo (the static hint still guides).
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
      try {
        if (localStorage.getItem("drift-intro-seen")) return;
        localStorage.setItem("drift-intro-seen", "1");
      } catch {
        /* private mode / blocked storage → still show it this once */
      }
      introRange = endYaw * 0.45; // demo ~45% of the drift (not the full reveal)
      introStart = performance.now();
      introActive = true;
      introHandRef.current?.classList.add("r3d-intro-on");
      stage.classList.add("r3d-introing"); // hides the resting hint during the demo
    };

    // --- frame images (real mode) ---
    // On phones, prefer the lighter mobile frame set (much smaller download →
    // buffers fast) when the product has one. Desktop and legacy products use
    // the full-resolution set.
    const isMobileViewport =
      typeof window !== "undefined" &&
      (Math.min(window.innerWidth, window.innerHeight) <= 820 ||
        !!window.matchMedia?.("(pointer: coarse)").matches);
    const usingMobileFrames =
      isMobileViewport &&
      Array.isArray(manifest.framesMobile) &&
      manifest.framesMobile.length > 0;
    const urls = usingMobileFrames ? manifest.framesMobile : manifest.frames;
    const realMode = Array.isArray(urls) && urls.length > 0;
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    const imgs: (HTMLImageElement | null)[] = realMode
      ? new Array(urls!.length).fill(null)
      : [];
    let loaded = 0;

    // --- synthetic object (demo mode) ---
    const V = [
      [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
      [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
    ];
    const F = [
      { i: [0, 1, 2, 3], c: [99, 102, 241], t: "1" },
      { i: [5, 4, 7, 6], c: [34, 211, 238], t: "2" },
      { i: [4, 0, 3, 7], c: [139, 92, 246], t: "3" },
      { i: [1, 5, 6, 2], c: [236, 140, 120], t: "4" },
      { i: [4, 5, 1, 0], c: [120, 140, 255], t: "5" },
      { i: [3, 2, 6, 7], c: [110, 200, 160], t: "6" },
    ];
    const norm = (v: number[]) => {
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    };
    const LIGHT = norm([0.35, 0.75, 0.9]);
    const rotY = (p: number[], a: number) => {
      const c = Math.cos(a), s = Math.sin(a);
      return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
    };
    const rotX = (p: number[], a: number) => {
      const c = Math.cos(a), s = Math.sin(a);
      return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]];
    };

    const fit = () => {
      const r = stage.getBoundingClientRect();
      const w = Math.round(r.width * DPR), h = Math.round(r.height * DPR);
      // Only re-size the backing store on a REAL change — setting cv.width/height
      // (even to the same value) clears the canvas, so skipping no-op resizes avoids
      // flicker during the resize bursts in-app browsers fire while overscrolling.
      if (w === cv.width && h === cv.height) return;
      cv.width = w;
      cv.height = h;
      dirty = true;
    };

    const drawShadow = (cx: number, cy: number, scale: number) => {
      const sr = scale * 1.5;
      const g = ctx.createRadialGradient(cx, cy + scale * 1.35, 0, cx, cy + scale * 1.35, sr);
      g.addColorStop(0, "rgba(0,0,0,.45)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(cx, cy + scale * 1.35, sr, sr * 0.28, 0, 0, TWO_PI);
      ctx.fill();
    };

    const drawSynthetic = (q: number, cx: number, cy: number, scale: number) => {
      const faces = F.map((f) => {
        const pts = f.i.map((idx) => rotX(rotY(V[idx], q), ELEV));
        const z = pts.reduce((s, p) => s + p[2], 0) / 4;
        const a = pts[0], b = pts[1], c = pts[2];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = norm([
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ]);
        const lit = Math.max(0.22, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
        return { pts, z, lit, f, facing: n[2] };
      }).sort((A, B) => A.z - B.z);

      for (const fc of faces) {
        if (fc.facing < 0) continue;
        const P = fc.pts.map((p) => [cx + p[0] * scale, cy - p[1] * scale]);
        ctx.beginPath();
        P.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
        const [r, g, b] = fc.f.c;
        const l = fc.lit;
        const xs = P.map((p) => p[0]);
        const ys = P.map((p) => p[1]);
        const gg = ctx.createLinearGradient(
          Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys),
        );
        gg.addColorStop(0, `rgb(${Math.min(255, r * l * 1.18) | 0},${Math.min(255, g * l * 1.18) | 0},${Math.min(255, b * l * 1.18) | 0})`);
        gg.addColorStop(1, `rgb(${(r * l * 0.78) | 0},${(g * l * 0.78) | 0},${(b * l * 0.78) | 0})`);
        ctx.fillStyle = gg;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.06)";
        ctx.lineWidth = DPR;
        ctx.stroke();
        const mx = P.reduce((s, p) => s + p[0], 0) / 4;
        const my = P.reduce((s, p) => s + p[1], 0) / 4;
        ctx.fillStyle = "rgba(255,255,255,.9)";
        ctx.font = `600 ${26 * DPR}px "Bai Jamjuree", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(fc.f.t, mx, my);
      }
    };

    const isReady = (im: HTMLImageElement | null): im is HTMLImageElement =>
      !!im && im.complete && im.naturalWidth > 0;
    // While frames stream in, draw the nearest already-loaded frame so scrubbing
    // never shows a blank — the spin is usable long before every frame arrives.
    const nearestLoaded = (frame: number): HTMLImageElement | null => {
      if (isReady(imgs[frame])) return imgs[frame];
      for (let d = 1; d <= FRAMES; d++) {
        if (loopScrub) {
          // Looping: the timeline wraps, so the neighbour past either end is valid.
          const a = (((frame - d) % FRAMES) + FRAMES) % FRAMES;
          const b = (frame + d) % FRAMES;
          if (isReady(imgs[a])) return imgs[a];
          if (isReady(imgs[b])) return imgs[b];
        } else {
          // Non-looping drift: DON'T wrap. Wrapping made the end frame fall back to
          // the START frame while frames were still streaming in (the flip-flop
          // flash on first load) — clamp the search to the real bounds instead so a
          // not-yet-decoded end frame shows its nearest loaded NEIGHBOUR, not frame 0.
          const a = frame - d;
          const b = frame + d;
          if (a >= 0 && isReady(imgs[a])) return imgs[a];
          if (b < FRAMES && isReady(imgs[b])) return imgs[b];
          if (a < 0 && b >= FRAMES) break; // both directions exhausted
        }
      }
      return null;
    };

    // The rendered frame image rect (device px) — captions are positioned
    // relative to THIS (matching the editor + export), not the whole canvas.
    let frameRect = { x: 0, y: 0, w: 0, h: 0 };
    const drawFrameImage = (frame: number, cx: number, cy: number, scale: number) => {
      const img = nearestLoaded(frame);
      if (!img) return;
      // contain-fit the frame into a square-ish box around center
      const box = scale * 4.2;
      const ar = img.naturalWidth / img.naturalHeight;
      let w = box, h = box / ar;
      if (h > box) { h = box; w = box * ar; }
      const x = cx - w / 2, y = cy - h / 2;
      frameRect = { x, y, w, h };
      ctx.drawImage(img, x, y, w, h);
    };

    // Drift scrub-track accent — the brand's own primary→secondary (cyan→blue by
    // default), parsed once for the progress fill drawn on the frame's bottom edge.
    const hexToRgb = (hex: string | null | undefined, fb: number[]): number[] => {
      const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || "").trim());
      if (!m) return fb;
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    const accentA = hexToRgb(primaryColor, [34, 211, 238]); // cyan
    const accentB = hexToRgb(secondaryColor, [59, 130, 246]); // blue

    const draw = () => {
      const step = TWO_PI / FRAMES;
      const q = Math.round(yaw / step) * step;
      const frame = ((Math.round(yaw / step) % FRAMES) + FRAMES) % FRAMES;
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      // Default size matches what used to be the "first zoom" size (~×1.25) so
      // the product reads bigger on load; hero/gallery tiles stay compact.
      // On the full-page landing, size the product so it always leaves clean room
      // BELOW it for the drag helper + powered-by + CTAs (default sizing draws it
      // ~1.05×min, which fills a wide desktop viewport and pushed the helper onto
      // the frame). Cap the box by the vertical budget (viewport minus the helper's
      // measured height + bottom stack) and the width, on every aspect ratio.
      // Landing shows the product BIG (like a ~2x zoom) — capped only so it never
      // overflows the viewport. At that size it fills the screen, so the drag arrow
      // rides as a bottom-centered overlay (pinned to the bottom, not the middle).
      // Every drift surface (the landing AND the standalone/embedded player) caps
      // the product size so it leaves clean room BELOW for the drag helper +
      // powered badge + CTAs — otherwise the bigger default sizing pushes the frame
      // down and the helper gets clamped up ONTO the image (landing vs player
      // inconsistency). Hero/gallery tiles keep the compact default.
      const capFit = landing || (driftMode && !hero);
      const cyFactor = capFit ? 0.46 : 0.47;
      let base = Math.min(W, H) * (hero ? 0.23 : 0.25);
      if (capFit) {
        const capH = (H * 0.95) / 4.2; // don't overflow the height
        const capW = (W * 0.94) / 4.2; // and fit the width
        base = Math.min(capH, capW);
      }
      const scale = base * zoom;
      const cx = W / 2 + panX * DPR, cy = H * cyFactor + panY * DPR;

      // Drift has no grounding shadow (per spec); Rotation3D keeps its contact shadow.
      if (!driftMode) {
        ctx.save();
        drawShadow(cx, cy, scale);
        ctx.restore();
      }

      if (realMode) drawFrameImage(frame, cx, cy, scale);
      else drawSynthetic(q, cx, cy, scale);

      // Drift on mobile: the canvas frame is vertically centered but the headline
      // block is pinned near the top — on tall phones that strands the copy far
      // above the product. Anchor the headline block's BOTTOM just above the frame
      // so it reads as one unit (desktop keeps the CSS top-pin).
      if (driftMode && headsRef.current) {
        const frameTopCss = (realMode ? frameRect.y : cy - scale * 2.1) / DPR;
        // Headline + description track just ABOVE the product's top edge, so they
        // follow the product as you zoom in/out (they stay one unit) — clamped so
        // the block never pushes up past the header. When the product's top is off
        // the top of the screen (very zoomed in), fall back to the CSS top pin.
        if (frameTopCss > 8) {
          const hCss = cv.clientHeight || H / DPR;
          const blockH = headsRef.current.offsetHeight || 60;
          const want = hCss - frameTopCss + 12; // sit 12px above the product top
          const maxBottom = hCss - (56 + blockH); // keep the block's top ≥ ~56px
          headsRef.current.style.top = "auto";
          headsRef.current.style.bottom = Math.max(12, Math.min(want, maxBottom)) + "px";
        } else {
          headsRef.current.style.top = "";
          headsRef.current.style.bottom = "";
        }
      }

      // Drift: pin the "drag to drift" helper just UNDER the product's rendered
      // bottom (the real frame rect when drawn; the box half-height otherwise —
      // the old code used `scale`, i.e. half the true height, so the arrow landed
      // INSIDE the frame). Clamp so its bottom clears the powered-by badge + CTAs.
      if (driftMode && hintRef.current) {
        const frameBottomCss = (realMode && frameRect.h > 0 ? frameRect.y + frameRect.h : cy + scale * 2.1) / DPR;
        // Sit the whole helper cluster (hand + text + arrow) just UNDER the frame's
        // bottom edge on every device. Mobile briefly lifted it ~16% ONTO the frame,
        // which put the text/arrow on the product AND stranded an empty gap between
        // the frame and the CTAs — dropping the helper into that gap fixes both.
        const under = frameBottomCss + 16;
        const hintH = hintRef.current.offsetHeight || 110;
        // Safety clamp: never let the helper cluster drop so low it overlaps the
        // powered badge + CTAs (tighter reserve for drift surfaces via capFit).
        const maxTop = H / DPR - ((capFit ? 130 : 140) + hintH);
        hintRef.current.style.top = Math.max(12, Math.min(under, maxTop)) + "px";
        hintRef.current.style.bottom = "auto";
        // Horizontal: align the cue to the frame's LEFT edge going forward, RIGHT
        // edge going backward (the arrow leads the swipe direction, see r3d-back).
        if (frameRect.w > 0) {
          const stageW = W / DPR;
          if (helperBack) {
            hintRef.current.style.left = "auto";
            hintRef.current.style.right = Math.max(8, stageW - (frameRect.x + frameRect.w) / DPR) + "px";
          } else {
            hintRef.current.style.right = "auto";
            hintRef.current.style.left = Math.max(8, frameRect.x / DPR) + "px";
          }
          hintRef.current.style.transform = "none";
        }
      }

      // Drift on-frame captions — visible while this frame is within range.
      // Positioned relative to the rendered FRAME rect (matches editor + export).
      const caps = captionsRef.current;
      if (caps && caps.length && frameRect.w > 0) {
        for (const c of caps) {
          if (c.clip && c.clip !== "A") continue; // clip B not consumed yet
          if (frame < c.startFrame || frame > c.endFrame) continue;
          const fs = Math.max(9, (c.fontSize ?? 0.05) * frameRect.h);
          const lines = String(c.text || "").split("\n");
          if (!lines.some((l) => l.trim())) continue;
          ctx.save();
          ctx.font = `${c.fontWeight ?? 600} ${fs}px "Bai Jamjuree", ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = c.align === "left" ? "left" : c.align === "right" ? "right" : "center";
          ctx.textBaseline = "middle";
          const px = frameRect.x + c.x * frameRect.w, py = frameRect.y + c.y * frameRect.h, lh = fs * 1.25;
          if (c.background) {
            let maxW = 0;
            for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
            const padX = fs * 0.55, padY = fs * 0.4;
            const boxW = maxW + padX * 2, boxH = (lines.length - 1) * lh + fs + padY * 2;
            let bx = px - boxW / 2;
            if (ctx.textAlign === "left") bx = px - padX;
            else if (ctx.textAlign === "right") bx = px - boxW + padX;
            const by = py - boxH / 2, r = Math.min(fs * 0.4, boxH / 2);
            ctx.beginPath();
            ctx.moveTo(bx + r, by);
            ctx.arcTo(bx + boxW, by, bx + boxW, by + boxH, r);
            ctx.arcTo(bx + boxW, by + boxH, bx, by + boxH, r);
            ctx.arcTo(bx, by + boxH, bx, by, r);
            ctx.arcTo(bx, by, bx + boxW, by, r);
            ctx.closePath();
            ctx.fillStyle = c.background;
            ctx.fill();
          } else {
            ctx.shadowColor = "rgba(0,0,0,.65)";
            ctx.shadowBlur = fs * 0.45;
          }
          ctx.fillStyle = c.color || "#ffffff";
          const y0 = py - ((lines.length - 1) * lh) / 2;
          lines.forEach((ln, i) => ctx.fillText(ln, px, y0 + i * lh));
          ctx.restore();
        }
      }

      // Drift scrub-progress: a hairline track on the frame's bottom edge — a faint
      // full-width rail, the "drifted" portion filled in the brand accent
      // (cyan→blue), and a small glowing head at the current position. The
      // video-scrubber / story-bar language: subtle, shows position AND range, and
      // reads like the frame's own bottom edge is filling as you drift.
      if (driftMode && realMode && frameRect.w > 0) {
        const prog = loopScrub
          ? (((yaw % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI
          : Math.max(0, Math.min(1, endYaw > 0 ? yaw / endYaw : 0));
        const railY = frameRect.y + frameRect.h; // the frame's bottom edge
        const x0 = frameRect.x;
        const headX = x0 + prog * frameRect.w;
        ctx.save();
        ctx.lineCap = "round";
        // faint full-width rail
        ctx.strokeStyle = "rgba(255,255,255,.12)";
        ctx.lineWidth = Math.max(1, 1.4 * DPR);
        ctx.beginPath();
        ctx.moveTo(x0, railY);
        ctx.lineTo(x0 + frameRect.w, railY);
        ctx.stroke();
        // filled portion — brand accent gradient (start → head)
        if (prog > 0.002) {
          const grad = ctx.createLinearGradient(x0, 0, headX, 0);
          grad.addColorStop(0, `rgba(${accentA[0]},${accentA[1]},${accentA[2]},.7)`);
          grad.addColorStop(1, `rgba(${accentB[0]},${accentB[1]},${accentB[2]},.95)`);
          ctx.strokeStyle = grad;
          ctx.lineWidth = Math.max(1.5, 1.9 * DPR);
          ctx.beginPath();
          ctx.moveTo(x0, railY);
          ctx.lineTo(headX, railY);
          ctx.stroke();
        }
        // soft head at the current position
        ctx.shadowColor = `rgba(${accentB[0]},${accentB[1]},${accentB[2]},.55)`;
        ctx.shadowBlur = 8 * DPR;
        ctx.fillStyle = `rgba(${accentB[0]},${accentB[1]},${accentB[2]},1)`;
        ctx.beginPath();
        ctx.arc(headX, railY, 2.6 * DPR, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
      }

      // Navigator: 0° at the start frame (DEFAULT_FRAME), counting up as you
      // drag forward (right). Measured relative to the start so the readout
      // begins at 0°; circular, so dragging back past the start wraps toward 360°.
      const startYaw = (START_FRAME / FRAMES) * TWO_PI;
      // Navigator display is the same for both modes (0° at start, up on
      // drag-right): measure progress in the `spin` direction from the start.
      const nav = (((spin * (yaw - startYaw)) % TWO_PI + TWO_PI) % TWO_PI) / TWO_PI;
      if (degRef.current) degRef.current.textContent = (Math.round(nav * 360) % 360) + "°";
      if (fillRef.current) fillRef.current.style.left = nav * 100 + "%";
      // Drift: the END frame is the trigger — dissolve headline/description 1 → 2
      // and bring the helper back (reverse). Revert at the start. CSS handles the fade.
      if (driftMode) {
        if (nav >= 0.92 && !atEnd) {
          atEnd = true;
          setHeadState(true);
          helperBack = true; syncHelper(); // arrow + text flip to reverse (always visible)
          if (helperPhase === 1) { showHand(); helperPhase = 2; } // hand reappears at the end
        } else if (nav <= 0.08 && atEnd) {
          atEnd = false;
          setHeadState(false);
          helperBack = false; syncHelper(); // arrow + text flip back to forward
        }
      }
    };

    const tick = () => {
      if (!alive) return;
      // The one-time intro owns the scrub while it plays; physics resumes after.
      let introHandProg = -1;
      let introAlpha = 1;
      if (introActive) {
        const t = performance.now() - introStart;
        if (t >= INTRO_TOTAL) {
          endIntro();
        } else {
          let scrubK = 0;
          if (t < INTRO_IN) {
            introAlpha = t / INTRO_IN; // fade the finger in over the start frame
          } else if (t < INTRO_IN + INTRO_OUT) {
            scrubK = introEase((t - INTRO_IN) / INTRO_OUT); // drag forward
          } else if (t < INTRO_IN + INTRO_OUT + INTRO_HOLD) {
            scrubK = 1; // brief hold at the peek
          } else if (t < INTRO_IN + INTRO_OUT + INTRO_HOLD + INTRO_BACK) {
            scrubK = 1 - introEase((t - INTRO_IN - INTRO_OUT - INTRO_HOLD) / INTRO_BACK); // ease back
          } else {
            introAlpha = 1 - (t - INTRO_IN - INTRO_OUT - INTRO_HOLD - INTRO_BACK) / INTRO_FADE; // release
          }
          yaw = scrubK * introRange;
          introHandProg = scrubK;
          dirty = true;
        }
      }
      if (!introActive) {
        if (idleSpin) yaw += spin * 0.004;
        else if (Math.abs(yawVel) > 0.00003) { yaw += yawVel; yawVel *= 0.94; }
        clampScrub();
      }
      zoom += (zoomTarget - zoom) * 0.18; // eased zoom for a premium feel
      if (zoomTarget <= 1.1) { panTX = 0; panTY = 0; }
      panX += (panTX - panX) * 0.2;
      panY += (panTY - panY) * 0.2;
      // At rest, let the browser scroll the page vertically (touch-action pan-y);
      // once zoomed in, capture all gestures so drag can pan to inspect.
      const zoomedNow = zoomTarget > 1.05;
      if (zoomedNow !== touchZoomed) {
        touchZoomed = zoomedNow;
        stage.style.touchAction = zoomedNow ? "none" : "pan-y";
      }
      // Once zoomed in a bit, fade the top/bottom scrims — otherwise a product
      // zoomed to fill the screen gets washed out by them (esp. on light bg).
      const bigZoom = zoom > 1.35;
      if (bigZoom !== scrimHidden) {
        scrimHidden = bigZoom;
        stage.classList.toggle("r3d-zoomed", bigZoom);
      }
      // Only repaint when something actually changed — idle products stop
      // burning CPU/battery on mobile.
      if (
        dirty ||
        yaw !== lastYaw ||
        Math.abs(zoom - lastZoom) > 0.0004 ||
        Math.abs(panX - lastPX) > 0.03 ||
        Math.abs(panY - lastPY) > 0.03
      ) {
        draw();
        lastYaw = yaw; lastZoom = zoom; lastPX = panX; lastPY = panY; dirty = false;
      }
      // Move the intro finger across the frame in sync with the scrub.
      if (introHandProg >= 0 && introHandRef.current && frameRect.w > 0) {
        const fx = frameRect.x / DPR, fw = frameRect.w / DPR;
        const fy = frameRect.y / DPR, fh = frameRect.h / DPR;
        introHandRef.current.style.left = fx + (0.3 + 0.4 * introHandProg) * fw + "px";
        introHandRef.current.style.top = fy + fh * 0.52 + "px";
        introHandRef.current.style.opacity = String(Math.max(0, Math.min(1, introAlpha)));
      }
      raf = requestAnimationFrame(tick);
    };

    // --- input ---
    const engage = () => {
      if (!interacted) {
        interacted = true;
        if (!loopOn) idleSpin = false; // loop keeps spinning after the first touch
        // Drift keeps the "drag to drift" arrow as a persistent directional guide.
        if (!driftMode) hintRef.current?.classList.add("r3d-gone");
      }
    };
    let dragging = false, lastX = 0, lastY = 0, lastT = 0, pinchD = 0;
    let startX = 0, startY = 0;
    // Per-touch gesture lock. At rest a vertical swipe becomes "scroll" (we bail
    // and let the page scroll — never gets stuck on the spinner); horizontal
    // becomes "rotate". When zoomed, "rotatepan": horizontal still spins the
    // product, vertical pans up/down to inspect.
    let axis: "" | "rotate" | "scroll" | "rotatepan" = "";
    const pointers = new Map<number, PointerEvent>();
    const isControl = (t: EventTarget | null) =>
      t instanceof Element &&
      (t.closest(".r3d-iconbtn") ||
        t.closest(".r3d-cta") ||
        t.closest(".r3d-powered-badge") ||
        t.closest(".r3d-thumbs") ||
        t.closest(".r3d-media"));

    const down = (e: PointerEvent) => {
      dragging = true;
      engage(); // dismiss the "drag to rotate" hint the instant the player is touched
      idleSpin = false; // pause auto-rotate while actively dragging
      yawVel = 0;
      lastX = startX = e.clientX;
      lastY = startY = e.clientY;
      lastT = performance.now();
      // Pan (moving the frame around) only unlocks once you're zoomed in a few
      // clicks; below that a turn stays anchored so it can't wobble. Each zoom
      // click is ×1.2, so 1.2^4 ≈ 2.07 → ~1.9 is the 4th zoom-in click.
      if (zoomTarget > 1.9 && !driftMode) {
        // Rotation3D: deep zoom → spin (x) + vertical pan (y) to inspect.
        // Drift stays rotate-only when zoomed — no up/down movement (per spec).
        axis = "rotatepan";
        try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        stage.classList.add("r3d-grabbing");
        engage();
      } else if (zoomTarget > 1.05) {
        axis = "rotate"; // light zoom → keep anchored: rotate only, no wobble
        try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        stage.classList.add("r3d-grabbing");
        engage();
        advanceHelperOnDrag();
      } else {
        axis = ""; // at rest → first move picks rotate vs page-scroll
      }
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;

      if (axis === "") {
        const tdx = e.clientX - startX, tdy = e.clientY - startY;
        if (Math.abs(tdx) < 6 && Math.abs(tdy) < 6) { lastX = e.clientX; lastY = e.clientY; lastT = now; return; }
        if (Math.abs(tdx) >= Math.abs(tdy)) {
          axis = "rotate";
          try { stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
          stage.classList.add("r3d-grabbing");
          engage();
          advanceHelperOnDrag();
        } else {
          axis = "scroll"; // vertical → hand it back to the page
          dragging = false;
          return;
        }
      }
      if (axis === "scroll") return;

      if (axis === "rotatepan") {
        // zoomed → horizontal still spins the product (so you never lose the
        // rotate), vertical pans up/down to inspect the zoomed-in region.
        const k = 0.006;
        const d = spin * dx * k;
        yaw += d;
        clampScrub();
        yawVel = (d / dt) * 16;
        const lim = 130 * (zoomTarget - 1);
        panTY = Math.max(-lim, Math.min(lim, panTY + dy));
        panY = panTY;
      } else {
        // at rest → horizontal scrubs the sequence: drag right = forward
        const k = 0.006;
        const d = spin * dx * k;
        yaw += d;
        clampScrub();
        yawVel = (d / dt) * 16;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;
    };
    const up = () => {
      dragging = false;
      axis = "";
      if (loopOn) idleSpin = true; // resume auto-rotate after the drag ends
      stage.classList.remove("r3d-grabbing");
    };

    const onDown = (e: PointerEvent) => {
      if (introActive) endIntro(); // the user is taking over — stop the demo
      if (isControl(e.target)) return;
      pointers.set(e.pointerId, e);
      if (pointers.size === 2) { dragging = false; axis = ""; return; } // pinch
      if (pointers.size === 1) down(e);
    };
    const onMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinchD) { zoomTarget = clampZoom(zoomTarget * (d / pinchD)); zoom = zoomTarget; engage(); }
        pinchD = d;
        dragging = false;
      } else move(e);
    };
    let lastTap = 0;
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchD = 0;
      if (!pointers.size) up();
      if (isControl(e.target)) return;
      const now = performance.now();
      // Drift: no double-tap zoom (accidental double-taps caused a jarring zoom).
      if (!driftMode && now - lastTap < 300) {
        if (zoomTarget > 1.2) {
          zoomTarget = 1; panTX = 0; panTY = 0;
        } else {
          // double-tap zooms INTO the tapped spot
          const rect = stage.getBoundingClientRect();
          const flx = ((e.clientX - rect.left) - (rect.width / 2 + panX)) / zoom;
          const fly = ((e.clientY - rect.top) - (rect.height * 0.47 + panY)) / zoom;
          const z2 = 2.4;
          const lim = 130 * (z2 - 1);
          zoomTarget = z2;
          panTX = Math.max(-lim, Math.min(lim, -flx * z2));
          panTY = Math.max(-lim, Math.min(lim, -fly * z2));
        }
        engage();
      }
      lastTap = now;
    };
    const onWheel = (e: WheelEvent) => {
      // Drift: never hijack the page scroll to zoom — the +/- buttons handle zoom.
      if (driftMode) return;
      e.preventDefault();
      engage();
      zoomTarget = clampZoom(zoomTarget * (e.deltaY < 0 ? 1.1 : 0.9));
    };
    const onKey = (e: KeyboardEvent) => {
      const step = TWO_PI / FRAMES;
      if (e.key === "ArrowRight") { engage(); yaw += spin * step; }
      else if (e.key === "ArrowLeft") { engage(); yaw -= spin * step; }
      else if (e.key === "+" || e.key === "=") zoomTarget = clampZoom(zoomTarget * 1.2);
      else if (e.key === "-") zoomTarget = clampZoom(zoomTarget * 0.83);
      else if (e.key === "r" || e.key === "R") { yaw = (DEFAULT_FRAME / FRAMES) * TWO_PI; zoomTarget = 1; panX = panY = panTX = panTY = 0; }
      else if (e.key === "f" || e.key === "F") toggleFs();
    };

    // Fullscreen with an iOS fallback. Safari can't fullscreen a <div> (only
    // <video>), so requestFullscreen is undefined there and the button did
    // nothing on iPhone. Fall back to a CSS "pseudo fullscreen" that fixes the
    // stage to fill the viewport — works on every mobile browser.
    let pseudoFs = false;
    const nativeFsActive = () =>
      !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    const ENTER_ICON = '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>';
    const EXIT_ICON = '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>';
    const PLAY_ICON = '<path d="M8 5v14l11-7z"/>';
    const PAUSE_ICON = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
    const syncLoopIcon = () => {
      const el = loopIconRef.current;
      if (el) el.innerHTML = loopOn ? PAUSE_ICON : PLAY_ICON;
    };
    const syncFsIcon = () => {
      const el = fsIconRef.current;
      if (el) el.innerHTML = nativeFsActive() || pseudoFs ? EXIT_ICON : ENTER_ICON;
      setTimeout(fit, 60);
    };
    // On a phone held sideways there's lots of empty width but the product only
    // fills the height — so auto-zoom to 2× to fill the frame. We only auto-apply
    // once (autoLandscapeZoom) and only pull back if the user hasn't since changed
    // the zoom themselves, so we never fight their pinch.
    let autoLandscapeZoom = false;
    // A real touch device (phone/tablet) is the only place this applies — a coarse
    // pointer is the reliable signal, so a small laptop window that merely looks
    // phone-sized never triggers it.
    const isTouchDevice = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    const isLandscape = () =>
      window.matchMedia?.("(orientation: landscape)")?.matches ??
      window.innerWidth > window.innerHeight;
    const updateLandscapeZoom = () => {
      // Client spec: portrait → 1×, landscape → 2× (main player only, any touch
      // device — not gated to fullscreen; never the tiny hero/gallery tiles).
      const want = isTouchDevice && !hero && isLandscape();
      if (want && !autoLandscapeZoom && zoomTarget <= 1.05) {
        zoomTarget = clampZoom(2);
        autoLandscapeZoom = true;
        engage();
      } else if (!want && autoLandscapeZoom) {
        if (Math.abs(zoomTarget - clampZoom(2)) < 0.01) {
          zoomTarget = 1; panTX = 0; panTY = 0;
        }
        autoLandscapeZoom = false;
      }
    };
    // Rotating a phone fires a burst of resize/orientation events with transient
    // (sometimes momentarily-portrait) dimensions mid-animation; debounce so we
    // act once the viewport settles, or a stray reading cancels the zoom.
    let landscapeZoomTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleLandscapeZoom = () => {
      if (landscapeZoomTimer) clearTimeout(landscapeZoomTimer);
      landscapeZoomTimer = setTimeout(() => {
        landscapeZoomTimer = null;
        updateLandscapeZoom();
      }, 160);
    };
    const setPseudo = (on: boolean) => {
      pseudoFs = on;
      stage.classList.toggle("r3d-pseudo-fs", on);
      document.documentElement.classList.toggle("r3d-fs-lock", on);
      syncFsIcon();
      scheduleLandscapeZoom();
    };
    const toggleFs = () => {
      const reqFs = stage.requestFullscreen || (stage as any).webkitRequestFullscreen;
      if (reqFs) {
        if (nativeFsActive()) {
          (document.exitFullscreen || (document as any).webkitExitFullscreen)?.call(document);
        } else {
          const p = reqFs.call(stage);
          if (p && typeof p.catch === "function") p.catch(() => setPseudo(true)); // iOS refuses → pseudo
        }
      } else {
        setPseudo(!pseudoFs); // no native fullscreen (iOS Safari) → pseudo
      }
    };
    const onFsChange = () => { syncFsIcon(); scheduleLandscapeZoom(); };
    // Re-fit AND repaint synchronously. fit() resizes the backing store; drawing
    // right away (instead of waiting for the next RAF) means the canvas is never
    // shown for a frame at the old buffer size stretched into the new box — which
    // is the squish/distortion seen when an in-app browser resizes the viewport.
    const refit = () => { fit(); draw(); };
    const onOrient = () => { refit(); scheduleLandscapeZoom(); };

    // control buttons (delegated within the stage)
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      const zbtn = t.closest("[data-z]");
      if (zbtn) {
        engage();
        zoomTarget = clampZoom(zoomTarget * (Number(zbtn.getAttribute("data-z")) > 0 ? 1.25 : 0.8));
      } else if (t.closest("[data-reset]")) {
        yaw = (START_FRAME / FRAMES) * TWO_PI; yawVel = 0; zoomTarget = 1; panX = panY = panTX = panTY = 0;
      } else if (t.closest("[data-fs]")) {
        toggleFs();
      } else if (t.closest("[data-loop]")) {
        loopOn = !loopOn;
        idleSpin = loopOn;
        engage();
        syncLoopIcon();
      }
    };

    stage.addEventListener("pointerdown", onDown);
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerup", onUp);
    stage.addEventListener("pointercancel", onUp);
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("keydown", onKey);
    stage.addEventListener("click", onClick);
    document.addEventListener("fullscreenchange", onFsChange);
    window.addEventListener("resize", onOrient);
    window.addEventListener("orientationchange", onOrient);
    const orientMql = window.matchMedia?.("(orientation: landscape)");
    orientMql?.addEventListener?.("change", onOrient);
    // A ResizeObserver catches box changes the window 'resize' event can miss or
    // report late (in-app browser chrome animating in/out, container reflow) and
    // fires as soon as the stage's box actually changes — so the backing store
    // tracks the display and never lags it into a stretched frame.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => refit());
      ro.observe(stage);
    }

    // --- loading / preload ---
    const C = 2 * Math.PI * 27;
    if (ringRef.current) {
      ringRef.current.style.strokeDasharray = String(C);
      ringRef.current.style.strokeDashoffset = String(C);
    }
    let progressShown = 0;
    let finishing = false;
    const paintProgress = (p: number) => {
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(C * (1 - p / 100));
      if (pctRef.current) pctRef.current.textContent = Math.round(p) + "%";
    };
    const setProgress = (p: number) => {
      // Once the finish sweep is running, ignore late real-load ticks so the ring
      // can't jump backwards while it's completing to 100%.
      if (finishing) return;
      progressShown = p;
      paintProgress(p);
    };
    const finishLoad = () => {
      if (finishing) return;
      finishing = true;
      if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
      // We usually reveal at a low % (a usable coarse ring decodes fast), so sweep
      // the ring to a satisfying 100% before fading — the short load still reads
      // as a "full load" instead of vanishing at ~11%.
      const from = progressShown;
      const startT = performance.now();
      const DUR = 420;
      const sweep = (t: number) => {
        if (!alive) return;
        const k = Math.min(1, (t - startT) / DUR);
        const eased = 1 - Math.pow(1 - k, 3);
        paintProgress(from + (100 - from) * eased);
        if (k < 1) {
          requestAnimationFrame(sweep);
        } else {
          loaderRef.current?.classList.add("r3d-gone");
          if (!hero) stage.focus({ preventScroll: true });
          window.setTimeout(startIntro, 550); // one-time first-visit drag demo
        }
      };
      requestAnimationFrame(sweep);
    };

    if (realMode) {
      const n = urls!.length;
      // Progressive density: load an evenly-spread coarse ring first so the
      // whole 360 is usable within ~a second, then keep filling the gaps so the
      // spin sharpens toward full frame count — no waiting for all 120/180.
      const seq = progressiveOrder(n, START_FRAME);
      const COARSE = Math.min(n, 36); // a turntable already reads well at ~36
      let revealed = false;
      let cursor = 0;

      // Load frames with BOUNDED concurrency and decode each one OFF the main
      // thread (img.decode()) before it's used. Firing all 180 at once
      // saturated the connection, and — worse — drawing a freshly-arrived but
      // not-yet-decoded frame forced a synchronous decode on the animation
      // thread. That was the 5-10s of "bogging" before the spin smoothed out.
      // Bounded + pre-decoded keeps the turn smooth from the first second.
      const LOAD_CONCURRENCY = 8;
      const loadOne = async (i: number) => {
        const im = new Image();
        im.decoding = "async";
        im.src = urls![i];
        try {
          if (im.decode) await im.decode();
          else await new Promise<void>((r) => { im.onload = im.onerror = () => r(); });
        } catch {
          /* broken/cancelled frame — fall through so loading can't stall */
        }
        if (!alive) return;
        imgs[i] = im;
        dirty = true; // repaint once a frame is decoded (no auto-spin to do it)
        loaded++;
        setProgress((loaded / n) * 100);
        // Reveal as soon as a usable coarse ring is decoded — don't make the
        // user wait for all 120/180. The rest keep loading underneath and the
        // spin sharpens seamlessly (nearestLoaded picks the best frame).
        if (!revealed && loaded >= COARSE) {
          revealed = true;
          finishLoad();
        }
      };
      const worker = async () => {
        while (alive && cursor < seq.length) {
          await loadOne(seq[cursor++]);
        }
      };
      for (let w = 0; w < Math.min(LOAD_CONCURRENCY, seq.length); w++) void worker();
      // Cap the loader so the user never stares at it: reveal with whatever's
      // decoded after 1.5s even if the coarse ring isn't complete (a low-density
      // spin is still usable, and keeps sharpening as frames arrive).
      revealTimer = setTimeout(() => {
        if (!revealed) { revealed = true; finishLoad(); }
      }, 1500);
    } else {
      // synthetic: simulate a short preload so the UX matches real mode
      let p = 0;
      const step = () => {
        if (!alive) return;
        p = Math.min(100, p + Math.random() * 11 + 4);
        setProgress(p);
        if (p < 100) setTimeout(step, 70);
        else setTimeout(finishLoad, 200);
      };
      step();
    }

    fit();
    tick();
    if (enableLoop) syncLoopIcon();
    scheduleLandscapeZoom(); // apply landscape 2× if we mount already held sideways

    return () => {
      alive = false;
      if (revealTimer) clearTimeout(revealTimer);
      if (landscapeZoomTimer) clearTimeout(landscapeZoomTimer);
      cancelAnimationFrame(raf);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("keydown", onKey);
      stage.removeEventListener("click", onClick);
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("resize", onOrient);
      window.removeEventListener("orientationchange", onOrient);
      orientMql?.removeEventListener?.("change", onOrient);
      ro?.disconnect();
      // undo pseudo-fullscreen if we unmount while it's active
      stage.classList.remove("r3d-pseudo-fs");
      document.documentElement.classList.remove("r3d-fs-lock");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, FRAMES, DEFAULT_FRAME, hero, driftMode, loopScrub, helperStart, helperEnd]);

  const fireCta = (which: "primary" | "secondary", cta?: SpinCta) => {
    if (!cta) return;
    onCtaClick?.(which, cta);
    // A CTA with an attached form opens the in-player form overlay (same page).
    const form = cta.formId && forms ? forms[cta.formId] : undefined;
    if (form) {
      setActiveForm({ form, which });
      return;
    }
    if (cta.url && cta.url !== "#") {
      // Drift CTAs open in the SAME window (ad landing behavior); others honor newTab.
      if (driftMode || cta.newTab === false) window.location.href = cta.url;
      else window.open(cta.url, "_blank", "noopener");
    }
  };
  const [activeForm, setActiveForm] = useState<{ form: OverlayForm; which: "primary" | "secondary" } | null>(null);

  return (
    <div ref={stageRef} className={`r3d-stage ${hero ? "r3d-hero" : ""} ${driftMode ? "r3d-drift" : ""} ${landing ? "r3d-landing" : ""} ${lightBg ? "r3d-light" : ""} ${!showControls ? "r3d-no-controls" : ""} ${!showCtas ? "r3d-no-ctas" : ""} ${!showBrand ? "r3d-no-brand" : ""} ${!showLogo ? "r3d-no-logo" : ""} ${!showName ? "r3d-no-name" : ""} ${!showTitle ? "r3d-no-title" : ""} ${!showTools ? "r3d-no-tools" : ""} ${!mobileZoom ? "r3d-no-mobile-zoom" : ""} ${view !== 0 ? "r3d-media-mode" : ""} ${className || ""}`}
      style={stageStyle}
      tabIndex={hero ? -1 : 0}
      aria-label="Interactive 360 degree product viewer. Drag to rotate.">
      <style>{R3D_CSS}</style>
      <canvas ref={canvasRef} />
      <div className="r3d-scrim-top" />
      <div className="r3d-scrim-bot" />

      <div className="r3d-topbar">
        <div className="r3d-brand">
          {logoUrl ? (
            <img className="r3d-logo-img" src={logoUrl} alt={brandName} />
          ) : (
            <span className="r3d-logo" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
            </span>
          )}
          <div className="r3d-titles">
            <div className="r3d-kicker">{brandName}</div>
            <div className="r3d-name">{productName}</div>
          </div>
        </div>
        <div className="r3d-tools">
          {enableLoop && !driftMode && (
            <button className="r3d-iconbtn" data-loop title="Play / pause auto-rotate" aria-label="Toggle auto-rotate">
              <svg ref={loopIconRef} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
            </button>
          )}
          <button className="r3d-iconbtn" data-reset title="Reset view" aria-label="Reset view">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
          <button className="r3d-iconbtn" data-fs title="Fullscreen" aria-label="Toggle fullscreen">
            <svg ref={fsIconRef} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
          </button>
        </div>
      </div>

      {!hero && driftMode && (title || description || titleEnd || descriptionEnd) ? (
        <div className="r3d-heads" aria-hidden ref={headsRef}>
          <div className="r3d-heads-stack">
            {title && <div className="r3d-head" ref={head1Ref}>{title}</div>}
            {titleEnd && <div className="r3d-head" ref={head2Ref} style={{ opacity: 0 }}>{titleEnd}</div>}
          </div>
          {(description || descriptionEnd) && (
            <div className="r3d-heads-desc-stack">
              {description && <div className="r3d-heads-desc" ref={desc1Ref}>{description}</div>}
              {descriptionEnd && (
                <div className="r3d-heads-desc" ref={desc2Ref} style={{ opacity: 0 }}>{descriptionEnd}</div>
              )}
            </div>
          )}
        </div>
      ) : !hero && (title || description) ? (
        <div className="r3d-info" aria-hidden>
          {title && <div className="r3d-info-title">{title}</div>}
          {description && <div className="r3d-info-desc">{description}</div>}
        </div>
      ) : null}

      <div className="r3d-zoomcol">
        <button className="r3d-iconbtn" data-z="1" aria-label="Zoom in">+</button>
        <button className="r3d-iconbtn" data-z="-1" aria-label="Zoom out">−</button>
      </div>

      <div className="r3d-rot" aria-hidden>
        <span ref={degRef}>0°</span>
        <div className="r3d-track"><div className="r3d-fill" ref={fillRef} /></div>
      </div>

      <div className="r3d-hint" ref={hintRef}>
        {driftMode ? (
          <>
            <div className="r3d-drift-hand" ref={handRef} aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-2.5-4a2 2 0 0 1 3.4-2L8 14" /></svg>
            </div>
            <div className="r3d-drift-cue">
              <span ref={helperTextRef}>{helperStart || "Drag to drift"}</span>
              <span className="r3d-drift-arrow" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="r3d-hand">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-2.5-4a2 2 0 0 1 3.4-2L8 14" /></svg>
            </div>
            <span>Drag to rotate</span>
          </>
        )}
      </div>

      {driftMode && introHint && (
        <div className="r3d-intro" ref={introHandRef} aria-hidden>
          <span className="r3d-intro-ring" />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-2.5-4a2 2 0 0 1 3.4-2L8 14" /></svg>
        </div>
      )}

      {(ctaPrimary || ctaSecondary) && (
        <div className="r3d-ctas">
          {ctaPrimary && (
            <button className="r3d-cta r3d-primary" onClick={() => fireCta("primary", ctaPrimary)}>
              {ctaPrimary.label}
            </button>
          )}
          {ctaSecondary && (
            <button className="r3d-cta r3d-ghost" onClick={() => fireCta("secondary", ctaSecondary)}>
              {ctaSecondary.label}
            </button>
          )}
        </div>
      )}

      {activeForm && (
        <DriftFormOverlay
          form={activeForm.form}
          which={activeForm.which}
          productId={productId}
          productName={productName}
          accent={primaryColor}
          onClose={() => setActiveForm(null)}
        />
      )}

      {view > 0 && stills[view - 1] && (
        <div className="r3d-media">
          <img className="r3d-media-still" src={stills[view - 1]} alt="" />
        </div>
      )}

      {!hero && showViewSelector && stills.length > 0 && (
        <div className="r3d-thumbs">
          <button
            type="button"
            className={`r3d-thumb ${view === 0 ? "active" : ""}`}
            onClick={() => setView(0)}
            aria-label="Interactive 360° view"
            title="360° interactive"
          >
            {poster && <img src={poster} alt="" />}
            <span className="r3d-thumb-360">360°</span>
          </button>
          {stills.map((f, i) => (
            <button
              key={i}
              type="button"
              className={`r3d-thumb ${view === i + 1 ? "active" : ""}`}
              onClick={() => setView(i + 1)}
              aria-label={`Still ${i + 1}`}
            >
              <img src={f} alt="" />
            </button>
          ))}
        </div>
      )}

      <a
        className="r3d-powered-badge"
        href={playerBrand.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Powered by ${playerBrand.name}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
        <span>{driftMode ? <>Powered by <b>Drift Link Interactive</b></> : <>Powered by <b>{playerBrand.name}</b></>}</span>
      </a>

      <div className="r3d-loader" ref={loaderRef}>
        <div className="r3d-loadwrap">
          <svg className="r3d-ring" viewBox="0 0 64 64">
            <defs>
              <linearGradient id="r3dg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--r3d-primary)" />
                <stop offset="1" stopColor="var(--r3d-secondary)" />
              </linearGradient>
            </defs>
            <circle className="r3d-ring-bg" cx="32" cy="32" r="27" />
            <circle className="r3d-ring-fg" ref={ringRef} cx="32" cy="32" r="27" />
          </svg>
          <div className="r3d-pct" ref={pctRef}>0%</div>
          <div className="r3d-lbl">{driftMode ? "Loading…" : loaderLabel || "Optimizing frames…"}</div>
          <div className="r3d-powered">{driftMode ? <b>Drift Link Interactive</b> : <>Powered by <b>{playerBrand.name}</b></>}</div>
        </div>
      </div>
    </div>
  );
}

const R3D_CSS = `
.r3d-stage{
  --r3d-primary:var(--primary-brand,#6366f1);
  --r3d-secondary:var(--secondary-brand,#8b5cf6);
  --r3d-glass:rgba(255,255,255,.05);--r3d-glass2:rgba(255,255,255,.09);
  --r3d-line:rgba(255,255,255,.10);--r3d-muted:#9aa3b6;
  --r3d-glow:0 0 24px rgba(34,211,238,.18);
  /* svh (stable small-viewport height) instead of dvh: in in-app browsers
     (Instagram etc.) dvh fluctuates as the chrome shows/hides and on rubber-band
     overscroll, which resized the canvas and SQUISHED the render. svh doesn't
     change on scroll, so the stage — and the canvas — stay stable. */
  position:relative;height:100vh;height:100svh;width:100%;overflow:hidden;outline:none;overscroll-behavior:none;
  font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif;color:#eef1f6;
  background:radial-gradient(120% 80% at 50% -10%,#1a2336 0%,rgba(17,24,39,0) 55%),linear-gradient(to bottom right,#111827,#0B0F19);
  touch-action:pan-y;user-select:none;-webkit-user-select:none;
  -webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;
}
.r3d-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
/* Full-page landing takeover: the player owns the whole screen, so the drag
   surface (the canvas) hands NO touch gesture to the browser. touch-action:none
   stops the in-app browser (Instagram, etc.) from turning a vertical drag into
   pull-to-refresh (a full page RELOAD that re-shows the loader) or a chrome
   show/hide (which reflows + clips the bottom CTAs). Scrubbing still works — it's
   driven by pointer events, which fire regardless. It's scoped to the CANVAS (not
   the stage) so the lead-form overlay above it can still scroll on touch, and so
   embeds — which don't get .r3d-landing — keep touch-action:pan-y for host-page
   scroll. The canvas is inset:0 (fills the stage) and the hint/headline overlays
   are pointer-events:none, so touches fall through to it across the whole surface. */
.r3d-stage.r3d-landing canvas{touch-action:none}
.r3d-stage.r3d-landing{overscroll-behavior:none}
.r3d-stage.r3d-grabbing canvas{cursor:grabbing}
.r3d-scrim-top{position:absolute;top:0;left:0;right:0;height:120px;pointer-events:none;background:linear-gradient(to bottom,rgba(11,15,25,.55),transparent);transition:opacity .3s}
.r3d-scrim-bot{position:absolute;bottom:0;left:0;right:0;height:190px;pointer-events:none;background:linear-gradient(to top,rgba(11,15,25,.72),transparent);transition:opacity .3s}
/* zoomed in → fade the scrims so a screen-filling product isn't washed out */
.r3d-zoomed .r3d-scrim-top,.r3d-zoomed .r3d-scrim-bot{opacity:0}
.r3d-topbar{position:absolute;top:0;left:0;right:0;display:flex;align-items:flex-start;justify-content:space-between;padding:max(16px,env(safe-area-inset-top)) 16px 0;gap:12px;z-index:5}
.r3d-brand{display:flex;align-items:center;gap:10px;min-width:0}
.r3d-logo{width:30px;height:30px;border-radius:9px;flex:none;background:linear-gradient(135deg,var(--r3d-primary),var(--r3d-secondary));box-shadow:var(--r3d-glow);display:grid;place-items:center}
.r3d-logo svg{width:16px;height:16px;color:#fff}
/* theme-adaptive halo keeps a static brand logo legible on any background:
   dark bg → faint light ring (protects dark logos); light bg override below */
.r3d-logo-img{height:34px;max-width:130px;object-fit:contain;flex:none;filter:drop-shadow(0 0 2px rgba(0,0,0,.45)) drop-shadow(0 0 6px rgba(255,255,255,.14))}
.r3d-titles{min-width:0}
.r3d-kicker{font-size:clamp(9px,2.6vmin,11px);letter-spacing:.14em;text-transform:uppercase;color:var(--r3d-muted)}
.r3d-name{font-weight:600;font-size:clamp(13px,4vmin,16px);line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r3d-tools{display:flex;gap:clamp(6px,1.8vmin,8px);flex:none}
/* Chrome scales fluidly with the container (embeds/mobile) but is bounded so
   desktop stays as designed and touch targets don't get too small. */
.r3d-iconbtn{width:clamp(32px,9vmin,40px);height:clamp(32px,9vmin,40px);border-radius:clamp(9px,2.6vmin,12px);border:1px solid var(--r3d-line);background:var(--r3d-glass);backdrop-filter:blur(10px);color:#eef1f6;display:grid;place-items:center;cursor:pointer;transition:background .2s,transform .1s;font-size:clamp(15px,4.5vmin,20px);line-height:1}
.r3d-iconbtn:hover{background:var(--r3d-glass2)}
.r3d-iconbtn:active{transform:translateY(1px)}
.r3d-iconbtn svg{width:clamp(14px,4vmin,18px);height:clamp(14px,4vmin,18px)}
.r3d-zoomcol{position:absolute;right:14px;bottom:calc(146px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;z-index:6}
/* angle indicator — subtle blurred pill so it reads on the product's shadow/platform */
.r3d-rot{position:absolute;left:50%;bottom:calc(128px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:8px;color:var(--r3d-muted);font-size:11px;font-weight:500;background:rgba(11,15,25,.45);border:1px solid var(--r3d-line);border-radius:999px;padding:5px 11px;backdrop-filter:blur(8px)}
.r3d-track{position:relative;width:132px;height:3px;border-radius:2px;background:rgba(255,255,255,.12)}
.r3d-fill{position:absolute;top:-3px;width:9px;height:9px;border-radius:50%;background:linear-gradient(135deg,var(--r3d-primary),var(--r3d-secondary));box-shadow:var(--r3d-glow);transform:translateX(-50%)}
.r3d-ctas{position:absolute;left:0;right:0;bottom:0;z-index:5;display:flex;gap:clamp(8px,2.4vmin,12px);padding:clamp(10px,2.8vmin,14px) clamp(12px,3.4vmin,16px) calc(clamp(12px,3.4vmin,16px) + env(safe-area-inset-bottom));max-width:640px;margin:0 auto}
.r3d-cta{flex:1;text-align:center;padding:clamp(9px,3vmin,14px) clamp(11px,3.4vmin,16px);border-radius:clamp(10px,3vmin,14px);font-weight:600;font-size:clamp(12.5px,3.4vmin,15px);color:#fff;cursor:pointer;border:1px solid var(--r3d-line);font-family:inherit;transition:transform .12s,filter .2s,background .2s}
.r3d-primary{border:none;background:linear-gradient(135deg,var(--r3d-primary),var(--r3d-secondary));box-shadow:0 10px 30px -10px var(--r3d-secondary)}
.r3d-primary:hover{filter:brightness(1.08)}
.r3d-ghost{background:var(--r3d-glass);backdrop-filter:blur(10px)}
.r3d-ghost:hover{background:var(--r3d-glass2)}
.r3d-cta:active{transform:translateY(1px)}
/* hint sits UNDER the product (lower third), not over it; the max() floor keeps
   it clear of the angle navigator (.r3d-rot at bottom:118px) on short viewports */
.r3d-hint{position:absolute;left:50%;bottom:max(28%,200px);top:auto;transform:translateX(-50%);z-index:4;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none;transition:opacity .5s}
.r3d-hint.r3d-gone{opacity:0}
.r3d-hand{width:52px;height:52px;border-radius:50%;border:1px solid var(--r3d-line);background:rgba(11,15,25,.4);backdrop-filter:blur(8px);display:grid;place-items:center;animation:r3dsway 1.8s ease-in-out infinite}
.r3d-hand svg{width:24px;height:24px;color:#eef1f6}
.r3d-hint span{font-size:clamp(10px,3.4vmin,13px);font-weight:600;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.95),0 2px 14px rgba(0,0,0,.75)}
@keyframes r3dsway{0%,100%{transform:translateX(-12px)}50%{transform:translateX(12px)}}
/* Drift player chrome: "drag to drift" arrow (flips with drag direction), no
   bottom scrim, and the angle number hidden (the scrubber track stays). */
.r3d-drift .r3d-scrim-bot{display:none}
/* Drift: hide the angle scrubber entirely — the drag helper + headline dissolve
   convey position, and it was colliding with the helper arrow. */
.r3d-drift .r3d-rot{display:none!important}
/* "drag to drift" is positioned imperatively just under the product (see draw). */
/* Drift helper: an inline [text + arrow] cue. JS aligns it to the frame's LEFT
   edge going forward and its RIGHT edge going backward; row-reverse puts the arrow
   on the leading (swipe-direction) side of the text. */
.r3d-drift .r3d-hint{opacity:.96;flex-direction:column;align-items:flex-start;gap:7px}
.r3d-drift .r3d-hint.r3d-back{align-items:flex-end}
.r3d-drift-cue{display:flex;align-items:center;gap:9px}
.r3d-drift .r3d-hint.r3d-back .r3d-drift-cue{flex-direction:row-reverse}
.r3d-drift .r3d-hint span{font-size:clamp(12px,3.8vmin,15px);font-weight:650}
/* the drift helper hides between its start/end appearances (hand sequence) */
.r3d-drift .r3d-hint.r3d-gone{opacity:0}
.r3d-drift-hand{width:28px;height:28px;color:#eef1f6;animation:r3dsway 1.8s ease-in-out infinite;transition:opacity .3s}
.r3d-drift-hand svg{width:19px;height:19px}
/* only the hand hides between its start/end appearances; arrow + text stay */
.r3d-drift-hand.r3d-gone{opacity:0}
.r3d-drift-hand{width:clamp(26px,7.5vmin,34px);height:clamp(26px,7.5vmin,34px);display:grid;place-items:center;color:#eef1f6}
.r3d-drift-hand svg{width:clamp(17px,5vmin,22px);height:clamp(17px,5vmin,22px)}
.r3d-drift-arrow{display:inline-flex;align-items:center;color:#22d3ee;flex:none;animation:r3darrownudge 1.4s ease-in-out infinite}
.r3d-drift .r3d-hint.r3d-back .r3d-drift-arrow{animation:r3darrownudgeback 1.4s ease-in-out infinite}
.r3d-drift-arrow svg{width:clamp(20px,6vmin,26px);height:clamp(20px,6vmin,26px);filter:drop-shadow(0 1px 3px rgba(0,0,0,.9));transition:transform .25s}
@keyframes r3darrownudge{0%,100%{transform:translateX(0)}50%{transform:translateX(5px)}}
@keyframes r3darrownudgeback{0%,100%{transform:translateX(0)}50%{transform:translateX(-5px)}}
@media (prefers-reduced-motion:reduce){.r3d-drift-arrow{animation:none!important}}
.r3d-hint.r3d-back .r3d-drift-arrow svg{transform:scaleX(-1)}
@media (prefers-reduced-motion:reduce){.r3d-drift-hand{animation:none}}
/* One-time first-visit drag demo — a finger (with a touch ripple) drags across
   the frame while the content scrubs. Position + opacity are driven from the RAF
   loop; the ring pulses only while the demo is on. */
.r3d-intro{position:absolute;left:0;top:0;z-index:8;transform:translate(-50%,-50%);pointer-events:none;opacity:0;display:grid;place-items:center;color:#fff}
.r3d-intro svg{width:clamp(30px,8vmin,40px);height:clamp(30px,8vmin,40px);filter:drop-shadow(0 2px 10px rgba(0,0,0,.7))}
.r3d-intro-ring{position:absolute;width:clamp(46px,12vmin,60px);height:clamp(46px,12vmin,60px);border-radius:50%;background:rgba(255,255,255,.16);border:1.5px solid rgba(255,255,255,.55);box-shadow:0 0 18px rgba(255,255,255,.25)}
.r3d-intro.r3d-intro-on .r3d-intro-ring{animation:r3dintropulse 1.15s ease-in-out infinite}
@keyframes r3dintropulse{0%,100%{transform:scale(.82);opacity:.55}50%{transform:scale(1.08);opacity:.95}}
/* during the demo, hide the resting hint so there's just the one moving finger */
.r3d-introing .r3d-hint{opacity:0!important}
@media (prefers-reduced-motion:reduce){.r3d-intro-ring{animation:none}}
/* Drift: "Powered By Drift Link" sits UNDER the player, above the CTA, a bit bigger. */
.r3d-drift .r3d-powered-badge{top:auto;bottom:calc(36px + env(safe-area-inset-bottom));font-size:clamp(10px,3vmin,12px)}
.r3d-drift .r3d-powered-badge svg{width:clamp(12px,3.4vmin,14px);height:clamp(12px,3.4vmin,14px)}
/* Drift: lift the CTA a touch off the very edge (standard spacing). */
.r3d-drift .r3d-ctas{padding-bottom:calc(64px + env(safe-area-inset-bottom))}
/* Right (secondary) CTA is purple; the left (primary) stays the brand blue. */
/* Drift CTAs: solid colours (no gradient) — left blue, right purple, all drifts. */
.r3d-drift .r3d-cta.r3d-primary{background:#3b82f6;border:none;box-shadow:0 10px 30px -12px rgba(59,130,246,.6)}
.r3d-drift .r3d-cta.r3d-ghost{background:#8b5cf6;border:none;color:#fff;backdrop-filter:none;box-shadow:0 10px 30px -12px rgba(139,92,246,.6)}
.r3d-drift .r3d-cta.r3d-ghost:hover{filter:brightness(1.08)}
/* Bottom stack (drift): CTA buttons up top, then the "Powered by" badge, then
   the landing's Terms/Privacy at the very bottom — see the badge + ctas rules. */
/* Drift mobile: hide reset + fullscreen (keep it clean). */
@media (max-width:560px){
  .r3d-drift [data-reset],.r3d-drift [data-fs]{display:none!important}
}
/* Drift: crossfading dual headline (headline 1 at start → headline 2 at the end). */
.r3d-heads{position:absolute;left:0;right:0;top:calc(64px + env(safe-area-inset-top));z-index:4;display:flex;flex-direction:column;align-items:center;padding:0 20px;pointer-events:none;text-align:center}
.r3d-heads-stack{display:grid;place-items:center}
.r3d-head{grid-area:1/1;font-size:clamp(17px,5.6vmin,24px);font-weight:800;line-height:1.15;letter-spacing:-.01em;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.6);transition:opacity .5s ease}
.r3d-heads-desc-stack{display:grid;place-items:center;margin-top:8px}
.r3d-heads-desc{grid-area:1/1;font-size:clamp(12px,3.7vmin,15px);line-height:1.5;color:#d3dae7;text-shadow:0 1px 10px rgba(0,0,0,.6);max-width:42ch;transition:opacity .5s ease}
/* Drift headlines read a touch larger; still fluid so small embeds stay tidy. */
.r3d-drift .r3d-head{font-size:clamp(18px,6.2vmin,27px)}
.r3d-drift .r3d-heads-desc{font-size:clamp(13px,4vmin,17px)}
@media (max-width:560px){
  .r3d-drift .r3d-info-title{font-size:26px}
  .r3d-drift .r3d-info-desc{font-size:16px}
}
.r3d-loader{position:absolute;inset:0;z-index:20;display:grid;place-items:center;background:linear-gradient(to bottom right,#111827,#0B0F19);transition:opacity .5s}
.r3d-loader.r3d-gone{opacity:0;pointer-events:none}
.r3d-ring{width:64px;height:64px;transform:rotate(-90deg)}
.r3d-ring circle{fill:none;stroke-width:5;stroke-linecap:round}
.r3d-ring-bg{stroke:rgba(255,255,255,.10)}
.r3d-ring-fg{stroke:url(#r3dg);transition:stroke-dashoffset .1s linear}
.r3d-loadwrap{display:flex;flex-direction:column;align-items:center;gap:14px}
.r3d-pct{font-weight:600;font-size:13px;color:var(--r3d-muted)}
.r3d-lbl{font-size:12px;color:var(--r3d-muted);letter-spacing:.14em;text-transform:uppercase}
.r3d-powered{margin-top:4px;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--r3d-muted);opacity:.65}
.r3d-powered b{font-weight:700}
.r3d-drift .r3d-powered b{color:#22d3ee}
@media (prefers-reduced-motion:reduce){.r3d-hand{animation:none}}
/* pseudo-fullscreen (iOS fallback): fix the stage to fill the viewport */
.r3d-pseudo-fs{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;z-index:2147483000!important;margin:0!important}
:root.r3d-fs-lock,html.r3d-fs-lock{overflow:hidden!important}
/* hero variant: contained, transparent, chrome-less spinning object */
/* hero fills its parent and is transparent by default (blends into the page),
   but an explicit product background still shows through via inline style */
.r3d-hero{height:100%!important;background:transparent}
.r3d-hero .r3d-scrim-top,.r3d-hero .r3d-scrim-bot,.r3d-hero .r3d-topbar,.r3d-hero .r3d-zoomcol,.r3d-hero .r3d-rot,.r3d-hero .r3d-ctas,.r3d-hero .r3d-loader{display:none!important}
/* gallery tiles: keep the drag hint small and low so it sits under the product */
.r3d-hero .r3d-hint{bottom:8%;gap:5px;opacity:.8}
/* the hero rule above has equal specificity to .r3d-hint.r3d-gone but comes later,
   so it used to override the dismiss — this makes the gone-state win on hero too */
.r3d-hero .r3d-hint.r3d-gone{opacity:0}
.r3d-hero .r3d-hand{width:32px;height:32px}
.r3d-hero .r3d-hand svg{width:15px;height:15px}
.r3d-hero .r3d-drift-arrow{width:34px;height:34px}
.r3d-hero .r3d-drift-arrow svg{width:16px;height:16px}
.r3d-hero .r3d-hint span{font-size:11px}
/* mobile: keep controls off the product + clear of each other */
@media (max-width:560px){
  .r3d-iconbtn{width:40px;height:40px}
  .r3d-name{font-size:14px;max-width:52vw}
  .r3d-thumbs{bottom:calc(82px + env(safe-area-inset-bottom))}
  .r3d-thumb{width:42px;height:42px}
  .r3d-rot{bottom:calc(132px + env(safe-area-inset-bottom))}
  .r3d-rot .r3d-track{width:88px}
  .r3d-hint{bottom:max(26%,200px)}
  .r3d-zoomcol{bottom:calc(146px + env(safe-area-inset-bottom))}
  .r3d-cta{padding:13px 12px;font-size:14px}
  /* Drift mobile: bigger arrow + text, buttons lifted higher, badge kept clear
     above them (leaving room below the buttons for the landing legal links). */
  .r3d-drift-hand{width:40px;height:40px}
  .r3d-drift-hand svg{width:27px;height:27px}
  .r3d-drift-arrow svg{width:32px;height:32px}
  .r3d-drift .r3d-hint span{font-size:16px}
  .r3d-drift .r3d-powered-badge{bottom:calc(36px + env(safe-area-inset-bottom))}
  .r3d-drift .r3d-ctas{padding-bottom:calc(78px + env(safe-area-inset-bottom))}
  /* +/- zoom controls are off on phones by default (superadmin can turn them on). */
  .r3d-no-mobile-zoom .r3d-zoomcol{display:none!important}
}
/* persistent viral attribution — shows on every embed regardless of the tenant
   brand toggle (brand=0 only hides the tenant's own logo/name). Bottom-left, above
   the CTA bar; drops to the edge when there are no CTAs; hidden on hero tiles. */
/* subtle "Powered by Rotation3D" caption at the TOP, clear of the bottom controls */
.r3d-powered-badge{position:absolute;left:50%;transform:translateX(-50%);top:calc(60px + env(safe-area-inset-top));z-index:6;display:flex;align-items:center;gap:5px;white-space:nowrap;color:var(--r3d-muted);font-size:10px;letter-spacing:.03em;line-height:1;text-decoration:none;opacity:.7;text-shadow:0 1px 6px rgba(0,0,0,.55);transition:opacity .2s}
.r3d-powered-badge:hover{opacity:1}
.r3d-powered-badge svg{width:12px;height:12px;color:var(--r3d-secondary)}
.r3d-powered-badge b{font-weight:700}
/* Drift: match the "Drift Link Interactive" wordmark accent (cyan) used in the landing header. */
.r3d-drift .r3d-powered-badge b{color:#22d3ee}
.r3d-hero .r3d-powered-badge{display:none!important}
.r3d-light .r3d-powered-badge{color:#5b6472;text-shadow:none}

/* landscape phone (short viewport): the angle navigator + hint sit ~150px up,
   which lands right over the product on a short sideways screen ("toggle covering
   product"). Pull all chrome to the very bottom edge, and trim the scrims that
   read as bars across a wide short frame. */
@media (orientation:landscape) and (max-height:540px){
  .r3d-thumbs{bottom:max(6px,env(safe-area-inset-bottom))}
  .r3d-thumb{width:36px;height:36px}
  .r3d-rot{bottom:52px}
  .r3d-rot .r3d-track{width:100px}
  .r3d-hint{bottom:82px}
  .r3d-hand{width:32px;height:32px}
  .r3d-zoomcol{bottom:52px}
  .r3d-scrim-bot{height:150px}
  .r3d-scrim-top{height:64px}
}
/* thumbnail-box view selector (e-commerce style): interactive 360° + 4 stills.
   Selecting a still shows it large (.r3d-media) with the canvas hidden. */
.r3d-thumbs{position:absolute;left:50%;bottom:calc(76px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:7;display:flex;gap:8px}
.r3d-thumb{position:relative;width:44px;height:44px;padding:0;border-radius:10px;overflow:hidden;border:2px solid var(--r3d-line);background:rgba(11,15,25,.5);cursor:pointer;transition:border-color .2s,transform .1s}
.r3d-thumb:hover{transform:translateY(-1px)}
.r3d-thumb.active{border-color:var(--r3d-primary)}
.r3d-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.r3d-thumb-360{position:absolute;inset:0;display:grid;place-items:center;font-size:9px;font-weight:800;letter-spacing:.03em;color:#fff;background:rgba(0,0,0,.32);text-shadow:0 1px 4px #000}
.r3d-media{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:70px 14px 150px}
.r3d-media-still{max-width:100%;max-height:100%;object-fit:contain;border-radius:14px}
.r3d-media-mode canvas{opacity:0}
.r3d-media-mode .r3d-zoomcol,.r3d-media-mode .r3d-rot,.r3d-media-mode .r3d-hint{display:none!important}
.r3d-light .r3d-thumb{background:rgba(255,255,255,.6)}

/* optional product info (title + description). Only rendered when the brand sets
   it, so default players look unchanged. Desktop: right, vertically centered;
   mobile: top under the topbar. pointer-events:none so it never blocks the drag. */
.r3d-info{position:absolute;z-index:4;pointer-events:none;color:#eef1f6;text-shadow:0 1px 12px rgba(0,0,0,.6)}
.r3d-info-title{font-size:18px;font-weight:700;line-height:1.2}
.r3d-info-desc{margin-top:6px;font-size:13px;line-height:1.5;color:#c7cdd9}
@media (min-width:768px){
  .r3d-info{right:22px;top:50%;transform:translateY(-50%);max-width:min(300px,32%);text-align:right}
}
@media (max-width:767px){
  .r3d-info{left:16px;right:16px;top:calc(92px + env(safe-area-inset-top));text-align:center;max-height:22vh;overflow:hidden}
  .r3d-info-title{font-size:16px}
  .r3d-info-desc{font-size:12px;margin-top:4px}
}
.r3d-light .r3d-info{color:#0b0f19;text-shadow:none}
.r3d-light .r3d-info-desc{color:#3a4150}
/* embed chrome toggles */
.r3d-no-controls .r3d-zoomcol,.r3d-no-controls .r3d-tools,.r3d-no-controls .r3d-rot{display:none!important}
.r3d-no-ctas .r3d-ctas{display:none!important}
.r3d-no-brand .r3d-brand,.r3d-no-brand .r3d-powered{display:none!important}
.r3d-no-logo .r3d-logo-img,.r3d-no-logo .r3d-logo{display:none!important}
.r3d-no-name .r3d-kicker{display:none!important}
.r3d-no-title .r3d-name{display:none!important}
.r3d-no-tools [data-reset],.r3d-no-tools [data-fs]{display:none!important}
/* light background → flip text + controls to dark for contrast */
.r3d-light .r3d-logo-img{filter:drop-shadow(0 0 1px rgba(0,0,0,.55)) drop-shadow(0 1px 5px rgba(0,0,0,.3))}
.r3d-light .r3d-name{color:#0b0f19}
.r3d-light .r3d-kicker{color:#5b6472}
.r3d-light .r3d-hint span{color:#0b0f19;text-shadow:none}
.r3d-light .r3d-hand{border-color:rgba(0,0,0,.12);background:rgba(255,255,255,.55)}
.r3d-light .r3d-hand svg{color:#0b0f19}
.r3d-light .r3d-iconbtn{border-color:rgba(0,0,0,.12);background:rgba(0,0,0,.05);color:#0b0f19}
.r3d-light .r3d-iconbtn:hover{background:rgba(0,0,0,.10)}
.r3d-light .r3d-rot{color:#5b6472;background:rgba(255,255,255,.6);border-color:rgba(0,0,0,.10)}
.r3d-light .r3d-track{background:rgba(0,0,0,.12)}
.r3d-light .r3d-cta.r3d-ghost{background:rgba(0,0,0,.05);color:#0b0f19;border-color:rgba(0,0,0,.12)}
.r3d-light .r3d-cta.r3d-ghost:hover{background:rgba(0,0,0,.10)}
.r3d-light .r3d-scrim-top{background:linear-gradient(to bottom,rgba(255,255,255,.42),transparent)}
.r3d-light .r3d-scrim-bot{background:linear-gradient(to top,rgba(255,255,255,.48),transparent)}
.r3d-light .r3d-loader{background:#f4f5f7}
.r3d-light .r3d-pct,.r3d-light .r3d-lbl{color:#5b6472}
.r3d-light .r3d-ring-bg{stroke:rgba(0,0,0,.10)}
`;
