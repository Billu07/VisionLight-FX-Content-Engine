# drift.li Tour v2 — client batch (2026-09-14)

Source: the client's update list + reference screenshots `tour_ref.png`, `tour_player_ref.png`,
`player_ref2.png`, `ref3.png`, `ref4.png`, `ref5.png` (repo root, untracked). Builds on
TOUR_PLAN.md (v1, P1–P8 shipped). Drift side only — nothing here touches the studio.

## 1. The brief, condensed

**Accounts.** Signup asks: **General** (Realtors, Brands, Venues) or **Pro** (Photographers /
Videographers). A Pro can create a General page for a client and manage it. A General page can
**Invite a Pro**.

**Pages & links.**
- A page (profile) is both the admin and the public view. Admin extras are hidden from visitors.
- Every tour's main link is its **pathway menu**: logo/page name, tour title, a **Start Tour**
  button above #1, the drifts as strips on a straight line (tap any strip to open that drift),
  a **Contact** button (default "Contact PicDrift", page admins can set label + link). No preview
  panel on the public view.
- Every drift in a tour has exactly two buttons: **Home** (left, back to the pathway) and the
  **next drift's name** (right). The last drift's right button is drift #1 (tours loop, never end).
- Player address bar shows readable slugs, not ids.

**Page admin.**
- "Your tours" → **Featured Tours**; admins can **hide** a tour → a **Hidden tours** section only
  admins see. Card view / **Path view** (tours as strips on a straight connecting line).
- **View Demo** button (the superadmin's demo by default; a page can set its own).
- "Talk to us about more tours" → **Contact PicDrift** (label + link editable by page admins).
- "Upgrade" → **Create New Tour** → batch upload clips → **checkout before processing**.
- At the bottom of the admin pathway: **+ Add to Tour** ($6.50 each, checkout) and
  **+ Create New Tour**.

**Pricing (Stripe).** $6.50 per drift. No packages, no minimum, no subscription. Conversion +
1 year of hosting included; reactivate for another year.

**Builder (ref4, ref5).** Default names Drift 1/2/3; pencil icon beside the name; remove
Headline, Button label/link, Button positions, Loop and the auto-link text; "Save Drift" (never
"stop"); straight lines. Tour settings: cover = Start / Middle / End frame of the first drift or
an upload; remove the Next-label field and the last-stop button; keep Description.

**Player (tour_player_ref, player_ref2, ref3).** Top-left: logo, page name, tour name, drift
name. Progress dots top-middle. Remove the reset button. Hand sits on the frame's bottom corner
(it had drifted to the top of the frame on brand drifts). Tour drifts' helper = hand icon + arrow
(no "Drag to drift" text). Remove the end-of-tour popup.

**Brand.** "Drift Link Interactive" → **"Drift Live Interactive"**. The powered-by line sits at
the bottom with **Terms · Privacy under it on every drift**; tours read "Tour Powered by …",
views "View Powered by …".

**Superadmin.** drift.li tab gets a **Tour** sub-tab: manage tour pages/users, open their
dashboards, set up the public demo tour. The superadmin's tour account has no clip limit.

**Marketing.** New `/tour` landing and new drift.li home, copy supplied verbatim by the client
(kept in §6). Hero animations use straight, horizontal lines.

## 2. Decisions taken (assumptions — confirm or redirect)

1. **URLs.** `/tour/{page}` (page), `/tour/{page}/{tour}` (pathway), `/tour/{page}/{tour}/{drift}`
   (player). The client's text said `drift.li/{page}/tour`; their screenshots use
   `/tour/{page}/{tour}`, which is also collision-free with brand vanity URLs. `drift.li/{page}/tour`
   redirects to `/tour/{page}`. Legacy `/tour/{slug}`, `/tour/:id/edit` and `/p/{id}` for tour
   drifts keep working (redirect / resolve).
2. **Drift URL segment** is derived from the drift's name, unique within its tour, so renaming
   "Drift 1" → "Porch" gives `/…/porch` with no slug bookkeeping.
3. **Free trial** = each page's first **3 drifts** are free (today's free tour). Every drift after
   that is $6.50 and is uploaded first, processed only after Stripe confirms payment.
   Superadmin: unlimited, free, no clip-length limit.
