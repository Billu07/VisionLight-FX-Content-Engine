import sharp from "sharp";
import { ellipsize, measure, runs, text, wrap } from "./driftTypeset";

/**
 * drift.li share cards — the image in a link preview (WhatsApp, iMessage, Facebook, LinkedIn,
 * X, Slack), 1200×630 JPEG:
 * - site cards (home, the product landings, the capture guide, reports): the drift.li look —
 *   an ink sky, a horizon glow over a perspective grid, the client's own headline and line, and
 *   upright frames from drift.li's demo tour (home, tour) or the product's icon;
 * - page cards: the page's logo and name beside its tours' covers;
 * - tour cards: the cover photo full-bleed, "Interactive tour · N spaces", the page, the title
 *   and a strip of its spaces;
 * - drift cards: the drift's frame with a drag badge that shows the way it moves;
 * - unbranded tour cards: the tour card with no page and no drift.li mark (listing sites).
 * Text is drawn from the bundled brand font (driftTypeset.ts) and every card stays under
 * ~290 KB so WhatsApp shows it. Pure: images come in as buffers.
 */

export const CARD_W = 1200;
export const CARD_H = 630;
/** Part of every card URL — bump it to make crawlers fetch every card again. */
export const CARD_VERSION = 1;
const INK = "#0b0f19";
const WHITE = "#ffffff";
const MUTED = "#b6c0cf";
const MAX_BYTES = 290_000;
export const ACCENTS = { cyan: "#22d3ee", violet: "#a78bfa", emerald: "#34d399" } as const;
export type AccentName = keyof typeof ACCENTS;

/** 24×24 stroke icons (the same drawings the site uses). */
export const ICONS = {
  hand: [
    "M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8",
    "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-7-4l-2.5-4a2 2 0 0 1 3.4-2L8 14",
  ],
  eye: ["M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z", "M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"],
  heart: ["M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"],
  path: [
    "M6 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
    "M18 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
    "M6 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
    "M6 8.5v7",
    "M18 8.5c0 4-4 5-9.8 7.4",
  ],
  camera: ["M23 7l-7 5 7 5V7z", "M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"],
  chart: ["M3 3v18h18", "M8 16v-4", "M13 16V8", "M18 16v-7"],
  left: ["M15 18l-6-6 6-6"],
  right: ["M9 18l6-6-6-6"],
  up: ["M18 15l-6-6-6 6"],
  down: ["M6 9l6 6 6-6"],
} as const;
type IconName = keyof typeof ICONS;

export type SiteCardKey = "home" | "tour" | "view" | "memory" | "path" | "guide" | "report";

/** Site cards: headlines and lines are the client's copy from the home page and landings
 *  ("\n" = the line break the site uses). */
export const SITE_CARDS: Record<
  SiteCardKey,
  { accent: AccentName; kicker: string; headline: string; accentWords: string; lead: string; foot: string; visual: "frames" | IconName; alt: string }
> = {
  home: {
    accent: "cyan",
    kicker: "Drift Live Interactive",
    headline: "You Control\nthe Movement.",
    accentWords: "Movement.",
    lead: "Turn a few seconds of video into a Live Interactive you can explore.",
    foot: "Tour · View · Memory · Path",
    visual: "frames",
    alt: "drift.li — You Control the Movement.",
  },
  tour: {
    accent: "cyan",
    kicker: "Drift Tour",
    headline: "Show Any Space",
    accentWords: "Space",
    lead: "Turn a 3-second video into a Live Interactive. Connect them and create a Tour.",
    foot: "Real Estate · Venues · Any Location",
    visual: "frames",
    alt: "Drift Tour — Show Any Space",
  },
  view: {
    accent: "cyan",
    kicker: "Drift View",
    headline: "Share What You See",
    accentWords: "See",
    lead: "Turn a few seconds of a real place or moment into an Interactive View.",
    foot: "Sunsets · Cities · Cafés · Nature · Events",
    visual: "eye",
    alt: "Drift View — Share What You See",
  },
  memory: {
    accent: "violet",
    kicker: "Drift Memory",
    headline: "Keep the Moments That Matter",
    accentWords: "Matter",
    lead: "Turn a few seconds of life into something you can return to and explore.",
    foot: "Private. Yours to remember.",
    visual: "heart",
    alt: "Drift Memory — Keep the Moments That Matter",
  },
  path: {
    accent: "emerald",
    kicker: "Drift Path",
    headline: "Connect the Experience",
    accentWords: "Experience",
    lead: "Connect Drifts, images, video, information and links into an Interactive Path.",
    foot: "Tell a story. Explain a process. Guide someone step by step.",
    visual: "path",
    alt: "Drift Path — Connect the Experience",
  },
  guide: {
    accent: "cyan",
    kicker: "Drift Capture Guide",
    headline: "For Best Results",
    accentWords: "Results",
    lead: "Take a pan or tilt video of each space. Upload it. We turn it into a Drift in minutes.",
    foot: "3-Second Capture",
    visual: "camera",
    alt: "Drift Capture Guide — For Best Results",
  },
  report: {
    accent: "cyan",
    kicker: "Tour Report",
    headline: "A live tour report",
    accentWords: "report",
    lead: "Visits, time spent and the spaces people explore — updated live.",
    foot: "drift.li",
    visual: "chart",
    alt: "A live tour report on drift.li",
  },
};

