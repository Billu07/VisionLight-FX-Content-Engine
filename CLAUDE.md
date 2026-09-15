# CLAUDE.md — VisionLight-FX project bible

Context that should survive across sessions. Named `CLAUDE.md` because Claude Code
(incl. Fable) auto-loads it at the start of every session — that's what keeps us
from "getting lost between sessions." Keep it current; it's the source of truth for
how this repo works and what we're building.

> Point-in-time note: verify file/line claims against current code before relying
> on them. Prefer describing *where* things live over brittle line numbers.

---

## Products in this repo

One codebase, multiple product lines (scoped by host + `Organization.productLine`):

- **PicDrift Studio** — AI content generation studio (the "studio" side).
- **Rotation3D** — managed 360° product spin viewer.
- **Drift / drift.li** — interactive before/after "drift" paths for ad campaigns.
  A drift = real footage turned into a path you scrub with a finger, with headlines,
  captions, and CTAs. Runs the SAME player engine as Rotation3D against its own data
  (`/api/drift/*`). **Current active focus.**

## Stack & layout

- **Frontend**: `frontend/` — React 19 + Vite + TypeScript. Build `tsc -b && vite build`.
- **Backend**: `backend/` — Node + Express + Prisma + PostgreSQL. Build `prisma generate && tsc`.
  Auth via **Supabase** (frontend authenticates; backend validates the JWT).
- **DB**: PostgreSQL, **local on the VPS** (single box).
- **Storage**: managed media (Cloudflare R2) via `backend/src/utils/managedStorage.ts`,
  namespaced (`drift/…`).
- **Media processing**: ffmpeg in-process on the VPS (frame extraction). This is the
  scaling ceiling (uncapped in-process work).
- **Infra**: `cloudflare/` (gitignored — use `git add -f`) holds the OG worker + setup docs.

## Deploy flow (important)

- **Deploys are MANUAL.** Push to GitHub **`main`**, then the user runs the deploy commands
  in their own SSH session (see "VPS operations" below). The GitHub Action
  (`.github/workflows/deploy.yml`) exists but always aborts on its dirty-tree guard
  (untracked ops files live in the VPS repo — verified 2026-09-08: 80/80 runs failed), so
  treat it as a no-op; never wait for a green run. Frontend is built + served as static by
  nginx (so `frontend/public/*` is at the domain root).
- **Schema changes**: there are **no migration files**, so schema changes reach the DB only
  via a **manual `npx prisma db push`** on the VPS — run it right after `git pull` and
  BEFORE `npm run build`/restart (additive columns are invisible to the old build, so the DB
  is ready before the new code starts). Always hand the user that ordering.
- **Adding a backend dependency**: deploy uses `npm ci` (exact lockfile) — run `npm
  install <pkg>` locally so `package.json` + `package-lock.json` both update, or `npm
  ci` fails.
- **Git push is SLOW here and often times out** → run `git push` with
  `run_in_background: true`, then verify with `git fetch` + `git rev-parse --short
  origin/main`. Don't trust an un-verified push.
- VPS IP: `72.61.0.117`. App path: `/var/www/myapp` (backend at `/var/www/myapp/backend`).
- Restart + read logs: `pm2 restart my-backend --update-env`, `pm2 logs my-backend --lines N --nostream`.

## VPS operations (commands to GUIDE the user — the agent cannot SSH)

Server: `/var/www/myapp` on the VPS (IP `72.61.0.117`; shell prompt `root@srv1115586`).
Backend `/var/www/myapp/backend`, frontend `/var/www/myapp/frontend`, pm2 process
**`my-backend`**. The user runs these in their own SSH session; the agent only provides them.

**nginx** (`/etc/nginx/sites-available/myapp`, symlinked in sites-enabled; upstream `myapp_backend`): one "Main app"
server block serves picdrift.studio / visualfx.studio / byok.link / picdrift.app / visualfx.app / rotation3d.com from
`frontend/dist` (+ `/api/` proxy, `snippets/spa-cache.conf`). **drift.li + www.drift.li have their OWN block at the end
of the file** (2026-09-15, link previews): pages → `@drift_page` proxy to `/__drift/html$request_uri` (falls back to the
static index.html on 5xx), `/og/` `/robots.txt` `/sitemap.xml` → `/__drift/*`, plus the same `/api/` proxy. A change
meant for every domain must go in both blocks. Backup from before that change: `myapp.bak-previews`. Always
`sudo nginx -t` before `sudo systemctl reload nginx`.

