import { Router, type Request, type Response } from "express";
import axios from "axios";
import fs from "node:fs/promises";
import path from "node:path";
import { isManagedStorageUrl } from "../utils/managedStorage";
import {
  createDbShareLookup,
  renderSharePage,
  resolveShare,
  robotsTxt,
  sitemapXml,
  type ShareMeta,
} from "../services/driftShare";
import { renderDriftCard, renderPageCard, renderSiteCard, renderTourCard, SITE_CARDS, type SiteCardKey } from "../services/driftShareCards";

/**
 * drift.li link previews, served from this app (services/driftShare.ts). nginx sends drift.li
 * page requests that aren't static files to /__drift/html/<path>, /og/* to /__drift/og/*, and
 * /robots.txt and /sitemap.xml here. Each page gets the app's index.html with its own title,
 * description, canonical link and share card filled in. Nothing here can take a page down: a
 * lookup failure serves the plain index.html, and nginx falls back to the static file if this
 * process can't answer.
 */

const router = Router();
const NS = "drift-share";
const lookup = createDbShareLookup();

// ── the app shell (frontend/dist/index.html, re-read when a new build lands) ──
const SHELL_FILES = [
  process.env.DRIFT_INDEX_HTML,
  path.resolve(process.cwd(), "../frontend/dist/index.html"),
  path.resolve(__dirname, "../../../frontend/dist/index.html"),
].filter((f): f is string => !!f);
let shell: { file: string; mtimeMs: number; html: string } | null = null;

async function appShell(): Promise<string | null> {
  for (const file of SHELL_FILES) {
    try {
      const stat = await fs.stat(file);
      if (shell && shell.file === file && shell.mtimeMs === stat.mtimeMs) return shell.html;
      const html = await fs.readFile(file, "utf8");
      shell = { file, mtimeMs: stat.mtimeMs, html };
      return html;
    } catch {
      /* try the next place */
    }
  }
  return null;
}

/** Remembers promises for a while (failures are forgotten at once). */
function remember<T>(ttlMs: number, max: number) {
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, make: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const hit = entries.get(key);
    if (hit && now - hit.at < ttlMs) return hit.value;
    const value = make();
    entries.set(key, { at: now, value });
    value.catch(() => entries.delete(key));
    if (entries.size > max) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    return value;
  };
}
const metaFor = remember<ShareMeta>(60_000, 1000);
const cardFor = remember<Buffer>(60 * 60_000, 150);

// At most two cards render at once (sharp is CPU work; a burst of crawlers mustn't pile up).
let rendering = 0;
const waiting: (() => void)[] = [];
async function limited<T>(task: () => Promise<T>): Promise<T> {
  if (rendering >= 2) await new Promise<void>((resolve) => waiting.push(resolve));
  rendering++;
  try {
    return await task();
  } finally {
    rendering--;
    waiting.shift()?.();
  }
}

// ── a page ──
router.get(/^\/__drift\/html(?:\/.*)?$/, async (req: Request, res: Response) => {
  const html = await appShell();
  if (!html) {
    res.status(503).type("text/plain").send("The app isn't built yet");
    return;
  }
  const pagePath = req.path.slice("/__drift/html".length) || "/";
  let meta: ShareMeta | null = null;
  try {
    meta = await metaFor(pagePath.toLowerCase(), () => resolveShare(pagePath, lookup));
  } catch (err) {
    console.warn(`[${NS}] metadata for ${pagePath} failed:`, err instanceof Error ? err.message : err);
  }
  res.set("Cache-Control", "no-cache");
  res.type("html");
  if (!meta) {
    res.send(html);
    return;
  }
  if (meta.noindex) res.set("X-Robots-Tag", "noindex, nofollow");
  res.send(renderSharePage(html, meta));
});

// ── share cards ──
class NotFound extends Error {}

