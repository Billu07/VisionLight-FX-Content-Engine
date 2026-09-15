import crypto from "node:crypto";
import { prisma } from "./database";
import {
  driftPublicPath,
  flowInclude,
  flowPublicPath,
  pagePublicPath,
  parseFlowKind,
  serializePublicFlow,
  stepDriftSlugs,
  stepNoun,
} from "./driftFlows";
import { CARD_VERSION, SITE_CARDS, type SiteCardKey } from "./driftShareCards";

/**
 * drift.li link previews and search metadata, per page. Social apps and search engines read a
 * page's <head> without running JavaScript, so the server fills it in before the app loads:
 * title, description, canonical link, robots, Open Graph + X (Twitter) tags pointing at a share
 * card made for that page (driftShareCards.ts), JSON-LD, and drift.li's own icons. Also
 * robots.txt and sitemap.xml. What each page shows only ever comes from what's public anyway
 * (published tours, ready drifts); private links (reports, unbranded) are noindex.
 * The data comes through a ShareLookup, so this is tested without a database.
 */

export const DRIFT_ORIGIN = (process.env.DRIFT_PUBLIC_ORIGIN || "https://drift.li").replace(/\/+$/, "");
export const SHARE_START = "<!-- share:start";
export const SHARE_END = "<!-- share:end -->";

export type TourShare = {
  id: string;
  path: string;
  title: string;
  description: string | null;
  /** null on the unbranded version */
  pageName: string | null;
  pagePath: string | null;
  logoUrl: string | null;
  cover: string | null;
  thumbs: string[];
  spaces: number;
};

export type PageShare = {
  slug: string;
  path: string;
  name: string;
  logoUrl: string | null;
  tours: { title: string; path: string; cover: string | null }[];
};

export type DriftShare = {
  id: string;
  path: string;
  name: string;
  description: string | null;
  frame: string | null;
  vertical: boolean;
  index: number | null;
  total: number | null;
  tour: { title: string; path: string } | null;
  page: { name: string; path: string | null } | null;
  brand: { name: string; logoUrl: string | null } | null;
};

export interface ShareLookup {
  /** covers / frames of drift.li's demo tour (the home and tour cards) */
  demoFrames(): Promise<string[]>;
  page(slug: string): Promise<PageShare | null>;
  tour(pageSlug: string, tourSlug: string): Promise<TourShare | null>;
  tourById(id: string): Promise<TourShare | null>;
  unbranded(code: string): Promise<TourShare | null>;
  drift(pageSlug: string, tourSlug: string, driftSlug: string): Promise<DriftShare | null>;
  driftById(id: string): Promise<DriftShare | null>;
  brandDrift(brandSlug: string, productSlug: string): Promise<DriftShare | null>;
  sitemap(): Promise<{ path: string; updatedAt: Date | null }[]>;
}

export type ShareImage = { kind: "site" | "page" | "tour" | "drift" | "u"; id: string; version: string; alt: string };

export type ShareMeta = {
  /** the page as opened (no query) */
  path: string;
  title: string;
  description: string;
  /** null → no canonical link (private or unknown pages) */
  canonical: string | null;
  noindex: boolean;
  image: ShareImage;
  jsonLd: Record<string, unknown>[];
};

// ───────────────────────────── per page ─────────────────────────────