**Standard deploy (manual, after every push to `main`)** — give the user only the parts that
changed (skip `npm ci` when no dependency changed; skip the frontend block when only the
backend changed):
```bash
cd /var/www/myapp && git pull --ff-only origin main
cd backend && npm ci --no-audit --no-fund && npm run build && pm2 restart my-backend --update-env
cd ../frontend && npm ci --no-audit --no-fund && npm run build
```
Keep the VPS tracking `origin/main` (never hand-edit tracked files there, or the ff-only pull
fails). The Action in `.github/workflows/deploy.yml` is NOT the deploy path: it aborts every
run because untracked ops files (`.env` backups, CSV exports, ad-hoc scripts) sit in the VPS
tree. Optional cleanup: move them to `/var/www/ops-scratch/` and/or relax the guard to
`git status --porcelain --untracked-files=no`.

**Deploy with a SCHEMA change** (new/changed Prisma model) — same as above plus `db push`,
in THIS order: pull → `db push` → build → restart. The old build keeps running while the DB
gains the additive tables/columns (it ignores them), so there is no window where queries
fail. Never restart before the push: every Organization query (studio included) errors until
the columns exist.
```bash
cd /var/www/myapp && git pull --ff-only origin main
cd backend && npx prisma db push --skip-generate      # additive → applies; destructive → refuses (stop and review)
npm ci --no-audit --no-fund && npm run build && pm2 restart my-backend --update-env
```

**Manual deploy** (only if the Action fails / to force):
```bash
cd /var/www/myapp && git pull --ff-only origin main
cd backend && npm ci --no-audit --no-fund && npm run build && pm2 restart my-backend --update-env
cd ../frontend && npm ci --no-audit --no-fund && npm run build
```

**Everyday commands:**
```bash
pm2 restart my-backend --update-env             # restart backend, reload env
pm2 logs my-backend --lines 100 --nostream      # recent logs (grep-able)
pm2 status                                       # process state
nano /var/www/myapp/backend/.env                 # edit env → then restart --update-env
```
Env changes need `--update-env`. Read a boot check with e.g. `pm2 logs my-backend --lines 80
--nostream | grep -iE '\[mail\]|Environment Check'`.

## Conventions

- **No central env module** — modules read `process.env.*` directly into module consts
  with fallbacks; expose an `xxxConfigured()` guard (see `services/cloudflareDomains.ts`,
  `services/mail.ts`). `dotenv.config()` runs first in `backend/src/index.ts`.
- **Services** (`backend/src/services/`): named-export functions + a config guard, or an
  exported object literal (`GeminiService`), or a static class (`AuthService`). Match the
  nearest neighbor.
- **Logging**: plain `console.log/warn/error`, namespaced `[ns]` (e.g. `[drift]`, `[mail]`).
- **Prisma**: `import { prisma } from "../services/database"`.
- **Drift admin UI**: reuse `driftUiTheme.tsx` + scoped `.d-*` classes (light/dark tokens). The whole
  superadmin **drift.li tab** (`DriftAdminPanel`, `DriftMailSettings`, the embedded `DriftBrandDashboard`)
  is on it since 2026-09-08 — root `drift-ui d-embed`, one `ThemeToggle` (hooks sync via a window
  event). Design brief: studio-clean, **no gradients**, flat light mode; every button row is a wrapping
  `d-actions`, lists use `d-split` master–detail (detail-only on phones with `d-mobile-back`).
- **Superadmin panel shell** (2026-09-14): `SuperAdminDashboard` is a `drift-ui d-page` shell from
  `pages/superAdminShell.ts` (sticky top bar, grouped tabs Studio / Settings / Products, the ONE theme
  toggle). Every tab + dialog is on `.d-*` / `.sa-*` (all migrated 2026-09-14, visual-only — handlers, API
  calls and permissions untouched; dialogs use `.sa-overlay` + `.sa-dialog`). A NEW tab not yet restyled:
  leave its id out of `MIGRATED` and it renders inside `.sa-legacy` (readable in light mode).
  `lib/adminUi.ts` is shared with the studio `TenantDashboard` — don't restyle it for this.
- **Commit attribution** (this account): end commits with the `Co-Authored-By:` line for the
  model doing the work (e.g. `Claude Opus 5 <noreply@anthropic.com>`) + the `Claude-Session:` line.
  Only commit/push when asked; branch off `main` if the user hasn't said to push to it.

## The drift player (frontend)

- `frontend/src/rotation3d/SpinViewer.tsx` — the canvas drift/spin player. A big RAF
  `tick()/draw()` loop; chrome (helper hand+cue, CTAs, headline, powered badge, legal) is
  absolutely-positioned; the drag helper is JS-anchored per frame to the frame rect.
  Frames preload progressively (coarse ring → full). `driftMode` toggles drift behavior.
