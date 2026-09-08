import { isDriftSite } from "./branding";

/**
 * Which product the legal pages (/terms, /privacy) speak for. The clauses are the
 * same on every host — one company, one agreement — only the product name, the
 * contact mailbox and the page skin change. drift.li (and brand custom domains)
 * get Drift Link; everything else stays PicDrift Studio.
 */
export type LegalBrand = {
  /** short product name used in most sentences */
  product: string;
  /** "X and the Y engine" — the full platform phrase */
  engineLong: string;
  /** "… are products of Visionlight Production Inc." lead-in */
  productsOf: string;
  /** "X or FX will operate…" */
  platformOrEngine: string;
  /** "X and FX are provided as is…" */
  platformAndEngine: string;
  /** "All proprietary technology, including …" */
  engineTech: string;
  email: string;
  site: string;
  /** page gradient + base text colour classes */
  shell: string;
  muted: string;
  intro: string;
};

const PICDRIFT: LegalBrand = {
  product: "PicDrift Studio",
  engineLong: "PicDrift Studio and the FX dashboard engine",
  productsOf: 'PicDrift Studio and the FX dashboard engine ("FX") are products of',
  platformOrEngine: "PicDrift Studio or FX",
  platformAndEngine: "PicDrift Studio and FX",
  engineTech: "the FX dashboard engine",
  email: "picdrift@picdrift.com",
  site: "picdrift.com",
  shell: "from-gray-900 via-purple-900 to-violet-900 text-purple-50",
  muted: "text-purple-300",
  intro: "text-purple-200",
};

const DRIFT: LegalBrand = {
  product: "Drift Link",
  engineLong: "Drift Link (drift.li) and its creator tools",
  productsOf: "Drift Link (drift.li), its player and its creator tools are products of",
  platformOrEngine: "Drift Link",
  platformAndEngine: "Drift Link and its tools",
  engineTech: "the drift engine and player",
  email: "web@drift.li",
  site: "drift.li",
  shell: "from-[#050912] via-[#0b1626] to-[#04080f] text-slate-100",
  muted: "text-slate-400",
  intro: "text-slate-300",
};

export const legalBrand = (): LegalBrand => (isDriftSite() ? DRIFT : PICDRIFT);
export const isDriftLegal = (): boolean => isDriftSite();
