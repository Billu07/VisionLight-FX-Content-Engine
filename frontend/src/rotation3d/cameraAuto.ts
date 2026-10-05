/**
 * Camera Control: Auto or Lock (client, 2026-10-06).
 *
 * A drift's Camera Control says how the clip was shot, and from that the player works out which
 * way a drag scrubs forward. Visitors do not agree about that. Some expect to push the room the
 * way the camera went; others expect to pull it back the other way, the way a scrollbar works.
 * Whichever one a creator picks, the other half of their visitors drag the wrong way first.
 *
 * So on a drift left on **Auto** (the default) the visitor's FIRST swipe decides it: whichever
 * way they swipe, the drift goes forward, and that choice then holds for the rest of the visit
 * so nothing reverses under them halfway through a tour. A creator who needs their own mapping
 * kept — a clip where only one reading makes sense — turns **Lock** on for that drift.
 *
 * The decision lives in this module, which means one page session: it survives every drift→drift
 * swap (one SpinViewer stays mounted) and is forgotten when the tab is closed. Nothing is stored
 * on the visitor's device — it is a reading of what they just did, not a preference to remember.
 */

/** 0 = the visitor has not dragged yet; otherwise the multiplier their first swipe asked for. */
let flip: 0 | 1 | -1 = 0;

/** The multiplier to apply to a drift's own direction, or 0 while it is still undecided. */
export const cameraFlip = (): 0 | 1 | -1 => flip;

/** The first swipe wins; later ones are ignored, so the mapping never changes mid-visit. */
export const decideCameraFlip = (v: 1 | -1): void => {
  if (!flip) flip = v;
};

/** Testing, and anything that wants a fresh visit. */
export const resetCameraFlip = (): void => {
  flip = 0;
};
