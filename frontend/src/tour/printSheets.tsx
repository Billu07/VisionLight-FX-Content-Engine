import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * The printable pieces of the print kit — a flyer, a window sign and a sheet of QR cards —
 * sized in millimetres for A4 or US Letter. Self-contained (React + the QR encoder only, no
 * app imports), so PrintKit renders them on screen and for print, and they can be rendered
 * outside the app to check the print layout.
 */

export type PrintTemplate = "flyer" | "sign" | "cards";
export type PrintPaper = "A4" | "Letter";

export const PRINT_PAPER: Record<PrintPaper, { w: number; h: number; css: string }> = {
  A4: { w: 210, h: 297, css: "A4" },
  Letter: { w: 215.9, h: 279.4, css: "letter" },
};

export const PRINT_TEMPLATES: { value: PrintTemplate; label: string; hint: string }[] = [
  { value: "flyer", label: "Flyer", hint: "The cover photo, the title and a QR code — for open houses and handouts." },
  { value: "sign", label: "Window sign", hint: "A big QR code people can scan from the street." },
  { value: "cards", label: "QR cards", hint: "Eight small cards to cut out and leave around." },
];

/** A template's page in millimetres (the window sign is landscape). */
export const sheetSize = (template: PrintTemplate, paper: PrintPaper) => {
  const p = PRINT_PAPER[paper];
  return template === "sign" ? { w: p.h, h: p.w, portrait: false } : { w: p.w, h: p.h, portrait: true };
};

export type PrintContent = {
  title: string;
  description: string | null;
  cover: string | null;
  url: string;
  /** the page's name and logo — null leaves them out (the unbranded version) */
  brand: { name: string; logoUrl: string | null } | null;
};

function Qr({ text, sizeMm }: { text: string; sizeMm: number }) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
    return { path: d, n: count };
  }, [text]);
  // A 4-module quiet zone keeps it scannable on any background.
  return (
    <svg
      className="pk-qr"
      viewBox={`-4 -4 ${n + 8} ${n + 8}`}
      style={{ width: `${sizeMm}mm`, height: `${sizeMm}mm` }}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code"
    >
      <rect x={-4} y={-4} width={n + 8} height={n + 8} fill="#fff" />
      <path d={path} fill="#0b1220" />
    </svg>
  );
}

export function PrintSheet({ template, paper, content }: { template: PrintTemplate; paper: PrintPaper; content: PrintContent }) {
  const { w, h } = sheetSize(template, paper);
  const { title, description, cover, url, brand } = content;
  const short = url.replace(/^https?:\/\//, "");
  const style = { width: `${w}mm`, height: `${h}mm` };
  const brandLine = brand ? (
    <div className="pk-brand">
      {brand.logoUrl ? <img src={brand.logoUrl} alt="" /> : null}
      <span>{brand.name}</span>
    </div>
  ) : null;

  if (template === "flyer") {
    return (
      <div className="pk-sheet pk-flyer" style={style}>
        <div className="pk-cover">{cover ? <img src={cover} alt="" /> : null}</div>
        <div className="pk-flyer-body">
          {brandLine}
          <div className="pk-kicker">Interactive tour</div>
          <div className="pk-title">{title}</div>
          {description && <div className="pk-desc">{description}</div>}
          <div className="pk-scan">
            <Qr text={url} sizeMm={44} />
            <div className="pk-scan-text">
              <b>Scan to walk through</b>
              <span>Open it on your phone and drag across each space to look around.</span>
              <code>{short}</code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (template === "sign") {
    return (
      <div className="pk-sheet pk-sign" style={style}>
        <div className="pk-sign-text">
          {brandLine}
          <div className="pk-sign-head">Scan to tour inside</div>
          <div className="pk-title">{title}</div>
          <div className="pk-sign-sub">Point your phone's camera at the code, then drag across each space.</div>
          <code className="pk-url">{short}</code>
        </div>
        <Qr text={url} sizeMm={Math.min(h - 50, 130)} />
      </div>
    );
  }

  return (
    <div className="pk-sheet pk-cards" style={style}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="pk-card">
          <div className="pk-card-text">
            <div className="pk-kicker">Interactive tour</div>
            <div className="pk-card-title">{title}</div>
            <div className="pk-card-sub">Scan to explore</div>
            {brand && <div className="pk-card-brand">{brand.name}</div>}
          </div>
          <Qr text={url} sizeMm={30} />
        </div>
      ))}
    </div>
  );
}