- `Rotation3DPlayer.tsx` — the public player route (`/p/:id`, `/embed/:id`,
  `/:brand/:slug`); on drift.li it runs in drift mode against `/api/drift/*`. Keeps ONE
  SpinViewer mounted across drift→drift swaps (instant + fullscreen-preserving); prefetches
  + warms the next drift's frames (`driftNav.ts`); intercepts same-origin drift CTAs into
  in-app SPA navigation.
- `DriftLanding.tsx` — the drift.li landing (gallery / hero takeover `HeroLanding`).
- Drifts connect via **CTA button links** to other drift URLs (same-origin → SPA swap).
- **Performance rules (2026-09-14)** — keep these when touching the player or routes:
  - Routes are lazy chunks (`App.tsx` via `lib/lazyRoute.ts`, which reloads once if a chunk vanished after
    a deploy); shared loaders live in `routeChunks.ts` and `TourShell` preloads the player chunk on idle.
    Vendor chunks (`vendor-react`, `vendor-supabase`) are set in `vite.config.ts`. Don't add static
    imports of route pages elsewhere — it pulls them back into the entry.
  - Phones play `manifest.framesMobile` (1080px). Build every player manifest with
    `driftNav.combinedFrameSets()` so the mobile set is never dropped (it was: phones downloaded and
    decoded 180 × 2048px frames per drift → stutter).
  - `driftNav` warms the next drift's WHOLE frame set (6 at a time, the device's set, coarse-only on
    data-saver/2G) once the drift on screen has every frame: SpinViewer holds `holdForegroundLoad()` while
    it loads (25s safety release). Tour drifts reveal only at 100% (20s fallback); brand drifts keep the
    36-frame coarse reveal. Pages prefetch a drift link with
    `prefetchDriftPath` (pathway Start Tour + strips). The drift→drift crossfade copies the canvas to a
    second canvas — never `toDataURL()` (a main-thread PNG encode per swap).
  - Tour thumbnails use the mobile frame. New R2 frame / cover / logo / thumbnail uploads send
    `Cache-Control: public, max-age=31536000, immutable` (keys are random UUIDs) via the optional
    `cacheControl` of `uploadManagedBuffer` — the studio's uploads are unchanged.

## Data model (drift) — high level

- `Organization` (a brand; `productLine="DRIFT"`) has `users`, `driftProducts`,
  `driftForms`, `driftLeads`, `driftDomains`; drift landing fields (`termsUrl`,
  `privacyUrl`, `landingHeroProductId`, `metaPixelId`). **No email field** — reach a
  brand via its ADMIN `User.email`.
- `User`: `email`, `name`, `role` (USER/ADMIN/SUPERADMIN), `view`, `organizationId`,
  `authUserId` (Supabase), `maxProjects`, `isDemo`.
- `DriftProduct`: manifest (`frames[]`, `frameCount`, `defaultFrame`), optional
  `secondManifest` (2-clip loop), `ctaPrimary`/`ctaSecondary` (JSON, drift links),
  captions, `status`, `slug`, org association, per-product toggles (`hideTitle`,
  `mobileZoom`, `loopEnabled`, …).
