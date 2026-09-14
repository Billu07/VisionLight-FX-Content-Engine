// API shapes for the creator suite (mirrors backend/src/services/driftFlows.ts and
// the page routes in backend/src/routes/driftFlows.ts).

export type Cta = { label: string; url: string };

export type StepProduct = {
  id: string;
  name: string;
  slug: string;
  title: string | null;
  titleEnd: string | null;
  description: string | null;
  descriptionEnd: string | null;
  background: string | null;
  status: "DRAFT" | "PROCESSING" | "READY" | "PUBLISHED" | "FAILED" | string;
  defaultFrame: number;
  loopEnabled: boolean;
  driftDirection: string;
  ctaPlacement: string;
  frameCount: number;
  thumb: string | null;
  ctaPrimary: Cta | null;
  ctaSecondary: Cta | null;
  /** readable player link: /tour/{page}/{tour}/{drift} */
  playerPath: string;
  updatedAt: string;
};

export type FlowStep = {
  id: string;
  flowId: string;
  order: number;
  stepType: string;
  customCta: Cta | null;
  createdAt: string;
  updatedAt: string;
  /** this drift's URL segment within its tour */
  slug: string | null;
  product: StepProduct | null;
};

export type Flow = {
  id: string;
  kind: string;
  slug: string;
  name: string;
  title: string | null;
  description: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  isDemo: boolean;
  /** hidden from Featured Tours (its link still works) */
  hidden: boolean;
  coverUrl: string | null;
  endCta: Cta | null;
  settings: { nextLabel: string | null };
  order: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  pageSlug: string | null;
  pageName: string | null;
  /** /tour/{page} */
  pagePath: string | null;
  /** the tour's main link — its pathway menu: /tour/{page}/{tour} */
  publicPath: string;
  entryProductId: string | null;
  entryPath: string | null;
  thumb: string | null;
  /** cover choices: the first drift's start, middle and end frames */
  coverFrames: string[];
  counts: { steps: number; ready: number; processing: number; failed: number };
  steps: FlowStep[];
};

export type Quota = {
  maxFlows: number;
  usedFlows: number;
  maxStepsPerFlow: number;
  maxClipSeconds: number;
};

export type Creator = { name: string | null; handle: string | null };

/** A page: the creator's profile at drift.li/tour/{slug} (admin + public view). */
export type Page = {
  id: string;
  name: string;
  slug: string | null;
  path: string | null;
  accountType: string | null;
  logoUrl: string | null;
  /** the effective contact button (defaults to "Contact PicDrift") */
  contact: { label: string; url: string };
  /** what the admin set (null = default) */
  contactLabel: string | null;
  contactUrl: string | null;
  demoFlowId: string | null;
};

/** "View Demo": the page's own demo tour, or drift.li's. */
export type Demo = { name: string; path: string; own: boolean } | null;

export type PublicFlowStep = {
  id: string;
  order: number;
  slug: string | null;
  productId: string;
  name: string;
  title: string | null;
  thumb: string | null;
  playerPath: string;
};

export type PublicFlow = {
  id: string;
  kind: string;
  slug: string;
  name: string;
  title: string | null;
  description: string | null;
  coverUrl: string | null;
  settings: { nextLabel: string | null };
  hidden: boolean;
  pageSlug: string | null;
  pageName: string | null;
  pagePath: string | null;
  publicPath: string;
  entryProductId: string | null;
  entryPath: string | null;
  thumb: string | null;
  steps: PublicFlowStep[];
};

export const isReady = (s?: string | null) => s === "READY" || s === "PUBLISHED";