/** The sheets' styles, plus the print rule: only the .pk-portal copy prints. */
export const PRINT_SHEET_CSS = `
.pk-sheet{position:relative;box-sizing:border-box;background:#fff;color:#0b1220;font-family:"Bai Jamjuree",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pk-sheet *{box-sizing:border-box}
.pk-qr{display:block;flex:none}
.pk-kicker{font-size:3.2mm;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:#0891b2}
.pk-title{font-size:11mm;font-weight:800;line-height:1.05;letter-spacing:-.02em;overflow-wrap:anywhere}
.pk-brand{display:flex;align-items:center;gap:3mm;font-size:4.2mm;font-weight:700;color:#334155}
.pk-brand img{height:10mm;max-width:40mm;object-fit:contain}
.pk-url,.pk-scan-text code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:3.6mm;color:#0891b2;overflow-wrap:anywhere}
.pk-flyer{display:grid;grid-template-rows:48% 1fr}
.pk-cover{background:#0b1220;overflow:hidden}
.pk-cover img{width:100%;height:100%;object-fit:cover;display:block}
.pk-flyer-body{padding:12mm 14mm;display:flex;flex-direction:column;gap:4mm;min-height:0}
.pk-desc{font-size:4.4mm;line-height:1.4;color:#475569;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.pk-scan{margin-top:auto;display:flex;align-items:center;gap:8mm;padding:6mm;border-radius:5mm;border:.5mm solid #e2e8f0;background:#f8fafc}
.pk-scan-text{display:grid;gap:2mm;min-width:0}
.pk-scan-text b{font-size:6.5mm;font-weight:800}
.pk-scan-text span{font-size:4mm;line-height:1.35;color:#475569}
.pk-sign{display:flex;align-items:center;justify-content:space-between;gap:14mm;padding:18mm 20mm}
.pk-sign-text{display:flex;flex-direction:column;gap:5mm;min-width:0;flex:1}
.pk-sign-head{font-size:19mm;font-weight:800;line-height:.98;letter-spacing:-.03em}
.pk-sign .pk-title{font-size:9mm;color:#0891b2}
.pk-sign-sub{font-size:5mm;line-height:1.35;color:#475569}
.pk-cards{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4,1fr);padding:12mm}
.pk-card{display:flex;align-items:center;justify-content:space-between;gap:4mm;padding:5mm 6mm;border:.3mm dashed #cbd5e1;min-width:0}
.pk-card-text{display:grid;gap:1.5mm;min-width:0}
.pk-card .pk-kicker{font-size:2.4mm}
.pk-card-title{font-size:5mm;font-weight:800;line-height:1.1;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pk-card-sub{font-size:3.4mm;color:#475569}
.pk-card-brand{font-size:3mm;font-weight:700;color:#64748b}
.pk-portal{display:none}
@media print{
  body > *:not(.pk-portal){display:none !important}
  .pk-portal{display:block !important}
  html,body{margin:0 !important;padding:0 !important;background:#fff !important}
}
`;

/** The @page rule for a template + paper (only while printing). */
export const pageRuleCss = (template: PrintTemplate, paper: PrintPaper) =>
  `@media print{@page{size:${PRINT_PAPER[paper].css} ${sheetSize(template, paper).portrait ? "portrait" : "landscape"};margin:0}}`;
