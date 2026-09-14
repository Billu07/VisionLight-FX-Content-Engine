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

## 3. Phases

- [x] **P1 — Player & brand polish (no schema).** Rename; Terms/Privacy under the powered line on
  every drift; "Tour Powered by"; remove reset; hand at the frame's bottom corner (fix the height
  feedback loop); tour icon cue; remove the end-of-tour popup; dots top-middle; tour title lines;
  "Drift" instead of "Stop"; signup copy.
- [x] **P2 — Pages & pathways (schema push #1, all v2 columns at once).** Slug URLs + public
  endpoints; Home/next-drift relink; player routes + in-app swaps; public pathway page; admin
  pathway = simplified builder (ref4/ref5); page at `/tour/{page}` with Featured/Hidden, Card/Path,
  View Demo, editable Contact; legacy redirects.
- [ ] **P3 — Stripe.** Batch upload → pending clips → Checkout ($6.50 × drifts) → webhook +
  return-page confirm → processing. + Add to Tour, + Create New Tour. Free allowance, superadmin
  bypass, receipts in the order table.
- [ ] **P4 — General / Pro.** Signup choice; Pro "Client pages" (create + manage); Invite a Pro
  (emailed link → ADMIN profile on accept).
- [ ] **P5 — Superadmin Tour tab.** Pages, owners, tours, drifts, payments; open any page as admin;
  demo tour picker (exclusive); per-page limits; wait list.
- [ ] **P6 — Marketing.** New `/tour` landing; new drift.li home (Login/Dashboard top right, live
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

## 5. Ops owed (as phases land)

- P2: `npx prisma db push --skip-generate` (pull → push → build → restart).
- P3: Stripe account → VPS env `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  (+ optional `TOUR_DRIFT_PRICE_CENTS=650`, `TOUR_CURRENCY=usd`); webhook endpoint
  `https://<api host>/api/drift/billing/webhook` for `checkout.session.completed`; backend `npm ci`
  (new `stripe` dependency).
- Saved email-template overrides keep their old "Drift Link" wording — re-save them in Admin → Emails.

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