// ───────────────────────────── drawing helpers ─────────────────────────────

const svg = (w: number, h: number, body: string) =>
  Buffer.from(`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);

const icon = (name: IconName, x: number, y: number, size: number, stroke: string, width = 1.8, opacity = 1) =>
  `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(size / 24).toFixed(4)})" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]
    .map((d) => `<path d="${d}"/>`)
    .join("")}</g>`;

const wordmark = (x: number, y: number, size: number, accent: string, anchor: "start" | "end" = "start") =>
  runs(
    [
      { text: "drift", fill: WHITE },
      { text: ".li", fill: accent },
    ],
    { weight: "bold", size, x, y, anchor },
  );

/** The wordmark on a glass chip, top-right of a photo (readable on any picture). */
function wordmarkChip(accent: string): string {
  const size = 32;
  const w = measure("drift.li", "bold", size) + 40;
  const right = 1136;
  return `<rect x="${(right - w).toFixed(1)}" y="52" width="${w.toFixed(1)}" height="52" rx="26" fill="${INK}" fill-opacity="0.58" stroke="${WHITE}" stroke-opacity="0.2" stroke-width="1.2"/>${wordmark(right - 20, 89, size, accent, "end")}`;
}

/** The drift.li sky: ink, a horizon glow and a perspective grid floor fading in towards the viewer. */
function backdrop(accent: string, horizon: number, cx: number): string {
  const lines: string[] = [];
  for (let k = -14; k <= 14; k++) lines.push(`<line x1="${cx}" y1="${horizon}" x2="${cx + k * 140}" y2="${CARD_H + 60}"/>`);
  for (let k = 1; k <= 10; k++) {
    const y = horizon + (CARD_H + 20 - horizon) * (k / 10) ** 2;
    lines.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${CARD_W}" y2="${y.toFixed(1)}"/>`);
  }
  return `<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101829"/><stop offset="1" stop-color="${INK}"/></linearGradient>
    <radialGradient id="glow" cx="${cx}" cy="${horizon}" r="560" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.32"/><stop offset="0.4" stop-color="${accent}" stop-opacity="0.09"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="${horizon}" x2="0" y2="${CARD_H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>
    <mask id="floor"><rect x="0" y="${horizon}" width="${CARD_W}" height="${CARD_H - horizon}" fill="url(#fade)"/></mask>
    <filter id="haze" x="-20%" y="-400%" width="140%" height="900%"><feGaussianBlur stdDeviation="10"/></filter>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#sky)"/>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#glow)"/>
  <ellipse cx="${cx}" cy="${horizon}" rx="620" ry="10" fill="${accent}" fill-opacity="0.32" filter="url(#haze)"/>
  <g mask="url(#floor)" stroke="${accent}" stroke-opacity="0.24" stroke-width="1.3">${lines.join("")}</g>`;
}

