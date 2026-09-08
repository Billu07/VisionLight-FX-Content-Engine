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
- **Drift admin UI**: reuse `driftUiTheme.tsx` + scoped `.d-*` classes (light/dark tokens).
- **Commit attribution** (this account): end commits with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + the `Claude-Session:` line.
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
  (guard), `TourHome` (/tour), `TourBuilder` (/tour/:id/edit), `TourPlay` (/tour/:slug),
  `tourUi`/`tourSession`/`types`; the landing's creator section is `.dl-suite` in `DriftLanding.tsx`.
  Routes sit before the `/:brandSlug` catch-alls; `driftNav.RESERVED_SEG` + backend `RESERVED_SLUGS`
  reserve tour/view/memory/path.
- **Tour context in the player** (2026-09-08): `GET /api/drift/public/products/:id` adds `flow`
  (`flowNavPayload` in `routes/drift.ts`: the flow's viewable stops in order + this drift's `index`;
  null for brand drifts / other routes). `Rotation3DPlayer` passes it as `flowNav` → `SpinViewer`
  renders the stop strip under the name (`.r3d-stops`), the closing card at the end of the last stop
  (`.r3d-finale`, gated on the drift's end frame + a 900ms beat), and slides stop→stop along the
  OUTGOING drift's direction (`prevDirRef`). Everything is gated on `flowNav`, so brand drifts are
  untouched. Builder: `RouteInk` (TourBuilder) draws the rail as an inked route from the items'
  pin positions (`:scope > .t-route-item`, pin centre = offsetTop + 33); `ShareSheet.tsx` is the
  publish moment (link + copy + QR via `qrcode-generator` + system share), also behind "Share".
- **Rules**: creator button links = drift.li / picdrift.com / same-site paths only (server-validated,
  env `DRIFT_CREATOR_LINK_HOSTS`); a flow-step drift's `ctaPrimary` is flow-managed (the generic
  product patch drops it); product/form deletes cascade the step → the product delete route relinks.
  Supabase stays on the default (implicit) auth flow — do NOT switch to PKCE (breaks reset/confirm
  links opened in another browser).
- **Ops owed**: Supabase dashboard (Google provider, redirect allow-list incl. `/auth/callback`,
  Confirm email ON, custom SMTP = web@drift.li — TOUR_PLAN.md §13); seed the demo tour from the
  superadmin account (build in /tour, tick "Use as the public demo" in Tour settings, publish, point
  its buttons at `/tour/start`).

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
