# Tour v4 — the 2026-10-02 client list, planned

Priority stated by the client: **iOS / Safari fullscreen on a landscape drift**. Everything else
follows it. Desktop behaviour is not to change unless an item says so.

> Sizes: `S` under an hour · `M` half a day · `L` a day or more.

---

## A. The player on a phone — the priority

**A1. A landscape drift on an upright phone gets a "fill the screen" button. `M`**
_Client: "the drifts that are landscape, when shown on mobile, should have a fullscreen icon,
clicking it will just rotate the screen."_

**What is actually possible matters here, because iPhone is the target:**

| | Android / Chrome | iPhone Safari |
|---|---|---|
| `element.requestFullscreen()` | yes | **no** — `<video>` only |
| `screen.orientation.lock("landscape")` | yes (needs fullscreen first) | **not supported at all** |

So on Android the button can genuinely turn the screen. **On iOS it cannot** — no API exists, and
Apple has never shipped one. The button there can only do two honest things: take the player over
the whole viewport (the pseudo-fullscreen we already have) and *ask* for the turn. The moment the
visitor does turn the phone, `updateLandscapeTakeover` already fills the screen.

Plan: one button, best behaviour per platform —
- Android/Chrome: fullscreen + `orientation.lock("landscape")` → it really rotates.
- iOS: pseudo-fullscreen + a short "turn your phone" animation that fades once turned.
- Only shown when the DRIFT is landscape and the PHONE is upright. Never on desktop, never on a
  portrait drift (client: "no change for videos that are shot in portrait").

**A2. Landscape-on-phone button placement. `M`** — from `landscape_button.jpeg`: the footage is
letterboxed with dead ground either side, and the client has written the buttons into it —
**Menu top-right · Prev bottom-left · Next bottom-right** — instead of the centred Prev·Menu·Next
row lying over the picture. This is `r3d-siderail` territory (it already moves that row into the
side column) but with the client's own arrangement, so it becomes its own layout rather than a
tweak to the rail.

**A3. The centre-top drift indicator goes. `S`** — `.r3d-stops` ("● ● ● ○ ○ 7/10") sits over the
top of the frame. Client: remove it. Check whether that is landscape-only or everywhere before
deleting — the dots are the only "where am I" signal a tour has.

**A4. No change on desktop, none for portrait drifts. `S`** — the acceptance test for A1–A3. Both
need a screenshot pass to prove it.

---

## B. Chrome that hides itself

**B1. Tap-to-hide comes out. `S`** — `.r3d-bare` on tap, desktop and mobile. Client: remove.

**B2. Fade-while-dragging stays, but only for a portrait drift on a phone. `S`** — today
`.r3d-grabbing` fades the chrome on any immersive drift. It narrows to that one case.

---

## C. Facebook's in-app browser. `M`
_Client: "the first screen of a drift doesn't drag" in the FB browser._

FB's webview intercepts the first touch sequence on some pages; the drift looks dead until the
second try. We cannot fix their browser, so the share link changes: **a tour drift shared to
Facebook points at the tour's MENU**, where the first interaction is an ordinary tap on a link.
Where: `services/driftShare.ts` (canonical / og:url for a drift path) — needs care not to change
the link for every other network at the same time.

---

## D. The player's top-left mark. `S`
The circled icon in `landscape_button.jpeg` is the old circular-arrow glyph. Replace with the
drift.li mark from `brand/drift-li/svg/` (it exists and the client liked it).

## E. "Try Drift Tour" goes to /tour, not the login wizard. `S`
On the drift.li landings. It currently opens `/tour/start`; it should open the top of `/tour`.
(`ScrollToTop` already guarantees "the top".)

---

## F. The home hero's four worlds. `M–L`
_Client: View and Tour "aren't quite clear what they're supposed to mean"; and when the playhead
lands on a world, that world "is not centralized — the first and last look cut off"._

Three separate things:
- **F1 centring (bug, do first).** The strip is translated by whole cells, so world 0 and world 3
  sit against the window's edges. Measure and centre each cell in the window.
- **F2 View = a sunset.** Right now it is an arc with a sweeping sightline, which reads as
  nothing. A horizon, a sun, colour.
- **F3 Tour = a room you can read.** A corner of a room doesn't say "space you walk through".

## G. More blue in the player's background on a phone. `S`
`r3d-tour.r3d-ground` already gets an aurora wash; it is too faint at phone width (the same
problem the page wash had on 2026-09-24).

## H. The tour page header's spacing. `S`
The page name and the "Tours" line under it have an extra gap.

---

## Then — two bigger pieces, to plan properly once the above ships

**I. A first-run drag coach. `L`** — a few seconds that teach the drag on a visitor's first drift.
There is already a hand + cue (`startIntro`, `.r3d-drift-hand`); this is a deliberate, designed
version of it: show, invite, confirm, get out of the way. Needs a storyboard before any code.

**J. A ~30s explainer video for /tour. `L`, mostly not code** — a presenter with the interface
animating alongside. Script → storyboard → record → edit. The build side is only where it sits on
the page and how it loads.

---

## Sequencing

1. **A** (the priority) — A3 + A4 first since they are cheap and make A1/A2 easier to see, then
   A2's layout, then A1's button.
2. **B** — same file, same screenshot pass, so it rides along with A.
3. **D, E, G, H** — small and independent; one pass.
4. **C** — needs its own thought about share links.
5. **F** — its own pass; F1 is a bug and can go earlier if it's quick.
6. **I**, then **J**.

## Verification

Headless Chrome covers layout and the Android path. **It cannot answer the iOS question** — the
one that matters most here — so A needs a real iPhone (Safari, and the Facebook in-app browser for
C) before it is called done.
