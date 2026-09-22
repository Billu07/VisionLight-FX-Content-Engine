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
  /** FREE | AWAITING_PAYMENT (saved, converts after checkout) | PAID | COMP */
  billingStatus: string;
  paidAt: string | null;
  hostingExpiresAt: string | null;
  /** tour pins on this drift */
  pinCount?: number;
  /** what the auto clean-up did to the clip (null when nothing) */
  cleanup?: { trimmedS: number; steadied: boolean; direction: string | null } | null;
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
  /** the unbranded (MLS-safe) link once it's been made: /u/{code} */
  unbrandedPath?: string | null;
  /** the owner report link while it's on: /report/{code} */
  reportPath?: string | null;
  entryProductId: string | null;
  entryPath: string | null;
  thumb: string | null;
  /** cover choices: the first drift's start, middle and end frames */
  coverFrames: string[];
  counts: { steps: number; ready: number; processing: number; failed: number; awaiting: number };
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
  /** the enquiry button ("Book a viewing" …) */
  enquiries?: { enabled: boolean; label: string; askPhone: boolean };
};

/** A page reference (a client page, the Pro page managing one, an invite's page). */
export type PageRef = { id: string; name: string; slug: string | null; path: string | null };

/** A Pro's client page. */
export type ClientPage = PageRef & { tours: number; createdAt: string };

/** What someone may do on a page: Admin (everything), Editor (build tours), Viewer (look). */
export type PageRole = "ADMIN" | "EDITOR" | "VIEWER";

/** Someone on a page (a profile in its org). */
export type PageMember = { id: string; email: string; name: string | null; role: PageRole; you: boolean; joinedAt: string };

/** A page this login can open — the header's page switcher and the Dashboard. */
export type MyPage = PageRef & {
  profileId: string;
  role: PageRole;
  accountType: string;
  managedBy: { id: string; name: string | null } | null;
  /** a page this login made itself (not joined by invite, not a Pro's client page) */
  own: boolean;
  /** where Dashboard goes: the first own page (else the first page it admins) */
  home: boolean;
};

/** A page invite link, with the role accepting it grants. */
export type TourInvite = {
  id: string;
  email: string;
  role?: PageRole;
  status: "PENDING" | "ACCEPTED" | "EXPIRED" | string;
  createdAt: string;
  acceptedAt: string | null;
};

/** A visitor's enquiry (the page's enquiry button). */
export type Enquiry = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  button: string | null;
  tour: string | null;
  drift: string | null;
  /** the personal link it came through */
  via: string | null;
  createdAt: string;
};

/** A personal link for one tour, sent to one person — with what they did. */
export type ShareLink = {
  id: string;
  label: string;
  token: string;
  opens: number;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  driftsSeen: number;
  drifts: number;
  enquiries: number;
  createdAt: string;
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
  /** the site's demo tour or the page's own "View Demo" (only on the pathway endpoint) */
  isDemo?: boolean;
  pageSlug: string | null;
  pageName: string | null;
  pagePath: string | null;
  publicPath: string;
  entryProductId: string | null;
  entryPath: string | null;
  thumb: string | null;
  steps: PublicFlowStep[];
};

/** Pay per drift: the page's free drifts, the price, whether checkout is switched on. */
export type Billing = {
  unlimited: boolean;
  freeDrifts: number;
  usedFreeDrifts: number;
  freeLeft: number | null;
  priceCents: number;
  currency: string;
  price: string;
  hostingDays: number;
  paymentsEnabled: boolean;
};

/** Tour Insights — one drift's numbers (backend services/driftInsights.ts). */
export type DriftInsight = {
  stepId: string;
  productId: string;
  name: string;
  thumb: string | null;
  /** 10 frames along the drift */
  strip: string[];
  views: number;
  visitors: number;
  /** the share of the period's visits that reached it */
  reachedPct: number;
  avgMs: number;
  /** the average share of the footage a view reached */
  explored: number;
  lookedBackPct: number;
  exits: number;
  /** of the visits that reached it, the share that ended there */
  exitPct: number;
  /** time on each of 20 equal parts of the footage, 0–1 (1 = the most) */
  heat: number[];
  topPart: number | null;
  pins: { title: string; taps: number }[];
};

/** Tour Insights for a period (the builder's Insights sheet and the owner report). */
export type TourInsights = {
  days: number;
  from: string;
  to: string;
  countingSince: string | null;
  visits: number;
  totalMs: number;
  avgVisitMs: number;
  sawAllPct: number;
  avgDriftsSeen: number;
  driftCount: number;
  enquiries: number;
  /** where visits came from — team only (null on the owner report) */
  sources: { direct: number; personal: number; unbranded: number } | null;
  series: { date: string; visits: number }[];
  drifts: DriftInsight[];
};

/** The owner report (/report/{code}): the tour, its page, and its Insights. */
export type OwnerReport = {
  tour: { title: string; description: string | null; thumb: string | null };
  page: { name: string; logoUrl: string | null };
  insights: TourInsights;
};

/** Reel layouts: every drift filling a portrait (full) or widescreen (landscape) frame, or the
 *  whole shot over a blurred copy (framed, portrait). */
export type ReelLayout = "full" | "landscape" | "framed";

/** A tour's reel (vertical video) in one layout: none yet, rendering, ready or failed. */
export type TourReel = {
  layout?: ReelLayout;
  status: "NONE" | "RENDERING" | "READY" | "FAILED";
  url?: string | null;
  seconds?: number | null;
  renderedAt?: string | null;
  /** the tour changed since this reel was made */
  stale?: boolean;
  error?: string | null;
  /** drifts that go in it */
  drifts: number;
};

export const isReady = (s?: string | null) => s === "READY" || s === "PUBLISHED";
