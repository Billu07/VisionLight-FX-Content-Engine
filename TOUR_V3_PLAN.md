# Tour v3 — the 2026-09-24 client meeting, planned

Source: the Google Meet summary from the Keith + Kazi call (24 Sep 2026). Every "next step"
from that list is below, checked against the code as it stands on `main` (`d78af87`, deployed
and confirmed live). Nothing here is built yet.

> Read the **Findings** line on each item before estimating it. Several items have a different
> cause than the meeting notes assume, and two are already half-done.

---

## What the recon turned up

Facts established by reading the current code, not assumed:

| Claim in the notes | What is actually true |
| --- | --- |
| "Rotation doesn't go fullscreen, gives a button instead" | The auto takeover EXISTS (`updateLandscapeTakeover` → pseudo-fullscreen on rotate). It fires. What it cannot do is hide **iOS Safari's own chrome** — no web page can, for a non-`<video>` element. So it fills the viewport and still looks bordered, and our ⛶ button stays on screen inviting a tap. |
| "Mobile lacks admin/public view icons" | Mine, from the navbar pass: `.t-view svg{display:none}` at ≤460px. One line. |
| "Learn More lands halfway down the page" | There is **no scroll-to-top on route change** anywhere in the app. React Router keeps the scroll offset, so any in-app link from a scrolled page lands mid-page. Affects every link, not just Learn More. |
| "Featured tour doesn't update when the original is edited" | Correct and by design: `saveToChannel` makes a one-way **copy** (own flow, own products, shared R2 frames). There is no sync path at all. This is the one item that needs a real design decision — see Decisions. |
| "Library/Featured badges should be buttons" | The admin channel tab already computes `{ featured, library }` counts; they're rendered as plain text. Small. |
| "Concurrent users get refused" | `ROT3D_PROCESS_CONCURRENCY` defaults to **1** — processing is serial today. Nothing is refused, it queues; but one slow clip blocks everyone. Raising it is an env change; a second box is architecture. |
| "Emails need logo and brand colours" | The shell already uses the cyan accent, but the header is **text**, not the logo. We now have the logo kit (`brand/drift-li/`), so this is straightforward. |
| Tutorial hand appears late | `startIntro` runs 550ms after the loader finishes — and the loader now finishes on the coarse ring, so it is already earlier than it was. Worth re-timing against the deployed build before tuning further. |

---

## A. The player — full screen and how a phone feels

**A1. Rotate to landscape = real full screen. `L`, highest client priority**
_Notes: "as they rotate their phone it should go full landscape mode… now it gives a full screen button instead. In Safari and iOS, browser nav still shows."_
Findings: the takeover fires already; the gap is (a) Safari's chrome can't be removed by us, (b) our ⛶ stays visible so it reads as "you must press this", (c) our own bottom furniture eats the little height there is.
Plan:
1. While the auto takeover is active, hide the ⛶ button — it has nothing left to add.
2. Hide **Terms · Privacy** and the **"Tour Powered by"** banner in the mobile player (the client asked for both). Keep them on desktop and on the pathway, where the legal link still has to live.
3. Make the takeover survive the exit rule: today one tap of "exit" while sideways sets `userExitedLandscape` for the rest of the session, so it never auto-enters again. Reset it when the device returns to portrait.
4. Android/Chrome: request **native** fullscreen on rotate where a user gesture allows it, falling back to the CSS overlay. Real fullscreen there removes the browser bars properly.
5. iOS: document the limit in the UI rather than pretending. Offer **Add to Home Screen** (the manifest is already `display: standalone`) as the chrome-less route, and make sure the layout uses `100svh` + safe areas so Safari's bars never cover a button.
Risk: medium. Needs a real iPhone and a real Android to confirm; headless Chrome cannot tell us.

