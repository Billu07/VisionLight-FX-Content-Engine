/**
 * The counting behind tour Insights for one drift view — pure (no browser APIs), so it can
 * be tested on its own; the player wiring is in attention.ts.
 *
 * Time counts while the drift is on screen and the visitor has been active in the last 20s
 * (a phone put down stops counting). Once they start dragging, that time is also spread over
 * 20 equal parts of the footage (where they linger), every part they pass is marked reached,
 * and a change of drag direction after at least 3 frames counts as dragging back.
 */

export const ATTENTION_PARTS = 20;
const IDLE_MS = 20000;
/** a stalled animation frame never counts as a long look */
const TICK_CAP_MS = 250;
const TURN_FRAMES = 3;

export type AttentionCounts = {
  ms: number;
  /** ms on each part */
  b: number[];
  /** bitmask of the parts reached (kept across takes) */
  s: number;
  /** drag reversals */
  r: number;
  /** pin taps by pin id */
  p?: Record<string, number>;
};

export class AttentionMeter {
  private readonly frames: number;
  private readonly loop: boolean;
  private ms = 0;
  private bins: number[] = new Array(ATTENTION_PARTS).fill(0);
  private seen = 0;
  private rev = 0;
  private pins: Record<string, number> = {};
  private last = 0;
  private lastInput: number;
  private lastFrame = -1;
  private dir = 0;
  private run = 0;

  constructor(frames: number, loop: boolean, now: number) {
    this.frames = Math.max(1, frames);
    this.loop = loop;
    this.lastInput = now;
  }

  /** The visitor did something (touch, drag, key, wheel). */
  activity(now: number) {
    this.lastInput = now;
  }

  /** Every animation frame: the frame on screen, and whether the visitor has taken over. */
  sample(frame: number, exploring: boolean, now: number) {
    const dt = this.last ? Math.min(TICK_CAP_MS, Math.max(0, now - this.last)) : 0;
    this.last = now;
    if (now - this.lastInput > IDLE_MS) {
      this.lastFrame = -1;
      return;
    }
    this.ms += dt;
    if (!exploring) return;
    const part = this.partOf(frame);
    this.bins[part] += dt;
    if (this.lastFrame < 0) {
      this.seen |= 1 << part;
      this.lastFrame = frame;
      return;
    }
    if (frame === this.lastFrame) return;
    let d = frame - this.lastFrame;
    // A looping drift wraps: the short way round is the real move.
    if (this.loop && Math.abs(d) > this.frames / 2) d -= Math.sign(d) * this.frames;
    this.reach(this.lastFrame, d);
    const s = Math.sign(d);
    if (s !== this.dir) {
      if (this.dir !== 0 && this.run >= TURN_FRAMES) this.rev++;
      this.dir = s;
      this.run = 0;
    }
    this.run += Math.abs(d);
    this.lastFrame = frame;
  }

  pin(id: string) {
    this.pins[id] = Math.min(100, (this.pins[id] || 0) + 1);
  }

  /** After the page was hidden: the gap doesn't count. */
  pause() {
    this.last = 0;
  }

  /** The counts since the last take, then reset (the reached parts are kept). null when
   *  there's less than `minMs` to report. */
  take(minMs: number): AttentionCounts | null {
    if (this.ms < minMs) return null;
    const out: AttentionCounts = { ms: Math.round(this.ms), b: this.bins.map((x) => Math.round(x)), s: this.seen, r: this.rev };
    if (Object.keys(this.pins).length) out.p = this.pins;
    this.ms = 0;
    this.bins = new Array(ATTENTION_PARTS).fill(0);
    this.rev = 0;
    this.pins = {};
    return out;
  }

  /** Every part passed between two frames is reached (a fast drag skips frames). */
  private reach(from: number, d: number) {
    const step = Math.sign(d);
    for (let k = 0; k <= Math.abs(d); k++) {
      const f = (((from + step * k) % this.frames) + this.frames) % this.frames;
      this.seen |= 1 << this.partOf(f);
    }
  }

  private partOf(frame: number) {
    return Math.max(0, Math.min(ATTENTION_PARTS - 1, Math.floor((frame / this.frames) * ATTENTION_PARTS)));
  }
}