- `DriftForm` (dynamic lead form; `definition` JSON, `webhookUrl`) → `DriftLead`
  (`data` JSON = viewer's answers, `source`).
- `DriftFlow` (creator suite: tour/view/memory/path; `kind`, `slug` unique per kind →
  `/{kind}/{slug}`, `status`, `endCta`, `settings`, `isDemo`) → ordered `DriftFlowStep`
  (`stepType` DRIFT|FORM|PAGE, `order`, `productId` unique, `formId`, `customCta`). Step
  order drives the auto "Next" CTA on each step's product. Quotas on `Organization`:
  `maxFlows`/`maxStepsPerFlow`/`maxClipSeconds` (free tier 1/3/5). Shipped 2026-09-08
  (TOUR_PLAN.md §2).

## drift.li creator suite (Tour) — CODE DONE 2026-09-08 (P1–P8), awaiting deploy + ops

Self-serve creators build **tours** (ordered `DriftFlow` steps of drifts). A creator = personal
Organization (`productLine "TOUR"`, its own line like ROTATION3D vs DRIFT) + ADMIN User
(`view "TOUR"`). Status/details: TOUR_PLAN.md (§2–§8 "as shipped", §11 log, §13 ops).

- **Backend**: `services/driftFlows.ts` (`relinkFlow()` = single source of truth for every step's
  auto "Next" CTA → relative `/p/{id}`, quotas, serializers, link validation), `routes/driftFlows.ts`
  (`/api/drift/my/flows/*` CRUD + clip upload/replace + reorder + publish; `GET
  /api/drift/public/flows/:kind/:slug`), `services/driftCreator.ts` + `routes/driftCreator.ts`
  (`POST /api/drift/creator/signup` — idempotent provisioning; the auth middleware allow-lists
  `/api/drift/creator/*` before workspace selection), `pipeline.probeClipInfo` (duration + fps),
  creator email templates at the end of `services/mail.ts`.
- **Frontend** `src/tour/`: `TourAuth` (/tour/start), `AuthCallback` (/auth/callback), `CreatorRoute`
  (guard), `TourIndex` (/tour = landing always; `TourDashboard` /tour/dashboard → your page; legacy /tour/:id/edit → pathway), `CaptureGuide` (builder + /tour/capture-guide), `TourPage` (/tour/:page —
  admin + public view), `TourPathway` (/tour/:page/:tour — public strips; admins get `TourBuilder`),
  readable drift links /tour/:page/:tour/:drift in `Rotation3DPlayer`; `usePageAdmin` (who's admin;
  superadmin "Manage" via `X-Drift-Org`), `tourUi`/`tourPageStyles`/`tourPageParts`/`tourSession`/`types`;
  the landing's creator section is `.dl-suite` in `DriftLanding.tsx`. **Tour v2 (2026-09-14): plan, decisions
  and log in TOUR_V2_PLAN.md** — read it before touching tours.
  Routes sit before the `/:brandSlug` catch-alls; `driftNav.RESERVED_SEG` + backend `RESERVED_SLUGS`
  reserve tour/view/memory/path.
- **Tour context in the player** (2026-09-08): `GET /api/drift/public/products/:id` adds `flow`
  (`flowNavPayload` in `routes/drift.ts`: the flow's viewable stops in order + this drift's `index`;
  null for brand drifts / other routes). `Rotation3DPlayer` passes it as `flowNav` → `SpinViewer`
  renders the progress dots top-middle (`.r3d-stops`), the page · tour · drift title lines, the
  hand-icon helper cue and "Tour Powered by", and slides drift→drift along the OUTGOING drift's
  direction (`prevDirRef`). (The end-of-tour card was removed in Tour v2 — tours loop.) Everything is gated on `flowNav`, so brand drifts are
  untouched. Builder: `RouteInk` (TourBuilder) draws the rail as an inked route from the items'
  pin positions (`:scope > .t-route-item`, pin centre = offsetTop + 33); `ShareSheet.tsx` is the
  publish moment (link + copy + QR via `qrcode-generator` + system share), also behind "Share".
- **Rules**: creator button links = drift.li / picdrift.com / same-site paths only (server-validated,
  env `DRIFT_CREATOR_LINK_HOSTS`); a flow-step drift's `ctaPrimary` is flow-managed (the generic
  product patch drops it); product/form deletes cascade the step → the product delete route relinks.
  Supabase stays on the default (implicit) auth flow — do NOT switch to PKCE (breaks reset/confirm
  links opened in another browser).
- **Ops owed**: Supabase dashboard (Google provider, redirect allow-list incl. `/auth/callback`,
  Confirm email ON, custom SMTP = web@drift.li — TOUR_PLAN.md §13); the demo tour is now picked in
  Admin → drift.li → Tour → Demo tour.

## drift.li Tour v2 (2026-09-14) — code shipped P1–P6, deploy + ops owed (TOUR_V2_PLAN.md §5)

- **URLs**: `/tour` (the landing — ALWAYS, even signed in; creators get Dashboard in the header) ·
  `/tour/dashboard` (→ the creator's page; post-login target) · `/tour/capture-guide` (Drift Capture Guide,
  also in the builder) · `/tour/{page}` (a TOUR org = a page,
  admin + public view) · `/tour/{page}/{tour}` (the tour's main link = pathway menu; admins get the
  builder) · `/tour/{page}/{tour}/{drift}` (player; drift segment derived from the name, unique per tour —
  `stepDriftSlugs`) · `/tour/invite/{token}` · `drift.li/{page}/tour` → `/tour/{page}`.
- **Buttons**: every tour drift has Home (→ pathway) + the next drift's name, last → #1 (`relinkFlow`,
  only READY drifts, writes on change, `relinkAllFlows()` at boot, re-run when a drift turns READY).
- **Pay per drift** (`services/driftBilling.ts`): free while `Organization.freeDrifts` last, then
  `AWAITING_PAYMENT` (clip stored, not processed) → Stripe Checkout (one per tour) → webhook
  `/api/drift/billing/webhook` (raw body, mounted BEFORE express.json; events `checkout.session.completed` / `.async_payment_succeeded` /
  `.async_payment_failed` → order FAILED, drifts due again / `.expired`) or return-page confirm → PAID,
  `hostingExpiresAt` +1y (not enforced yet) → processed. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  optional `TOUR_DRIFT_PRICE_CENTS`/`TOUR_CURRENCY`. Superadmin = COMP, no clip limit.
