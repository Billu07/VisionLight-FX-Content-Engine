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

export const isReady = (s?: string | null) => s === "READY" || s === "PUBLISHED";