4. **Hosting year**: `paidAt` + `hostingExpiresAt` recorded from day one; expiry + "reactivate"
   enforcement is a later phase (nothing expires before then).
5. **Buttons**: left Home → pathway, right → next drift's name; last → drift #1; a one-drift tour
   shows Home only. Button placement is fixed for tours (the control is removed).
6. **Legal text**: the Terms/Privacy bodies are a published agreement and stay verbatim; only the
   page chrome is renamed.
7. **drift.li home**: the superadmin "Set as landing" drift becomes the live, draggable drift in
   the new home hero ("You Control the Movement"). The gallery reel is retired on drift.li; brand
   custom domains keep their full-screen takeover.
8. **Pro ↔ client pages** reuse multi-profile: a Pro gets an ADMIN profile inside each client page
   (the workspace switcher already handles several profiles). Invites are emailed links.
9. **Invite links belong to whoever holds them** (one use, 14 days): the accepting account's email
   isn't required to match the invited email, so a Pro can join with a different login than the one
   they were invited at. Tighten to "email must match" if the client prefers.
10. **Free drifts count live drifts**: deleting a free drift frees its slot again, so a page never
    has more than `freeDrifts` free drifts at once (rather than "the first 3 ever").
11. **Pro is self-serve but not a loophole** (2026-09-14): anyone may pick Pro at signup (the client's
    two-layer signup), but the type is then fixed — only a superadmin changes it (Admin → drift.li →
    Tour); page settings show it read-only. Client pages start with `freeDrifts = 0` (the trial is the
    Pro's own page; client work is paid per drift). Optional later: superadmin approval before a Pro
    can create client pages.

## 3. Phases

- [x] **P1 — Player & brand polish (no schema).** Rename; Terms/Privacy under the powered line on
  every drift; "Tour Powered by"; remove reset; hand at the frame's bottom corner (fix the height
  feedback loop); tour icon cue; remove the end-of-tour popup; dots top-middle; tour title lines;
  "Drift" instead of "Stop"; signup copy.