const clip = (value: string, max: number) => {
  const s = String(value || "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};
const version = (...parts: unknown[]) => `${CARD_VERSION}-${crypto.createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 10)}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const SITE_PAGES: Record<string, { card: SiteCardKey; title: string; description: string }> = {
  "/": {
    card: "home",
    title: "Drift Live Interactive",
    description: "Turn a few seconds of video into a Live Interactive you can explore. Tour · View · Memory · Path.",
  },
  "/tour": {
    card: "tour",
    title: "Drift Tour — Show Any Space | drift.li",
    description: "Turn a 3-second video into a Live Interactive. Connect them and create a Tour. No 360 equipment. No complicated software.",
  },
  "/tour/start": {
    card: "tour",
    title: "Try Drift Tour Free | drift.li",
    description: "Turn a 3-second video into a Live Interactive. Connect them and create a Tour. No 360 equipment. No complicated software.",
  },
  "/tour/capture-guide": {
    card: "guide",
    title: "Drift Capture Guide — For Best Results | drift.li",
    description: "Take a pan or tilt video of each space. Upload it. We turn it into a Drift in minutes.",
  },
  "/view": {
    card: "view",
    title: "Drift View — Share What You See | drift.li",
    description: "Turn a few seconds of a real place or moment into an Interactive View. See the world through someone else's eyes.",
  },
  "/memory": {
    card: "memory",
    title: "Drift Memory — Keep the Moments That Matter",
    description: "Turn a few seconds of life into something you can return to and explore. Private. Yours to remember.",
  },
  "/path": {
    card: "path",
    title: "Drift Path — Connect the Experience | drift.li",
    description: "Connect Drifts, images, video, information and links into an Interactive Path. Tell a story. Explain a process. Guide someone step by step.",
  },
  "/terms": { card: "home", title: "Terms | drift.li", description: "Turn a few seconds of video into a Live Interactive you can explore." },
  "/privacy": { card: "home", title: "Privacy | drift.li", description: "Turn a few seconds of video into a Live Interactive you can explore." },
};

/** First path segments that are signed-in or utility screens: never indexed, the home card. */
const PRIVATE = new Set(["auth", "admin", "app", "studios", "projects", "reset-password", "support-handoff", "billing", "pricing", "demo"]);

const breadcrumbs = (items: [string, string][]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: `${DRIFT_ORIGIN}${path === "/" ? "" : path}` })),
});

async function siteMeta(path: string, page: string, lookup: ShareLookup, opts: { noindex?: boolean } = {}): Promise<ShareMeta> {
  const s = SITE_PAGES[page] ?? SITE_PAGES["/"];
  const card = SITE_CARDS[s.card];
  const frames = card.visual === "frames" ? await lookup.demoFrames().catch(() => []) : [];
  return {
    path,
    title: s.title,
    description: s.description,
    canonical: opts.noindex ? null : page,
    noindex: !!opts.noindex,
    image: { kind: "site", id: s.card, version: version(s.card, frames), alt: card.alt },
    jsonLd:
      page === "/" && !opts.noindex
        ? [
            { "@context": "https://schema.org", "@type": "Organization", name: "Drift Live Interactive", url: DRIFT_ORIGIN, logo: `${DRIFT_ORIGIN}/drift/icon-512.png` },
            // Google shows this as the site's name in search results.
            { "@context": "https://schema.org", "@type": "WebSite", name: "Drift Live Interactive", alternateName: "drift.li", url: DRIFT_ORIGIN },
          ]
        : [],
  };
}

function pageMeta(path: string, p: PageShare): ShareMeta {
  const n = p.tours.length;
  return {
    path,
    title: clip(`${p.name} — Interactive Tours | drift.li`, 70),
    description: clip(
      n ? `${plural(n, "interactive tour", "interactive tours")} by ${p.name}. Drag through every space, right in your browser.` : `Interactive tours by ${p.name} on drift.li.`,
      160,
    ),
    canonical: p.path,
    noindex: false,
    image: { kind: "page", id: p.slug, version: version(p.name, p.logoUrl, p.tours.map((t) => [t.title, t.cover])), alt: `${p.name} on drift.li` },
    jsonLd: [breadcrumbs([["drift.li", "/"], [p.name, p.path]])],
  };
}

function tourMeta(path: string, t: TourShare, unbrandedCode: string | null): ShareMeta {
  const spaces = plural(t.spaces, "space", "spaces");
  const image = { title: t.title, pageName: t.pageName, logoUrl: t.logoUrl, cover: t.cover, thumbs: t.thumbs, spaces: t.spaces };
  if (unbrandedCode) {
    return {
      path,
      title: clip(t.title, 70),
      description: clip(t.description || `An interactive tour of ${spaces}. Drag through each one, right in your browser.`, 160),
      canonical: null,
      noindex: true,
      image: { kind: "u", id: unbrandedCode, version: version(image), alt: `${t.title} — interactive tour` },
      jsonLd: [],
    };
  }
  return {
    path,
    title: clip(t.pageName ? `${t.title} — ${t.pageName}` : t.title, 70),
    description: clip(t.description || `An interactive tour of ${spaces}${t.pageName ? ` by ${t.pageName}` : ""}. Drag through each one, right in your browser.`, 160),
    canonical: t.path,
    noindex: false,
    image: { kind: "tour", id: t.id, version: version(image), alt: `${t.title} — interactive tour` },
    jsonLd: [breadcrumbs([["drift.li", "/"], ...(t.pageName && t.pagePath ? ([[t.pageName, t.pagePath]] as [string, string][]) : []), [t.title, t.path]])],
  };
}

function driftMeta(path: string, d: DriftShare, noindex: boolean): ShareMeta {
  const context = d.tour?.title ?? d.brand?.name ?? null;
  const description = d.tour
    ? `Drag to explore ${d.name} — part of ${d.tour.title}${d.page ? ` by ${d.page.name}` : ""}.`
    : `Drag to explore ${d.name}${d.brand?.name ? ` by ${d.brand.name}` : ""}.`;
  return {
    path,
    title: clip(context ? `${d.name} · ${context}` : d.name, 70),
    description: clip(d.description || description, 160),
    canonical: noindex ? null : d.path,
    noindex,
    image: {
      kind: "drift",
      id: d.id,
      version: version(d.name, d.frame, context, d.page?.name, d.brand, d.index, d.total, d.vertical),
      alt: `${d.name} — drag to explore`,
    },
    jsonLd:
      d.tour && !noindex
        ? [breadcrumbs([["drift.li", "/"], ...(d.page?.path ? ([[d.page.name, d.page.path]] as [string, string][]) : []), [d.tour.title, d.tour.path], [d.name, d.path]])]
        : [],
  };
}

const decodeSegment = (s: string) => {
  try {
    return decodeURIComponent(s).trim().toLowerCase();
  } catch {
    return s.trim().toLowerCase();
  }
};

/** The metadata for a drift.li page path. Unknown pages get the home card (not indexed). */
export async function resolveShare(rawPath: string, lookup: ShareLookup): Promise<ShareMeta> {
  const segs = String(rawPath || "/").split(/[?#]/)[0].split("/").filter(Boolean).map(decodeSegment);
  const path = `/${segs.join("/")}`;
  const [a, b, c, d] = segs;
  const n = segs.length;

  if (SITE_PAGES[path]) return siteMeta(path, path, lookup);
  if (PRIVATE.has(a)) return siteMeta(path, "/", lookup, { noindex: true });

  if (a === "tour") {
    if (b === "dashboard" || b === "invite" || (n === 3 && c === "edit")) return siteMeta(path, "/tour", lookup, { noindex: true });
    if (n === 2) {
      const page = await lookup.page(b);
      if (page) return pageMeta(path, page);
    } else if (n === 3) {
      const tour = await lookup.tour(b, c);
      if (tour) return tourMeta(path, tour, null);
    } else if (n === 4) {
      const drift = await lookup.drift(b, c, d);
      if (drift) return driftMeta(path, drift, false);
    }
    return siteMeta(path, "/tour", lookup, { noindex: true });
  }
  if (a === "u" && n === 2) {
    const tour = await lookup.unbranded(b);
    if (tour) return tourMeta(path, tour, b);
    return siteMeta(path, "/", lookup, { noindex: true });
  }
  if (a === "report") {
    const card = SITE_CARDS.report;
    return {
      path,
      title: "Tour report | drift.li",
      description: "A live, read-only report for this tour on drift.li.",
      canonical: null,
      noindex: true,
      image: { kind: "site", id: "report", version: version("report"), alt: card.alt },
      jsonLd: [],
    };
  }
  if ((a === "p" || a === "embed") && n === 2) {
    const drift = await lookup.driftById(b);
    if (drift) return driftMeta(path, drift, a === "embed");
    return siteMeta(path, "/", lookup, { noindex: true });
  }
  if (n === 2 && b === "tour") {
    // drift.li/{page}/tour is an alias of the page.
    const page = await lookup.page(a);
    if (page) return pageMeta(path, page);
  }
  if (n === 2) {
    const drift = await lookup.brandDrift(a, b);
    if (drift) return driftMeta(path, drift, false);
  }
  return siteMeta(path, "/", lookup, { noindex: true });
}

// ───────────────────────────── the page head ─────────────────────────────

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const absolute = (origin: string, path: string) => `${origin}${path === "/" ? "/" : path}`;

/** The <head> tags for a page: title, description, canonical, robots, icons, Open Graph, X, JSON-LD. */
export function shareHead(meta: ShareMeta, origin = DRIFT_ORIGIN): string {
  const image = `${origin}/og/${meta.image.kind}/${encodeURIComponent(meta.image.id)}.jpg?v=${meta.image.version}`;
  const url = absolute(origin, meta.canonical ?? meta.path);
  const tags = [
    `<title>${esc(meta.title)}</title>`,
    `<meta name="description" content="${esc(meta.description)}" />`,
    meta.canonical !== null ? `<link rel="canonical" href="${esc(absolute(origin, meta.canonical))}" />` : "",
    `<meta name="robots" content="${meta.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}" />`,
    `<meta name="theme-color" content="#0b0f19" />`,
    `<link rel="icon" type="image/svg+xml" href="/drift/icon.svg" />`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/drift/favicon-32.png" />`,
    `<link rel="icon" type="image/png" sizes="16x16" href="/drift/favicon-16.png" />`,
    `<link rel="apple-touch-icon" sizes="180x180" href="/drift/apple-touch-icon.png" />`,
    `<link rel="manifest" href="/drift.webmanifest" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="drift.li" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    `<meta property="og:description" content="${esc(meta.description)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:secure_url" content="${esc(image)}" />`,
    `<meta property="og:image:type" content="image/jpeg" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(meta.image.alt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(meta.image.alt)}" />`,
    ...meta.jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`),
  ];
  return tags.filter(Boolean).join("\n    ");
}

/** The app's index.html with this page's head. The block between the share markers is replaced;
 *  an index.html without markers has its static title / social tags swapped instead. */
export function renderSharePage(template: string, meta: ShareMeta, origin = DRIFT_ORIGIN): string {
  const head = shareHead(meta, origin);
  const start = template.indexOf(SHARE_START);
  const end = template.indexOf(SHARE_END);
  if (start !== -1 && end > start) return `${template.slice(0, start)}${head}${template.slice(end + SHARE_END.length)}`;
  const stripped = template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description|theme-color)"[^>]*>\s*/gi, "");
  return stripped.replace(/<\/head>/i, `  ${head}\n  </head>`);
}

export const robotsTxt = (origin = DRIFT_ORIGIN) =>
  ["User-agent: *", "Allow: /", "Disallow: /auth/", "Disallow: /admin", "Disallow: /tour/dashboard", "Disallow: /api/", "", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");

export async function sitemapXml(lookup: ShareLookup, origin = DRIFT_ORIGIN): Promise<string> {
  const fixed = ["/", "/tour", "/view", "/memory", "/path", "/tour/capture-guide"].map((path) => ({ path, updatedAt: null as Date | null }));
  const urls = [...fixed, ...(await lookup.sitemap())];
  const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls.map((u) => `  <url><loc>${xml(absolute(origin, u.path))}</loc>${u.updatedAt ? `<lastmod>${u.updatedAt.toISOString().slice(0, 10)}</lastmod>` : ""}</url>`),
    `</urlset>`,
    "",
  ].join("\n");
}

// ───────────────────────────── the database ─────────────────────────────

const settingsObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const logoOf = (tourSettings: unknown) => {
  const s = settingsObj(tourSettings);
  return typeof s.logoUrl === "string" && s.logoUrl ? s.logoUrl : null;
};
const viewable = (status: string) => status === "READY" || status === "PUBLISHED";
const CODE = /^[a-z0-9]{6,20}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const tourInclude = { ...flowInclude, organization: { select: { slug: true, name: true, tourSettings: true } } };

function tourShareOf(flow: any, unbrandedCode: string | null): TourShare {
  const pub = serializePublicFlow(flow);
  return {
    id: flow.id,
    path: unbrandedCode ? `/u/${unbrandedCode}` : pub.publicPath,
    title: pub.title || pub.name,
    description: pub.description ?? null,
    pageName: unbrandedCode ? null : (flow.organization?.name ?? null),
    pagePath: unbrandedCode ? null : pub.pagePath,
    logoUrl: unbrandedCode ? null : logoOf(flow.organization?.tourSettings),
    cover: pub.thumb,
    thumbs: pub.steps.map((s) => s.thumb).filter((t): t is string => !!t).slice(0, 5),
    spaces: pub.steps.length,
  };
}

const frameOf = (p: any): string | null => {
  const m = settingsObj(p?.spin?.manifest);
  const frames = Array.isArray(m.frames) ? (m.frames as string[]) : [];
  return p?.thumbnailUrl || frames[Math.min(frames.length - 1, Math.max(0, Number(p?.defaultFrame) || 0))] || frames[0] || null;
};
const isVertical = (p: any) => p?.driftDirection === "TTB" || p?.driftDirection === "BTT";

function driftShareOf(flow: any, match: (step: any, slug: string | undefined) => boolean): DriftShare | null {
  const kind = parseFlowKind(flow.kind) ?? "TOUR";
  const slugs = stepDriftSlugs(flow.steps, stepNoun(kind));
  const live = (flow.steps as any[]).filter((s) => s.product && viewable(s.product.status));
  const step = live.find((s) => match(s, slugs.get(s.id)));
  if (!step) return null;
  const p = step.product;
  const pageSlug: string | null = flow.organization?.slug ?? null;
  const driftSlug = slugs.get(step.id);
  return {
    id: p.id,
    path: pageSlug && driftSlug ? driftPublicPath(kind, pageSlug, flow.slug, driftSlug) : `/p/${p.id}`,
    name: p.name,
    description: p.description ?? null,
    frame: frameOf(p),
    vertical: isVertical(p),
    index: live.indexOf(step) + 1,
    total: live.length,
    tour: { title: flow.title || flow.name, path: flowPublicPath(kind, pageSlug, flow.slug) },
    page: flow.organization ? { name: flow.organization.name, path: pageSlug ? pagePublicPath(pageSlug) : null } : null,
    brand: null,
  };
}

function brandDriftOf(p: any, org: any, path: string): DriftShare {
  const bc = org?.brandConfigs?.[0];
  return {
    id: p.id,
    path,
    name: p.title || p.name,
    description: p.description ?? null,
    frame: frameOf(p),
    vertical: isVertical(p),
    index: null,
    total: null,
    tour: null,
    page: null,
    brand: { name: bc?.companyName || org?.name || "", logoUrl: bc?.logoUrl || null },
  };
}

/** The live ShareLookup: only published tours, ready drifts, tour pages and drift brands. */
export function createDbShareLookup(): ShareLookup {
  const findPage = (slug: string) =>
    prisma.organization.findFirst({ where: { slug, productLine: "TOUR" }, select: { id: true, slug: true, name: true, tourSettings: true } });
  const brandSelect = { name: true, slug: true, brandConfigs: { select: { logoUrl: true, companyName: true }, take: 1 } } as const;

  return {
    async demoFrames() {
      const flow = await prisma.driftFlow.findFirst({
        where: { kind: "TOUR", status: "PUBLISHED", isDemo: true },
        orderBy: { updatedAt: "desc" },
        include: tourInclude,
      });
      if (!flow) return [];
      const pub = serializePublicFlow(flow);
      return [...new Set([pub.thumb, ...pub.steps.map((s) => s.thumb)].filter((t): t is string => !!t))].slice(0, 3);
    },
    async page(slug) {
      const org = await findPage(slug);
      if (!org?.slug) return null;
      const flows = await prisma.driftFlow.findMany({
        where: { organizationId: org.id, kind: "TOUR", status: "PUBLISHED", hidden: false },
        orderBy: [{ order: "asc" }, { createdAt: "desc" }],
        include: tourInclude,
        take: 24,
      });
      return {
        slug: org.slug,
        path: pagePublicPath(org.slug),
        name: org.name,
        logoUrl: logoOf(org.tourSettings),
        tours: flows.map((f) => {
          const pub = serializePublicFlow(f);
          return { title: pub.title || pub.name, path: pub.publicPath, cover: pub.thumb };
        }),
      };
    },
    async tour(pageSlug, tourSlug) {
      const org = await findPage(pageSlug);
      if (!org) return null;
      const flow = await prisma.driftFlow.findFirst({ where: { organizationId: org.id, slug: tourSlug, status: "PUBLISHED" }, include: tourInclude });
      return flow ? tourShareOf(flow, null) : null;
    },
    async tourById(id) {
      if (!UUID.test(id)) return null;
      const flow = await prisma.driftFlow.findFirst({ where: { id, status: "PUBLISHED", organization: { productLine: "TOUR" } }, include: tourInclude });
      return flow ? tourShareOf(flow, null) : null;
    },
    async unbranded(code) {
      if (!CODE.test(code)) return null;
      const flow = await prisma.driftFlow.findFirst({
        where: { status: "PUBLISHED", settings: { path: ["unbrandedCode"], equals: code } },
        include: tourInclude,
      });
      return flow ? tourShareOf(flow, code) : null;
    },
    async drift(pageSlug, tourSlug, driftSlug) {
      const org = await findPage(pageSlug);
      if (!org) return null;
      const flow = await prisma.driftFlow.findFirst({ where: { organizationId: org.id, slug: tourSlug, status: "PUBLISHED" }, include: tourInclude });
      return flow ? driftShareOf(flow, (_s, slug) => slug === driftSlug) : null;
    },
    async driftById(id) {
      if (!UUID.test(id)) return null;
      const step = await prisma.driftFlowStep.findUnique({ where: { productId: id }, select: { flowId: true } });
      if (step) {
        const flow = await prisma.driftFlow.findFirst({ where: { id: step.flowId, status: "PUBLISHED" }, include: tourInclude });
        return flow ? driftShareOf(flow, (s) => s.productId === id) : null;
      }
      const p = await prisma.driftProduct.findFirst({
        where: { id, status: { in: ["READY", "PUBLISHED"] }, organization: { productLine: "DRIFT" } },
        include: { spin: { select: { manifest: true } }, organization: { select: brandSelect } },
      });
      return p?.spin ? brandDriftOf(p, p.organization, `/p/${p.id}`) : null;
    },
    async brandDrift(brandSlug, productSlug) {
      const org = await prisma.organization.findFirst({ where: { slug: brandSlug, productLine: "DRIFT" }, select: { id: true, ...brandSelect } });
      if (!org) return null;
      const p = await prisma.driftProduct.findFirst({
        where: { organizationId: org.id, slug: productSlug, status: { in: ["READY", "PUBLISHED"] } },
        include: { spin: { select: { manifest: true } } },
      });
      return p?.spin ? brandDriftOf(p, org, `/${org.slug}/${p.slug}`) : null;
    },
    async sitemap() {
      const flows = await prisma.driftFlow.findMany({
        where: { kind: "TOUR", status: "PUBLISHED", hidden: false, organization: { productLine: "TOUR" } },
        select: { slug: true, updatedAt: true, organization: { select: { slug: true } } },
        orderBy: { updatedAt: "desc" },
        take: 5000,
      });
      const pages = new Map<string, Date>();
      const tours: { path: string; updatedAt: Date | null }[] = [];
      for (const f of flows) {
        const pageSlug = f.organization?.slug;
        if (!pageSlug) continue;
        tours.push({ path: flowPublicPath("TOUR", pageSlug, f.slug), updatedAt: f.updatedAt });
        const seen = pages.get(pageSlug);
        if (!seen || f.updatedAt > seen) pages.set(pageSlug, f.updatedAt);
      }
      return [...[...pages].map(([slug, updatedAt]) => ({ path: pagePublicPath(slug), updatedAt })), ...tours];
    },
  };
}