- **Accounts** (`services/driftTourAccounts.ts`): `tourAccountType` GENERAL | PRO; Pro "Client Pages"
  (org with `managedByOrgId` + an Admin profile for the Pro); page invites (one-time links with a role).
- **Page roles** (2026-09-15): a member = a User profile in the page's org; `User.tourRole` ADMIN | EDITOR |
  VIEWER (null = ADMIN for pre-roles rows; `User.role` mirrors it — ADMIN, else USER). Enforced server-side:
  `driftFlows.requirePage(req, res, "VIEW" | "EDIT" | "ADMIN")` on every creator route (Viewers read; Editors
  build, publish, check out; Admins also page settings, People, client pages, deleting tours) and drift.ts
  `requireOrg` keeps the brand tools read-only for Editors/Viewers. The session user carries `tourRole`
  (`AuthService.toSessionUser`) — a new creator route must use `requirePage`, never bare `requireOrg`. People:
  `GET /api/drift/my/page/people`, `PATCH|DELETE /api/drift/my/page/members/:id` (last admin protected; deleting
  yourself = Leave page; when nobody from the managing Pro page is left, `managedByOrgId` clears).
  `GET /api/drift/creator/pages` = the login's pages (`home` = its own page) for the header `PageSwitcher` and
  `/tour/dashboard`. UI: `PagePeople` in page settings, a view-only `TourBuilder` for Viewers.
- **Invite sign-up** (2026-09-15): `/tour/start?next=/tour/invite/…` is an account only — no page type, no page of
  their own (TourAuth + AuthCallback skip `ensureCreatorProfile`); accepting converts the bare auto-created
  profile in place (`driftCreator.untouchedProfile`). Pages are `own` unless joined by invite (accepted invite
  `acceptedByUserId`) or a Pro's client page; Dashboard = first own page. Someone with no own page gets
  "+ Create your own page" (PageSwitcher → `/tour/start?create=1` → signup API `ownPage: true`).
- **Tour pins** (2026-09-15): `DriftPin` (placed on one `frame` at x/y, optional fine-tune `keys` [{f,x,y}], title,
  note) + `DriftProduct.pinTrack` (how the footage moves: cumulative shift per frame along the drift axis,
  `services/driftPins.ts` — ~30 sampled frames matched on grayscale copies, a confidence check refuses cuts /
  featureless frames, keyed to the clip's frames so a replaced clip re-measures). One placement rule shared by
  player + editor: `frontend/src/rotation3d/pins.ts` `pinPlacement()`. API: `GET|PUT
  /api/drift/my/flows/:id/steps/:stepId/pins` (VIEW / EDIT); the public drift payload carries `pins` + `pinTrack`.
  Player: `.r3d-pins` buttons positioned in `draw()` (excluded from drag via `isControl`). Builder: "Pins" on a
  ready drift → `tour/PinEditor.tsx`. Brand caption/thumbnail writes also refuse tour Editors/Viewers
  (`tourRoleReadOnly` in drift.ts).
- **Enquiries + personal links** (2026-09-15): a page's enquiry button (`tourSettings.enquiries` {enabled, label,
  askPhone}; `services/tourEnquirySettings.ts`, pure) shows on the page, the pathway and in the player (chip under the
  tour titles → `DriftFormOverlay` with `enquiry`). `POST /api/drift/public/pages/:page/enquiries` (honeypot + per-IP
  limit) → a `DriftLead` (formId null, `source.kind` "TOUR_ENQUIRY", tour / drift / link) + email `tour.enquiry.new` to
  the page's Admins + Editors (reply-to = visitor); inbox `PageEnquiries` (`GET|DELETE /api/drift/my/page/enquiries`).
  Personal links: `DriftShareLink` per tour (`…?to={token}`, `services/driftEnquiries.ts`); `rotation3d/personalLink.ts`
  notes the token for the visit (open counted once, param dropped from the address) and the player tags VIEW events
  `meta.link`; the share sheet's `PersonalLinks` shows opens / drifts seen / enquiries.
- **Print kit + unbranded link** (2026-09-15, no schema change): share sheet (Editors + Admins, published tours) →
  "Unbranded link" = `/u/{code}` for listing sites (MLS) — `POST /api/drift/my/flows/:id/unbranded` (EDIT) makes a
  10-char code once, kept in `DriftFlow.settings.unbrandedCode` (`serializeFlow` → `unbrandedPath`); public
  `GET /api/drift/public/unbranded/:code` (+ `/drifts/:index`) in `routes/drift.ts` strip page name / logo / pixel /
  forms / enquiry and rewrite every tour link to `/u/{code}?d={i}`; player `rotation3d/UnbrandedTour.tsx` (menu +
  one mounted SpinViewer). "Print kit" = `tour/PrintKit.tsx` (picker + scaled preview) over `tour/printSheets.tsx`
  (flyer / window sign / 8 QR cards in mm, A4 or Letter, QR → tour or unbranded link). Printing renders a copy into a
  `.pk-portal` on `<body>`; print CSS hides everything else and sets `@page` — verified one page per sheet at the right
  size via headless Chrome. `u` is reserved in both slug lists.
