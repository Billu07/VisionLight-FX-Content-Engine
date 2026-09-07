# TOUR_PLAN.md — drift.li/tour build plan

Execution-ready plan for the self-serve **Tour** creator on drift.li. Written to be
picked up phase-by-phase (incl. by Fable 5 sessions). Read `CLAUDE.md` first for repo
conventions, deploy flow, and the drift engine overview.

Status: **P1 (data model) shipped 2026-09-08 — P2 (creator API) is next.** Grounded in a
full recon of the existing engine + auth (2026-09-08). Progress log: §11.

---

## 0. Locked decisions

- **Monetization:** free-forever + paid tiers. 1 tour (3 stops, clips ≤5s) free
  permanently; more tours/stops/features require a paid plan. Stripe added later; build
  the **quota/entitlement gate now** so paywalls are a config flip.
- **Auth emails:** Supabase Auth over **our web@drift.li SMTP**. Configure the Supabase
  project's SMTP (dashboard → Auth → SMTP) to the `web@drift.li` mailbox → Supabase sends
  confirm-email / reset / magic-link from our domain. Our `mail.ts` nodemailer stays for
  **app** notifications + nurturing (separate channel).
- **Creator account model:** reuse existing infra. A creator = a **personal Organization**
  (`productLine="TOUR"`) + a `User` (role `ADMIN`, `view="TOUR"`, `authUserId`=Supabase id).
  One Supabase identity → per-org `User` rows already works. This reuses drift products,
  storage, player, forms/leads wholesale — only the UX is new.
- **One shared model for all four variants.** No collection concept exists today (drifts
  connect only via hand-pasted CTA URLs). Add a neutral **`DriftFlow`** (with `kind` =
  TOUR | VIEW | MEMORY | PATH) + ordered polymorphic **`DriftFlowStep`** (a step is a drift,
  and — for PATH — a form or an in-platform page). Tour ships with drift-only steps; the
  form/page step types are reserved so `/view`, `/memory`, `/path` reuse the same tables with
  no migration. The linear "Next" on each step is **auto-generated from step order** (the
  "auto-relink on reorder").

### 0.1 Resolved design answers (2026-09-08)

- **URL scheme:** `/{kind}/{slug}` — `/tour/{slug}`, `/view/{slug}`, `/memory/{slug}`,
  `/path/{slug}`. Reserve all four in `RESERVED_SLUGS`.
- **Last-step "Next":** a **creator-customizable CTA** (they set label + a drift/picdrift
  target; default suggestion "Start your free trial" for the demo).
- **Step custom button:** **both** — a picker of the creator's own drifts AND free entry of
  any drift/picdrift URL (server-validated to those two domains).
- **The four variants** (same engine, different `kind` + allowed step types + copy):
  - **tour** — a guided path of connected drifts (e.g. a real-estate home tour). Drift steps.
  - **view** — people capture a *view* (a sunset on a date, etc.) on their phone; we make it
    an interactive drift; they can string views together and link drifts. Drift steps.
  - **memory** — a "memory lane" of drifts. Same shape as view/tour. Drift steps.
  - **path** — the most customizable: drifts **plus forms and in-platform webpages/pages**
    interleaved between steps — a full ad campaign or personal pathway (drift → page → form →
    drift…). Adds FORM + PAGE step types (a new lightweight `DriftPage` builder, later).
- **Playback reuses the existing player for free.** Each step is a normal `DriftProduct`
  whose auto "Next" CTA points at the next step's drift URL; `Rotation3DPlayer` +
  `driftNav.ts` already do the instant, fullscreen-preserving swap. No new player needed.
- **Design system:** build all creator UI on the scoped **`.d-*`** system
  (`rotation3d/driftUiTheme.tsx`, `DriftBrandDashboard.tsx` as the template) — themeable
  (light/dark) and already the most responsive. Mobile-first.

## 1. What we reuse vs. build