**A2. Desktop full screen should NOT fill the screen. `M`**
_Notes: "it doesn't have to go all the way fullscreen… the bottom part can be our dark gradient bg for button placement… a bit smaller but bigger than the default screen."_
Findings: this revises what we shipped on 2026-09-23. Today desktop fullscreen goes immersive (chrome floating over the footage).
Plan: in fullscreen on a desktop, keep the **framed** geometry — drift sized larger than the in-page default but with a reserved bottom band carrying the dark gradient and the buttons. Keep tap-to-hide (he likes it) and the top scrim. Effectively: fullscreen = "framed, bigger", not "edge to edge".
Risk: low. It simplifies the immersive branch rather than extending it.

**A3. Tutorial hand sooner. `S`**
Re-measure against the deployed build first (the reveal moved earlier when we changed the loader), then cut the 550ms delay and bring the helper's settle-reveal forward.

**A4. First-touch directional lock. `M`. DECIDED 2026-09-25.**
_Notes: "lock navigation based on initial user input."_
Today: the first movement picks between "scrub" and "let the page scroll", using the drift's own axis — so a vertical swipe on a horizontal drift does nothing.
Agreed behaviour: **whichever way the finger first moves becomes the scrub axis for that gesture**, whatever the clip's own pan direction, and it stays locked until the finger lifts — so a vertical swipe scrubs a horizontal room and a drift never feels dead to a drag. Two things to get right: where a drift sits INSIDE a page (the landing, the builder preview) the page must still be able to scroll, so keep the "let the page scroll" escape on those surfaces; and the sign wants to feel natural — drag down = forward on a left-to-right room, the way the rotated presentation behaved before we removed it.

---

## B. Tour UI polish (mobile-led)

**B1. Admin/Public icons back on mobile. `S`** — remove the `≤460px` rule that hides them; keep labels from wrapping by shortening the text instead.

**B2. Drop the second "tour". `S`** — _"in mobile, when in menu, the second 'tour' text at the top left can be removed… too much 'tour' reference and looks congested."_ The header wordmark is `drift.li TOUR`, and the page beneath says "Tours" again. On phones, keep the wordmark's kind label and drop the repeat.

**B3. "Captured by" branding. `S–M`** — replace the contact label wording with the captured-by credit, centre credits on mobile, standardise alignment. Needs his exact wording.

**B4. Declutter + shift content up. `M`** — remove redundant labels, tighten the button rows, move the block up the page.

**B5. Scroll to top on navigation. `S`, wide effect** — one `ScrollToTop` mount in `App.tsx`. Fixes Learn More and every other in-app link at once.

**B6. Mobile gradient bug. `S` once seen** — **blocked: I need a screenshot.** Several gradients could be meant (the page aurora, the home hero floor, the player ground) and guessing wastes a build.

---

## C. Drift channel + admin

**C1. A featured tour follows its original — by REFERENCE. `L`. SHIPPED 2026-09-26.**
_As built (43 checks against a throwaway Postgres): as designed below, with two notes._
_**No schema change** — the pointer lives in `DriftFlow.settings.featureOf`, beside the credit
that was already there. `resolveFeature` merges the source's content onto the channel entry's
identity and every existing serializer produces channel addresses over live content without
knowing about any of it. A drift of a featured tour goes through `presentOnChannel`, which
rewrites the stops and drops the creator's pixel, buttons, forms and enquiry button._
_**A broken feature stays visible to the channel**, and only to it: gone from the public page,
still in `/my/flows` and the back office so it can be removed (`resolveOwnFeature`). One
guard on `/api/drift/my/flows/:id` refuses every write to a feature — a pointer has nothing of
its own to change — and the builder shows it read-only with "Featured from {page}"._
_**Migration:** tours copied into the library BEFORE this are ordinary flows and stay as they
are. To make one live, remove it from the library and save it again._


Copying is dropped. A channel entry becomes a pointer at the source flow, so it is current by
construction: nothing to sync, no duplicate rows, no duplicate frames.

Shape of the change:
- A `DriftFlow` on the channel carries `settings.featureOf = <source flow id>` and **no steps of
  its own**. It keeps what is genuinely the channel's: its slug, `order`, `hidden`, and the
  `settings.credit` block that names the creator.
