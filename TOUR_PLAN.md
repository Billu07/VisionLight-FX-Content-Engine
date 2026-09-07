# TOUR_PLAN.md — drift.li/tour build plan

Execution-ready plan for the self-serve **Tour** creator on drift.li. Written to be
picked up phase-by-phase (incl. by Fable 5 sessions). Read `CLAUDE.md` first for repo
conventions, deploy flow, and the drift engine overview.

Status: **planning complete, not started.** Grounded in a full recon of the existing
engine + auth (2026-09-08).

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
- **Tour = new grouping model.** No collection concept exists today (drifts connect only via
  hand-pasted CTA URLs). Add `DriftTour` + ordered `DriftTourStop`; the linear "Next" button
  on each step is **auto-generated from stop order** (that is the "auto-relink on reorder").
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
1. `DriftTour` + `DriftTourStop` models + `Organization.maxTours` (Phase 1).
2. Brand/creator-scoped clip-upload + tour CRUD/reorder API under `/api/drift/my/tours/*`
   (today video upload is **superadmin-only** — this is the main new backend surface) (P2).
3. Self-serve signup: Google OAuth (net-new) + manual signup w/ email verify; TOUR account
   provisioning (P3).
4. Creator home/profile + tour builder wizard + the tour "map" (P4–P5).
5. drift.li landing intro section for tour/view/memory/path + demo flow (P6).
6. App + client-notification emails + nurturing (P7).
7. Admin-panel mobile-first pass (P8, can run in parallel).

---

## 2. Data model (Phase 1)

Add to `backend/prisma/schema.prisma`:

```prisma
model DriftTour {
  id             String   @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  slug           String   // /tour/{slug} or /{creatorSlug}/{tourSlug}
  name           String
  title          String?
  description    String?
  status         String   @default("DRAFT") // DRAFT | PUBLISHED | ARCHIVED
  isDemo         Boolean  @default(false)    // the client-seeded demo tour
  coverUrl       String?
  order          Int      @default(0)        // creators can order their tours
  createdByUserId String?
  stops          DriftTourStop[]
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@unique([organizationId, slug])
}

model DriftTourStop {
  id        String @id @default(uuid())
  tourId    String
  tour      DriftTour @relation(fields: [tourId], references: [id], onDelete: Cascade)
  productId String    // the DriftProduct (the drift for this step)
  product   DriftProduct @relation(fields: [productId], references: [id], onDelete: Cascade)
  order     Int       // 0-based position in the tour
  createdAt DateTime  @default(now())
  @@unique([tourId, productId])
  @@index([tourId, order])
}
```

- Add `tours DriftTour[]` + `tourStops`… relations to `Organization` and `DriftProduct`.
- Add `Organization.maxTours Int @default(1)` (free tier) and (optional) `maxStopsPerTour
  Int @default(3)`.
- **Deploy:** no migration files in this repo → run **`npx prisma db push` on the VPS**
  after deploy (see CLAUDE.md). Flag this to the user every schema change.

## 3. Backend API (Phase 2) — `backend/src/routes/drift.ts`

All under `authenticateToken` (NOT `requireSuperAdmin`), scoped to `req.user.organizationId`
via the existing `requireOrg()`. Reserve `tour`,`view`,`memory`,`path` in `RESERVED_SLUGS`.

- `GET  /api/drift/my/tours` — list the creator's tours (+ stop counts, statuses).
- `POST /api/drift/my/tours` — create a tour. **Quota gate:** `count(tours) >= org.maxTours`
  → `402/403 { upgrade: true }`. Fires client-notify email.
- `GET/PATCH/DELETE /api/drift/my/tours/:id` — read/edit/delete (org-checked).
- `POST /api/drift/my/tours/:id/stops` — **the clip upload.** `videoUpload.single("video")`
  (reuse the 500MB disk multer). Body: title/headline/bgColor/customCta. Quota:
  `stops >= org.maxStopsPerTour` → upgrade. Flow: create `DriftProduct{status:PROCESSING,
  frameCount:180}` scoped to the creator org → create `DriftTourStop{order:last+1}` →
  respond `201` → async `processClip({clip:"A", frameCount:180, ...})` (reuse verbatim) →
  regenerate step links (below). Client polls product `status` for READY (same as today).
- `PATCH /api/drift/my/tours/:id/stops/reorder` — body `stopIds[]` in new order → update
  `order` → **regenerate the auto "Next" CTA** on every step.
- `PATCH /api/drift/my/tours/:id/stops/:stopId` — edit that step's drift fields (title,
  headline, bg, the ONE custom CTA) via a **restricted** `applyProductPatch` (see below).
- `DELETE /api/drift/my/tours/:id/stops/:stopId` — remove; re-order + relink remainder.
- `POST /api/drift/my/tours/:id/publish` — set `PUBLISHED`, publish all step products.

**Auto-link logic** (single source of truth = stop order): after any create/reorder/delete,
for each step i, set `product.ctaPrimary = { label: nextLabel, url: <step i+1 drift URL> }`
(last step → a configurable end CTA, e.g. "Start free trial" or loop to start). The step's
**custom** button (user-set, drift/picdrift only) goes in `ctaSecondary`. Build drift URLs
the same way the share-card route does (`/{brandSlug}/{slug}` or `/p/{id}`).

**Field restriction for creators** (new `applyTourStopPatch`, a whitelist subset of
`applyProductPatch`): allow `title`, `titleEnd`(headline), `description`, `background`, and a
**validated** custom CTA — `url` must resolve to a **drift or picdrift.com** target (reuse
`resolveDriftTarget` logic server-side; reject external). Do NOT expose the full superadmin
field set. `ctaPrimary` (the Next link) is system-managed, not user-editable.

**Public read:** `GET /api/drift/public/tours/:slug` (or reuse per-product public payload +
the entry drift). Playback needs nothing new — the entry step's drift URL + auto CTAs drive it.

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
(`productLine="TOUR"`, `maxTours=1`, `tenantPlan="PAID"` or a FREE marker) + the `User`
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

1. **P1 Data model** — `DriftTour`/`DriftTourStop`/`maxTours`; `db push`.
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

## 14. Open questions (confirm with user before/at execution)

- Creator vanity URL scheme: `/tour/{tourSlug}` vs `/{creatorSlug}/{tourSlug}` vs `/p/{id}`.
- Last-step "Next" behavior: loop to start, end screen, or a fixed CTA?
- Custom step button: a picker of the creator's own drifts, or allow any drift/picdrift URL?
- What exactly are `/view`, `/memory`, `/path`? (one-liner each to shape the shared foundation).
- Does creator storage count against a quota?
