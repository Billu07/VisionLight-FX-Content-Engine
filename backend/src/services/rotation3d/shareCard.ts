import sharp from "sharp";
import QRCode from "qrcode";

// Server-side "share card": a downloadable social image with a scannable QR
// (to the product's link, with the brand logo in its center), the product's
// start frame, and "Powered by Rotation3D.com". Generated server-side so we
// never hit browser CORS / canvas-taint issues reading frames+logo from R2.

const W = 1080;
const H = 1350;

const sanitizeHex = (c?: string | null): string | null => {
  if (!c) return null;
  const s = c.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s) ? s : null;
};

const esc = (s: string) =>
  s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c));

const fetchImage = async (url?: string | null): Promise<Buffer | null> => {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
};

export async function buildShareCard(opts: {
  productUrl: string;
  frameUrl?: string | null;
  logoUrl?: string | null;
  productName: string;
  brandName: string;
  primaryColor?: string | null;
}): Promise<Buffer> {
  const primary = sanitizeHex(opts.primaryColor) || "#22d3ee";

  // --- QR (level H tolerates a centered logo occluding ~25%) ---
  const qrSize = 440;
  const qrPng = await QRCode.toBuffer(opts.productUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: qrSize,
    color: { dark: "#0b0f19", light: "#ffffff" },
  });
  let qrPipeline = sharp(qrPng);
  const logoBuf = await fetchImage(opts.logoUrl);
  if (logoBuf) {
    const badge = Math.round(qrSize * 0.24);
    const logoResized = await sharp(logoBuf)
      .resize(badge - 18, badge - 18, {
        fit: "inside",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer();
    const badgeBg = Buffer.from(
      `<svg width="${badge}" height="${badge}"><rect width="${badge}" height="${badge}" rx="${Math.round(
        badge * 0.24,
      )}" fill="#ffffff"/></svg>`,
    );
    const badgeImg = await sharp(badgeBg)
      .composite([{ input: logoResized, gravity: "center" }])
      .png()
      .toBuffer();
    qrPipeline = qrPipeline.composite([{ input: badgeImg, gravity: "center" }]);
  }
  const qrFinal = await qrPipeline.png().toBuffer();

  // --- product start frame ---
  const frameArea = { w: 900, h: 430 };
  const frameBuf = await fetchImage(opts.frameUrl);
  let frameFinal: Buffer | null = null;
  let fw = 0;
  let fh = 0;
  if (frameBuf) {
    frameFinal = await sharp(frameBuf)
      .resize(frameArea.w, frameArea.h, {
        fit: "inside",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    const meta = await sharp(frameFinal).metadata();
    fw = meta.width || frameArea.w;
    fh = meta.height || frameArea.h;
  }

  // --- background + text (SVG) ---
  const bg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="1" stop-color="#0B0F19"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="6%" r="75%">
          <stop offset="0" stop-color="${primary}" stop-opacity="0.20"/>
          <stop offset="1" stop-color="#0B0F19" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect width="${W}" height="${H}" fill="url(#glow)"/>
    </svg>`);

  const qrPanel = 500;
  const qrPanelTop = 150;
  const qrPanelSvg = Buffer.from(
    `<svg width="${qrPanel}" height="${qrPanel}"><rect width="${qrPanel}" height="${qrPanel}" rx="36" fill="#ffffff"/></svg>`,
  );

  const textSvg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <style>
        text { font-family: "DejaVu Sans", "Segoe UI", Arial, sans-serif; }
        .scan { fill:#9aa3b6; font-size:30px; }
        .brand { fill:${primary}; font-weight:600; font-size:30px; letter-spacing:4px; }
        .name { fill:#ffffff; font-weight:700; font-size:54px; }
        .powered { fill:#8a94a8; font-size:26px; letter-spacing:2px; }
      </style>
      <text x="${W / 2}" y="112" text-anchor="middle" class="scan">Scan to view in 360°</text>
      <text x="${W / 2}" y="${H - 196}" text-anchor="middle" class="brand">${esc(
        opts.brandName.toUpperCase(),
      )}</text>
      <text x="${W / 2}" y="${H - 132}" text-anchor="middle" class="name">${esc(
        opts.productName,
      )}</text>
      <text x="${W / 2}" y="${H - 54}" text-anchor="middle" class="powered">Powered by Rotation3D.com</text>
    </svg>`);

  const composites: sharp.OverlayOptions[] = [
    { input: qrPanelSvg, top: qrPanelTop, left: Math.round((W - qrPanel) / 2) },
    {
      input: qrFinal,
      top: qrPanelTop + Math.round((qrPanel - qrSize) / 2),
      left: Math.round((W - qrSize) / 2),
    },
  ];
  if (frameFinal) {
    const areaTop = qrPanelTop + qrPanel + 40;
    composites.push({
      input: frameFinal,
      top: areaTop + Math.round((frameArea.h - fh) / 2),
      left: Math.round((W - fw) / 2),
    });
  }
  composites.push({ input: textSvg, top: 0, left: 0 });

  return sharp(bg).composite(composites).png().toBuffer();
}