- `serializePublicFlow` / `flowNavPayload` resolve through the pointer: the STEPS come from the
  source, but every path, the `publicPath` and the stops are rewritten to the CHANNEL's address,
  so a visitor stays inside `/tour/drift/...` the whole way. The player's Prev · Menu · Next is
  already built from `flowNav`, which is exactly what makes this tractable.
- The creator's own pixel, billing, enquiry, reel, unbranded and report settings are not
  inherited — same list the copy already stripped.
- Delete-safety: a source that is deleted or unpublished must make the feature disappear
  cleanly, not 500. The channel row survives so the superadmin can see and remove it.
- Migration: the tours already copied into the library stay as they are (they are real flows);
  either leave them, or add a one-off "convert to a reference" action. Decide when we build.
Risk: high-ish — it touches the public payload and slug routing, the two things every visitor
hits. Build it behind the existing channel tests (27 checks against a throwaway Postgres) and
add cases for: source edited → feature shows the edit; source unpublished → feature hidden;
source deleted → channel page still loads.

**C2. Library / Featured counts become links. `S`** — the counts exist; make them navigate to the channel page filtered to that set.

**C3. Invite a creator, with limits, from the admin panel. `L`. SHIPPED 2026-09-26.**
_As built (27 checks over real HTTP against a throwaway Postgres): **no schema change after
all.** The page is created at the moment of inviting — with its limits — and the invite is the
ordinary one-time `DriftTourInvite` (role ADMIN) that has been carrying page invites since
2026-09-15, so accepting goes down a path already in production and nothing new has to be
trusted. Carrying limits inside the invite would have meant a new column and a second place
that decides what a page may do._
_`POST /api/drift/admin/tour/invite` {email, pageName?, accountType?, freeDrifts?,
maxClipSeconds?} → page + invite + the `tour.creator.invite` email (a new template: the team
handing over a page reads nothing like a colleague's invitation). Also
`POST|DELETE /api/drift/admin/tour/pages/:id/invites[/:inviteId]`, and `pageDetail` now
carries the page's invites. Every invite comes back **with its link**, so a superadmin can pass
it on by hand when an email goes astray. Someone who already has a page is refused with a
pointer to it. The limits are read by one `readLimits` used by both the edit and the invite
route, so they cannot drift apart._


_Notes: "from admin panel, we should be able to create a profile with limits and things and send a direct invitation."_
Pieces that already exist: `DriftTourInvite` (one-time links with a role), creator provisioning (`ensureCreatorProfile`), per-org quotas (`maxFlows`, `maxStepsPerFlow`, `maxClipSeconds`, `freeDrifts`), and the `tour.pro.invite` email.
Missing: an admin screen that creates the page + sets the limits + sends the invite in one action, and an invite that carries those limits.
Risk: medium — touches provisioning and quota defaults. Schema change likely (invite → limits payload), so it needs a `db push` in the deploy.

---

## D. Email and payments

**D1. Email branding. `S`** — put the real logo in the header (we generated it: `brand/drift-li/png/drift-lockup-on-dark/…`), served from `frontend/public/drift/`, and align the header gradient to the brand ink. Check it renders in Gmail, Outlook and Apple Mail (no background images, fixed pixel width, alt text).

**D2. Stripe receipts. `S–M`, partly Keith's** — Keith saw a successful test payment with **no official receipt**. Two halves: Stripe Dashboard must have "Successful payments" emails on, with the business name and address filled in (Keith's Update Stripe Branding item); our half is setting `invoice_creation` / receipt email on the Checkout session so Stripe has an address to send to. Verify with one test payment end to end.

---

## E. drift.li landing

**E1. Rework the hero scene. `M–L`**
_Notes: "that 'Take a Tour' on the right side animation can be removed and the other text needs to be centralized over the animations. Animations can come one by one, with a picker if the user wants to see one by one."_
Plan: drop the `TakeATour` chip from the scene; centre the hero copy over the animation rather than beside it; keep the world-by-world journey but add an explicit **picker** (Tour · View · Memory · Path) so a visitor can choose, with the auto-advance continuing when untouched.
Note: the client's own copy and CTAs stay exactly as written — restyle only.