**Reuse as-is:** `buildSpinFromVideo` (frames engine, 12–180 frames), `processingQueue`,
`managedStorage`/R2 (`drift/` namespace), `DriftProduct`/`DriftSpin`, the public player +
`driftNav.ts` prefetch/swap, the multipart upload + `onUploadProgress` pattern
(`driftUploadProductVideo`), `mail.ts`, `DriftEvent` for analytics, `DriftForm`/`DriftLead`.

**Build new:**
1. `DriftFlow` + `DriftFlowStep` models (shared by all 4 kinds) + `Organization.maxFlows` (Phase 1).
2. Brand/creator-scoped clip-upload + tour CRUD/reorder API under `/api/drift/my/tours/*`
   (today video upload is **superadmin-only** — this is the main new backend surface) (P2).
3. Self-serve signup: Google OAuth (net-new) + manual signup w/ email verify; TOUR account
   provisioning (P3).
4. Creator home/profile + tour builder wizard + the tour "map" (P4–P5).
5. drift.li landing intro section for tour/view/memory/path + demo flow (P6).
6. App + client-notification emails + nurturing (P7).
7. Admin-panel mobile-first pass (P8, can run in parallel).

---

## 2. Data model (Phase 1) — SHIPPED 2026-09-08

Source of truth: `backend/prisma/schema.prisma`, section "Drift flows" (end of file). One
shared model for tour/view/memory/path, distinguished by `kind`; Tour only uses
`stepType="DRIFT"`, FORM/PAGE are reserved for `/path`.

- **`DriftFlow`** — `kind` (TOUR|VIEW|MEMORY|PATH), `slug` (**`@@unique([kind, slug])`, global
  per kind — the public URL `/{kind}/{slug}` has no org segment**; on collision suffix like
  `uniqueProductSlug`), `name`, `title`, `description`, `status` (DRAFT|PUBLISHED|ARCHIVED),
  `isDemo`, `coverUrl`, `endCta Json` (customizable last-step CTA), `settings Json` (small
  presentation knobs such as `nextLabel`/theme — put new knobs there, not in columns),
  `order`, `createdByUserId`, `publishedAt`, timestamps. Relations: `organization` (cascade),
  `steps`. Index `[organizationId, kind]`.
- **`DriftFlowStep`** — `stepType` (DRIFT|FORM|PAGE), `order` (0-based; the single source of
  truth for the auto "Next" links), `productId` (**`@unique`** — a drift belongs to at most
  one step because the flow owns that drift's `ctaPrimary`), `formId` (FK → `DriftForm`,
  cascade), `pageId` (reserved; no model yet), `customCta Json` (the step's own button →
  mirrored to `product.ctaSecondary`), timestamps. Index `[flowId, order]`.
- **Quotas on `Organization`**: `maxFlows=1`, `maxStepsPerFlow=3`, `maxClipSeconds=5` (free
  tier; a superadmin or, later, the Stripe webhook raises them). Back-relations:
  `Organization.driftFlows`, `DriftProduct.flowStep`, `DriftForm.flowSteps`.
- **Cascade caveat for P2:** deleting a product/form removes its step at the DB level, so the
  product/form delete routes must re-run the relink or the previous step's Next link dangles.
- **Why it differs from the first draft:** per-kind (not per-org) slug uniqueness matches the
  URL scheme; `maxClipSeconds`, `settings`, `publishedAt`, step `updatedAt`, the `formId` FK
  and unique `productId` were added now so P2–P5 need no second `db push`.
- **Schema rollout rule (every schema phase):** deploys are manual, so on the VPS run
  `git pull --ff-only origin main` → `npx prisma db push --skip-generate` → `npm run build` →
  `pm2 restart my-backend --update-env`, in that order. Additive tables/columns are invisible
  to the still-running old build, so the DB is ready before the new code starts; restarting
  first breaks every Organization query (65 of them, studio included) until the push runs.
  P1 was applied 2026-09-08 (schema pushed from a side branch before `main`; equivalent).

## 3. Backend API (Phase 2) — `backend/src/routes/drift.ts`

