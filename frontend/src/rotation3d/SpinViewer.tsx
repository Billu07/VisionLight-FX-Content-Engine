import { useEffect, useRef, type CSSProperties } from "react";

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
  /** frame index shown on load / reset (centered "hero" angle) */
  defaultFrame?: number;
};

export type SpinCta = { label: string; url: string; newTab?: boolean };

export type SpinViewerProps = {
  manifest: SpinManifest;
  productName?: string;
  brandName?: string;
  ctaPrimary?: SpinCta;
  ctaSecondary?: SpinCta;
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
};

const clampZoom = (z: number) => Math.max(0.7, Math.min(2.8, z));

// Is the player background a light color? (so we flip text/controls to dark).
const isLightColor = (bg?: string | null): boolean => {
  if (!bg) return false; // empty → default dark studio gradient
  const s = bg.trim().toLowerCase();
  if (s === "white") return true;
  if (s === "black") return false;
  let hex = s.replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6}$/.test(hex)) return false;
  const n = parseInt(hex, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
};

export default function SpinViewer({
  manifest,
  productName = "Product",
  brandName = "Rotation3D",
  ctaPrimary,
  ctaSecondary,
  onCtaClick,
  className,
  variant = "full",
  logoUrl,
  primaryColor,
  secondaryColor,
  background,
}: SpinViewerProps) {
  const hero = variant === "hero";
  const lightBg = isLightColor(background);
  const stageStyle: CSSProperties = {
    ...(primaryColor ? { ["--r3d-primary" as any]: primaryColor } : {}),
    ...(secondaryColor ? { ["--r3d-secondary" as any]: secondaryColor } : {}),
    ...(background && !hero ? { background } : {}),
  };
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const degRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const pctRef = useRef<HTMLDivElement>(null);
  const fsIconRef = useRef<SVGSVGElement>(null);

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
    let yaw = (DEFAULT_FRAME / FRAMES) * TWO_PI;
    let yawVel = 0;
    let zoom = 1, zoomTarget = 1;
    let panX = 0, panY = 0, panTX = 0, panTY = 0;
    let idleSpin = false; // no auto-rotation; the "Drag to rotate" hint invites it
    let dirty = true, lastYaw = NaN, lastZoom = NaN, lastPX = 0, lastPY = 0;
    let interacted = false;
    let raf = 0;
    let alive = true;

    // --- frame images (real mode) ---
    const urls = manifest.frames;
    const realMode = Array.isArray(urls) && urls.length > 0;
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
      cv.width = Math.round(r.width * DPR);
      cv.height = Math.round(r.height * DPR);
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
        const a = (((frame - d) % FRAMES) + FRAMES) % FRAMES;
        const b = (frame + d) % FRAMES;
        if (isReady(imgs[a])) return imgs[a];
        if (isReady(imgs[b])) return imgs[b];
      }
      return null;
    };

    const drawFrameImage = (frame: number, cx: number, cy: number, scale: number) => {
      const img = nearestLoaded(frame);
      if (!img) return;
      // contain-fit the frame into a square-ish box around center
      const box = scale * 4.2;
      const ar = img.naturalWidth / img.naturalHeight;
      let w = box, h = box / ar;
      if (h > box) { h = box; w = box * ar; }
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
    };

    const draw = () => {
      const step = TWO_PI / FRAMES;
      const q = Math.round(yaw / step) * step;
      const frame = ((Math.round(yaw / step) % FRAMES) + FRAMES) % FRAMES;
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      const scale = Math.min(W, H) * 0.23 * zoom;
      const cx = W / 2 + panX * DPR, cy = H * 0.47 + panY * DPR;

      ctx.save();
      drawShadow(cx, cy, scale);
      ctx.restore();

      if (realMode) drawFrameImage(frame, cx, cy, scale);
      else drawSynthetic(q, cx, cy, scale);

      const n01 = (((yaw % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI;
      if (degRef.current) degRef.current.textContent = Math.round(n01 * 360) + "°";
      if (fillRef.current) fillRef.current.style.left = n01 * 100 + "%";
    };

    const tick = () => {
      if (!alive) return;
      if (idleSpin) yaw += 0.004;
      else if (Math.abs(yawVel) > 0.00003) { yaw += yawVel; yawVel *= 0.94; }
      zoom += (zoomTarget - zoom) * 0.18; // eased zoom for a premium feel
      if (zoomTarget <= 1.1) { panTX = 0; panTY = 0; }
      panX += (panTX - panX) * 0.2;
      panY += (panTY - panY) * 0.2;
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
      raf = requestAnimationFrame(tick);
    };

    // --- input ---
    const engage = () => {
      if (!interacted) {
        interacted = true;
        idleSpin = false;
        hintRef.current?.classList.add("r3d-gone");
      }
    };
    let dragging = false, lastX = 0, lastY = 0, lastT = 0, pinchD = 0;
    const pointers = new Map<number, PointerEvent>();
    const isControl = (t: EventTarget | null) =>
      t instanceof Element && (t.closest(".r3d-iconbtn") || t.closest(".r3d-cta"));

    const down = (e: PointerEvent) => {
      engage();
      dragging = true;
      yawVel = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = performance.now();
      stage.classList.add("r3d-grabbing");
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      // Horizontal drag always rotates — you can spin even while zoomed in.
      const k = 0.006;
      yaw += dx * k;
      yawVel = ((dx * k) / dt) * 16;
      // Vertical drag pans up/down to inspect when zoomed in.
      if (zoomTarget > 1.15) {
        const lim = 130 * (zoomTarget - 1);
        panTY = Math.max(-lim, Math.min(lim, panTY + dy));
        panY = panTY;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;
    };
    const up = () => { dragging = false; stage.classList.remove("r3d-grabbing"); };

    const onDown = (e: PointerEvent) => {
      if (isControl(e.target)) return;
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, e);
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
      if (now - lastTap < 300) {
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
      e.preventDefault();
      engage();
      zoomTarget = clampZoom(zoomTarget * (e.deltaY < 0 ? 1.1 : 0.9));
    };
    const onKey = (e: KeyboardEvent) => {
      const step = TWO_PI / FRAMES;
      if (e.key === "ArrowLeft") { engage(); yaw -= step; }
      else if (e.key === "ArrowRight") { engage(); yaw += step; }
      else if (e.key === "+" || e.key === "=") zoomTarget = clampZoom(zoomTarget * 1.2);
      else if (e.key === "-") zoomTarget = clampZoom(zoomTarget * 0.83);
      else if (e.key === "r" || e.key === "R") { yaw = (DEFAULT_FRAME / FRAMES) * TWO_PI; zoomTarget = 1; panX = panY = panTX = panTY = 0; }
      else if (e.key === "f" || e.key === "F") toggleFs();
    };

    const toggleFs = () => {
      if (!document.fullscreenElement) stage.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    };
    const onFsChange = () => {
      const el = fsIconRef.current;
      if (el)
        el.innerHTML = document.fullscreenElement
          ? '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>'
          : '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>';
      setTimeout(fit, 60);
    };

    // control buttons (delegated within the stage)
    const onClick = (e: MouseEvent) => {
      const t = e.target as Element;
      const zbtn = t.closest("[data-z]");
      if (zbtn) {
        engage();
        zoomTarget = clampZoom(zoomTarget * (Number(zbtn.getAttribute("data-z")) > 0 ? 1.25 : 0.8));
      } else if (t.closest("[data-reset]")) {
        yaw = (DEFAULT_FRAME / FRAMES) * TWO_PI; yawVel = 0; zoomTarget = 1; panX = panY = panTX = panTY = 0;
      } else if (t.closest("[data-fs]")) {
        toggleFs();
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
    window.addEventListener("resize", fit);

    // --- loading / preload ---
    const C = 2 * Math.PI * 27;
    if (ringRef.current) {
      ringRef.current.style.strokeDasharray = String(C);
      ringRef.current.style.strokeDashoffset = String(C);
    }
    const setProgress = (p: number) => {
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(C * (1 - p / 100));
      if (pctRef.current) pctRef.current.textContent = Math.round(p) + "%";
    };
    const finishLoad = () => {
      loaderRef.current?.classList.add("r3d-gone");
      if (!hero) stage.focus({ preventScroll: true });
    };

    if (realMode) {
      const n = urls!.length;
      // Prioritize the hero frame + its neighbors, then fan outward, so the
      // viewer reveals almost instantly and the rest stream in behind it.
      const order: number[] = [DEFAULT_FRAME];
      for (let d = 1; d <= n; d++) {
        order.push((((DEFAULT_FRAME - d) % n) + n) % n, (DEFAULT_FRAME + d) % n);
      }
      const seq = [...new Set(order)].slice(0, n);
      let revealed = false;
      seq.forEach((i, k) => {
        const im = new Image();
        im.decoding = "async";
        if (k < 4) (im as any).fetchPriority = "high";
        im.onload = im.onerror = () => {
          imgs[i] = im;
          loaded++;
          setProgress((loaded / n) * 100);
          if (!revealed && (isReady(imgs[DEFAULT_FRAME]) || loaded >= Math.min(6, n))) {
            revealed = true;
            finishLoad();
          }
        };
        im.src = urls![i];
      });
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

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stage.removeEventListener("pointerdown", onDown);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerup", onUp);
      stage.removeEventListener("pointercancel", onUp);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("keydown", onKey);
      stage.removeEventListener("click", onClick);
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("resize", fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, FRAMES, DEFAULT_FRAME, hero]);

  const fireCta = (which: "primary" | "secondary", cta?: SpinCta) => {
    if (!cta) return;
    onCtaClick?.(which, cta);
    if (cta.url && cta.url !== "#") {
      if (cta.newTab === false) window.location.href = cta.url;
      else window.open(cta.url, "_blank", "noopener");
    }
  };

  return (
    <div ref={stageRef} className={`r3d-stage ${hero ? "r3d-hero" : ""} ${lightBg ? "r3d-light" : ""} ${className || ""}`}
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
          <button className="r3d-iconbtn" data-reset title="Reset view" aria-label="Reset view">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
          <button className="r3d-iconbtn" data-fs title="Fullscreen" aria-label="Toggle fullscreen">
            <svg ref={fsIconRef} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
          </button>
        </div>
      </div>

      <div className="r3d-zoomcol">
        <button className="r3d-iconbtn" data-z="1" aria-label="Zoom in">+</button>
        <button className="r3d-iconbtn" data-z="-1" aria-label="Zoom out">−</button>
      </div>

      <div className="r3d-rot" aria-hidden>
        <span ref={degRef}>0°</span>
        <div className="r3d-track"><div className="r3d-fill" ref={fillRef} /></div>
      </div>

      <div className="r3d-hint" ref={hintRef}>
        <div className="r3d-hand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-2.5-4a2 2 0 0 1 3.4-2L8 14" /></svg>
        </div>
        <span>Drag to rotate</span>
      </div>

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
          <div className="r3d-lbl">Preparing spin</div>
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
  position:relative;height:100dvh;width:100%;overflow:hidden;outline:none;
  font-family:"Bai Jamjuree",ui-sans-serif,system-ui,sans-serif;color:#eef1f6;
  background:radial-gradient(120% 80% at 50% -10%,#1a2336 0%,rgba(17,24,39,0) 55%),linear-gradient(to bottom right,#111827,#0B0F19);
  touch-action:none;user-select:none;-webkit-user-select:none;
  overscroll-behavior:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;
}
.r3d-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab}
.r3d-stage.r3d-grabbing canvas{cursor:grabbing}
.r3d-scrim-top{position:absolute;top:0;left:0;right:0;height:120px;pointer-events:none;background:linear-gradient(to bottom,rgba(11,15,25,.55),transparent)}
.r3d-scrim-bot{position:absolute;bottom:0;left:0;right:0;height:190px;pointer-events:none;background:linear-gradient(to top,rgba(11,15,25,.72),transparent)}
.r3d-topbar{position:absolute;top:0;left:0;right:0;display:flex;align-items:flex-start;justify-content:space-between;padding:max(16px,env(safe-area-inset-top)) 16px 0;gap:12px;z-index:5}
.r3d-brand{display:flex;align-items:center;gap:10px;min-width:0}
.r3d-logo{width:30px;height:30px;border-radius:9px;flex:none;background:linear-gradient(135deg,var(--r3d-primary),var(--r3d-secondary));box-shadow:var(--r3d-glow);display:grid;place-items:center}
.r3d-logo svg{width:16px;height:16px;color:#fff}
.r3d-logo-img{height:34px;max-width:130px;object-fit:contain;flex:none;filter:drop-shadow(0 1px 6px rgba(0,0,0,.4))}
.r3d-titles{min-width:0}
.r3d-kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--r3d-muted)}
.r3d-name{font-weight:600;font-size:16px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.r3d-tools{display:flex;gap:8px;flex:none}
.r3d-iconbtn{width:40px;height:40px;border-radius:12px;border:1px solid var(--r3d-line);background:var(--r3d-glass);backdrop-filter:blur(10px);color:#eef1f6;display:grid;place-items:center;cursor:pointer;transition:background .2s,transform .1s;font-size:20px;line-height:1}
.r3d-iconbtn:hover{background:var(--r3d-glass2)}
.r3d-iconbtn:active{transform:translateY(1px)}
.r3d-iconbtn svg{width:18px;height:18px}
.r3d-zoomcol{position:absolute;right:14px;bottom:calc(100px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;z-index:6}
.r3d-rot{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);z-index:5;display:flex;align-items:center;gap:10px;color:var(--r3d-muted);font-size:12px;font-weight:500;background:rgba(11,15,25,.35);border:1px solid var(--r3d-line);border-radius:999px;padding:6px 12px;backdrop-filter:blur(8px)}
.r3d-track{position:relative;width:132px;height:3px;border-radius:2px;background:rgba(255,255,255,.12)}
.r3d-fill{position:absolute;top:-3px;width:9px;height:9px;border-radius:50%;background:linear-gradient(135deg,var(--r3d-primary),var(--r3d-secondary));box-shadow:var(--r3d-glow);transform:translateX(-50%)}
.r3d-ctas{position:absolute;left:0;right:0;bottom:0;z-index:5;display:flex;gap:12px;padding:14px 16px calc(16px + env(safe-area-inset-bottom));max-width:640px;margin:0 auto}
.r3d-cta{flex:1;text-align:center;padding:14px 16px;border-radius:14px;font-weight:600;font-size:15px;color:#fff;cursor:pointer;border:1px solid var(--r3d-line);font-family:inherit;transition:transform .12s,filter .2s,background .2s}
.r3d-primary{border:none;background:linear-gradient(135deg,var(--r3d-primary),var(--r3d-secondary));box-shadow:0 10px 30px -10px var(--r3d-secondary)}
.r3d-primary:hover{filter:brightness(1.08)}
.r3d-ghost{background:var(--r3d-glass);backdrop-filter:blur(10px)}
.r3d-ghost:hover{background:var(--r3d-glass2)}
.r3d-cta:active{transform:translateY(1px)}
.r3d-hint{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;display:flex;flex-direction:column;align-items:center;gap:12px;pointer-events:none;transition:opacity .5s}
.r3d-hint.r3d-gone{opacity:0}
.r3d-hand{width:52px;height:52px;border-radius:50%;border:1px solid var(--r3d-line);background:rgba(11,15,25,.4);backdrop-filter:blur(8px);display:grid;place-items:center;animation:r3dsway 1.8s ease-in-out infinite}
.r3d-hand svg{width:24px;height:24px;color:#eef1f6}
.r3d-hint span{font-size:13px;color:#eef1f6;text-shadow:0 1px 10px #000}
@keyframes r3dsway{0%,100%{transform:translateX(-12px)}50%{transform:translateX(12px)}}
.r3d-loader{position:absolute;inset:0;z-index:20;display:grid;place-items:center;background:linear-gradient(to bottom right,#111827,#0B0F19);transition:opacity .5s}
.r3d-loader.r3d-gone{opacity:0;pointer-events:none}
.r3d-ring{width:64px;height:64px;transform:rotate(-90deg)}
.r3d-ring circle{fill:none;stroke-width:5;stroke-linecap:round}
.r3d-ring-bg{stroke:rgba(255,255,255,.10)}
.r3d-ring-fg{stroke:url(#r3dg);transition:stroke-dashoffset .1s linear}
.r3d-loadwrap{display:flex;flex-direction:column;align-items:center;gap:14px}
.r3d-pct{font-weight:600;font-size:13px;color:var(--r3d-muted)}
.r3d-lbl{font-size:12px;color:var(--r3d-muted);letter-spacing:.14em;text-transform:uppercase}
@media (prefers-reduced-motion:reduce){.r3d-hand{animation:none}}
/* hero variant: contained, transparent, chrome-less spinning object */
.r3d-hero{height:100%!important;background:transparent!important}
.r3d-hero .r3d-scrim-top,.r3d-hero .r3d-scrim-bot,.r3d-hero .r3d-topbar,.r3d-hero .r3d-zoomcol,.r3d-hero .r3d-rot,.r3d-hero .r3d-ctas,.r3d-hero .r3d-loader{display:none!important}
/* mobile: keep controls off the product + clear of each other */
@media (max-width:560px){
  .r3d-iconbtn{width:40px;height:40px}
  .r3d-name{font-size:14px;max-width:52vw}
  .r3d-rot{bottom:150px;padding:5px 11px}
  .r3d-rot .r3d-track{width:92px}
  .r3d-zoomcol{bottom:calc(150px + env(safe-area-inset-bottom))}
  .r3d-cta{padding:13px 12px;font-size:14px}
}
/* light background → flip text + controls to dark for contrast */
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
.r3d-light .r3d-scrim-top{background:linear-gradient(to bottom,rgba(255,255,255,.6),transparent)}
.r3d-light .r3d-scrim-bot{background:linear-gradient(to top,rgba(255,255,255,.75),transparent)}
.r3d-light .r3d-loader{background:#f4f5f7}
.r3d-light .r3d-pct,.r3d-light .r3d-lbl{color:#5b6472}
.r3d-light .r3d-ring-bg{stroke:rgba(0,0,0,.10)}
`;
