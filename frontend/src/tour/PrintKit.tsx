import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Flow, Page } from "./types";
import { publicUrl } from "./tourUi";
import {
  PRINT_SHEET_CSS,
  PRINT_TEMPLATES,
  PrintSheet,
  pageRuleCss,
  sheetSize,
  type PrintContent,
  type PrintPaper,
  type PrintTemplate,
} from "./printSheets";

/**
 * Print kit for a published tour: a flyer, a window sign and a sheet of QR cards, on A4
 * or US Letter, pointing at the tour link or its unbranded (MLS-safe) link. The preview
 * is the real sheet scaled down; printing uses a clean copy rendered outside the app (a
 * portal on <body>), so exactly one page prints — "Save as PDF" in the dialog makes a file.
 */

const PX_PER_MM = 96 / 25.4;

const UI_CSS = `
.pk-overlay{z-index:80}
.t-sheet-card.pk-ui{max-width:760px;max-height:94dvh;overflow:auto;gap:14px}
.pk-head{padding-right:36px}
.pk-controls{display:grid;gap:10px}
.pk-options{display:flex;flex-wrap:wrap;gap:10px}
.pk-opt{display:grid;gap:4px;font-size:12px;font-weight:650;color:var(--muted);flex:1 1 200px}
.pk-hint{font-size:12.5px;line-height:1.45}
.pk-preview{display:grid;place-items:center;padding:12px;border-radius:16px;background:var(--surface-3);min-height:240px;overflow:hidden}
.pk-frame{position:relative;overflow:hidden;background:#fff;border-radius:2px;box-shadow:0 12px 40px -12px rgba(0,0,0,.45)}
.pk-actions{align-items:center}
`;

export function PrintKit({
  flow,
  page,
  unbrandedPath,
  ensureUnbranded,
  onClose,
}: {
  flow: Flow;
  page: Page | null;
  unbrandedPath: string | null;
  ensureUnbranded: () => Promise<string | null>;
  onClose: () => void;
}) {
  const [template, setTemplate] = useState<PrintTemplate>("flyer");
  const [paper, setPaper] = useState<PrintPaper>(() => (/^en-(US|CA)$/i.test(navigator.language || "") ? "Letter" : "A4"));
  const [unbranded, setUnbranded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(0.4);
  const previewRef = useRef<HTMLDivElement>(null);
  const { w: wMm, h: hMm } = sheetSize(template, paper);

  const content: PrintContent = {
    title: flow.title || flow.name,
    description: flow.description,
    cover: flow.thumb,
    url: publicUrl(unbranded && unbrandedPath ? unbrandedPath : flow.publicPath),
    brand: !unbranded && page ? { name: page.name, logoUrl: page.logoUrl } : null,
  };

  // The print copy lives outside the app so nothing else lands on the page.
  useEffect(() => {
    const el = document.createElement("div");
    el.className = "pk-portal";
    document.body.appendChild(el);
    setPortal(el);
    return () => el.remove();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const fit = () => {
      const availW = Math.max(120, el.clientWidth - 24);
      const availH = Math.max(240, window.innerHeight * 0.56);
      setScale(Math.max(0.12, Math.min(1, availW / (wMm * PX_PER_MM), availH / (hMm * PX_PER_MM))));
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [wMm, hMm]);

  const pickLink = async (value: string) => {
    if (value !== "unbranded") return setUnbranded(false);
    if (unbrandedPath) return setUnbranded(true);
    setBusy(true);
    const made = await ensureUnbranded();
    setBusy(false);
    if (made) setUnbranded(true);
  };

  const sheet = <PrintSheet template={template} paper={paper} content={content} />;
  const hint = PRINT_TEMPLATES.find((t) => t.value === template)?.hint || "";

  return (
    <div className="t-sheet pk-overlay" onClick={onClose} role="dialog" aria-modal aria-label="Print kit">
      <style>{PRINT_SHEET_CSS + UI_CSS}</style>
      <div className="t-sheet-card pk-ui" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="t-sheet-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="pk-head">
          <div className="d-eyebrow">Print kit</div>
          <div className="t-sheet-title">{flow.title || flow.name}</div>
        </div>
        <div className="pk-controls">
          <div className="d-tabs" role="tablist" aria-label="What to print">
            {PRINT_TEMPLATES.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={template === t.value}
                className={`d-tab ${template === t.value ? "active" : ""}`}
                onClick={() => setTemplate(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="pk-options">
            <label className="pk-opt">
              Paper
              <select className="d-select" value={paper} onChange={(e) => setPaper(e.target.value as PrintPaper)}>
                <option value="A4">A4</option>
                <option value="Letter">US Letter</option>
              </select>
            </label>
            <label className="pk-opt">
              The QR code opens
              <select className="d-select" value={unbranded ? "unbranded" : "tour"} onChange={(e) => void pickLink(e.target.value)} disabled={busy}>
                <option value="tour">The tour link</option>
                <option value="unbranded">The unbranded link (MLS)</option>
              </select>
            </label>
          </div>
          <div className="d-faint pk-hint">
            {hint}
            {unbranded ? " The unbranded version leaves out your page name and logo." : ""}
          </div>
        </div>
        <div className="pk-preview" ref={previewRef}>
          <div className="pk-frame" style={{ width: wMm * PX_PER_MM * scale, height: hMm * PX_PER_MM * scale }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>{sheet}</div>
          </div>
        </div>
        <div className="t-actions pk-actions">
          <button type="button" className="d-btn primary" onClick={() => window.print()} disabled={busy}>
            Print or save as PDF
          </button>
          <span className="d-faint" style={{ fontSize: 12 }}>
            To download it, choose "Save as PDF" in the print dialog.
          </span>
        </div>
      </div>
      {portal &&
        createPortal(
          <>
            <style>{PRINT_SHEET_CSS + pageRuleCss(template, paper)}</style>
            {sheet}
          </>,
          portal,
        )}
    </div>
  );
}
