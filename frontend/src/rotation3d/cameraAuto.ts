/**
 * Camera Control: Auto or Lock (client, 2026-10-06).
 *
 * A drift's Camera Control says how the clip was shot, and from that the player works out which
 * way a drag scrubs forward. Visitors do not agree about that. Some expect to push the room the
 * way the camera went; others expect to pull it back the other way, the way a map works.
 * Whichever one a creator picks, the other half of their visitors drag the wrong way first.
 *
 * So on a drift left on **Auto** (the default) the visitor's FIRST swipe decides it: whichever
 * way they swipe, the drift goes forward, and that choice then holds for the rest of the visit
 * so nothing reverses under them halfway through a tour. A creator who needs their own mapping
 * kept — a clip where only one reading makes sense — turns **Lock** on for that drift.
 *
 * What is remembered is the visitor's habit **relative to the guide arrow**, not to the shoot:
 * did they drag TOWARD the arrow, or away from it. That is the only invariant that survives a
 * mixed tour, because the arrow's own direction is not a fixed function of the shoot — a pan
 * shows it on the left edge pointing left whichever way the room runs (the client's call, see
 * CLAUDE.md), while a tilt points it the way the room runs. Recording the habit against the
 * SHOOT therefore taught the player one thing on a left-to-right pan and the opposite on a tilt
 * (or on a right-to-left pan), so a visitor who had been following the arrow found it inverted
 * the moment the tour changed kind — which is exactly what was reported, 2026-10-06.
 *
 * The decision lives in this module, which means one page session: it survives every drift→drift
 * swap (one SpinViewer stays mounted) and is forgotten when the tab is closed. Nothing is stored
 * on the visitor's device — it is a reading of what they just did, not a preference to remember.
 */

/** 0 = the visitor has not dragged yet; +1 = they drag toward the arrow; -1 = away from it. */
let habit: 0 | 1 | -1 = 0;

/** How this visitor drags, relative to the arrow, or 0 while it is still undecided. */
export const arrowHabit = (): 0 | 1 | -1 => habit;

/** The first swipe wins; later ones are ignored, so the mapping never changes mid-visit. */
export const noteArrowHabit = (v: 1 | -1): void => {
  if (!habit) habit = v;
};

/** Testing, and anything that wants a fresh visit. */
export const resetArrowHabit = (): void => {
  habit = 0;
};