---

## F. Link previews

**F1. Bigger interactive element on the card. `S`** — the stop thumbnails are 112×84 on a 1200×630 card. Enlarge and re-balance the composition.
**F2. Uppercase across generated previews. `S`** — the kicker is already uppercased; confirm whether he means the **tour name** too before changing it.

---

## G. Infrastructure

**G1. Concurrency. `M`** — `ROT3D_PROCESS_CONCURRENCY` is 1. Raising it to 2–3 on the current box is an env change and a restart; the ceiling is ffmpeg running in-process on the same VPS as the API and Postgres. Measure a clip's CPU and memory first, then pick the number — over-raising it will starve the API.
**G2. Second VPS. `L`, blocked on Keith** — the real fix is moving processing off the web box: a worker that pulls from the queue over the network. Design once the second box exists; do not build speculatively.
**G3. iOS fullscreen research. `S`** — largely answered above (impossible for canvas; PWA is the route). Write it up for Keith rather than spending more time.

---

## Sequencing

Ship in passes, each independently deployable and verifiable:

**Pass 1 — DONE 2026-09-25** _(the cheap wins the client will see immediately)_
B1 icons · B5 scroll-to-top · B2 second "tour" · C2 count links · A3 hand timing · D1 email logo

**Pass 2 — DONE 2026-09-26** _(the player)_ · still wants a real iPhone + Android
A1 rotate-to-fullscreen + hide mobile furniture · A2 desktop fullscreen keeps its band
_Both live in SpinViewer; doing them together means one verification pass, not two._

**Pass 3 — polish and copy (half a day)**
B3 captured-by · B4 declutter · B6 gradient (once I have the screenshot) · F1/F2 previews

**Pass 4 — DONE 2026-09-26** _(the channel)_
C1 feature-by-reference · C3 invite-with-limits
_In the event **neither needed a schema change**, so this deploys with no `db push`: pull,
build, restart. Both are covered by throwaway-Postgres suites (43 + 27 checks)._

**Pass 5 — payments, landing, infra**
D2 receipts · E1 hero rework · G1 concurrency measurement

---

## Decisions

**Settled 2026-09-26**
- **C1 keeps no copy at all.** An entry that points has nothing to go stale, but it also means a
  tour deleted by its creator takes the feature with it — that is the right trade (the channel
  should not outlive the thing it credits), and the row stays for the superadmin to clear.
- **C3 creates the page up front** rather than at accept time. It puts an unclaimed page in the
  list, which is a feature: the superadmin can set it up, or delete it, before anyone arrives.

**Settled 2026-09-25**
- **C1 — feature by REFERENCE**, not a copy: a channel entry points at the source tour, so it is
  current by construction. Design in C1 above.
- **A4 — any drag direction scrubs**, locked on the first movement. Detail in A4 above.

**Still open — none of them block Pass 1 or Pass 2**
1. **F2 — uppercase what, exactly?** The kicker is already uppercase; does he mean the tour name?
2. **B3 — the exact "Captured by" wording** he wants in place of the contact labels.
3. ~~B6 — a screenshot of the gradient bug.~~ **Answered 2026-09-24**: it is the page wash, too
   small and too faint to register at phone width. Fixed in Pass 1.

## Waiting on Keith

- Root credentials for the second VPS (G2).
- Stripe Dashboard branding + business address (D2).
- The recorded video files for testing.

## How each pass gets verified

The harnesses from the last sessions still apply and should be re-run per pass: the fill matrix
(six screen/footage shapes), the prefetch, navigation, fullscreen and device-follow probes, and
the screenshot suite. Player work (A1, A2, A4) additionally needs a **real iPhone and Android** —
headless Chrome cannot answer the questions this meeting raised.