- **Insights + owner report** (2026-09-15, no schema change): the player records attention per tour drift view —
  `rotation3d/attentionMeter.ts` (pure: time while active, time on 20 equal parts of the footage once the visitor
  drags, parts reached, drag-backs, pin taps), wired into `SpinViewer` by the `attention` prop (`rotation3d/attention.ts`:
  a key per drift shown from `Rotation3DPlayer` / `UnbrandedTour`, never the builder's `/embed` preview; a random per-tab
  visit id, no cookies; a text/plain beacon on leave / hide) → `POST /api/drift/public/attention` → `DriftEvent` type
  "DWELL" (`services/driftInsights.ts`: validated, per-IP limited, tour drifts only). `GET /api/drift/my/flows/:id/insights`
  (VIEW, ?days=7|30|90) rolls it up (`rollUpInsights`, pure); builder "Insights" → `tour/TourInsights.tsx` over
  `tour/InsightsView.tsx`. Owner report: `POST|DELETE /api/drift/my/flows/:id/report` (EDIT) keeps a code in
  `DriftFlow.settings.reportCode` (`serializeFlow` → `reportPath`; never in `serializePublicFlow`); public
  `GET /api/drift/public/reports/:code` (counts only — no names, messages or personal links) → `/report/{code}`
  (`tour/OwnerReport.tsx`, noindex). The generic player events endpoint now drops meta over 1KB and rate-limits per IP
  (`services/driftVisitors.ts`). `report` is reserved in both slug lists.
- **Clip clean-up** (2026-09-15, no schema change): tour clips (step upload, replace, paid conversion — `processClip`
  `cleanup: true`; brand drifts and Rotation3D unchanged; env `TOUR_CLIP_CLEANUP=off` turns it off) extract through
  `services/driftCleanup.ts` `extractFramesForCleanup` (the PNG frames + a 256×256 gray copy of each in ONE ffmpeg pass).
  `planCleanup` (async, yields every 20ms) detects the pan direction, trims still ends (up to ~2% of the pan into the
  motion, 2 still frames kept) and steadies translational shake (smoothed path → a per-frame crop, margin 1–6%); anything
  unclear leaves the clip as uploaded (zooms, diagonals, noise, screen recordings). `buildSpinFromVideo({ cleanup })`
  applies it (`steadyCropFor`) and stores the report in `manifest.cleanup`; `processClip` sets `driftDirection` from it;
  the builder's step card shows "Auto clean-up: …" (`serializeStepProduct` → `cleanup`).
- **Reel** (2026-09-15, no schema change): share sheet → "Reel" (`tour/ReelSheet.tsx`: Portrait | Landscape | Framed
  tabs, opening on the full-screen layout that matches most ready drifts' thumbnails; make / watch / download / share the
  file) → `GET|POST /api/drift/my/flows/:id/reel?layout=full|landscape|framed` (VIEW / EDIT) + `GET …/reel/file?layout=`
  (download stream). `services/driftReel.ts` `renderReel` = one ffmpeg graph at 30fps — intro card → each ready drift
  (≤8, ~3.4s + holds) with a name + progress overlay (sharp SVG; DejaVu Sans on the VPS) → end card (link + QR),
  slideleft xfades, no audio. Sizes in `REEL_SIZE`; the cards have a portrait and a widescreen arrangement. Layout `full`
  (default, 1080×1920) and `landscape` (1920×1080, 2026-09-16): the full-resolution frames cut to a window at the reel's
  aspect that glides the way the camera pans (`fillWindow(…, aspect)`, cut in sharp); `framed` (1080×1920): the mobile
  frames over a blurred copy. Runs on the processing queue, uploads to R2; state per layout in
  `DriftFlow.settings.reelFull` / `reelLandscape` / `reel` (framed kept the first key) via one atomic `jsonb_set` (a
  content hash → `stale` once the tour changes; the full and framed hashes are unchanged, so existing reels stay current).