async function rounded(buf: Buffer, w: number, h: number, r: number): Promise<Buffer | null> {
  try {
    const img = await sharp(buf).rotate().resize(w, h, { fit: "cover", position: "attention" }).png().toBuffer();
    return await sharp(img)
      .composite([{ input: svg(w, h, `<rect width="${w}" height="${h}" rx="${r}" fill="#fff"/>`), blend: "dest-in" }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/** A logo scaled into a box, and whether it's dark (then it sits on a light plate so it shows on ink). */
async function logoLayer(buf: Buffer | null, maxW: number, maxH: number) {
  if (!buf) return null;
  try {
    const { data, info } = await sharp(buf).rotate().resize({ width: maxW, height: maxH, fit: "inside" }).png().toBuffer({ resolveWithObject: true });
    const px = await sharp(data).ensureAlpha().raw().toBuffer();
    let sum = 0;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      n++;
    }
    return { input: data, width: info.width, height: info.height, dark: n > 0 && sum / n < 120 };
  } catch {
    return null;
  }
}

/** Headline lines (forced breaks at "\n", then wrapped) with the closing words in the accent. */
function accentLines(value: string, accentWords: string, size: number, maxWidth: number, maxLines: number) {
  const total = value.trim().split(/\s+/).length;
  const from = total - accentWords.trim().split(/\s+/).length;
  const lines = value
    .split("\n")
    .flatMap((part) => wrap(part, "bold", size, maxWidth, maxLines))
    .slice(0, maxLines);
  let n = 0;
  return lines.map((line) => line.split(" ").map((w, i, arr) => ({ text: i < arr.length - 1 ? `${w} ` : w, accent: n++ >= from })));
}

/** The largest headline size that fits in two lines (three at the smallest size). */
function fitHeadline(value: string, accentWords: string, maxWidth: number) {
  for (const size of [72, 64, 58]) {
    const lines = accentLines(value, accentWords, size, maxWidth, 3);
    if (lines.length <= 2 || size === 58) return { size, lines };
  }
  return { size: 58, lines: accentLines(value, accentWords, 58, maxWidth, 3) };
}

async function finish(base: sharp.Sharp, layers: sharp.OverlayOptions[]): Promise<Buffer> {
  const flat = await base.composite(layers).png().toBuffer();
  for (const quality of [84, 76, 68]) {
    const jpg = await sharp(flat).jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
    if (jpg.length <= MAX_BYTES) return jpg;
  }
  return sharp(flat).jpeg({ quality: 60, mozjpeg: true, progressive: true }).toBuffer();
}

const photoBase = (buf: Buffer) => sharp(buf).rotate().resize(CARD_W, CARD_H, { fit: "cover", position: "attention" });

/** Upright frames standing on the floor: two behind, one forward (the home page's "live view"). */
async function standingFrames(images: Buffer[], accent: string, floor: number, cx: number): Promise<sharp.OverlayOptions[]> {
  const slots = [
    { w: 176, h: 244, x: cx - 250, bottom: floor - 28 },
    { w: 176, h: 244, x: cx + 74, bottom: floor - 28 },
    { w: 236, h: 326, x: cx - 118, bottom: floor + 8 },
  ];
  const sources = [images[1] ?? images[0], images[2] ?? images[1] ?? images[0], images[0]];
  const cut = await Promise.all(slots.map((s, i) => (sources[i] ? rounded(sources[i], s.w, s.h, 18) : Promise.resolve(null))));
  const top = (s: (typeof slots)[number]) => s.bottom - s.h;
  const defs = `<defs><filter id="soft" x="-50%" y="-300%" width="200%" height="700%"><feGaussianBlur stdDeviation="9"/></filter><filter id="halo" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="20"/></filter></defs>`;
  const shadow = (s: (typeof slots)[number]) =>
    `<ellipse cx="${s.x + s.w / 2}" cy="${s.bottom + 12}" rx="${(s.w * 0.55).toFixed(1)}" ry="13" fill="#000" fill-opacity="0.6" filter="url(#soft)"/>`;
  const outline = (s: (typeof slots)[number], stroke: string, opacity: number, width: number) =>
    `<rect x="${s.x + 0.75}" y="${top(s) + 0.75}" width="${s.w - 1.5}" height="${s.h - 1.5}" rx="18" fill="none" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}"/>`;
  const placeholder = (s: (typeof slots)[number], opacity: number) =>
    `<rect x="${s.x}" y="${top(s)}" width="${s.w}" height="${s.h}" rx="18" fill="${accent}" fill-opacity="${opacity}"/>`;

  const layers: sharp.OverlayOptions[] = [{ input: svg(CARD_W, CARD_H, defs + slots.map(shadow).join("")), top: 0, left: 0 }];
  for (const i of [0, 1]) if (cut[i]) layers.push({ input: cut[i]!, top: top(slots[i]), left: slots[i].x });
  const front = slots[2];
  layers.push({
    input: svg(
      CARD_W,
      CARD_H,
      defs +
        [0, 1]
          .map((i) => (cut[i] ? `<rect x="${slots[i].x}" y="${top(slots[i])}" width="${slots[i].w}" height="${slots[i].h}" rx="18" fill="${INK}" fill-opacity="0.3"/>` : placeholder(slots[i], 0.1)))
          .join("") +
        outline(slots[0], WHITE, 0.16, 1.5) +
        outline(slots[1], WHITE, 0.16, 1.5) +
        `<rect x="${front.x - 8}" y="${top(front) - 8}" width="${front.w + 16}" height="${front.h + 16}" rx="26" fill="${accent}" fill-opacity="0.3" filter="url(#halo)"/>`,
    ),
    top: 0,
    left: 0,
  });
  if (cut[2]) layers.push({ input: cut[2]!, top: top(front), left: front.x });
  layers.push({ input: svg(CARD_W, CARD_H, (cut[2] ? "" : placeholder(front, 0.16)) + outline(front, accent, 0.75, 2)), top: 0, left: 0 });
  return layers;
}

/** A product icon in a glowing ring, standing on the floor. */
function medallion(name: IconName, accent: string, cx: number, cy: number, floor: number): string {
  return `<defs><filter id="bloom" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="24"/></filter><filter id="soft" x="-50%" y="-300%" width="200%" height="700%"><feGaussianBlur stdDeviation="9"/></filter></defs>
    <ellipse cx="${cx}" cy="${floor + 14}" rx="190" ry="15" fill="#000" fill-opacity="0.55" filter="url(#soft)"/>
    <circle cx="${cx}" cy="${cy}" r="150" fill="${accent}" fill-opacity="0.22" filter="url(#bloom)"/>
    <circle cx="${cx}" cy="${cy}" r="194" fill="none" stroke="${accent}" stroke-opacity="0.16" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy}" r="142" fill="${INK}" fill-opacity="0.74" stroke="${accent}" stroke-opacity="0.6" stroke-width="2"/>
    ${icon(name, cx - 64, cy - 64, 128, accent, 1.5)}`;
}

/** The dark shading over a photo so text reads on any picture. */
const photoShade = (fromY: number) => `<defs>
    <linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${INK}" stop-opacity="0.72"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></linearGradient>
    <linearGradient id="bottom" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${INK}" stop-opacity="0"/><stop offset="0.45" stop-color="${INK}" stop-opacity="0.62"/><stop offset="1" stop-color="${INK}" stop-opacity="0.95"/></linearGradient>
  </defs>
  <rect width="${CARD_W}" height="200" fill="url(#top)"/>
  <rect y="${fromY}" width="${CARD_W}" height="${CARD_H - fromY}" fill="url(#bottom)"/>`;

/** A glass pill with an icon and a label; returns its SVG. */
function pill(x: number, y: number, label: string, accent: string, iconName: IconName = "hand"): string {
  const h = 52;
  const tw = measure(label, "semibold", 22);
  const w = 20 + 28 + 12 + tw + 24;
  return `<rect x="${x}" y="${y}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}" fill="${INK}" fill-opacity="0.58" stroke="${WHITE}" stroke-opacity="0.2" stroke-width="1.2"/>
    ${icon(iconName, x + 20, y + 12, 28, accent, 1.9)}
    ${text(label, WHITE, { weight: "semibold", size: 22, x: x + 60, y: y + 34 })}`;
}

// ───────────────────────────── cards ─────────────────────────────

export async function renderSiteCard(key: SiteCardKey, frames: Buffer[] = []): Promise<Buffer> {
  const c = SITE_CARDS[key];
  const accent = ACCENTS[c.accent];
  const FLOOR = 468;
  const CX = 930;
  const base = sharp(svg(CARD_W, CARD_H, backdrop(accent, FLOOR, CX)));
  const layers = c.visual === "frames" ? await standingFrames(frames, accent, FLOOR, CX) : [];

  const out: string[] = [];
  if (c.visual !== "frames") out.push(medallion(c.visual, accent, CX, 272, FLOOR));
  out.push(wordmark(72, 104, 42, accent));
  out.push(text(c.kicker.toUpperCase(), accent, { weight: "semibold", size: 19, x: 72, y: 226, tracking: 0.26 }));
  const head = fitHeadline(c.headline, c.accentWords, 580);
  const lineHeight = Math.round(head.size * 1.08);
  const headY = 226 + Math.round(head.size * 1.1);
  head.lines.forEach((line, i) =>
    out.push(runs(line.map((w) => ({ text: w.text, fill: w.accent ? accent : WHITE })), { weight: "bold", size: head.size, x: 70, y: headY + i * lineHeight })),
  );
  const FOOT_Y = 588;
  const LEAD_LH = 37;
  const leadY = headY + (head.lines.length - 1) * lineHeight + 54;
  const leadLines = Math.max(1, Math.min(3, Math.floor((FOOT_Y - 46 - leadY) / LEAD_LH) + 1));
  wrap(c.lead, "medium", 27, 560, leadLines).forEach((l, i) => out.push(text(l, MUTED, { weight: "medium", size: 27, x: 72, y: leadY + i * LEAD_LH })));
  out.push(text(ellipsize(c.foot, "semibold", 21, 600), WHITE, { weight: "semibold", size: 21, x: 72, y: FOOT_Y, opacity: 0.78 }));
  layers.push({ input: svg(CARD_W, CARD_H, out.join("")), top: 0, left: 0 });
  return finish(base, layers);
}

export async function renderPageCard(input: { name: string; logo: Buffer | null; tours: number; covers: Buffer[] }): Promise<Buffer> {
  const accent = ACCENTS.cyan;
  const FLOOR = 468;
  const CX = 930;
  const base = sharp(svg(CARD_W, CARD_H, backdrop(accent, FLOOR, CX)));
  const layers = await standingFrames(input.covers, accent, FLOOR, CX);
  const logo = await logoLayer(input.logo, 300, 92);
  const out: string[] = [];
  let y: number;
  if (logo) {
    if (logo.dark) out.push(`<rect x="60" y="98" width="${logo.width + 24}" height="${logo.height + 24}" rx="16" fill="${WHITE}" fill-opacity="0.95"/>`);
    y = 110 + logo.height + 96;
  } else {
    out.push(text("INTERACTIVE TOURS", accent, { weight: "semibold", size: 19, x: 72, y: 206, tracking: 0.26 }));
    y = 290;
  }
  const name = wrap(input.name, "bold", 66, 580, 2);
  name.forEach((l, i) => out.push(text(l, WHITE, { weight: "bold", size: 66, x: 70, y: y + i * 72 })));
  const count = input.tours ? `${input.tours} interactive ${input.tours === 1 ? "tour" : "tours"}` : "Interactive tours";
  out.push(text(count, MUTED, { weight: "medium", size: 28, x: 72, y: y + (name.length - 1) * 72 + 56 }));
  out.push(wordmark(72, 588, 34, accent));
  layers.push({ input: svg(CARD_W, CARD_H, out.join("")), top: 0, left: 0 });
  if (logo) layers.push({ input: logo.input, top: 110, left: 72 });
  return finish(base, layers);
}

export async function renderTourCard(input: {
  title: string;
  pageName: string | null;
  logo: Buffer | null;
  cover: Buffer | null;
  thumbs: Buffer[];
  spaces: number;
  /** listing-site version: no page, no drift.li mark */
  unbranded?: boolean;
}): Promise<Buffer> {
  const accent = ACCENTS.cyan;
  const base = input.cover ? photoBase(input.cover) : sharp(svg(CARD_W, CARD_H, backdrop(accent, 380, 600)));
  const layers: sharp.OverlayOptions[] = [];
  const out: string[] = [photoShade(230)];
  const spaces = `${input.spaces} ${input.spaces === 1 ? "space" : "spaces"}`;
  out.push(pill(64, 52, `Interactive tour · ${spaces}`, accent));
  if (!input.unbranded) out.push(wordmarkChip(accent));

  const title = wrap(input.title, "bold", 60, 1056, 2);
  const LAST = 566;
  const LH = 66;
  const firstBaseline = LAST - (title.length - 1) * LH;
  title.forEach((l, i) => out.push(text(l, WHITE, { weight: "bold", size: 60, x: 70, y: firstBaseline + i * LH })));
  let blockTop = firstBaseline - 52;

  if (!input.unbranded && input.pageName) {
    const logo = await logoLayer(input.logo, 150, 40);
    const rowBaseline = firstBaseline - 68;
    let nameX = 72;
    if (logo) {
      const logoTop = rowBaseline - 30;
      if (logo.dark) out.push(`<rect x="64" y="${logoTop - 6}" width="${logo.width + 16}" height="${logo.height + 12}" rx="10" fill="${WHITE}" fill-opacity="0.95"/>`);
      layers.push({ input: logo.input, top: logoTop, left: 72 });
      nameX = 72 + logo.width + (logo.dark ? 26 : 16);
    }
    out.push(text(ellipsize(input.pageName, "semibold", 26, 1128 - nameX), WHITE, { weight: "semibold", size: 26, x: nameX, y: rowBaseline, opacity: 0.88 }));
    blockTop = rowBaseline - 32;
  }

  const thumbs = input.thumbs.length >= 2 ? await Promise.all(input.thumbs.slice(0, 5).map((b) => rounded(b, 112, 84, 10))) : [];
  const thumbTop = blockTop - 18 - 84;
  thumbs.forEach((t, i) => {
    if (!t) return;
    const x = 72 + i * 124;
    layers.push({ input: t, top: thumbTop, left: x });
    out.push(`<rect x="${x + 0.75}" y="${thumbTop + 0.75}" width="110.5" height="82.5" rx="10" fill="none" stroke="${WHITE}" stroke-opacity="0.35" stroke-width="1.5"/>`);
  });
  layers.unshift({ input: svg(CARD_W, CARD_H, out.join("")), top: 0, left: 0 });
  return finish(base, layers);
}

export async function renderDriftCard(input: {
  name: string;
  /** e.g. the tour title and page, or the brand */
  context: string | null;
  frame: Buffer | null;
  index: number | null;
  total: number | null;
  vertical: boolean;
  logo: Buffer | null;
}): Promise<Buffer> {
  const accent = ACCENTS.cyan;
  const base = input.frame ? photoBase(input.frame) : sharp(svg(CARD_W, CARD_H, backdrop(accent, 380, 600)));
  const layers: sharp.OverlayOptions[] = [];
  const out: string[] = [photoShade(300)];

  // The drag badge: a hand in a glass ring, arrows the way the drift moves.
  const cx = 600;
  const cy = 262;
  out.push(`<circle cx="${cx}" cy="${cy}" r="72" fill="${INK}" fill-opacity="0.52" stroke="${WHITE}" stroke-opacity="0.34" stroke-width="2"/>`);
  out.push(icon("hand", cx - 30, cy - 32, 60, WHITE, 1.8));
  if (input.vertical) {
    out.push(icon("up", cx - 16, cy - 132, 32, accent, 2.6));
    out.push(icon("down", cx - 16, cy + 100, 32, accent, 2.6));
  } else {
    out.push(icon("left", cx - 132, cy - 16, 32, accent, 2.6));
    out.push(icon("right", cx + 100, cy - 16, 32, accent, 2.6));
  }

  const logo = await logoLayer(input.logo, 200, 52);
  if (logo) {
    if (logo.dark) out.push(`<rect x="56" y="46" width="${logo.width + 16}" height="${logo.height + 12}" rx="10" fill="${WHITE}" fill-opacity="0.95"/>`);
    layers.push({ input: logo.input, top: 52, left: 64 });
  } else {
    const label = input.index && input.total ? `Interactive tour · ${input.index} of ${input.total}` : "Interactive drift";
    out.push(pill(64, 52, label, accent));
  }
  out.push(wordmarkChip(accent));

  const name = wrap(input.name, "bold", 62, 1056, 2);
  const LAST = input.context ? 536 : 574;
  name.forEach((l, i) => out.push(text(l, WHITE, { weight: "bold", size: 62, x: 70, y: LAST - (name.length - 1 - i) * 66 })));
  if (input.context) out.push(text(ellipsize(input.context, "medium", 28, 1056), MUTED, { weight: "medium", size: 28, x: 72, y: 586 }));
  layers.unshift({ input: svg(CARD_W, CARD_H, out.join("")), top: 0, left: 0 });
  return finish(base, layers);
}

/** The drift.li app icon: "d" and a cyan dot on an ink square (`padding` = maskable safe zone). */
export function iconSvg(size: number, opts: { radius?: number; padding?: number } = {}): string {
  const pad = opts.padding ?? 0;
  const inner = size - pad * 2;
  const glyph = inner * 0.8;
  const dWidth = measure("d", "bold", glyph);
  const dot = inner * 0.085;
  const gap = inner * 0.03;
  const x0 = (size - (dWidth + gap + dot * 2)) / 2;
  const baseline = pad + inner * 0.77;
  const radius = opts.radius ?? size * 0.22;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${radius}" fill="${INK}"/>${text("d", WHITE, {
    weight: "bold",
    size: glyph,
    x: x0,
    y: baseline,
  })}<circle cx="${(x0 + dWidth + gap + dot).toFixed(2)}" cy="${(baseline - dot).toFixed(2)}" r="${dot.toFixed(2)}" fill="${ACCENTS.cyan}"/></svg>`;
}
