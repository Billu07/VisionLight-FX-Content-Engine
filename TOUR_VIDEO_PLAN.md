# The /tour explainer — ~30 seconds, planned

Client's brief (2026-10-02): **a voiceover, and a frame on screen for the speaker — but a
dynamic frame, it moves depending on the content movement.** Professionally made.

So: two layers. The **content** fills the screen and moves; the **speaker** sits in a small
frame that gets out of its way — it moves *because* the content moved, which is the whole
idea of the product in one visual device.

---

## 1. What each of us makes

| Layer | Who | How |
|---|---|---|
| **B-roll (the content layer)** | **us** | Rendered, not screen-recorded. The player is driven by a headless-Chrome harness at 1920×1080, frame by frame, and encoded with ffmpeg — the same harness that already drives the drag coach with real touch events. Deterministic, no cursor wobble, no notification bars, re-renderable the day the UI changes. |
| **Voiceover** | client | Phone or USB mic, quiet room, read the script below twice through. |
| **Speaker footage** | client | Talking head, framed below. |
| **The edit** | TBD | Composite, move the speaker frame per the storyboard, grade, captions. |

The one thing that cannot be rendered is the person. Everything else on screen can be made
here, which keeps it sharp and lets it be remade for a feature change without a reshoot.

## 2. Script (~62 words, ~28s at a measured pace) — a draft for the client's voice

> **0:00–0:04** A photo stops. A video plays at you. A drift moves when you do.
> **0:04–0:10** Film a room on your phone. Five seconds, one slow pan.
> **0:10–0:16** Upload it, and it becomes something your visitor moves with a finger.
> **0:16–0:22** String the rooms together and you have a tour — a path through the whole place.
> **0:22–0:27** Share one link. It opens anywhere. No app, no headset.
> **0:27–0:30** drift.li. Live Interactive Tours.

Copy is the client's — this is a starting point to be read aloud and rewritten in their mouth,
not a specification.

## 3. Storyboard — and where the speaker frame goes

The rule for the frame: **it sits on the side the content has just left.** The drift pans one
way, the frame slides the other. It never crosses the subject, and it never sits still for more
than one beat, because the product is movement.

| Time | Content layer | Speaker frame |
|---|---|---|
| 0:00–0:04 | A still photo; then the same room as a drift, dragged left→right | starts centre-low, large (the hook is the person), shrinks to a corner as the drag begins |
| 0:04–0:10 | A phone, upright, filming a slow pan of a room | bottom-**right**, small — the pan runs left→right, so it trails behind it |
| 0:10–0:16 | The builder: the clip lands, converts, becomes a drift; a finger drags it | slides to bottom-**left** as the drift is dragged right |
| 0:16–0:22 | The pathway menu, then Next · Next · Next through three rooms | top-**right**, clear of the Prev/Menu/Next row along the bottom |
| 0:22–0:27 | One link, a QR, the tour opening on a second phone | back to bottom-left, growing slightly |
| 0:27–0:30 | drift.li end card (the reel's own end card, same type) | centre, largest — the close belongs to the person |

Each move is a ~400ms ease, triggered on the content's own direction change, not on a timer.

## 4. Recording spec for the client

- **Framing**: head and shoulders, eyes a third down, 20–30cm of space behind the head. Shot
  so a **circular or rounded-square crop** of the head and shoulders still works — the frame on
  screen is small and rounded, not a 16:9 letterbox.
- **Background**: plain and uncluttered, or a green screen if they want a cutout with no frame
  at all. Either works; the frame version is more forgiving.
- **Light**: a window in front of them, nothing bright behind them.
- **Audio**: the thing that actually decides whether it reads as professional. Phone 20–30cm
  away, no fan, no traffic, record the room tone for five seconds at the end.
- **Format**: 1080p or better, 30 or 60fps, landscape, one long take per line.

## 5. Where it lives on /tour

Under the hero on `tour/TourLanding.tsx`, in the section before "How It Works" — someone who
needs the explainer has already read the headline and wants it shown. Build rules:

- A poster frame, and the video only fetched on play. It must never be in the way of the
  landing's first paint, which is lazy-chunked and measured.
- Muted inline autoplay is **not** right for this one: it has a voiceover, and a page that
  starts talking is a page people close. Click to play, with the poster doing the inviting.
- Captions (`.vtt`) — most of the audience watches on a phone with the sound off, which is
  exactly the audience the voiceover cannot reach.
- Served from R2 like every other managed asset, with the long-lived immutable cache header.

## 6. Order of work

1. The B-roll harness and a first render of all six beats (us; no dependencies).
2. The client records voice + camera against the script.
3. Edit: composite, move the frame, grade, caption.
4. The page slot, poster and captions.

Step 1 is worth doing first whatever happens to the script: clean rendered footage of the
product is reusable for the social cards, the landing loops and the reel's own intro.