- **Link previews + search** (2026-09-16, no schema change; runbook docs/DRIFT_SOCIAL_SETUP.md): drift.li pages get their
  `<head>` from the app — nginx sends non-file requests to `/__drift/html<path>`, `/og/*` → `/__drift/og/*`,
  `/robots.txt` + `/sitemap.xml` → `/__drift/*` (`routes/driftShare.ts`). `services/driftShare.ts` `resolveShare(path,
  lookup)` → title / description / canonical / noindex / JSON-LD / card per page (site pages with the client's copy,
  tour page, tour, drift, `/u/` = no page name + noindex, `/report/` = generic + noindex, brand drifts; unknown →
  home card, noindex) and `renderSharePage` swaps the block between `<!-- share:start … -->` and `<!-- share:end -->`
  in frontend/index.html (other domains keep that static PicDrift block — put new head tags outside the markers).
  Cards: `driftShareCards.ts` (1200×630 JPEG ≤290 KB for WhatsApp), text drawn as paths from Bai Jamjuree in
  backend/assets/fonts via opentype.js (`driftTypeset.ts`; own typings in src/types/opentype.d.ts — @types/opentype.js
  pulls the DOM lib and breaks Node's Blob typing). Card URLs carry a content version (`CARD_VERSION` refreshes all).
  drift.li icons: frontend/public/drift/* + drift.webmanifest. Any lookup failure serves the plain index.html and a
  drift.li card; nginx falls back to the static file. The Cloudflare OG worker is no longer needed.
- **Superadmin**: `X-Drift-Org` lets a superadmin act on any TOUR page ("Manage this page", `usePageAdmin`);
  back office = Admin → drift.li → Tour (`routes/driftTourAdmin.ts`, `DriftTourAdmin.tsx`).
- **drift.li home** = `rotation3d/DriftHome.tsx` (2026-09-14 redesign per the client's `land.png`: the hero's
  right side is a NON-interactive "live view" — drift.li's DEMO TOUR standing on the `PerspectiveGrid` floor,
  no box: stops as free-standing 3D cards, the centre card forward "out of the screen" (floats over its
  shadow, steps through the first stops), orbit at its base, horizon glow; glow in dark theme only; "Take a Tour" starts the
  tour — never label the visual as draggable; no demo set → empty panels); headline on two lines on desktop; four product cards). The
  client's copy and CTAs stay exactly as written (Tour: Try it Free + Learn More; the rest: Join Wait List →
  `DriftWaitlist`) — restyle freely, don't reword. It no longer loads the player. Brand custom
  domains keep the full-screen `HeroLanding` (SpinViewer loaded lazily there). The **/tour landing**
  (`tour/TourLanding.tsx`, 2026-09-15) shares the look: its route animation (`PathArtH`) rides the same
  `rotation3d/PerspectiveGrid` floor under a horizon glow, spaced kickers, pill CTAs, glass sections in dark
  (flat in light) — copy verbatim. The shared TourShell header/background is not restyled yet.
- **drift.li product landings** (2026-09-15): `/view`, `/memory`, `/path` → `rotation3d/Drift{View,Memory,Path}Landing.tsx`,
  all on `rotation3d/driftSite.tsx` (shared with DriftHome: header/footer shell, `WaitlistDialog`, `DriftStage` =
  horizon + PerspectiveGrid, `ProductHero` split/flip/stack, Steps, Card, ClosingCall, ICONS). Coming soon →
  Join Wait List (source view/memory/path) + Try Drift Tour. Distinct but related: View (cyan, 180° arc with a
  sweeping sightline), Memory (`ds-violet`, upright moment frames with a Private badge), Path (`ds-emerald`,
  winding route through Drifts/Images/Video/Information/Links). Hero copy = the client's home-card lines
  verbatim; supporting lines are new and short. No tilted cards anywhere (the user dislikes tilt).

## Transactional email — DONE (2026-09-06)

- `backend/src/services/mail.ts` — nodemailer SMTP, env-driven, defaults to
  `mail.privateemail.com`. `sendMail()` never throws (no-op + log when unconfigured);
  `mailConfigured()`, `verifyMail()` (boot check), `renderEmail()` (branded shell),
  `orgNotificationRecipients(orgId)`. Mailbox: `web@drift.li`.
- Wired: new drift-form lead → brand admins; new brand admin → sign-in + temp password.
- Send from new code: `sendMail({ to, subject, html: renderEmail({...}) })`.
- **Editable templates (2026-09-08):** every platform email is a template key in
  `services/mailTemplates.ts` (code defaults + `{{vars}}`); a superadmin rewrites copy,
  recipients (default audience / custom list / both, BCC) or switches it off in **Admin → Drift
  → Emails** (`rotation3d/DriftMailSettings.tsx`, routes `routes/driftMail.ts`: list / save /
  reset / preview / test). Overrides live in `MailTemplate` (scope GLOBAL; org scope reserved).
  Senders call `sendTemplated(key, { vars, defaultTo, rows?, replyTo? })`; reads fail soft when
  the table isn't pushed yet. New email = add a def to `MAIL_TEMPLATES` + a sender in mail.ts.
- **Ops owed by user**: VPS env `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`
  (`pm2 restart --update-env`); drift.li DNS (Namecheap): MX + SPF (via Mail Settings →
  Private Email), DKIM (`default._domainkey`, value from client), DMARC (`_dmarc`).
  Runbook: `backend/EMAIL_SETUP.md`. drift.li DNS is on **Namecheap** (registrar-servers
  NS), not Cloudflare.

## Custom domains + share previews — code shipped, ops pending

- Cloudflare-for-SaaS custom hostnames (`services/cloudflareDomains.ts`, drift domain
  routes, `DriftDomain` model). OG share-card worker `cloudflare/drift-og-worker.js` +
  `frontend/public/og-drift.png`. **Requires drift.li on Cloudflare nameservers** (not
  yet — still on Namecheap). Full runbook: `cloudflare/SETUP.md`. User still owes the CF
  env vars + Cloudflare-for-SaaS + worker deploy + `prisma db push`.

## Gotchas

- `prisma db push` is manual on the VPS (no migrations). New Prisma fields break queries
  until pushed → run it right after `git pull`, BEFORE build/restart (see VPS operations).
- Git pushes time out → background + verify.
- **Legal pages are per host**: on drift.li (and brand custom domains) `/terms` and `/privacy`
  render `rotation3d/DriftLegal.tsx` — the published Drift Link agreement (Visionlight
  Productions Inc., verbatim from picdrift.com/terms + /privacy, contact picdrift@picdrift.com);
  everywhere else `pages/Terms.tsx` / `Privacy.tsx` keep the studio agreement. drift.li surfaces
  link to `/terms` `/privacy` (landing footer, hero-takeover + player defaults, /tour/start fine
  print). A brand org's `termsUrl`/`privacyUrl` override those defaults — the superadmin brand
  "Drift Link Interactive" had them pointed at picdrift.com; set them to drift.li or clear them.
- `cloudflare/` is gitignored (`git add -f`).
- Sensitive files: a prior `ss1.jpeg` held Google AI Studio API keys — never echo such
  secrets; keep private. Passwords/keys live only in server env, never in code/chat.

---

## Roadmap — drift.li self-serve creator suite

Four new client-facing locations on drift.li, each a variant of the same idea (build
interactive drift paths from phone clips). **Priority #1: `/tour`.** Others: `/view`,
`/memory`, `/path` (variants, defined later).

### drift.li/tour (P1–P8 code shipped 2026-09-08 — see TOUR_PLAN.md; next: deploy, Supabase ops, demo seed, Stripe)

A self-serve, mobile-first builder where a user creates an **interactive tour** =
multiple drifts connected by buttons into a guided path (e.g. a real-estate home tour),
using the existing extraction engine but with a simpler, aesthetic client UI.

Spec captured from the user (2026-09-08):
- **Landing**: a new section on the drift.li landing introducing tour/view/memory/path
  (studio/SaaS vibe, mobile-first). Two CTAs: **View Demo** | **Start Your Free Trial** —
  both require signup.
- **Auth**: Google signup + manual signup with **email verification** (via web@drift.li).
  Professional at every step.
- **Creator profile**: on signup the backend auto-creates a personal **profile/home**
  (distinct UX from the brand dashboard — "a canvas of creativity"). Likely backed by the
  existing Organization/User infra with a new account type (TBD after recon).
- **View Demo flow**: sign up → land inside a **demo tour** (seeded by the client:
  connected drifts with periodic "Start free trial" CTAs) → ends at their profile.
- **Create a Tour** (free tier = 1 tour): "Create a Tour" → 3 ordered clip slots (each
  clip ≤ 5s) → per slot: upload clip → engine extracts ~180 frames → title, headline,
  button links (**drift + picdrift.com links only, no external**), bg color (keep simple;
  add fields only if needed). Each ready slot becomes a step on a visual **map/layout**
  on the side. Building slot 2 links it to slot 1, etc.
- **Reordering**: steps/drifts are reorderable; the system must **auto-relink** the
  connecting buttons so order changes never break the path.
- **Gating**: creating a 2nd tour (or extra clips) → upgrade prompt. **Stripe** packages
  added later.
- **Selling**: the engine + storage. Users make many tours, can connect/order tours.
- **Analytics** (later): per-step tracking (where users drop, step click counts).
- **Emails**: notify the client on signup / tour creation; user nurturing sequences.
- **Mobile-first** throughout; ALSO do a mobile optimization pass on the existing admin
  panel (tables cut off, clipped user lists, non-responsive tabs).

Open decisions (to confirm with user): monetization model (free-tier vs trial), auth
email delivery path (Supabase custom SMTP vs custom flow), the exact view/memory/path
variants.
