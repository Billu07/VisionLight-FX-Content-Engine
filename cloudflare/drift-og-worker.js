// Cloudflare Worker / Snippet — per-domain share-preview meta for drift.li.
//
// WHY: the app is ONE static SPA served to every domain, and social / ad crawlers
// (iMessage, Facebook/Meta, LinkedIn, WhatsApp, X…) read the STATIC <title> +
// Open Graph tags WITHOUT running JavaScript. So the JS tab-title script in
// index.html can't help them, and drift.li link previews fell back to the baked-in
// "PicDrift Studio - AI Content Generation Studio". This rewrites those tags to the
// Drift Link values at the edge for drift domains; every other host/response passes
// through untouched.
//
// DEPLOY (Cloudflare dashboard → the drift.li zone):
//   1. drift.li must be proxied through Cloudflare (orange cloud).
//   2. Workers & Pages → Create Worker → paste this → Deploy.
//   3. Add Routes:  drift.li/*  and  www.drift.li/*  (add brand custom hostnames
//      here too as they go live, and extend isDriftHost / the copy per brand).
//   (Cloudflare "Snippets" work the same way with the same HTMLRewriter API if you
//   prefer not to use a Worker.)
//
// VERIFY: after deploy, use the Facebook Sharing Debugger / X Card Validator, or
// just paste a drift.li link into iMessage — the preview title should read
// "Drift Link — Interactive Drift Paths".

const DRIFT = {
  title: "Drift Link — Interactive Drift Paths",
  description:
    "Drag anything to life — interactive before/after drifts you scrub with a finger. Built for ad campaigns.",
  siteName: "Drift Link",
  // 1200x630 share card, served as a static asset by the app (frontend/public).
  image: "https://drift.li/og-drift.png",
};

function isDriftHost(host) {
  const h = host.replace(/^www\./, "").toLowerCase();
  return h === "drift.li"; // extend with brand custom domains as they're added
}

export default {
  async fetch(request) {
    const res = await fetch(request); // goes to the origin (no Worker loop)
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) return res; // only rewrite HTML documents
    if (!isDriftHost(new URL(request.url).hostname)) return res;

    const setContent = (val) => ({
      element(el) {
        el.setAttribute("content", val);
      },
    });

    return new HTMLRewriter()
      .on("title", {
        element(el) {
          el.setInnerContent(DRIFT.title);
        },
      })
      .on('meta[property="og:site_name"]', setContent(DRIFT.siteName))
      .on('meta[property="og:title"]', setContent(DRIFT.title))
      .on('meta[name="twitter:title"]', setContent(DRIFT.title))
      .on('meta[property="og:description"]', setContent(DRIFT.description))
      .on('meta[name="twitter:description"]', setContent(DRIFT.description))
      // index.html carries no og:image (so picdrift/visualfx aren't mislabeled) —
      // inject the Drift Link share card into <head> for drift domains only.
      .on("head", {
        element(el) {
          el.append(
            `<meta property="og:image" content="${DRIFT.image}"/>` +
              `<meta property="og:image:width" content="1200"/>` +
              `<meta property="og:image:height" content="630"/>` +
              `<meta property="og:image:alt" content="Drift Link — interactive before/after product drifts"/>` +
              `<meta name="twitter:image" content="${DRIFT.image}"/>`,
            { html: true },
          );
        },
      })
      .transform(res);
  },
};
