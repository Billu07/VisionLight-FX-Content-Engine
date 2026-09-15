# drift.li link previews + search — setup and checks

When anyone shares a drift.li link (WhatsApp, iMessage, Facebook, Instagram DMs, LinkedIn, X, Slack,
Discord, email apps), the preview is built from the page's `<head>`: title, description and image.
Those apps **don't run JavaScript**, so they used to read the one `index.html` every domain shares —
"PicDrift Studio - AI Content Generation Studio". Now the app fills that head in per page before it
reaches them.

## What's in the package

| Page | Preview title | Card |
|---|---|---|
| `drift.li` | Drift Live Interactive | Home card: the client's headline, demo-tour frames on the grid |
| `/tour`, `/tour/start` | Drift Tour — Show Any Space / Try Drift Tour Free | Tour card with demo frames |
| `/view` `/memory` `/path` | Drift View / Memory / Path + the client's line | Each product's icon and colour (cyan / violet / emerald) |
| `/tour/capture-guide` | Drift Capture Guide — For Best Results | Camera card |
| `/tour/{page}` | {Page} — Interactive Tours | The page's logo, name and tour covers |
| `/tour/{page}/{tour}` | {Tour} — {Page} | The cover photo, "Interactive tour · N spaces", the spaces strip, the page |
| `/tour/{page}/{tour}/{drift}` | {Drift} · {Tour} | The drift's frame with a drag badge (arrows the way it moves) |
| `/u/{code}` (unbranded) | {Tour} | The tour card with **no page, logo or drift.li mark**; not indexed |
| `/report/{code}` | Tour report | A generic card — no tour data; not indexed |
| `/p/{id}`, `/{brand}/{drift}` | {Drift} · {Brand} | The drift's frame + the brand's logo |

Also: canonical links (a personal link `?to=…` previews as the tour itself), `robots` noindex on
private pages (reports, unbranded links, dashboards, sign-in), JSON-LD (Organization + WebSite on the
home page, breadcrumbs on pages / tours / drifts), drift.li's own icon set + web app manifest
(`frontend/public/drift/`, `drift.webmanifest`), `robots.txt` and `sitemap.xml` (published, visible
tours and their pages).

Cards are 1200×630 JPEGs under 290 KB (WhatsApp's limit), drawn with the site font bundled in the
backend. Each card URL carries a version of its content, so a changed tour gets a fresh preview.

Code: `backend/src/services/driftShare.ts` (per page), `driftShareCards.ts` (cards),
`driftTypeset.ts` (font), `routes/driftShare.ts` (served at `/__drift/*`).

---

## 1. Deploy

```bash
cd /var/www/myapp && git pull --ff-only origin main
cd backend && npm ci --no-audit --no-fund && npm run build && pm2 restart my-backend --update-env
cd ../frontend && npm ci --no-audit --no-fund && npm run build
```

Check the app answers (on the VPS):

```bash
curl -s http://127.0.0.1:4000/__drift/html/tour | grep -iE '<title>|og:image"'
curl -s -o /tmp/card.jpg -w '%{http_code} %{content_type} %{size_download} bytes\n' http://127.0.0.1:4000/__drift/og/site/home.jpg
```

You should see `Drift Tour — Show Any Space`, an `og:image` on `https://drift.li/og/…`, and
`200 image/jpeg …`. (If your backend runs on another port, use that port everywhere below.)

## 2. nginx: send drift.li pages through the app

Find drift.li's server block:

```bash
sudo grep -rln "drift.li" /etc/nginx/sites-enabled/
sudo nginx -T 2>/dev/null | grep -n "server_name"
```

- If drift.li has **its own** `server { … server_name drift.li www.drift.li; … }` block, edit that.
- If drift.li shares a block with picdrift.studio, give drift.li its own block first (copy the block,
  keep the same `root`, `listen` and SSL lines, set `server_name drift.li www.drift.li;` in the copy,
  remove drift.li from the original).

Inside drift.li's block, replace the existing `location / { … }` with:

```nginx
    # drift.li link previews + search (backend routes/driftShare.ts)
    location = /robots.txt  { proxy_pass http://127.0.0.1:4000/__drift/robots.txt;  proxy_set_header Host $host; }
    location = /sitemap.xml { proxy_pass http://127.0.0.1:4000/__drift/sitemap.xml; proxy_set_header Host $host; }

    location ^~ /og/ {
        proxy_pass http://127.0.0.1:4000/__drift/og/;
        proxy_set_header Host $host;
    }

    # Static files as before; every page goes through the app for its head…
    location / {
        try_files $uri @drift_page;
    }
    location @drift_page {
        proxy_pass http://127.0.0.1:4000/__drift/html$request_uri;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 2s;
        proxy_read_timeout 8s;
        proxy_intercept_errors on;
        error_page 500 502 503 504 = @drift_static;
    }
    # …and if the app can't answer, the plain index.html — the site never goes down over this.
    location @drift_static {
        try_files /index.html =404;
    }
```

Keep any other `location` blocks you have (e.g. `/assets/` caching). Then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Rollback:** put the old `location /` back and `sudo systemctl reload nginx`.

## 3. Check it from outside

```bash
curl -s https://drift.li/ | grep -iE '<title>|og:title|og:image"'
curl -s -A "facebookexternalhit/1.1" https://drift.li/tour | grep -i 'og:title'
curl -sI https://drift.li/og/site/home.jpg | head -3
curl -s https://drift.li/robots.txt
curl -s https://drift.li/sitemap.xml | head -5
```

Open one real tour link the same way (`/tour/{page}/{tour}`) and check the title is the tour's.

## 4. Refresh the apps' caches

Apps remember a link's preview for days, so old links may keep the old card until refreshed:

- **Facebook / Instagram / WhatsApp (Meta):** https://developers.facebook.com/tools/debug/ → paste the
  link → **Scrape Again**. Do it for drift.li, /tour and any link you've already shared.
- **LinkedIn:** https://www.linkedin.com/post-inspector/ → paste → Inspect.
- **X:** paste the link into a new post to see the card (X re-reads within about a week).
- **WhatsApp / iMessage / Slack** keep their own copies; to test right away add something new to the
  link, e.g. `https://drift.li/tour?v=2`.
- **Google:** in Search Console add the `drift.li` property, then Sitemaps → submit
  `https://drift.li/sitemap.xml`.

## 5. Notes

- The Cloudflare worker in `cloudflare/drift-og-worker.js` is no longer needed for this (and it only
  ever worked with drift.li's DNS on Cloudflare).
- Changing a tour's title, cover or drifts changes its card automatically. To force every card to
  refresh (e.g. after a redesign), bump `CARD_VERSION` in `driftShareCards.ts`.
- `DRIFT_PUBLIC_ORIGIN` (default `https://drift.li`) sets the address used in canonical links and
  card URLs.