All under `authenticateToken` (NOT `requireSuperAdmin`), scoped to `req.user.organizationId`
via the existing `requireOrg()`. Reserve `tour`,`view`,`memory`,`path` in `RESERVED_SLUGS`.
Endpoints are **generic over flows** (`kind` in body/query; Tour = `kind="TOUR"`).

- `GET  /api/drift/my/flows?kind=TOUR` — list the creator's flows (+ step counts, statuses).
- `POST /api/drift/my/flows` — create (body: `kind`, name…). **Quota gate:** `count(flows
  [of kind]) >= org.maxFlows` → `402/403 { upgrade: true }`. Fires client-notify email.
- `GET/PATCH/DELETE /api/drift/my/flows/:id` — read/edit/delete (org-checked). PATCH can set
  the customizable `endCta` (last-step CTA).
- `POST /api/drift/my/flows/:id/steps` — **the clip upload** (DRIFT step).
  `videoUpload.single("video")` (reuse the 500MB disk multer). Body: title/headline/bgColor/
  customCta. Quota: `steps >= org.maxStepsPerFlow` → upgrade. Flow: create
  `DriftProduct{status:PROCESSING, frameCount:180}` scoped to the creator org → create
  `DriftFlowStep{stepType:"DRIFT", order:last+1, productId}` → respond `201` → async
  `processClip({clip:"A", frameCount:180, ...})` (reuse verbatim) → regenerate step links
  (below). Client polls product `status` for READY (same as today). (FORM/PAGE steps: path only, later.)
- `PATCH /api/drift/my/flows/:id/steps/reorder` — body `stepIds[]` in new order → update
  `order` → **regenerate the auto "Next" CTA** on every step (one transaction).
- `PATCH /api/drift/my/flows/:id/steps/:stepId` — edit that step's drift fields (title,
  headline, bg, its custom CTA) via a **restricted** patch (see below).
- `DELETE /api/drift/my/flows/:id/steps/:stepId` — remove; re-order + relink remainder.
- `POST /api/drift/my/flows/:id/publish` — set `PUBLISHED`, publish all step products.

**Auto-link logic** (single source of truth = step order): after any create/reorder/delete,
for each step i, set `product.ctaPrimary = { label: nextLabel, url: <step i+1 drift URL> }`.
The **last step** uses the flow's **customizable `endCta`** (creator sets label + a
drift/picdrift target; default "Start your free trial"). The step's **custom** button goes in
`ctaSecondary` — the builder offers **both** a picker of the creator's own drifts AND free
entry of a drift/picdrift URL. Build drift URLs like the share-card route
(`/{brandSlug}/{slug}` or `/p/{id}`). Do the whole regenerate in one transaction.

**Field restriction for creators** (new `applyFlowStepPatch`, a whitelist subset of
`applyProductPatch`): allow `title`, `titleEnd`(headline), `description`, `background`, and a
**validated** custom CTA — `url` must resolve to a **drift or picdrift.com** target (reuse
`resolveDriftTarget` logic server-side; reject external). Do NOT expose the full superadmin
field set. `ctaPrimary` (the Next link) is system-managed, not user-editable.

**Public read:** `GET /api/drift/public/flows/:kind/:slug` (or reuse the per-product public
payload + the entry drift). Playback needs nothing new — the entry step's drift URL + auto
CTAs drive the existing player.

## 4. Auth & creator account (Phase 3)

**Supabase setup (dashboard, no code):** enable **Google** provider; turn **Confirm email**
ON; set **custom SMTP** to `web@drift.li`. (These are user/ops steps — document them.)

**Frontend:**
- `frontend/src/lib/supabase.ts` — add `{ auth: { flowType: 'pkce', detectSessionInUrl: true } }`.
- **Google:** `supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: origin+'/auth/callback' }})`.
  Add a new **`/auth/callback`** route (none exists) that finalizes the session then routes to
  the creator home. Add a "Continue with Google" button to the tour signup UI.
- **Manual signup:** clone `pages/ByokLanding.tsx` `handleAuth()` — `supabase.auth.signUp`,
  handle the "no session → confirm your email" branch with a polished "check your inbox" state.
