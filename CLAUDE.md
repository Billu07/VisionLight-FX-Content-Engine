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
- **Media processing**: ffmpeg in-process on the VPS (frame extraction), gated by
  `services/rotation3d/processingQueue.ts`. This is the scaling ceiling. **Measured 2026-09-26**:
  one 180-frame drift costs 16–19 CPU-seconds (only ~2.5s of it ffmpeg; the rest is sharp
  encoding 360 WebPs) and 65–95 MB at its peak, and both ffmpeg and sharp already run ~3×
  parallel while the uploads run 8-wide — so one conversion keeps ~3 cores busy and never idles.
  A second worker therefore buys **fairness, not throughput** (the second uploader stops waiting
  out the first one's whole drift), which is worth it from 4 cores but not on 2. So the gate
  **follows the box**: one conversion per 2 cores, capped at 2 → 2 vCPU gives 1, 4 vCPU gives 2.
  `ROT3D_PROCESS_CONCURRENCY` overrides it, and the queue says at boot what it chose and warns
  when the number is too high for the cores (`[r3d-queue]`). Admin → drift.li → Tour shows the
  queue ("N Converting · M Waiting", polled every 10s) so congestion is visible.
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
  - **Every device** plays `manifest.framesMobile` (1080px) when the product has one — desktop too
    (2026-09-22): a drift is drawn a few hundred px wide up to about a laptop's width, so the 2048px set
    mostly bought bytes and decode time (180 × 2048px ≈ tens of MB per drift → a tour opened slowly, dragged
    heavily, and the next drift was never warm in time). `driftNav.playerFrames()` and SpinViewer pick the
    same set; build every player manifest with `driftNav.combinedFrameSets()` so the light set is never
    dropped. Products from before the light set still use the full one.
  - **The loader is only skipped when the frames are actually in** (2026-09-22): `driftNav` tracks every
    frame URL it has warmed or a player has decoded (`markFramesIn` / `framesReady`); `Rotation3DPlayer`'s
    `instant` and SpinViewer's swap path both check it. Before that, a cached *payload* (prefetch) and every
    drift→drift swap hid the loader while the frames were still downloading — you landed on an unloaded
    drift and dragging stuttered with no sign of loading. Tour drifts still reveal at 100% (cap now 8s).
  - **Portrait footage keeps its chrome clear** (2026-09-22): the frame is fitted into the band between the
    top bar and the bottom stack (`bandTop` / `bandBottom`, 162px on desktop). A tall clip is height-bound,
    so the tour desktop zoom step (`TOUR_DESKTOP_ZOOM`) only applies to wide footage — it used to cap
    portrait at 98% of the canvas, which ran the frame under the top bar and over the buttons, the hand and
    the cue. The cue is also clamped above the CTA row.
  - **Tour drifts play edge to edge** (`immersive`, 2026-09-23, client): the footage used to be drawn
    INSIDE a band (56px top bar, ~160px bottom stack), so a room sat in the middle with dead ground
    round it. **WHEN it fills** is decided by `applyImmersive()` inside the effect, not at render time,
    because it changes while mounted: a phone or touch screen (`(max-width:820px), (pointer:coarse)`)
    ALWAYS fills; a desktop page stays framed until fullscreen — that is what the ⛶ button is for
    (client's call, 2026-09-23). It re-runs on `fullscreenchange`, inside `setPseudo` (the iPhone
    fallback never fires that event) and on the media query. `canImmerse` (the component) only says
    which drifts may: `driftMode && flowNav && !hero && !landing`. The class `r3d-immersive` is toggled
    imperatively — do NOT put it back in the JSX className.
    **HOW it fills**: it never crops (2026-09-24). `FILL_MAX_MISMATCH` is 1, so it covers only when the
    screen and the footage already share a shape, and otherwise fills the axis that fits and lets the
    chrome sit on the ground beside it. At 1.35 it was throwing away up to a quarter of the room — ~18%
    of a vertical clip's height on a phone — which is what the client saw. Raise the constant if a little
    crop is ever worth a little more bleed; it is the only knob. For the same reason the landscape 2×
    zoom (`updateLandscapeZoom`, "client spec: portrait 1×, landscape 2×") is skipped while immersive:
    it was measured against the FRAMED layout and doubles up on a full-bleed fill. When that leaves ground either side
    (≥132px), `r3d-siderail` moves the Prev · Menu · Next row INTO that column, stacked, width from the
    `--r3d-side` custom property — better than lying over the footage, and the drift keeps its full
    height. Brand drifts, the hero takeover and Rotation3D keep the framed layout — do NOT widen the
    scope without re-checking them.
    **A desktop in fullscreen keeps its BAND** (`r3d-band`, 2026-09-25, client: "it doesn't have to
    go all the way… the bottom part can be our dark gradient bg for button placement… bigger than the
    default screen"). Immersive is still on — tap to hide, the fade while dragging, the scrims — but
    the GEOMETRY reverts to the framed computation against the fullscreen viewport, so the drift grows
    (measured 602px → 669px tall at 1440×900, and more on a real screen once the browser's own chrome
    is reclaimed) and keeps ground under it for the buttons (26px clear). `bandMode` is
    `immersive && !touchLike`, and everywhere the immersive branch changes geometry it defers to the
    framed one: the sizing, the centre, the progress rail, the drag helper, and no side rail (the band
    already holds the buttons). The ground's wash shows again there, hence the `:not(.r3d-band)` on
    the rule that hides it.
    **A rotated phone** (2026-09-25, client): turning the device already hands the screen to the
    player, so `r3d-auto-fs` hides the fullscreen button while that takeover is in charge — it
    appearing "instead" was the complaint, and it appears because a phone in landscape is ~844px
    wide, past the `max-width:560px` rule that hides reset+fullscreen on a drift. Rotating back is
    the way out (and clears the class). A TOUCH screen's player also drops the Terms · Privacy
    line and the credit badge — `@media (pointer: coarse), (max-width:560px)`, tour drifts only.
    Keyed to the pointer, NOT to width: a phone turned sideways is ~844px wide, so a width rule
    stopped matching exactly where the client wanted them gone (the fullscreen landscape player).
    A desktop keeps both, either way up — asserted in fs-probe so it cannot drift.
    **The chrome in full screen** (2026-09-24, client): the +/- zoom column is hidden in REAL
    fullscreen (`:fullscreen`, `:-webkit-full-screen`, `.r3d-pseudo-fs` — three separate rules, since
    one selector an old browser cannot parse would drop the whole list); wheel and pinch still zoom. The
    drag cue keeps a 26px margin off the screen edge instead of sitting flush (72px on the side the zoom
    column uses when it IS showing) — at the far end of a drift it used to land exactly on those
    buttons. A tour stop with no helper copy draws its hand inside the CUE row, and the animated
    `.r3d-drift-hand` above it: framed those are far apart, filling the screen they stack into the same
    hand twice, so `.r3d-immersive .r3d-hint-icon` hides the second one and the cue's hand takes over
    the sway. On a desktop the cue scales with the scene (the shared clamps top out near phone size).
    Chrome floats over the footage: a tap on it toggles `r3d-bare`, and an active drag rides the existing
    `r3d-grabbing`; one `:is()` rule fades both, scrims included. The progress rail rides the SCREEN's
    edge in fill mode (the frame's own edges are off screen) and is canvas-drawn, so it survives the tap.
    The drag helper hangs off `ctasRef.offsetTop` instead of the frame's bottom edge.
  - **The player follows the device; it never turns the drift itself** (2026-09-23, client: "we don't
    want to make them turn their phone. It needs to respond only IF they turn their phone"). An earlier
    pass rotated the stage a quarter turn for a landscape drift on an upright phone — that is REMOVED,
    hint and all. Upright, a 16:9 drift fills the width with ground above and below; turn the phone and
    the pre-existing landscape takeover (`updateLandscapeTakeover`, auto pseudo-fullscreen on a touch
    device) covers the screen, and turning back hands the page over again. Don't re-add a forced turn.
  - **Fullscreen is the browser's real one**: `toggleFs` calls `requestFullscreen`/`webkitRequestFullscreen`
    on the stage (verified: `document.fullscreenElement` is set), so a desktop or Android visitor gets
    true fullscreen beyond the browser, the same API a video uses. The CSS `r3d-pseudo-fs` is ONLY the
    fallback for iPhone Safari, which grants element fullscreen to `<video>` alone. drift.li pages link
    `/drift.webmanifest` (`display: standalone`), so Add to Home Screen is the chrome-less route there.
  - **The page footer's credit matches the player's** (2026-09-25): `TourShell`'s "Tour · Powered by
    Drift Live Interactive" is two accent links (`.t-foot-link`) — the kind to `/tour`, the platform
    to drift.li. The pathway carries NO "Tour" eyebrow any more: the header, the way back and the
    tour's own name already say it, and a fourth in one corner is what the client flagged.
  - **The bottom credit is two links** (2026-09-24, client): on drift.li the badge reads
    "*Tour* Powered by *Drift Live Interactive*" with BOTH names in the accent and both clickable —
    the kind word to `/tour`, the platform to its home. Two anchors cannot nest, so in drift mode the
    badge is a plain element carrying two links (`.r3d-powered-link`); every other player keeps the
    single-anchor badge, and `poweredRef` is typed `HTMLElement` for both. `isControl` already
    excludes `.r3d-powered-badge`, so a tap on it never starts a drag.
  - **The player wears drift.li's skin** (2026-09-23, client): the old indigo/purple defaults put a
    purple badge, loading ring and CTA pill on every drift.li drift, so the player looked like a
    different product from the pages around it. `.r3d-drift` now sets `--r3d-primary:#22d3ee` /
    `--r3d-secondary:#38bdf8` as LITERALS (the studio injects `--primary-brand` globally, so a
    `var(…, fallback)` never reached the fallback); a brand's own `primaryColor`/`secondaryColor`
    still wins because the stage carries them inline. The loading ring is flat `var(--r3d-primary)`
    — the client asked for the same teal as "Drift Live Interactive" under it, not a gradient.
    Buttons speak the pages' language: the action that carries you FORWARD is the accent fill
    (ink from `--r3d-accent-ink`, dark on a bright accent, white on a deep brand colour), the other
    is a quiet surface pill. On a TOUR the forward action is the next drift (`ctaSecondary`) and Home
    steps back; a brand drift keeps its own `ctaPrimary` in front. The two sets are kept disjoint with
    `:not(.r3d-tour)` so neither wins by source order, and `.r3d-light` inverts the quiet pill.
    Stage classes: `r3d-tour` (flowNav present) and `r3d-ground` (the background is still drift.li's
    `#0d1119`) — `r3d-tour.r3d-ground` also gets the pages' aurora wash and a matching loader ground.
  - **Loading ahead** (`driftNav`, reworked 2026-09-22): the drift on screen owns the network while it is
    still opening, then the next stop trickles in behind it, then warming runs at full width. SpinViewer's
    `holdForegroundLoad()` returns `{usable, release}` — `usable()` at the 36-frame coarse ring, `release()`
    at 100% / unmount (25s safety) — and `warmWidth()` maps that to 0 / `WARM_TRICKLE` 2 / `WARM_CONCURRENCY`
    6 connections. Warm images are `fetchPriority="low"`, the player's coarse ring `"high"`, so loading ahead
    can never cost the visitor a stutter. `setWarmPaused(true/false)` (SpinViewer's pointer down/up, 5s
    auto-resume) holds new background requests while a finger is on the drift. Depth: `warmFlowAhead(flow)`
    (called from `Rotation3DPlayer` beside `prefetchDriftTargets`) takes the next stop in FULL and the one
    after it COARSE, walking `flow.stops` — CTA links alone missed the loop back to #1. Data-saver/2G:
    coarse only, and nothing while a drift is still filling in. **Every drift reveals on the ring, not on the
    last frame** (2026-09-24, client: "every drift now loads when I click next"): `REVEAL_AT =
    COARSE` for tours too (3s fallback), and a swap skips the loader on the same count. Waiting
    for 100% meant a visitor who moved briskly outran the warm queue and then sat through a full
    load at each stop — measured on a 180-frame drift over a slow link, the first open went 4.7s →
    1.6s and an early Next 2.4s-with-loader → 145ms without. `driftNav.REVEAL_RING` (36) is the one
    number: SpinViewer's COARSE, the loader-skip count, AND the spread `warmFrames` fills first, so
    what is warmed is exactly what the next drift opens on. `WARM_TRICKLE` is 4. Pages prefetch a drift link with
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
  (`POST /api/drift/creator/signup` → `provisionCreator()` — idempotent provisioning; the auth middleware allow-lists
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
- **Buttons** (2026-09-23, client): every tour drift shows the SAME row — `‹ Prev · Menu · Next ›`.
  Naming the next room read as a destination rather than a step, so the name is gone. The row is
  built in `SpinViewer` from `flowNav` (`tourNav`): Menu → `flow.publicPath`, Prev → the stop before
  (on the FIRST drift, Prev is the menu), Next → the stop after, looping to #1 at the end; a
  one-drift tour shows Menu alone. Because it comes from `flow.stops`, the unbranded player
  (`/u/{code}`, whose stops the server rewrites) gets the same row for free. Clicks still go through
  `fireCta`, so in-app swaps, fullscreen and tracking are unchanged. `relinkFlow` still writes
  `ctaPrimary`/`ctaSecondary` (Home + next drift, last → #1; only READY drifts, writes on change,
  `relinkAllFlows()` at boot, re-run when a drift turns READY) — the player ignores them for tour
  drifts, but they remain the stored truth for anything that reads a product's CTAs.
- **Pay per drift** (`services/driftBilling.ts`): free while `Organization.freeDrifts` last, then
  `AWAITING_PAYMENT` (clip stored, not processed) → Stripe Checkout (one per tour, with
  `customer_creation: "always"` + `invoice_creation` since 2026-09-26, so Stripe raises a real
  numbered invoice — the buyer's receipt, carrying the business name and address; `fulfillSession`
  reads its `hosted_invoice_url` back and `sendTourOrderPaidEmails` puts it in the "payment
  received" email via `sendTemplated`'s `appendHtml`, which is what makes a receipt exist in TEST
  mode at all — Stripe's automatic one is a live-mode Dashboard setting, still owed by the client.
  `stripePaymentUrl()` gives the back office a link straight to the payment) → webhook
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
  `planCleanup` (async, yields every 20ms) detects the pan direction, and CAN trim still ends (up to
  `MAX_TRIM_SHARE` 0.4 of the clip) and steady translational shake (a per-frame crop, margin 1–6%) — but since
  2026-09-24 **neither is applied**: the client's footage is the point ("some part of the original footage feels
  cut off or cropped"), so the pipeline analyses for DIRECTION only and passes every frame through whole.
  `TOUR_CLIP_TRIM=on` / `TOUR_CLIP_STEADY=on` bring them back (steady only lines up when trimming too — its path is
  measured over the kept frames). The stored `manifest.cleanup` reports what was APPLIED, not what was planned, so
  the builder's line can't claim a trim that never happened; anything
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
- **Ingestion + UI pass** (2026-09-22, client meeting; no schema change): tour clips are sampled at
  `STEP_INGEST_FPS` = 30 (services/driftFlows.ts, env `TOUR_INGEST_FPS` 10–60; `validateClip` in routes/driftFlows.ts:
  frames = duration × min(30, source fps), 12–180) — a 60 fps phone clip keeps every other frame, half the load; 180
  frames = 6 s at 30 fps. drift.li surfaces are **dark only** (TourShell, DriftSiteShell, OwnerReport, AuthCallback,
  CreatorRoute set `data-theme="dark"`; no theme picker — the admin panels keep theirs). Header (`TourShell`): "drift.li"
  → the drift.li home, "tour" → /tour; pages the viewer can manage pass `view` (`ShellView`) → an **Admin View /
  Public View** switch in the header (replaces the old "You're editing / viewing as a visitor" strips on the page,
  pathway and builder; a superadmin not yet managing sees Public, "Admin" = Manage). `PageSwitcher` is also the account
  menu (pages · Signed in as · Log Out); Dashboard hides when the view switch shows. The page and the builder show
  **Path only** (Cards removed). Page: admin view = Create New Tour + Page Settings (accent) + Leave Page (members) +
  the link; public view = View Demo / enquiry / contact. **Client pass 2026-09-23**: the header's
  "TOUR" reads at the wordmark's size (`.t-kind`, one lockup with drift.li); the page hero is the
  NAME first with "Tours" under it (`.tpg-kind`); the visitor's line is "Explore the Live Interactive
  Tours."; counts read "9 Drifts". `.t-back` is a pill (accent on accent-soft) everywhere it appears —
  it was easy to miss. A DEMO tour's pathway now carries `← Drift Tours` → `/tour/drift` (it had no way
  out at all); every pathway ends with a `.tpw-foot-end` row: **Learn More** (→ /tour) + **Share Tour**
  (copies the tour's menu link, `ShareTourButton`). The /tour landing's closing section is one
  **View Drift Tours** → `/tour/drift` instead of repeating the two CTAs above it. On phones the home
  hero's caption + "Take a Tour" get their own 44px band (`.dh-visual{padding-top}`) — pinned to the
  top corners they sat on the drift frame, which read as broken alignment. **A tour in the list is a directory entry**
  (2026-09-23, client): cover + name + drift count, and for a visitor a `.tpg-go` arrow on the right —
  the strip of clickable drift previews and the "Start Tour" button are gone (`TourPathList`), and the row
  opens the tour's PATHWAY, not the tour. Admins keep their tools on the right instead of the arrow.
  **Client pass 2026-09-24 (Pass 1)**: the Admin/Public icons stay on phones (hiding them left the
  switch as two bare words); a menu shows ONE "Tour" — the pathway's eyebrow is `.tpw-kind`, hidden
  under 620px because the header already says it; the page wash gets wider, stronger pools under
  820px (the desktop percentages cover a few hundred pixels on a phone and fade to flat dark); the
  channel's Featured / Library counts in Admin → drift.li → Tour are links to the channel.
  New-tour card = `.tpg-new` (accent, big input, scrolls into
  view). Builder toolbar: Start Tour · Insights · Tour Settings · Share|Publish (Unpublish lives in Tour Settings,
  Capture Guide in the meta row). A tour drift's background defaults to drift.li's dark ground
  (`TOUR_DEFAULT_BACKGROUND` #0d1119): processing no longer fills the detected colour in for tour steps, and
  `pickedTourBackground` treats a stored colour equal to the manifest's `detectedBg` (older builds) as not picked —
  the public payload serves the default, the builder shows "Default · drift.li Dark". A demo tour (the site's
  `isDemo`, or the page's own `demoFlowId`) comes back with `isDemo` on the public pathway → no page back link, brand,
  enquiry or contact. The client wants **Title Case** on UI text ("That Sounds Good"): done across the tour UI on
  2026-09-22 — major words capitalized, short joining words lowercase unless first/last ("Keep the Moments That
  Matter"), phrasal particles up ("Log In"), drift.li / emails / links untouched; one-line text only — multi-sentence
  help paragraphs keep sentence case; the client's own copy (TourLanding, CaptureGuide, landings) untouched. **Write
  new UI strings in Title Case.** Contact button (`ContactButton`, tourPageParts): "Contact {page}" — its own link when
  set, else (url null, when the page takes enquiries) it opens the page's message form (`EnquirySheet`, exported, sent
  with `via: "contact"` → the lead's button reads "Contact {page}"); only a page with neither falls back to
  "Contact PicDrift". `EnquirySheet` portals into the `.drift-ui.d-page` root (animated `.t-rise` sections are their own
  layer and painted over it). /tour/start (Try It Free) has an × (back, or the Tour landing) and is dark only.
- **Drift channel + featured library** (2026-09-22, no schema change; `services/driftChannel.ts`): drift.li/tour/drift =
  drift.li's own TOUR page "Drift" (slug `drift`, already in RESERVED_SLUGS, so only `ensureChannel` can create it —
  Admin → drift.li → Tour → **Drift Channel** tab → "Set Up the Drift Channel"). A superadmin **saves** any creator's tour
  to its library (back office: Pages → a page → a tour → Save to Library; or the builder's Tour Settings) → `saveToChannel`
  makes a **pointer**, not a copy (2026-09-26): a new DriftFlow on the channel (hidden = the library, PUBLISHED, its
  own slug — tour slugs are site-wide unique) with **no steps of its own** and `settings.featureOf` = the source flow's
  id. `resolveFeature`/`resolveFeatures` (public) and `resolveOwnFeature(s)` (the channel's own tools) merge the
  SOURCE's content onto the CHANNEL's identity — id, slug, organization, order, hidden, settings — and because
  `serializeFlow` derives every path from the flow's own org + slug, the existing serializers produce channel addresses
  over live content unchanged. An edit by the creator is therefore on the channel at once, and nothing is duplicated.
  One drift of a featured tour goes through `presentOnChannel` in the drift-by-slug route: the stops are rewritten to
  `/tour/drift/{tour}/{drift}` and the creator's pixel, stored CTAs, forms and enquiry button are dropped (an enquiry
  would otherwise reach the channel instead of them). A source deleted or unpublished drops out of the public page and
  404s its pathway, but the row stays in the channel's OWN lists so it can be removed. One guard —
  `router.use("/api/drift/my/flows/:id")` — refuses writes to a feature, and the builder shows it read-only as
  "Featured from {page}". What it lets through is the CHANNEL's own curation, i.e. the fields `mergeFeature` keeps
  from the entry rather than the source (`CHANNEL_OWNED`: hidden, order, isDemo, slug) plus publish/unpublish and
  DELETE — **Feature It is `hidden:false`, so a guard that blocked everything blocked featuring** (caught in use,
  2026-09-26). A PATCH mixing an owned field with a content one is still refused outright. Entries copied BEFORE this are ordinary flows with a credit and no
  `featureOf`: they keep working; remove and re-save one to make it live. Saving the same tour again returns the entry
  already there (`settings.credit.flowId`). `settings.credit` {flowId, pageId, pageName,
  pageSlug} → `serializePublicFlow.credit` → the pathway shows **"Captured by {creator}"** top right (always, client
  2026-09-26 — it credits whoever filmed it) linking to their
  page; back link = "← Drift Tours". On the channel page, Hidden Tours read **Library** and Unhide/Hide read
  **Feature / Move to Library**. Any page's Featured Tours can be ordered (↑ ↓, `PUT /api/drift/my/page/tour-order`,
  EDIT) — `DriftFlow.order`, which the public page already sorts by. A demo tour on the channel keeps its back link.
  Verified against a throwaway Docker Postgres (schema from `prisma migrate diff`, never `db push`): 43 checks.
- **Superadmin**: `X-Drift-Org` lets a superadmin act on any TOUR page ("Manage this page", `usePageAdmin`);
  back office = Admin → drift.li → Tour (`routes/driftTourAdmin.ts`, `DriftTourAdmin.tsx`).
- **Invite a creator** (2026-09-26, no schema change): Pages → "Invite a creator" makes the page WITH its limits and
  sends the way in, in one action — `POST /api/drift/admin/tour/invite` {email, pageName?, accountType?, freeDrifts?,
  maxClipSeconds?} creates the Organization (TOUR, MANUAL, drift.li, PAID) and then the ordinary one-time
  `DriftTourInvite` (role ADMIN) through `createProInvite({ flavour: "creator" })`, which only picks a different
  letter — `tour.creator.invite` instead of `tour.pro.invite`. Accepting is the existing path, untouched. Also
  `POST|DELETE /api/drift/admin/tour/pages/:id/invites[/:inviteId]`; `pageDetail` carries `invites`, and every
  invite carries **its link** so it can be passed on by hand. Someone who already has a page is refused with its id.
  `readLimits` in the route file is the ONE reading of freeDrifts / maxClipSeconds / accountType, shared with the
  page PATCH — of the four quota columns only those two still bite a tour page (tours are unlimited, per-tour drifts
  are capped by `TOUR_MAX_DRIFTS_PER_TOUR`).
- **drift.li home** = `rotation3d/DriftHome.tsx` (2026-09-14 redesign per the client's `land.png`; headline on
  two lines on desktop, four product cards). **Reworked 2026-09-26 (client)**: the hero STAYS TWO COLUMNS
  ("the right side animation"); what changed is what sits ON the scene. Two things were pinned to its
  corners — the chip naming the world on the left, "Take a Tour" on the right. The chip is **gone**
  (with the demo-tour fetch that only fed it; `TakeATour` deleted) and the **variant text is centred over
  the animation** (`.dh-now`, absolute at `left:50%`, one line — it wraps onto the drift otherwise — in the
  band above the frame). *Read the note carefully if it comes up again: "the other text needs to be
  centralized over the animations" means THAT chip, not the headline; centring the whole hero was my first,
  wrong reading.* The rail's four names are now a **picker** (`.dh-pick`): pick one and the playhead glides
  there, then the journey carries on from it. They are HTML, not SVG labels — `DriftStage` is `aria-hidden`,
  so anything focusable inside it is unreachable — and each is placed at `stopPct(i)` (its stop's share of
  the stage width) so it stands under its own dot at any size; below 440px they fall back to a centred row.
  The viewBox is cropped to `BOX = 0 8 480 298` (stage `aspect-ratio:480/298`, horizon 75%): it keeps the
  band the chip sits in and ends just under the rail, where the picker takes over in the flow. The world
  colours (`--w-cyan/violet/emerald`) live on `.dh-visual`, not the SVG, so the picker and chip wear them
  too — a world's class remaps `--accent`, and cyan is left alone (remapping it to itself is a cycle).
  Nothing hangs off a corner any more, which is what the iOS alignment complaint was.
  The hero's scene is **`rotation3d/DriftHomeScene.tsx`**
  (2026-09-17): this is the parent page, so one Drift frame stands on the shared `DriftStage` floor with all
  four worlds drawn side by side inside it (Tour room + stops · View horizon + sightline · Memory frames +
  Private badge · Path route + nodes), each in its product colour (cyan / cyan / violet / emerald), while a
  playhead travels the rail below (hold 2.6s, glide 1.15s, turns around at the ends) and a caption names the
  world with the card's own title + status. Drawn art, NOT photos — it matches the product landings and never
  depends on the demo tour. On a mouse or pen the pointer takes the playhead over (`follow`/`release`: this is
  "You Control the Movement" for real, so never *label* the visual as draggable); touch is left alone so the
  page scrolls; reduced motion holds a world and the pointer steps between them; the rAF loop stops when the
  tab is hidden or the hero scrolls off (IntersectionObserver). "Take a Tour" over the scene (the client's
  CTA, `TakeATour` in DriftHome) still starts the demo tour and warms its first drift + the player chunk; no
  demo tour set → no chip, the scene is unaffected. The client's copy stays exactly as written — restyle freely, don't reword.
  **The cards, 2026-09-26 (client)**: the product NAME is the card's title (`.dh-name`, ~26–31px in
  the product's accent) with the tagline under it — it used to be a 13px uppercase eyebrow over a
  25px tagline, so the one word the card is about was the smallest thing on it — and the card is
  roomier ("looks congested"). Every card now ends in **Learn More → its own landing** (`Product.path`);
  Tour keeps Try it Free in front of it. "Join Wait List" is GONE from the home: it lives on each
  landing, which is where Learn More takes you, so `WaitlistDialog` is no longer mounted here. Each
  card carries its landing's palette via `Product.tone` = the same `ds-violet` / `ds-emerald` classes
  those pages use (cyan needs none) — so icon, name, status pill, border, glow and button all match
  the page the card opens. Those classes now match a nested element as well as a page root
  (driftSite), which is what makes one palette serve both. The grid is 1 / 2x2 / 4 columns — auto-fit
  used to give a 3+1 in the middle range. It no longer loads the player. Brand custom
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
- **Footer + Unsubscribe (2026-09-22, CASL / CAN-SPAM; client's wording):** every email's footer carries the postal
  address "Drift.li - Visionlight Productions Inc. · Box 549 · Rosenort, MB, Canada · R0G 1W0" (env
  `MAIL_POSTAL_ADDRESS`, lines split by "|") in 10px, and **Unsubscribe**. `renderEmail` leaves
  `UNSUBSCRIBE_PLACEHOLDER` there; `sendMail` then sends **one message per recipient** (to + bcc) with their own
  signed link (`unsubscribeUrl`, HMAC with env `MAIL_UNSUBSCRIBE_SECRET`, falling back to the service-role key) and
  `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` headers. `routes/mailUnsubscribe.ts`:
  `GET /api/mail/unsubscribe` = a confirm page (link scanners open links, so GET never unsubscribes), POST (the button,
  and mail apps' one-click) records `EmailOptOut` (schema model, additive) — "Subscribe Again" deletes it. Opted-out
  addresses are left out of every email except `essential` templates (`drift.brand.invite`, `tour.pro.invite`,
  `tour.order.paid.creator`). Supabase's own auth emails (confirm, reset) are set in the Supabase dashboard — the
  address goes there by hand (the project is shared with the studio).
- **Branded header (2026-09-24)**: `renderEmail` puts the real lockup in the header —
  `frontend/public/drift/email-logo.png` (from the kit in `brand/drift-li/`), referenced absolutely
  off `PUBLIC_URL` at a fixed 121×32 with alt text. The header cell sets `background-color` AND
  `background-image`: Outlook renders it through Word, drops the gradient, and the white logo would
  otherwise land on white.
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
- **Navigation starts at the top**: `ScrollToTop` in `App.tsx` (2026-09-24). React Router keeps the
  window's scroll offset across a route change, so a link followed from halfway down a page landed
  halfway down the next — read as "the Learn More anchor is wrong", but it affected every in-app
  link. It scrolls with `behavior:"instant"` on purpose: `App.css` sets `scroll-behavior:smooth`
  globally and `"auto"` defers to it, which would animate the jump. A hash link is left alone.
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
