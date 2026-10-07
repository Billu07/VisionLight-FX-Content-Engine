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
  - **A landscape drift on a phone** (2026-10-02, client; `landscape_button.jpeg`): the drift's own
    shape decides this, measured off what is drawn (`r3d-wide`, frame aspect >= 1.2) — not the screen's.
    Held UPRIGHT it shows "Turn your phone for the full view" under the frame the whole time
    (`.r3d-turnhint`) — not a flash after a tap. The DRAG CUE sits just UNDER the frame there — 8px
    below it, never ON it: a phone's screen is small and the hand was covering part of the room
    (client, 2026-10-02) — and the pill steps BELOW the cue, because `draw()`
    publishes `--r3d-cuebot` while the cue is sitting there and the pill's `top` reads
    `var(--r3d-cuebot, var(--r3d-framebot))`. Before that the cue floated in the middle of the band and
    the two sat level with each other (client's refine3.jpeg, 2026-10-02). **The `[data-fs]` button is on EVERY landscape drift** (2026-10-07, client), in
    the footage's own BOTTOM-RIGHT corner where a video player puts it — "the icon and placement they
    are already familiar with from fb and tik tok standards", in place of the sentence. It used to be
    rationed to the first landscape drift of a visit (`r3d-fsfirst` / `fsOfferedFor`, both now gone):
    a visitor met it once and then had no way back OUT of fullscreen, which is what the client
    reported. `r3d-auto-fs` no longer hides it either — that rule existed for the iPhone case, and an
    iPhone never has the button at all. **Apple is the one exception**: `.r3d-stage.r3d-ios` hides it
    outright, because there is no orientation lock and element fullscreen is `<video>`-only, so turning
    the device IS the answer — and Apple is therefore the only place the "Turn your phone for the full
    view" line still stands (`.r3d-drift.r3d-wide.r3d-ios .r3d-turnhint`), since it is the only thing
    left to say there. Where the button does show it means "fill the screen". That calls `fillLandscape()`, which requests fullscreen and then
    `screen.orientation.lock("landscape")` — real rotation on Android/Chrome. The lock is tried THREE
    times: before any await (while the tap is still the user gesture), straight after fullscreen resolves,
    and once more 350ms later — on X's in-app browser the first open never turned and the second always
    did, which is what a lock asked for too early looks like (client, 2026-10-02). **iPhone Safari cannot be
    turned from a web page at all**: there is no orientation lock and element fullscreen is `<video>`-only,
    so there it falls back to pseudo-fullscreen plus `r3d-turn` (a 3.6s "Turn your phone" hint). Don't
    promise rotation on iOS. Turned SIDEWAYS, `r3d-corners` puts the nav in the ground either side of the
    footage — Menu top-right (under the icon column), Prev bottom-left, Next bottom-right (the client's
    own arrangement) — instead of a row across the room; the nav buttons carry `r3d-nav-prev/menu/next`
    for it. It applies to ANY clip on a sideways phone since 2026-10-02, portrait included: a portrait
    clip used to stack them down the right-hand side (`r3d-siderail`) and the two should match. Buttons
    are sized FROM `--r3d-side` — the ground beside the footage, measured every frame in draw() —
    width and type both: the max-width is that ground less 12px and the font is capped at a fifth of it
    (raised from 18px/0.17 on 2026-10-05 — the client wanted them a little bigger; measured 55x40 at
    12px → 59x47 at 13.3px, still clear of the picture on both sides),
    so each button is as large as the room allows and never lies on the picture. A fixed size cannot
    do this: a 16:9 clip on a 19.5:9 phone leaves about 75px, and the 104px floor an earlier pass put
    under the max-width is exactly what pushed them back onto the footage (client, 2026-10-02: "part
    of it is in the frame, dial it down a bit"). Prev and Next stand `9vh` up off the bottom edge,
    one line each (`nowrap`), with the zoom pair `9vh + 76px` so the minus key clears Next. The +/- zoom pair is KEPT here — `.r3d-stage.r3d-corners
    .r3d-zoomcol` overrides the three fullscreen rules that hide it, and it sits above Next — because a
    sideways phone pillarboxes the footage, so the pair has ground of its own beside it. A product with
    mobile zoom switched off still wins (that rule is `!important`).
    **Desktop is not touched by any of this**: `immersive` there means fullscreen, and fullscreen on a
    desktop is band mode, which keeps the row along the bottom.
    The `.r3d-stops` "7/10" panel is hidden on any coarse pointer (it lay over the frame) and KEPT on
    desktop, where the band above the footage holds it. Portrait drifts and desktop are untouched —
    that is the acceptance test, and v4-* in ui-shots asserts it.
  - **The first-run tips** (2026-10-05) are **the client's own guide, ported** — not a design of
    ours. They built it for drift.li (its noscript fallback points at our own
    /tour/drift/45-birch-f7d4/main-area), sent the HTML, and asked for it "100% same". So
    `rotation3d/TourTips.tsx` is a port: the beats, the copy, the artwork, the easings and the
    millisecond timings are theirs. **The two source files are in the repo**
    (`docs/reference/drift-tour-tips-mobile.html`, `…-desktop.html`) — go back to them before changing anything here,
    and do not "improve" the copy or the steps.
    Seven beats on a phone: *Quick Tour Tips* (auto-advances after 1850ms, no button) · *Drag To Look
    Around* · *For Horizontal Views / Rotate Phone* · *For Vertical Views / Rotate Phone Back* ·
    *Some Views / Pan Left Right* · *Some Views / Tilt Up Down* · *Entering Tour Now* (900ms, then it
    hands over). A desktop gets five — their second file drops the two rotate beats and widens the
    viewer to 640px with an 840px band. Each screen slides in from the right behind a cyan flash; the
    heading arrives word by word with the accent words shimmering; Next fades in after
    `NEXT_DELAY` (1265ms on the early beats, 265ms on the late ones); the progress dots are
    clickable; the outro swaps the rail for a drawn check mark. Tip one plays one automatic drag,
    then at 1840ms hands the pano over for real, its title moving *Drag To Look Around* → (1340ms)
    *Try It Here Now* → on touch, hidden → (250ms) *You Got It*.
    **Ours only in the plumbing**: it ends with `onDone()` instead of navigating to a tour URL, it is
    shown once per browser (`drift-tips-seen-2`, `tipsSeen()` — the key was BUMPED when the port
    landed, because the screen that set `drift-tips-seen` was a different thing entirely and
    everyone who had met it, the client included, would never have seen this one; bump it again if
    the guide is ever replaced, and remember the key is only written when a visitor finishes or
    skips, not when it merely appears). **`?tips=1` reopens them however many times they have been
    seen** — that is the link to hand anyone who wants to see them again, and the whole sheet is scoped under
    `.r3d-tips` with the keyframes renamed `tt*` — names as common as `.stage`, `.w`, `.flash` and
    `.skip` would otherwise reach into the player around it. Reduced motion skips straight to the
    tour, as theirs does. `.r3d-tips` is in `isControl` so the drift behind cannot be dragged while
    it is up, and the pano keeps the pointer the stage would otherwise capture.
    Shown only for a TOUR drift in a real player (`driftMode && flowNav && introHint`, never the hero
    or a landing). The hand demo (`startIntro`) is back to what it was before any of this: one
    wordless "this moves" on the first drift ever, its own `drift-intro-seen` key, skipped for anyone
    just shown the tips. Walked end to end against both source files: the beats, the copy, the dots
    and the handover all line up.
  - **Superseded, for history** (2026-10-02): the client asked for a coach that made the visitor drag
    forward and back inside the player before moving on. It shipped, then the card's placement became the
    problem — over the footage there is nowhere it does not cover something. The lesson survived; the
    place changed.
  - **A tour drift guides with ONE arrow, inside the frame** (2026-10-06, client; ref02/ref03/ref04) —
    this SUPERSEDES every description of the under-frame drag cue above, for tour drifts only. The old
    column (sway hand + copy + arrow) is gone; `guideCue` (`driftMode && flowNav`) puts `r3d-guide` on
    the hint and `placeGuide()` stands it INSIDE the frame against the edge it points at: the vertical
    middle of the left or right edge for a pan, the horizontal middle of the bottom or top edge for a
    tilt, 10px in, clamped 12px off the screen for a frame that bleeds past it. Edge and direction are
    now ONE decision — the arrow always stands on the edge it points at — which is what keeps the
    2026-10-05 arrangement the user asked twice to preserve: forward is the LEFT edge pointing left for
    a pan (and the BOTTOM edge pointing down for a TTB tilt), the way back is the opposite edge. Both
    horizontal directions read the same; `.r3d-dir-rtl` has no overrides left. **Lifecycle**: it opens
    forward, turns round at the far end (nav ≥ 0.92) and, once the visitor brings the drift back to the
    start, goes for good (`guideDone` + `r3d-gone`, never re-armed on that drift) — the far end cannot
    bring it back. The next stop gets its own: `r3d-gone` is cleared on mount beside `r3d-back`, because
    one SpinViewer carries the DOM across every swap. Nothing sits under the frame any more, so
    `--r3d-cuebot` is never published and the "turn your phone" pill hangs off `--r3d-framebot` again.
    Brand drifts, the hero takeover and Rotation3D keep the column — do NOT widen `guideCue`.
  - **And ONE hand, in the middle, carrying the frame a little** (2026-10-06, client): the first drift
    a visitor opens in a tour stands a hand in the MIDDLE of the frame, carries the footage a little way
    along the drift's axis, brings it back and fades. **A LITTLE**: `introRange = endYaw * 0.13`, where
    the old demo took 0.45 of the drift. It went through a wordless no-scrub version for half a day —
    the client had asked for "the other hand animation ... for the first back and forth" to be removed,
    which turned out to mean the small hand in the under-frame CUE, not this one: "it was good when the
    preview welcome hand moved the frame a little back and forth". So the scrub is back. One `introK`
    drives both the `yaw` and the finger's travel, so there is never a frame of daylight between the
    hand and the room it is moving, and the CSS sway is gone (it would double the motion). Which way it
    travels: toward the ARROW, since that is what a visitor reads and what Auto honours whichever way
    they then drag — except on a LOCKED drift, which has one true answer, so there it goes the way that
    drift actually scrubs forward. `endIntro` leaves `yaw` alone: run to the end the back-swing has
    already returned it, and cut short by a touch it belongs to the visitor, where the old demo's
    unconditional reset was a yank. Still started by the tips on their way out (`startIntroRef`) so it plays on the drift the
    visitor landed on, not the next one.
    **When it plays** (fixed 2026-10-06, after the user reported "I only see arrow now from the start"):
    the hand was never removed — it was gated on `drift-intro-seen` in localStorage, ONCE EVER PER
    BROWSER, a key set in every browser any of us had ever opened a drift in. Nobody who had used the
    product could see it again, which is indistinguishable from it being gone. The gate is now the module
    `Set` **`handShownFor`**, keyed by the flow: **one hand per TOUR per page session**, which is the
    client's own wording ("The hand only shows up middle screen for the first drift of the tour. Then
    it's just arrows."), writes nothing to the visitor's device, and can actually be looked at again.
    **It is cancelled only by a touch on the DRIFT, never on a control** (fixed 2026-10-07):
    `onDown` used to set `userTookOver` before its `isControl` check, so every tap on a button
    counted as taking the drift over. Tapping through the tips — Skip included — therefore
    cancelled the demo on the first drift before the tips could hand it over, and since the
    per-tour key is only claimed when the demo actually STARTS, the SECOND drift became the
    first stop that could play it (client's ref01.mp4). The regression test drives a real touch
    on Skip Tips and fails on the old ordering.
    **And the element is cleared on three occasions, not one** (fixed 2026-10-08): `endIntro`
    returns early on `!introActive`, so it cleaned up NOTHING when the effect tore down while the
    demo was still playing — and one SpinViewer serves a whole tour, so `.r3d-intro` is the same
    element on every stop: `r3d-intro-on` and the inline opacity outlived the drift that wrote
    them. A visitor who pressed Next mid-demo carried a frozen hand in the middle of every drift
    for the rest of the visit, which is what the client saw on iOS. Until the fix above this could
    not happen, because `onDown` called `endIntro()` on a tap anywhere, Next included — taking
    that out is what exposed it. `clearIntroDom()` has NO state guard and runs when the demo ends,
    when the effect tears down, and when a drift mounts (the last so a visitor already carrying a
    stranded hand is freed by the next drift they open). The regression test presses Next part-way
    through the demo and, before the fix, caught the hand frozen at opacity 0.16 on the next stop.
    It also fires from BOTH reveal paths now, with no delay: the moment the loader lifts (it used to wait
    another 200ms after the loader's 420ms sweep) **and** on the warm path, where a drift whose frames
    were already in reveals with no loader at all — a tour opened from its own pathway prefetches and
    warms its first stop, so that drift had nothing to hang the hand off and simply never played it.
    The gate makes the second call a no-op on a swap, so a later stop still gets none.
  - **`--r3d-framebot` is tracked separately from `--r3d-frametop`** (2026-10-06): both used to be
    written only when the TOP changed. A phone held sideways draws the frame full height, so its top
    rounds to 0 both before and after the first image arrives — and `--r3d-framebot` stayed at the 0 of
    that first empty draw, for the whole visit. Found while probing the in-frame guide; it matters more
    now that the turn-phone pill has no `--r3d-cuebot` to fall back from.
  - **First Direction and Camera Control are TWO settings** (2026-10-06, client; needs `prisma db push`) —
    "It's not camera control vs first direction... They are 2 totally different settings", and in the
    builder "our first direction on top in the selection and camera control second".
    **Camera Control** is how the clip was SHOT — Right Pan / Left Pan / Down Tilt / Up Tilt. It IS the
    long-standing `driftDirection` under its proper name (LTR has always meant "the camera pans right";
    the old tooltip said so), so the four values and every drift's drag are unchanged — only the words
    and the position in the form. It still sets the drag axis and which way a drag scrubs forward.
    **First Direction** is NEW (`DriftProduct.firstDirection`, nullable LEFT|RIGHT|UP|DOWN): which way
    the guide arrow points first, picked on its own, icons only, no words on the buttons — "First
    direction I pick right arrow. Camera control it depends how it was shot. I will pick right or left
    pan." Null = derived as before (a pan opens pointing left, a tilt along its own axis), so nothing
    already built moves until a creator picks; pressing the chosen icon again hands it back to Auto.
    The player reads it into `guideFirst` and puts `r3d-point-{left,right,up,down}` on the hint
    (`setGuidePoint`, called from `syncHelper` and on mount); `placeGuide` takes the EDGE from the same
    value, because the arrow always stands on the edge it points at. The `.r3d-dir-*` arrow rules are
    untouched and still serve brand drifts, which keep the old column.
    **Auto / Lock** (2026-10-06, `DriftProduct.cameraLocked`, default false = Auto): visitors do not agree
    about which way a drag should move a room — half expect to push it the way the camera went, half to
    pull it back — so whichever a creator picks, the other half drag the wrong way first. On **Auto** the
    visitor's FIRST swipe decides it: whichever way they swipe, the drift goes forward, and that reading
    then holds for the rest of the visit so nothing reverses mid-tour. **Lock** keeps the creator's own
    mapping for everyone. The decision lives in `rotation3d/cameraAuto.ts` — module scope, so it survives
    every drift→drift swap and dies with the tab; nothing is stored on the visitor's device.
    **What is remembered is the habit relative to the ARROW**, not to the shoot (fixed 2026-10-06, user:
    "in the clips that has tilt direction set up, the drag towards the arrow is inverted"): did they drag
    TOWARD the arrow, or away from it. Keying it to the shoot looked right and was not, because the
    arrow's direction is NOT a fixed function of the shoot — a pan shows it on the left edge pointing
    LEFT whichever way the room runs (the 2026-10-05 call), so on an LTR clip it is against the forward
    drag and on an RTL clip it is with it, while a tilt always points the way the room runs. A visitor
    following the arrow was therefore taught one relation on their first drift and handed the opposite on
    the next one of a different kind. Reproduced on LTR→TTB, LTR→BTT **and LTR→RTL** — it was never a
    tilt-only bug. `arrowSign` is which way the arrow leans on THIS drift's drag axis (0 when an admin
    points it off-axis, where there is no relation to read: such a drift neither follows the habit nor
    sets it), and `dirSign` is `arrowHabit() * arrowSign`. In SpinViewer
    `dirSign` is therefore a **`let`** (`baseDirSign` is the shoot's own), set at the moment the drag's
    axis locks at 6px — before a single frame has scrubbed, so the deciding gesture already moves the
    right way. The drag, the progress rail and the drift→drift slide all follow it; the guide arrow does
    NOT, because First Direction is a hint about where the room opens, not an instruction to swipe.
  - **The progress rail lies ON the screen's edge** (2026-10-06, client; ref08, ref09): filling the
    screen it used to stop 10px short on every side, which on a pillarboxed clip put it 10px up ON the
    footage for a pan and a hair off the buttons for a tilt. The 10px still decides where the rail STARTS
    and ENDS along its length (its round caps keep off the corners); only the edge it lies on moved, to
    `H - 2*DPR` for a pan and `W - 2*DPR` for a tilt — half the stroke, so the line sits wholly on screen.
    Banded and framed layouts are unchanged: there the frame's own edge is visible and the rail rides it.
  - **One width for everything beside the footage** (2026-10-06, client; ref07): `--r3d-navw` on
    `.r3d-stage.r3d-corners` is the ground less a 12px gap, CAPPED at the ground a 16:9 clip would leave
    (`(100vw - 177.8vh) / 2 - 12px`, floor 56px). A portrait clip pillarboxes to a third of the screen
    either side, and sizing from that gave buttons half the screen wide — "the button size should be same
    as landscape in that fullscreen screen". The cap can never make a button WIDER than the ground,
    because the measured ground is still the other half of the `min()`; a screen with no ground resolves
    negative, the declaration is dropped and the default stands, exactly as before. Prev, Menu, Next and
    the +/- column all take that one width, so the +/- pair now shares their centre line instead of being
    pushed to the screen's edge, and its keys are a touch bigger (`clamp(34px,9.8vmin,43px)`, 35 → 38 on a
    390px-tall phone). Measured: a portrait clip's buttons are 63px with 312px of ground, the same 63px a
    landscape clip gets from 75px.
  - **The player's top-left mark** (2026-10-02): a TOUR drift with no brand logo shows drift.li's own
    mark (the icon from frontend/public/drift/icon.svg, inlined — ink tile, white "d", cyan dot) instead of
    the old circular arrow, which meant nothing. A BRAND drift keeps the neutral gradient square: its page
    is not ours to badge. The background wash (`r3d-tour.r3d-ground::before`) is stronger and wider below
    820px, and it is no longer hidden there when the drift fills the screen — filling never crops on a
    phone, so there is always ground around the frame and that ground is where the blue belongs.
  - **Chrome no longer hides on a tap** (2026-10-02, client): tap-to-hide is gone, desktop and mobile
    (`r3d-bare` is dead). It still fades while DRAGGING, but only for a portrait drift on a touch screen
    (`@media (pointer: coarse){ .r3d-immersive:not(.r3d-wide).r3d-grabbing … }`) — a landscape drift keeps
    its chrome because that lives beside the footage, not over it.
  - **The drag cue: which edge, and which way round** (2026-10-05, client). Two separate things,
    asked for one after the other, so keep them apart when reading the code.
    **Which edge**: the cue opens at the frame's **LEFT** edge whichever way a horizontal drift
    runs, and crosses to the right for the way back — and the **arrow always points OUT of the
    frame**, so it reads as "there is more room that way" rather than as an instruction to drag
    that way. The condition in `placeHelperX()` is simply `helperBack`; it used to key off
    `dirSign` as well, until the client moved a left-to-right drift to "the other edge from where
    we have now" and told us a right-to-left one must not change "a single thing" — which it does
    not: every rule resolves to exactly what RTL was already drawing (measured identically before
    and after: cue at 57 of 390 upright, 14–66 sideways). Vertical drifts stay centred upright.
    A consequence worth knowing: horizontal drifts now put the cue in the SAME place whichever
    direction they run. The only thing direction still changes there is the order of the two
    glyphs inside the cue — and since 2026-10-05 that matches too, so the cue now looks the same
    for both horizontal directions. Direction still decides the drag itself, and the vertical
    drifts, which are untouched by any of this.
    **Which way round**: the ARROW leads and the HAND follows. A right-to-left drift has always
    read that way; a left-to-right one joined it on 2026-10-05. Getting there took three passes —
    both directions were swapped, that was taken back out as a mistake, and then only LTR was
    swapped — so the lesson is in the shape of the rules: the BASE pair carries the order and the
    `.r3d-dir-rtl` pair is left alone, which is what keeps RTL byte-identical (measured before and
    after: arrow 24, hand 46). Changing the base rules alone is how to move LTR without touching
    RTL. It is a separate thing from the edge above.
  - **The cue on a phone held SIDEWAYS** (2026-10-05, client) — `placeHelperX` and the hint's
    vertical placement both branch on `corners` before anything else:
    · a **vertical** drift (TTB/BTT) used to strand it in the middle of the screen, so it goes to
      the **bottom-right corner of the footage**, 14px inside the frame's right edge and 16px above
      its bottom;
    · a **horizontal** drift had it lying ON the footage, so it steps **off the picture into the
      ground** on the side it is heading for, and sits **under the Prev/Next row** (those stand at
      `bottom:38%`, so the cue goes to `0.62 × height + 12`). The ground is narrow beside a
      landscape clip and wide beside a portrait one — "just outside the frame" covers both, and the
      portrait case lands near the frame rather than out at the screen edge (measured: ground
      312px, frame ends 532, cue starts 541).
  - **A tilt drift owns the vertical axis, and a tour player holds the document still**
    (2026-10-07, client): dragging DOWN on a tilt drift was being stolen by Safari as
    pull-to-refresh, and in an in-app browser that closes the whole thing. The stage's
    `touch-action` is `none` for a vertical drift (`.r3d-dir-ttb` / `.r3d-dir-btt` in the sheet so it
    holds from the first paint, and by VALUE in the tick — it used to be set only when the ZOOM state
    changed, so the line never ran at all until someone pinched). A pan drift keeps `pan-y`, which is
    what lets a brand drift sit in a scrolling page. Separately, a TOUR player (`driftMode && flowNav
    && !hero && !landing`) sets `overflow:hidden` + `overscroll-behavior:none` on html and body while
    it is mounted and puts them back on unmount: a tour fills the screen so there is nothing under it
    to scroll, and a scrollable document under a fixed full-screen overlay is what makes iOS Safari
    land a touch somewhere other than where it painted the control ("the button touch is all shifted
    up" with tabs open). **Not verified against the client's own capture — ref11/ref12 never arrived
    — so if the shifted touches persist, this was the wrong cure and the next step is a fresh clip.**
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
- `DriftProduct`: `driftDirection` (LTR|RTL|TTB|BTT = **Camera Control**, how the clip was shot — the
  drag axis and which way a drag scrubs forward) + `firstDirection` (LEFT|RIGHT|UP|DOWN|null =
  **First Direction**, which way the guide arrow points first; null = derived) + `cameraLocked`
  (false = **Auto**, the visitor's first swipe decides which way a drag scrubs forward, for their visit;
  true = **Lock**). Also: manifest
  (`frames[]`, `frameCount`, `defaultFrame`), optional
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
  hand-icon helper cue and "Tour Powered by". The drift→drift handoff is a CROSSFADE ONLY since
  2026-10-06 — the directional slide is off (`outT`/`inT` are `shift(0)`; put -6 / 4 back to
  restore it). The client called it "a frame glitch at the start of a load then resets the frame
  to starting spot", and measuring their own capture (ref09.mp4) proved them right about what
  they were seeing: at every stop the picture's own left edge arrived ~34px to one side and eased
  into place over 420ms, alternating side with `prevDirRef`, while the drawn rect's size never
  changed. No frame was ever wrong — it was our animation. `prevDirRef` and `travel` are kept, so
  the slide is two numbers away. (The end-of-tour card was removed in Tour v2 — tours loop.) Everything is gated on `flowNav`, so brand drifts are
  untouched. Builder: `RouteInk` (TourBuilder) draws the rail as an inked route from the items'
  pin positions (`:scope > .t-route-item`, pin centre = offsetTop + 33); `ShareSheet.tsx` is the
  publish moment (link + copy + QR via `qrcode-generator` + system share), also behind "Share".
- **Facebook's in-app browser** (2026-10-02, client): it swallows the first touch sequence on a page,
  so a drift opened straight from a shared post looks dead — you drag and nothing moves. We can't fix
  their webview, so `Rotation3DPlayer` sends a `/tour/{page}/{tour}/{drift}` link opened in it to the
  tour's MENU instead (`isInAppBrowser`, matching FBAN/FBAV/FB_IAB/FBIOS). There the first interaction
  is a tap on a link, which that browser handles, and the drift is one tap away with the gesture
  already spent. Every other browser goes straight to the drift, and the share CARD is untouched —
  this is a runtime redirect, not a change to any link.
  **Two things it must keep doing** (both bit on 2026-10-02): it fires ONCE per page session
  (`inAppHandled`) — otherwise tapping a drift FROM that menu redirects straight back and the tour
  can never be opened, which is what "the buttons don't load" was. And it does NOT match Instagram:
  drifts opened from there worked fine, so sending those visitors the long way round cost something
  for nothing.
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
  (on the FIRST drift, Prev is the menu), Next → the stop after and, **on the LAST drift, the
  MENU** (2026-10-07, client: "when a tour is over, load the next button to bring it to its menu
  page" — it used to loop silently round to #1); a
  one-drift tour shows Menu alone. Because it comes from `flow.stops`, the unbranded player
  (`/u/{code}`, whose stops the server rewrites) gets the same row for free. Clicks still go through
  `fireCta`, so in-app swaps, fullscreen and tracking are unchanged. `relinkFlow` still writes
  `ctaPrimary`/`ctaSecondary` (Home + next drift, last → #1; only READY drifts, writes on change,
  `relinkAllFlows()` at boot, re-run when a drift turns READY) — the player ignores them for tour
  drifts, but they remain the stored truth for anything that reads a product's CTAs.
- **Pay per drift** (`services/driftBilling.ts`): free while `Organization.freeDrifts` last, then
  `AWAITING_PAYMENT` (clip stored, not processed — but `storePendingClip` also takes ONE frame out of it
  (`pipeline.posterFrame`, a third of the way in, ≤720px WebP, ~250ms) and stores it as `thumbnailUrl`, so the
  builder shows the creator's own footage instead of an empty square while it waits; the step card keeps
  "Clip Saved · Converts After Checkout" as a scrim over it. Never blocks an upload: no frame just means no
  picture. 2026-09-29, client) → Stripe Checkout (one per tour, with
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
  The TOUR card (2026-10-07, client's ref05) reads just **"Interactive tour"** at size 34 — no "· N spaces",
  no strip of drift thumbnails above the title. In a message thread those were the smallest, least useful
  things on it. `renderTourCard` still TAKES `spaces` and `thumbs` so every caller keeps working; it simply
  draws neither. `pill()` takes a `size` and scales every one of its measurements off it, so the default
  still renders byte-for-byte as before. **`CARD_VERSION` is now 2** — bumping it is what gets the new card
  past every cache holding the old one.
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
  menu (pages · Signed in as · Log Out); Dashboard hides when the view switch shows. The switch wears the accent
  since 2026-09-29 (client: make it obvious) — accent border and tint on `.t-view`, the selected side filled with
  `var(--accent)` on `--accent-ink` — because it is the one control in the header that changes what you are
  looking at. The page and the builder show
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
  Capture Guide in the meta row). **2026-09-30 (client)**: the bare URL chip is gone from BOTH the builder's meta
  row and a page's admin view — it sat there permanently to say what the address bar says, and Share (builder) /
  each tour's own Copy Link (page) are where a link is actually handed over. The published tour's "Live at …"
  banner stays: it appears with Share beside it and says edits are live. **Start Tour** is `d-btn soft t-start`
  (accent text on accent-soft, filling on hover) rather than ghost — it is pressed after every upload and was
  hard to pick out; the filled accent in that row belongs to Publish and Share. A tour drift's background defaults to drift.li's dark ground
  (`TOUR_DEFAULT_BACKGROUND` #0d1119): processing no longer fills the detected colour in for tour steps, and
  `pickedTourBackground` treats a stored colour equal to the manifest's `detectedBg` (older builds) as not picked —
  the public payload serves the default, the builder shows "Default · drift.li Dark". **Only the SITE's demo** (`DriftFlow.isDemo`) comes back
  with `isDemo` on the public pathway → no page back link, brand, enquiry or contact, and its way out is
  "← Drift Tours". A page's own `demoFlowId` — the tour its "View Demo" button opens — used to take the same
  treatment, so a creator's own menu lost their name and offered a way back to a channel they are not on
  (client, 2026-10-07: "that tour is not a drift tour, that is my account's tour"). It is just one of their
  tours now; `demoFlowId` still only decides which one View Demo opens. The client wants **Title Case** on UI text ("That Sounds Good"): done across the tour UI on
  2026-09-22 — major words capitalized, short joining words lowercase unless first/last ("Keep the Moments That
  Matter"), phrasal particles up ("Log In"), drift.li / emails / links untouched; one-line text only — multi-sentence
  help paragraphs keep sentence case; the client's own copy (TourLanding, CaptureGuide, landings) untouched. The home's closing
  **"Try Drift Tour" goes to `/tour`**, not `/tour/start` (2026-10-02): someone who has read that far wants
  to see what it is, not to open a signup wizard. **Write
  new UI strings in Title Case.** Contact button (`ContactButton`, tourPageParts): "Contact {page}" — its own link when
  set, else (url null, when the page takes enquiries) it opens the page's message form (`EnquirySheet`, exported, sent
  with `via: "contact"` → the lead's button reads "Contact {page}"). **A page with NEITHER gets no button at all**
  (2026-10-08): it used to be handed PicDrift's own address, so clearing the contact field in page settings did
  not remove the button — it just put someone else's details on their page, which is what the client hit
  ("I removed the contact button in the tour setting and it still defaults to contact PicDrift", ref11). The
  serializer now leaves `contact.url` null and `ContactButton` already renders nothing for a page that takes no
  messages, so the fallback branch was the only thing keeping it on screen. `DRIFT_TOUR_CONTACT_LABEL` and
  `DRIFT_TOUR_CONTACT_URL` are dead env vars now. The page-settings help line says so too. `EnquirySheet` portals into the `.drift-ui.d-page` root (animated `.t-rise` sections are their own
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
  pageSlug} → `serializePublicFlow.credit` → the pathway shows **"Captured by {creator}"** top right (client
  2026-09-26 — it credits whoever filmed it) linking to their page; back link = "← Drift Tours".
  **Except when the page that filmed it is one of OURS** (2026-10-07): crediting ourselves on our own channel
  says nothing ("if that drift is from the picdrift account, we don't need that credit card, it's the parent
  profile"). `creditIsOurs(pageId)` counts a page as ours two ways — a SUPERADMIN belongs to it, **or one of
  its profiles shares a LOGIN (`authUserId`) with a superadmin**. The second is the one that matters: a tour
  page is provisioned with an ADMIN user, never a superadmin, so the first test alone would have missed the
  parent profile's own page entirely; what ties it to us is the same Supabase account behind both. Asked per
  pathway load rather than stamped at save time, so entries made before today behave too, and the pathway
  route sends `credit.show:false` — the credit is still PRESENT, so `featured` stays true and the menu stays
  as bare as any other feature; only the chip goes. If a superadmin ever joins a creator's page as a member,
  that page reads as ours — at which point this wants to become an explicit flag. **A featured tour's menu carries nothing else** (client, 2026-09-26): `featured`
  in TourPathway is `!!flow.credit`, and it drops the page's name + logo (`.tpw-brand`) and BOTH "Contact {page}"
  buttons, top and bottom — the tour is someone else's, so the channel's own name just repeats the header and
  "Contact Drift" isn't who the visitor wants. `.tpw-featured .tpw-title` takes back the air the brand block gave it.
  A creator's own pathway is untouched: that page IS theirs. The closing Learn More · Share Tour row
  (`.tpw-foot-end`) is centred on every tour. On the channel page, Hidden Tours read **Library** and Unhide/Hide read
  **Feature / Move to Library**. Any page's Featured Tours can be ordered (↑ ↓, `PUT /api/drift/my/page/tour-order`,
  EDIT) — `DriftFlow.order`, which the public page already sorts by. A demo tour on the channel keeps its back link — and the demo BELONGS on the channel: Admin →
  drift.li → Tour → **Demo tour** now opens on the channel's tours ("On the Drift Channel" / "Every Published Tour",
  2026-09-26), because a demo carries no page branding, so pointing it at a creator's own tour strips the branding
  off their real tour too. That listing counts a feature's drifts from its SOURCE (its own row has none) and shows
  "Captured by {creator}". Publishing reads the source as well (`setFlowPublished`): a pointer has no steps, so
  "add at least one step before publishing" used to leave an unpublished feature stuck down. `featureSourceId`
  lives in driftFlows (driftChannel re-exports it) so both can read it without a cycle.
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
  four worlds drawn side by side inside it (Tour room + stops · View sunset + viewpoint · Memory frames +
  Private badge · Path route + nodes). **Redrawn 2026-10-02 (client)**: View is a sunset — sun, rays, horizon
  with land, light broken on the water — because the old arc-and-sightline read as a diagram, not a place;
  Tour is a room with a far wall, a lit window throwing light on the floor and furniture standing on it,
  because a corner reads as a detail rather than a space. Every world is drawn inside a SAFE BOX
  (x 26..314, y 18..192 of its 340x210 cell) and all four now carry >=30 units of margin: View used to run
  0..340, edge to edge, which is exactly what the client saw as "not completely shown" while scrubbing.
  Path is scaled into the box rather than redrawn. scratchpad/world-bbox.js measures this — run it after
  touching any world, each in its product colour (cyan / cyan / violet / emerald), while a
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
- **Back-office nudges** (2026-10-07, client): a superadmin lands on a tour page's **Admin view** instead of
  having to press "Admin" first (`usePageAdmin`'s `manage` starts true — it only scopes the creator API to the
  page via `X-Drift-Org`, and the header's Public side steps straight back out). Hiding a tour **scrolls to
  the Library / Hidden Tours** and featuring one scrolls back to **Featured Tours** (`#tpg-hidden` /
  `#tpg-featured`, one frame after `loadAdmin()` so the destination list has rendered) — the two lists are far
  enough apart on a long page that a tour could vanish from under the cursor with nothing to show for it. The
  Contact button's **Link field fills in `https://` on focus** and clears it again on blur if nothing was
  added, so an untouched field never saves a bare prefix.
- **The page's name and the "Tours" under it are optically aligned** (2026-10-07, client's align.png): nothing
  in the CSS ever moved them apart — both sit at the same box edge. What separates them is each glyph's own
  LEFT SIDE BEARING, the blank a font carries before the ink, which scales with type size: a 44px "D" sits
  ~2px inside its box while the 11px "T" below sits a fifth of that inside its own. A constant nudge cannot
  fix it either, because the name belongs to the creator and every first letter carries a different bearing —
  measured: "D" wants 3px, "O" wants 2px. **It is measured by DRAWING** (`tour/opticalAlign.ts`), because two
  cleverer ways both failed and the client reported each as doing nothing:
  · `measureText().actualBoundingBoxLeft` is not on every engine's TextMetrics, and a canvas font SHORTHAND
    silently refuses to parse family stacks some engines dislike (`ui-sans-serif`, `system-ui`). Either way
    both glyphs measure 0, the difference is 0 and no nudge is applied — a no-op indistinguishable from the
    bug, which is what shipped first (2026-10-07) and was reported as not working (2026-10-08).
  · SVG `getBBox()` on a text node returns the LAYOUT box, not the ink: it reported ~0 for a 3px bearing and
    made the alignment WORSE. Caught by the probe before it went anywhere.
  So `inkOffset()` draws the glyph on a small canvas and finds its first inked column, which cannot be wrong
  about what it is looking at — **at 4 samples per CSS pixel**, and only counting SOLID ink (alpha > 140).
  One sample per pixel rounded each bearing to a whole pixel, and the difference between two roundings is a
  third reason this looked fixed here and was not there (client's ref12, 2026-10-08: measured off their own
  screenshot, the small line still sat 2px left, 3.5% of its cap height). Their phone puts the title at the
  clamp's FLOOR, 28px, where the whole difference is only ~1.4px — a desktop's 44px happened to round to the
  right answer, which is exactly why it looked perfect on one device and off on another. The alpha bar is high
  on purpose: antialiasing throws a faint tail left of the real edge and the two glyphs are different sizes,
  so their tails differ; asking for solid ink measures the same thing on both. The one remaining fragility — the font string — is handled by quoting ONE
  family plus a generic and reading `ctx.font` back to confirm the engine took it; if it did not, or
  `getImageData` is refused, it falls back to the share of an em a sans-serif capital typically carries
  (0.05), which lands within ~1.4px instead of being 3px out. TourPage re-runs it on `document.fonts.ready`,
  once more 600ms later, and on resize (the title clamps 28→44px). The probe checks every path at BOTH widths —
  a desktop at the clamp's ceiling and a phone at its floor, which is the client's case — to within 0.6px,
  plus the fallback with the measurement taken away.
- **Pathway, second pass** (2026-10-07, client): the way back reads **"← More {page} Tours"** ("More" says
  what is on the other side of it). The page's **name and logo under it are GONE** (`.tpw-brand`) — the way
  back already says the name, so it was the same word twice in two lines (ref09). The cover's **expand button
  moved to its top RIGHT** (ref03) and the cover itself **stands off the way back** (`.tpw-head` margin-top
  22px, 26 on a phone) instead of being jammed under the pill (ref02). On **drift.li's own channel only**, a
  **Create a Tour** button sits in the row (`CreateTourButton` in tourPageParts, also on the channel PAGE's
  action row): a visitor there is not looking at a property to enquire about, so the invitation is to make
  one. Signed out it opens Try It Free, signed in it goes to their own page.
- **Builder, second pass** (2026-10-07, client): the tour's **cover photo is in the builder's head** too, the
  same picture the pathway shows (`flow.coverUrl`, else the first drift with a frame), with a **pencil** on it
  that opens Tour Settings — where the picker lives (ref08). The step strips keep their **reorder arrows on a
  phone** (ref10): they were there all along, hidden by a `max-width:560px` rule, which left the strips with
  nothing but a caret and no way to reorder at all on the one device the builder is meant for. They go compact
  (30px square keys) rather than away.
- **The pathway shows the tour's cover photo** (2026-10-07, client): beside the title on a desktop,
  stacked above it under 560px, with a small expand button on its top-left corner — the client's own
  suggestion. The whole thumbnail opens it full screen (`.tpw-lightbox`), closed by the X, a click anywhere,
  or Escape. The picture is `flow.coverUrl || flow.thumb`, so a tour with no cover of its own shows its first
  drift's frame. The overlay is **portalled into `.drift-ui.d-page`**: `.tpw` is a `.t-rise` section, those
  animate, an animating element is a containing block, and a `position:fixed` overlay inside one covers the
  section instead of the page — which is exactly what it did before the portal (seen in the shot).
  EnquirySheet portals for the same reason.
- **Every landing's hero is one centred column on a phone** (2026-09-29, client): below each page's own split
  point — 1024px for the product landings and the home, 960px for /tour — the kicker, headline, lead, tags and
  CTAs centre, which is what /path (`layout="stack"`) has always looked like at every width. Desktop is
  untouched: split and flip still put the words beside the scene. The rules live with each hero (`.ds-hero` in
  driftSite, `.dh-copy` in DriftHome, `.tl-hero-text` in TourLanding) — the scene keeps its full width in all
  three, only the words move.
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