- New signup/onboarding screens live on `.d-*`; entry from the landing CTAs (Phase 6).

**Backend provisioning:** on first authenticated call, `AuthService.validateSession`
auto-creates a `User`. Extend so a **TOUR** signup provisions a **personal Organization**
(`maxFlows=1`, `tenantPlan="PAID"` or a FREE marker; product-line marker — see §14) + the `User`
(`role:"ADMIN"`, `view:"TOUR"`, `organizationId`=that org). Patch `toProfileOption()` +
canonical-domain logic to handle `DRIFT`/`TOUR` (today it silently falls back to VisionLight).
Add a `view==="TOUR"` branch in `App.tsx AppEntry` → the creator home.

## 5. Frontend — creator home/profile (Phase 4)

- Route `/tour` (add **before** the `/:brandSlug` catch-alls) behind a protected gate.
- A personalized **home**: their tours as a gallery of "maps", a prominent **Create a Tour**
  button, the **Demo tour** card (client-seeded, read-only, hide-able), plan/usage (1/1 free),
  upgrade CTA. Studio/SaaS vibe on `.d-*`, mobile-first.

## 6. Frontend — tour builder wizard (Phase 5)

- **Create a Tour** → a mobile-first wizard. 3 ordered **slots** (marked/numbered). Per slot:
  video upload (≤5s clip; validate duration client-side), Title, Headline, custom button
  (drift/picdrift link picker — ideally a dropdown of the creator's own drifts, not free text),
  bg color. Desktop: live **side preview** + the **tour map** (steps as a vertical layout).
- On upload: progress bar (`onUploadProgress`) → "server building" → poll status → step flips
  to **Ready**. Each ready step appears on the side map.
- **Reorder** steps (drag) → calls the reorder endpoint → auto-relink. 4th slot / 2nd tour →
  upgrade prompt.
- Keep the field set tiny (Title, Headline, Button, Bg) per the spec; add only if needed.

## 7. Landing intro + demo flow (Phase 6)

- In `DriftLanding.tsx`, add a new `.dl-*` **section** introducing the four variants
  (tour/view/memory/path) — creative, organized, SaaS feel. Two CTAs: **View Demo** |
  **Start Your Free Trial** (both → signup).
- **View Demo:** signup → land **inside the demo tour** (the client-seeded `DriftTour
  isDemo=true`, played via the normal player) with periodic "Start free trial" CTAs → ends at
  the creator home. Decide entry: a dedicated `/tour/demo` that loads the demo tour's entry drift.

## 8. Emails (Phase 7) — reuse `mail.ts`

- **To client** (`ADMIN_EMAILS` / a configured address): on new creator signup, on tour
  created/published. New `sendMail` templates via `renderEmail`.
- **User nurturing:** welcome on signup, "you created your first tour", "upgrade to build
  more". Trigger from the relevant endpoints (fire-and-forget) or a lightweight scheduler.
- Auth confirm/reset emails come from **Supabase** (its SMTP = web@drift.li), not `mail.ts`.

## 9. Analytics (later)

Per-step tracking reuses `DriftEvent` (VIEW/CTA_CLICK) already logged by the player; add a
tour-scoped rollup (drop-off per step, step click counts) keyed by product→stop.

## 10. Admin-panel mobile-first pass (Phase 8, parallelizable)

Root cause: `adminUi.tablePanel` is `overflow-hidden` with tables that have no inner
`overflow-x-auto` → clipped/unreachable on mobile. Fix:
- Add a reusable responsive-table wrapper (or change `tablePanel` to allow inner scroll) and
  apply to every unwrapped table.
- Worst offenders: `SuperAdminDashboard.tsx` — Subscription Management table (~:1968, clipped),
  All Platform Users (~:2156, `min-w-[900px]`), BYOK tables (:2292/:2449/:2506); `AdminDashboard.tsx`
  ~:1036 (no wrapper); `DriftAnalytics.tsx` `.d-table` (no wrapper).
- Give the Users + Subscription tables a stacked/card breakpoint on mobile.
- The `.d-*` drift dashboards are already mostly responsive — use them as the template.

---

## 11. Phasing (each shippable)

1. **P1 Data model** — ✅ shipped 2026-09-08: `DriftFlow`/`DriftFlowStep`, `Organization.maxFlows`
   /`maxStepsPerFlow`/`maxClipSeconds` (see §2 for the rollout order).
2. **P2 Creator API** — tour CRUD, clip upload (brand-scoped `processClip`), reorder+auto-link,
   quota gate, field-restricted patch, public read.
3. **P3 Auth** — Supabase Google + manual+verify (dashboard setup), `/auth/callback`, TOUR
   provisioning, `toProfileOption`/`AppEntry` branches.
4. **P4 Creator home** — `/tour` route + home/profile + demo card + usage/upgrade.
5. **P5 Builder** — the 3-slot wizard, upload/progress/poll, side map, reorder UI.
6. **P6 Landing + demo** — the intro section + View Demo flow.
7. **P7 Emails** — client notifications + nurturing.
8. **P8 Mobile pass** — admin-panel responsive fixes (parallel).
9. **Later:** Stripe (flip the quota gate to paid), analytics rollup, `/view` `/memory` `/path`.

## 12. Edge cases & watch-outs

- **Processing = concurrency 1, in-memory** (restart drops the queue → recovered to FAILED).
  Self-serve volume will need a durable queue (Redis/DB-backed) + retry + a real FAILED UX
  with re-upload. Flag before launch scale.
- **Clip ≤5s**: validate duration client-side (and server-side via ffprobe) before processing.
- **180 frames** per clip is heavier than the 48 default — watch VPS CPU/time (5-min ffmpeg cap).
- **Storage**: drift media is NOT currently counted by `storageQuota` — decide if creators'
  storage is metered.
- **CTA validation**: creators' custom links must be server-validated to drift/picdrift only.
- **Reorder atomicity**: reorder + relink should be one transaction so links never half-update.
- **Demo tour**: read-only for users; ensure they can't edit/delete it; "hide" is per-user state.
- **`toProfileOption` DRIFT/TOUR gap**: multi-profile emails currently mis-route DRIFT to the
  VisionLight domain — patch when adding TOUR.
- **Google OAuth redirect**: register `/auth/callback` in Supabase allowed redirect URLs.

## 13. Setup dependencies (user/ops)

- Supabase dashboard: enable Google provider (+ Google Cloud OAuth client), turn on Confirm
  email, set custom SMTP = web@drift.li, add `/auth/callback` to redirect allowlist.
- VPS: `npx prisma db push` after each schema phase; the email env (already pending).
- Stripe account (later).

## 14. Open questions

Resolved 2026-09-08 (see §0.1): URL `/{kind}/{slug}`; last-step = customizable `endCta`;
custom button = picker **and** drift/picdrift URL; the four variants defined; the shared
`DriftFlow` model reflects all of it.

Still open (decide before/at execution):
- **Creator org marker — DECIDED 2026-09-08:** Tour is a separate product line from Drift
  (the brand/superadmin platform), same pattern as ROTATION3D vs DRIFT → creators get their
  own `productLine` (`"TOUR"`; rename to e.g. `"CREATOR"` at P3 if the four kinds are
  siblings rather than one "Tour" umbrella). Verified impact: the public player route behind
  `/p/{id}` has NO product-line filter, so tour steps play unchanged; only the two public
  brand-slug lookups (`/api/drift/public/b/:brandSlug[/:productSlug]`) are DRIFT-only and tour
  steps don't need them; every superadmin brand route is DRIFT-only, which correctly keeps
  creators out of the brand admin/landing. No extra column needed.
- Does creator storage count against a quota? (drift media isn't metered today.)
- Free-tier defaults: exactly `maxFlows=1`, `maxStepsPerFlow=3` — per-kind, or global?
- `/path` FORM/PAGE steps + the `DriftPage` builder — design when `/path` starts (post-Tour).