async function image(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !isManagedStorageUrl(url)) return null; // only our own storage — never an arbitrary URL
  try {
    const r = await axios.get(url, { responseType: "arraybuffer", timeout: 12000, maxContentLength: 25 * 1024 * 1024 });
    return Buffer.from(r.data as ArrayBuffer);
  } catch {
    return null;
  }
}
const images = async (urls: (string | null | undefined)[]) => (await Promise.all(urls.map(image))).filter((b): b is Buffer => !!b);

function renderCard(kind: string, id: string): Promise<Buffer> {
  return limited(async () => {
    if (kind === "site") {
      if (!Object.prototype.hasOwnProperty.call(SITE_CARDS, id)) throw new NotFound();
      const key = id as SiteCardKey;
      // Without the demo tour (or the database) the card still renders, with placeholder frames.
      const frames = SITE_CARDS[key].visual === "frames" ? await images(await lookup.demoFrames().catch(() => [])) : [];
      return renderSiteCard(key, frames);
    }
    if (kind === "page") {
      const page = await lookup.page(id.toLowerCase());
      if (!page) throw new NotFound();
      return renderPageCard({
        name: page.name,
        logo: await image(page.logoUrl),
        tours: page.tours.length,
        covers: await images(page.tours.slice(0, 3).map((t) => t.cover)),
      });
    }
    if (kind === "tour" || kind === "u") {
      const tour = kind === "tour" ? await lookup.tourById(id) : await lookup.unbranded(id.toLowerCase());
      if (!tour) throw new NotFound();
      const [logo, cover, thumbs] = await Promise.all([image(tour.logoUrl), image(tour.cover), images(tour.thumbs)]);
      return renderTourCard({ title: tour.title, pageName: tour.pageName, logo, cover, thumbs, spaces: tour.spaces, unbranded: kind === "u" });
    }
    if (kind === "drift") {
      const drift = await lookup.driftById(id);
      if (!drift) throw new NotFound();
      const context = drift.tour ? [drift.tour.title, drift.page?.name].filter(Boolean).join(" · ") : drift.brand?.name || null;
      const [frame, logo] = await Promise.all([image(drift.frame), image(drift.brand?.logoUrl)]);
      return renderDriftCard({ name: drift.name, context, frame, index: drift.index, total: drift.total, vertical: drift.vertical, logo });
    }
    throw new NotFound();
  });
}

router.get("/__drift/og/:kind/:file", async (req: Request, res: Response) => {
  const kind = String(req.params.kind || "");
  const id = String(req.params.file || "").replace(/\.jpe?g$/i, "");
  const v = String(req.query.v || "").slice(0, 40);
  try {
    const card = await cardFor(`${kind}:${id}:${v}`, () => renderCard(kind, id));
    res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.type("image/jpeg").send(card);
  } catch (err) {
    if (!(err instanceof NotFound)) console.warn(`[${NS}] card ${kind}/${id} failed:`, err instanceof Error ? err.message : err);
    // A preview never shows a broken image: fall back to the drift.li card.
    const fallback = await cardFor("site:home:fallback", () => limited(() => renderSiteCard("home"))).catch(() => null);
    if (!fallback) {
      res.status(404).end();
      return;
    }
    res.set("Cache-Control", "public, max-age=300");
    res.type("image/jpeg").send(fallback);
  }
});

// ── robots.txt + sitemap.xml ──
let sitemap: { at: number; xml: string } | null = null;

router.get("/__drift/robots.txt", (_req: Request, res: Response) => {
  res.set("Cache-Control", "public, max-age=3600").type("text/plain").send(robotsTxt());
});

router.get("/__drift/sitemap.xml", async (_req: Request, res: Response) => {
  try {
    if (!sitemap || Date.now() - sitemap.at > 10 * 60_000) sitemap = { at: Date.now(), xml: await sitemapXml(lookup) };
    res.set("Cache-Control", "public, max-age=600").type("application/xml").send(sitemap.xml);
  } catch (err) {
    console.warn(`[${NS}] sitemap failed:`, err instanceof Error ? err.message : err);
    res.status(503).type("text/plain").send("Sitemap unavailable");
  }
});

export default router;
