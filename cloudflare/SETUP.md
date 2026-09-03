# Drift custom domains + share-preview setup

The **code** for custom domains and per-domain share previews is already built and
deployed. This file is the one-time operational setup you run on **Cloudflare** and
the **VPS**. Do them in order — step 1 is required or the drift pages error.

Placeholders to substitute:
- `VPS_IP` — the drift server's public IP.
- `drift.li` — the primary drift zone (must be on Cloudflare, proxied / orange cloud).

---

## 1. Database schema (REQUIRED — do this first)

The deploy pipeline does **not** run migrations. Recent drift columns
(`DriftProduct.hideTitle`, `DriftProduct.mobileZoom`, `Organization.termsUrl`,
`Organization.privacyUrl`, `Organization.landingHeroProductId`, plus the
`DriftDomain` table) must be pushed manually. Until then the drift landing/player
queries throw (they select columns the DB doesn't have).

```bash
# on the VPS
cd /var/www/myapp/backend
npx prisma db push          # creates the missing columns + DriftDomain table
pm2 restart my-backend
```

Verify: open the drift landing (drift.li) — it should load without a 500.

---

## 2. Backend env vars for Cloudflare for SaaS

Without these, adding a domain in the dashboard just records CNAME instructions
(no automatic SSL / custom-hostname registration). With them, the backend calls
Cloudflare to provision the custom hostname + certificate.

Create a **Cloudflare API token** (My Profile → API Tokens → Create Token → custom):
- Permissions: **Zone → SSL and Certificates → Edit**, and **Zone → Zone → Read**
- Zone Resources: **Include → Specific zone → drift.li**

Then on the VPS (in the backend's env / ecosystem file), set:

```bash
CLOUDFLARE_API_TOKEN=<the token above>
CLOUDFLARE_ZONE_ID=<drift.li zone id>     # Cloudflare dashboard → drift.li → Overview → API → Zone ID
DRIFT_DOMAIN_TARGET=link.drift.li          # the CNAME target brands point at (see step 3)
```

Apply:

```bash
pm2 restart my-backend --update-env
```

Verify: as a brand (or super-admin), GET `/api/drift/my/domains` — the response
`cloudflare` field should be `true`.

---

## 3. Cloudflare for SaaS (custom hostnames)

In the **drift.li** Cloudflare zone:

1. **SSL/TLS → Custom Hostnames → Enable Cloudflare for SaaS.**
2. **Fallback origin:** set it to `link.drift.li` (this is `DRIFT_DOMAIN_TARGET`).
   - Add a DNS record so `link.drift.li` resolves to the app:
     `A  link  VPS_IP  (Proxied / orange cloud)`.
   - Cloudflare proxies every custom hostname to this fallback origin, which is the
     same app that serves drift.li.
3. That's it for the platform side. When a brand adds a domain in their drift
   dashboard, the backend registers it as a custom hostname automatically (step 2).

**How a brand connects their domain (what they do on their side):**
1. In their drift dashboard → Domains → add e.g. `drift.theirbrand.com`.
2. The dashboard shows a CNAME: `drift.theirbrand.com  →  link.drift.li`.
   (If Cloudflare returns a TXT ownership / DCV record, it's shown too — they add that.)
3. They create that CNAME at their DNS provider.
4. Back in the dashboard, **Refresh** until status → `active` (SSL issued).

**How it renders their brand:** the app serves the same SPA to every host. On a
non-drift.li host, the frontend calls `GET /api/drift/public/resolve-host?host=<host>`
→ `{ brandSlug }`, then loads that brand's landing hero (their logo/name +
their Terms/Privacy). drift.li itself keeps the single global hero.

---

## 4. Share-preview title + image (ads / social)

Social & ad crawlers read the **static** `<title>` + Open Graph tags and don't run
JS, so the per-domain title/image must be swapped at the edge. That's the worker in
`cloudflare/drift-og-worker.js`.

**The image** (`og-drift.png`, 1200×630) ships as a static asset in
`frontend/public/`, so it's already served at **https://drift.li/og-drift.png**
after a normal deploy — nothing extra to host.

**Deploy the worker** (drift.li zone):
1. Workers & Pages → **Create Worker** → paste `cloudflare/drift-og-worker.js` → Deploy.
2. Add **Routes**: `drift.li/*` and `www.drift.li/*`.
   (Add brand custom hostnames here too as they go live, and extend `isDriftHost`
   + the copy in the worker per brand.)
   - Cloudflare **Snippets** work the same way with the same HTMLRewriter API if you
     prefer not to manage a Worker.

The worker rewrites `<title>` + og/twitter title/description to the Drift Link
values and injects the og:image/twitter:image for drift hosts only; every other
host (picdrift, visualfx) passes through untouched.

**Verify:**
- Paste a drift.li link into iMessage / Slack — preview should read
  “Drift Link — Interactive Drift Paths” with the share card.
- Facebook Sharing Debugger + X Card Validator → **Scrape Again** (crawlers cache
  hard; re-scrape after deploying the worker).
- `curl -sL https://drift.li/ | grep -i 'og:image\|<title>'` should show the Drift
  values (served through Cloudflare).

---

## Quick checklist

- [ ] `npx prisma db push` on the VPS  ·  `pm2 restart my-backend`
- [ ] CF API token (SSL:Edit + Zone:Read) → env vars → `pm2 restart --update-env`
- [ ] `/api/drift/my/domains` returns `cloudflare: true`
- [ ] Cloudflare for SaaS enabled + fallback origin `link.drift.li` → `A link VPS_IP` (proxied)
- [ ] Deploy `drift-og-worker.js` + routes `drift.li/*`, `www.drift.li/*`
- [ ] Re-scrape in FB Debugger / X Validator → title + image correct