- [x] **P2 — Pages & pathways (schema push #1, all v2 columns at once).** Slug URLs + public
  endpoints; Home/next-drift relink; player routes + in-app swaps; public pathway page; admin
  pathway = simplified builder (ref4/ref5); page at `/tour/{page}` with Featured/Hidden, Card/Path,
  View Demo, editable Contact; legacy redirects.
- [x] **P3 — Stripe.** Batch upload → pending clips → Checkout ($6.50 × drifts) → webhook +
  return-page confirm → processing. + Add to Tour, + Create New Tour. Free allowance, superadmin
  bypass, receipts in the order table.
- [x] **P4 — General / Pro.** Signup choice; Pro "Client pages" (create + manage); Invite a Pro
  (emailed link → ADMIN profile on accept).
- [x] **P5 — Superadmin Tour tab.** Pages, owners, tours, drifts, payments; open any page as admin;
  demo tour picker (exclusive); per-page limits; wait list.
- [x] **P6 — Marketing.** New `/tour` landing; new drift.li home (Login/Dashboard top right, live
  hero drift, Tour/View/Memory/Path, wait list modal); straight horizontal hero routes.

## 4. Schema (lands with P2 — ONE `prisma db push`, additive only)

- `Organization`: `tourAccountType String?` (GENERAL | PRO), `managedByOrgId String?`,
  `tourSettings Json?` ({ contactLabel, contactUrl, demoFlowId }), `freeDrifts Int @default(3)`.
- `DriftFlow`: `hidden Boolean @default(false)`.
- `DriftProduct`: `billingStatus String @default("FREE")` (FREE | AWAITING_PAYMENT | PAID | COMP),
  `pendingVideoUrl String?`, `pendingFrameCount Int?`, `orderId String?`, `paidAt DateTime?`,
  `hostingExpiresAt DateTime?`.
- `DriftTourOrder` (Stripe checkout): org, user, flow, quantity, unit/total cents, currency,
  status, `stripeSessionId @unique`, paymentIntent, timestamps.
- `DriftTourInvite`: org, email, token `@unique`, invitedBy, status, timestamps.
- `DriftWaitlist`: email, product (VIEW | MEMORY | PATH), `@@unique([email, product])`.

## 5. Ops owed (one deploy covers P1–P6)

1. VPS: `git pull --ff-only origin main` → `cd backend && npx prisma db push --skip-generate` (additive)
   → `npm ci` (new `stripe` dependency) → `npm run build` → `pm2 restart my-backend --update-env` →
   `cd ../frontend && npm ci && npm run build`.
2. Stripe (payments stay off until this is done — uploads past the free drifts are kept, checkout says
   "not switched on yet"): VPS env `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (+ optional
   `TOUR_DRIFT_PRICE_CENTS=650`, `TOUR_CURRENCY=usd`, `DRIFT_APP_URL=https://drift.li`); in Stripe add a
   webhook endpoint `https://<api host>/api/drift/billing/webhook` for `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `checkout.session.expired`; restart with `--update-env`.
   Admin → drift.li → Tour shows "Checkout on · $6.50 / drift" when both keys are set.
3. Demo tour: build + publish it on the superadmin's own tour page, then Admin → drift.li → Tour →
   Demo tour → "Use as demo".
4. Saved email-template overrides keep their old "Drift Link" wording — re-save them in Admin → Emails.
5. Landing hero: the drift.li home's live hero is the "Set as landing" drift (Admin → drift.li → Brands
   → ★ Set as landing, or the Landing showcase "Make hero"); the showcase list itself no longer shows.

## 6. Client copy (verbatim)

### /tour landing
```
Drift Tour
Show Any Space
Turn a 3-second video into a Live Interactive. Connect them and create a Tour.
Natural 180° Views
Real Estate | Venues | Any Location
[ Try it Free ] [Take a Tour ]

3-Second Capture
Take a pan or tilt video of each space
Upload it. We turn it into a Drift in minutes.
Capture → Upload → Explore
[ Try it Free ]

Phone or Camera
No 360 equipment.
No scanning equipment.
No complicated software.
If you can take a video, you can create a Drift Tour in minutes.
Real Views
Natural 180° motion that feels like looking from side to side.
Real rooms. Real details. Real spaces.
No AI-generated rooms.
Show the space as it really is.
One Link
Share it anywhere.
Listing · Website · Text · Email · Social · QR · Ads
Your Tour goes wherever your viewers are.
Your Brand
Add your logo, property details, contact information and calls to action.
Simple Pricing
Build a Tour of any size.
$6.50 per Drift
No packages.
No minimum.
No subscription.
Conversion + 1 year of hosting included.
Reactivate for another year if you need it.
[ Try it Free ]

Invite a Pro
Professional Capture
Your photographer or videographer can create a Drift Tour using their existing equipment and skills.
Are you a Photographer or Videographer?
Get set up in minutes and start offering Drift Tours to your clients.
[ Try it Free ] [Take a Tour]

Ready for Tour?
[ Try it Free ] [Take a Tour]
TOUR · Powered by Drift Live Interactive
```

### Signup copy
`Start Free` → `Try It Free` · `Your Name` → `Your Page Name` (placeholder: your name or business
name) · `Create my free account` → `Create My Free Account`.

### drift.li home
```
Login / Dashboard (top right; logged in → Dashboard (tour), others later)
drift.li
Drift Live Interactive
You Control the Movement.
Turn a few seconds of video into a Live Interactive you can explore.
Tour · View · Memory · Path
[Explore Drift Tour ]
Tour
Show Any Space
Turn a 3-second video into a Live Interactive Tour.
No 360 equipment. No complicated software.
Real Estate · Venues · Any Location
Available Now
[ Try it Free ] [ Learn More ]
View
Share What You See
Turn a few seconds of a real place or moment into an Interactive View.
Sunsets · Cities · Cafés · Nature · Events
See the world through someone else's eyes.
Coming Soon
[ Join Wait List ]
Memory
Keep the Moments That Matter
Turn a few seconds of life into something you can return to and explore.
Family · Friends · Places · Milestones · Everyday Life
Private. Yours to remember.
Coming Soon
[ Join Wait List ]
Path
Connect the Experience
Connect Drifts, images, video, information and links into an Interactive Path.
Tell a story. Explain a process. Guide someone step by step.
Coming Soon
[ Join Wait List ]
A New Way to Explore
Tour · View · Memory · Path
[ Try Drift Tour ]
drift.li
Drift Live Interactive
Terms · Privacy
Drift.li is a division of PicDrift
```

## 7. Log

- 2026-09-14 — plan written.
- 2026-09-14 — P1 shipped: "Drift Live Interactive" everywhere except the verbatim legal bodies;
  Terms · Privacy under the powered line on every drift (player defaults `/terms` `/privacy`),
  "Tour Powered by" on flow drifts; reset button removed on drifts; helper hand fixed (the clamp
  used the column's offsetHeight, which includes the cue's JS margin → feedback loop pinned the hand
  to the frame top) and parked on the frame's bottom corner; tour drifts get a hand-icon + arrow cue;
  end-of-tour card removed; progress dots top-middle (top-right on phones); title block page · tour
  · drift; default step names "Drift N"; signup copy.
- 2026-09-14 — P2 shipped (needs the one `db push`): all v2 columns/models in schema.prisma.
  URLs: `/tour/{page}` (TourPage — Featured/Hidden Tours, Cards/Path, View Demo, Contact, page
  settings incl. logo), `/tour/{page}/{tour}` (TourPathway — public strips + Start Tour; admins get
  TourBuilder there, with "Public view"), `/tour/{page}/{tour}/{drift}` (Rotation3DPlayer; `/p/{id}`
  for a tour drift swaps its address to the readable one). Drift segments come from names
  (`stepDriftSlugs`, unique per flow). `relinkFlow` = Home (→ pathway) + next drift's name, last →
  #1, placement CENTER; writes only on change and `relinkAllFlows()` runs at boot. An unpublished
  tour's slug follows its name. Page endpoints: `GET/PATCH /api/drift/my/page`, `POST
  /api/drift/my/page/logo`, `GET /api/drift/public/pages/:page`, `…/flows/:slug`,
  `…/flows/:flow/drifts/:drift`. Superadmins: no clip limit; `X-Drift-Org` lets them act on any
  TOUR page ("Manage this page"). Builder per ref4/ref5 (no headline/buttons/placement/loop; Save
  Drift; pencil rename; straight rail; cover = start/middle/end of drift 1 or upload). Legacy
  `/tour/:id/edit`, `/tour/{old-slug}`, `/tour/demo` resolve; `drift.li/{page}/tour` redirects.
- 2026-09-14 — P3 shipped (backend `npm ci` — new `stripe` dep): `services/driftBilling.ts`. Billing is
  decided in `createDriftStep` under the org lock: COMP (superadmin) / FREE (while
  `Organization.freeDrifts` last, counted over flow drifts billed FREE) / AWAITING_PAYMENT (clip stored
  via `storePendingClip`, product status `AWAITING_PAYMENT`, not processed). `POST
  /api/drift/my/flows/:id/checkout` (one open session per tour — older ones expired), `POST
  /api/drift/my/checkout/confirm` (return page) and `POST /api/drift/billing/webhook` (raw body, mounted
  before express.json) share an idempotent, row-locked `fulfillSession` → PAID + hostingExpiresAt +1y →
  fetch the stored clip → `processClip`. Tours are unlimited (maxFlows no longer gates; 60-drift cap).
  relink only links READY drifts and re-runs when a drift turns READY. Builder: multi-file upload, free /
  price note, checkout bar, Stripe return confirm. Templates `tour.order.paid.creator` / `.notice`.
- 2026-09-14 — P4 shipped: `services/driftTourAccounts.ts`. Signup chooses General / Pro
  (`?type=pro`; invite links default to Pro; remembered across email confirm / Google) →
  `Organization.tourAccountType`. Pro pages: "Client Pages" on their page (`GET/POST
  /api/drift/my/client-pages` → a GENERAL org with `managedByOrgId` + an ADMIN profile for the Pro).
  General pages: "Invite a Pro" in page settings (`/api/drift/my/page/invites` → one-time 14-day link
  `/tour/invite/{token}` → `TourInviteAccept` → `POST /api/drift/creator/invites/:token/accept`, which
  adds an ADMIN profile and records the managing Pro). Admin note shows "Managed by …". Page slugs now
  also reserve start/invite/new/edit/login/signup. Templates `tour.pro.invite`, `tour.pro.joined`.
- 2026-09-14 — P5 shipped: `routes/driftTourAdmin.ts` (superadmin) + `rotation3d/DriftTourAdmin.tsx` as
  the "Tour" tab of the drift.li admin panel — Pages (search, detail with limits / tours / people /
  client pages / orders, "Open page" → Manage this page), Demo tour (exclusive `isDemo` picker),
  Orders, Wait list (copy emails). Status pill for Stripe + webhook config.
- 2026-09-14 — P6 shipped: drift.li "/" = `rotation3d/DriftHome.tsx` (client copy; the landing drift is a
  live draggable hero, fallback art otherwise; Tour card + View/Memory/Path wait list dialogs → `POST
  /api/drift/public/waitlist`, team email `waitlist.join.notice`; Login → Dashboard when signed in).
  Brand custom domains keep `HeroLanding` (`BrandDomainLanding` in DriftLanding.tsx); the gallery reel
  code is gone. `/tour` = `tour/TourLanding.tsx` for visitors (creators still go to their page;
  `/tour?view=landing` forces it). Hero routes are straight and horizontal (`PathArtH`, optional labels).
- 2026-09-14 — Post-P6 fixes. Relink when a tour drift FAILS or starts rebuilding (neighbours skip it
  instead of linking a 404); admin Tour tab links open on drift.li. From an independent review of
  billing/auth/invites (no unpaid-processing path found; webhook/confirm and free-count races clean):
  checkout is serialized per tour and, when an older session can't be expired, looks it up — paid →
  fulfilled on the spot (`ALREADY_PAID`), still clearing → 409 `CHECKOUT_IN_PROGRESS` — so nobody pays
  twice; paid drifts cut off by a restart are resumed from their stored clip at boot
  (`resumePaidDrifts`, excluded from `recoverOrphanedDriftJobs`), and the clip download retries;
  invites are claimed atomically (one use; expired links change nothing for existing members); a clip
  replaced while its checkout completes keeps the paid clip (409); the generic product PATCH ignores
  `publish` on flow drifts; a superadmin creating a client page from "Manage this page" gives the
  ADMIN profiles to the Pro page's admins; wait-list double-submits and two-tab uploads no longer 500.
  An order paid for drifts deleted meanwhile logs "review for a refund" (`pm2 logs | grep refund`).
- 2026-09-14 — Signup screen is just the wizard (left pitch panel removed); logging out of a tour page
  lands on `/tour`. Pro can no longer be switched on from page settings (PATCH `/api/drift/my/page`
  refuses a type change unless superadmin; settings show it read-only) and client pages are created with
  `freeDrifts = 0` — decision §2.11.
- 2026-09-14 — Tour performance pass. Root cause of the lag on phones: the player dropped
  `manifest.framesMobile`, so every drift downloaded and decoded 180 full 2048px frames. Now: mobile frame
  set on phones (player + drift.li home heroes), polite neighbour warming (idle, bounded, low priority,
  device set, data-saver aware), pathway prefetch of Start Tour / strips, canvas-to-canvas crossfade (no
  `toDataURL`), route-level code splitting (first load 634 KB → ~196 KB gzipped JS for a drift; the
  builder is admin-only), vendor chunks, `font-display: swap`, mobile-frame thumbnails, immutable
  Cache-Control on new frame/cover/logo/thumbnail uploads. Ops: nginx gzip/brotli + long cache for
  `/assets/*`; existing R2 frames need a Cloudflare cache rule (they were uploaded without Cache-Control).
- 2026-09-14 — drift.li home redesign from the client's `land.png`: the draggable hero drift is replaced by a
  visual "live view" (five frames of the landing drift in perspective with an orbit, horizon and grid; glow
  in dark theme only, flat in light), "Drag to explore" opens the live drift, four even product cards, closing
  "Try Drift Tour" kept. All copy and CTAs unchanged (Tour: Try it Free + Learn More; View/Memory/Path: Join
  Wait List) — the client wants the original content kept on the new design.
- 2026-09-14 — Home live view shows the demo tour instead of the landing drift (stops in perspective, the
  centre stepping through the first three stops, tour + stop name chip, "Take a Tour" starts the tour
  with drift #1 + player prefetched on intent — renamed from "Drag to explore", misleading on a visual you
  can't drag); headline on exactly two lines on desktop.
- 2026-09-15 — /tour landing restyled to match the home: the route animation now rides the home's perspective
  grid (shared `rotation3d/PerspectiveGrid`) under a horizon glow; spaced kickers with a dot, pill CTAs (arrow on
  Try it Free), the capture steps as glowing nodes on a horizon line, glass cards / price / Pro / closing in
  dark (flat in light). Copy and CTAs unchanged. TourShell header/background left for a later pass.
- 2026-09-15 — Home live view loses its boxed frame: the demo tour's cards stand on the grid floor — the back
  row angled and receding to the horizon, the centre card forward (out of the screen) floating over its
  shadow with a faint reflection, an orbit ring around its base. Labels float over the scene. Copy unchanged.
- 2026-09-15 — Home cards stand upright (no tilt — depth from distance only). New coming-soon landings at
  `/view`, `/memory`, `/path` on a shared site kit (`rotation3d/driftSite.tsx`, which the home now uses for its
  header/footer/wait list): same aesthetic, each with its own accent, layout and animated scene; Join Wait List +
  Try Drift Tour. The home's coming-soon cards still only open the wait list (not linked to the landings yet).
- 2026-09-15 — Client feedback: (1) tour drifts reveal only when every frame is loaded (20s fallback) and the
  player holds a "foreground lease" so the next drift warms its whole frame set (6 at a time) right after the
  current one completes; the pathway's Start Tour warms all of drift #1; desktop tour drifts start one zoom step
  (×1.25) bigger. (2) The tutorial hand hides the instant the screen is touched (inline opacity reset) and a touch
  before the demo cancels it. (3) `/tour` is always the landing; `/tour/dashboard` opens the creator's page
  (Dashboard button top right of the tour header, post-login target, /app + /projects for tour users, drift.li
  home). Backend reserves `dashboard` and `capture-guide` page slugs. (4) Drift Capture Guide (client copy
  verbatim, `tour/CaptureGuide.tsx`): inline in the builder while a tour is empty, a sheet the first time + from
  the builder's "Capture Guide" button, and a page at `/tour/capture-guide`.
- 2026-09-15 — Builder UX: clips queue — pick/drop more any time (even mid-upload), they upload in order
  (a plan-limit error stops the queue with one message; leaving mid-upload asks first); "+ Create New Tour"
  moved from under the slot to the top row ("+ New Tour" beside the back link); the inline Capture Guide is
  gone — the header button is first and Spotify green. The home
  no longer downloads the player.
