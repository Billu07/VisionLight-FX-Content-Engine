// API shapes for the creator suite (mirrors backend/src/services/driftFlows.ts).

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
  frameCount: number;
  thumb: string | null;
  ctaPrimary: Cta | null;
  ctaSecondary: Cta | null;
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
  coverUrl: string | null;
  endCta: Cta | null;
  settings: { nextLabel: string | null };
  order: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  publicPath: string;
  entryProductId: string | null;
  entryPath: string | null;
  thumb: string | null;
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

export type PublicFlow = {
  id: string;
  kind: string;
  slug: string;
  name: string;
  title: string | null;
  description: string | null;
  coverUrl: string | null;
  endCta: Cta | null;
  settings: { nextLabel: string | null };
  publicPath: string;
  entryProductId: string | null;
  entryPath: string | null;
  thumb: string | null;
  steps: { id: string; order: number; productId: string; name: string; title: string | null; thumb: string | null; playerPath: string }[];
};

export const isReady = (s?: string | null) => s === "READY" || s === "PUBLISHED";
