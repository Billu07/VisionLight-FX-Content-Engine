/**
 * The first-run drag coach.
 *
 * A visitor who watches a hand move learns nothing — they learn by doing it (client,
 * 2026-10-02): drag the drift forward, drag it back, and the gesture is theirs. Both
 * directions, because a drift is a place you move through in two, and a visitor who has
 * only ever gone forward does not know they can return.
 *
 * Pure on purpose: it is handed the scrub position (0..1 of the drift, along the drift's
 * OWN axis — `dirSign` has already turned the gesture the right way round) and the clock,
 * and says what to show. Since 2026-10-05 the caller is `TourTips`, where the lesson moved:
 * the strip there is dragged in the same pixels as the player, so what it measures is what
 * the real thing will feel like. The card this used to drive, inside the player, is gone —
 * over the footage there was nowhere it did not cover something.
 */

export type CoachStep = "forward" | "back" | "done";

export interface CoachView {
  step: CoachStep;
  /** 0..1 through the step on screen. */
  progress: number;
  /** True on the one update that finished a step — the moment to acknowledge. */
  justAdvanced: boolean;
  /** They have stopped moving: show them the move again. */
  nudge: boolean;
}

/**
 * How much of the drift counts as "you dragged it".
 *
 * In pixels, which is what the thumb feels: the player turns a drag into yaw at 0.006 rad/px
 * (`k` in SpinViewer's move handler) and a whole drift is 2π, so **the full sweep is ~1047px**
 * of dragging. A third of that is 314px — 80% of a phone's width in one stroke, which is a
 * chore for a lesson. These are set from that measurement, not from a feel for percentages:
 * ~188px forward (about half a phone's width, one confident swipe) and ~147px back, shorter
 * because by then they know how. Short swipes still add up — the leg measures the span
 * covered, not one gesture.
 */
export const FORWARD_SHARE = 0.18;
/** And how far back from the furthest point counts as "and back again". */
export const BACK_SHARE = 0.14;
/** Standing still this long on a step → nudge. */
export const NUDGE_AFTER = 3400;
/**
 * Near enough. Both legs are a fraction of a fraction, so an exact drag lands a hair under 1
 * in floating point — and a visitor who covers 21.9% of 22% has plainly done it.
 */
const COMPLETE = 0.999;

export interface DragCoach {
  /** Call every frame with the current scrub position and clock. */
  update(pos: number, now: number): CoachView;
  /** The visitor said no thanks. */
  skip(): void;
  /** Position changed for a reason that is not the visitor (the nudge animation). */
  rebase(pos: number): void;
  readonly step: CoachStep;
}

export const createDragCoach = (now = 0): DragCoach => {
  let step: CoachStep = "forward";
  // The stretch covered so far in this step. A drift can start part-way in
  // (`defaultFrame`), and a visitor may well pull it the "wrong" way first, so the
  // forward leg measures the span they have covered rather than a distance from zero.
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  let peak = 0; // where the forward leg ended — the back leg is measured from there
  let best = 0; // the furthest this step has ever got, so a nudge waits on real progress
  let lastGain = now;

  const view = (progress: number, justAdvanced: boolean, when: number): CoachView => {
    if (progress > best + 0.01) {
      best = progress;
      lastGain = when;
    }
    return {
      step,
      progress: Math.max(0, Math.min(1, progress)),
      justAdvanced,
      nudge: step !== "done" && when - lastGain >= NUDGE_AFTER,
    };
  };

  return {
    get step() {
      return step;
    },
    rebase(pos: number) {
      // The drift moved on its own. Start the measurement again from where it landed,
      // so the demonstration can never finish the step on the visitor's behalf.
      low = pos;
      high = pos;
      if (step === "back") peak = pos;
    },
    skip() {
      step = "done";
    },
    update(pos: number, when: number): CoachView {
      if (step === "done") return { step, progress: 1, justAdvanced: false, nudge: false };

      if (step === "forward") {
        if (pos < low) low = pos;
        if (pos > high) high = pos;
        const progress = (high - low) / FORWARD_SHARE;
        if (progress >= COMPLETE) {
          step = "back";
          peak = pos;
          best = 0;
          lastGain = when;
          return { step, progress: 0, justAdvanced: true, nudge: false };
        }
        return view(progress, false, when);
      }

      // Back: measured from the furthest point they reached, and it follows them if they
      // push on forwards first — the leg is "come back from wherever you got to".
      if (pos > peak) peak = pos;
      const progress = (peak - pos) / BACK_SHARE;
      if (progress >= COMPLETE) {
        step = "done";
        return { step, progress: 1, justAdvanced: true, nudge: false };
      }
      return view(progress, false, when);
    },
  };
};
