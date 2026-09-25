// Bounded-concurrency in-memory queue for Rotation3D video processing.
//
// Why: uploads respond instantly, but frame extraction (ffmpeg) is CPU-heavy
// and this box has 2 vCPU — ffmpeg already saturates both for a single job.
// Without a gate, parallel/batch uploads spawn parallel ffmpeg runs, which
// oversubscribes the CPU and stalls the API + Postgres sharing the same box.
// This queue accepts every upload immediately and drains the heavy work at a
// safe concurrency (default 1), so no burst of uploads can overload the box.
//
// In-memory by design (no Redis dependency). A process restart clears the
// backlog; the route's startup recovery fails any orphaned PROCESSING jobs so
// they don't get stuck.
//
// MEASURED 2026-09-26 (three real client clips, 180 frames each): one drift costs
// 16–19 CPU-seconds — about 2.5s of that ffmpeg, the rest sharp encoding 360 WebPs
// (full + mobile) — and holds 65–95 MB at its peak. ffmpeg runs ~3x parallel on its
// own, sharp likewise, and the uploads already go 8 at a time (UPLOAD_CONCURRENCY),
// so ONE conversion keeps roughly three cores busy and never idles waiting on the
// network. On 2 vCPU a second worker therefore adds no throughput at all: the same
// CPU-seconds are interleaved, both drifts take twice as long to appear, and peak
// memory doubles next to Postgres and the API. Leave this at 1 until processing has
// a box of its own (TOUR_V3_PLAN G2); then it belongs on that box, not this one.
// Rule of thumb for a bigger box: one worker per ~3 free cores, memory permitting.

const CONCURRENCY = Math.max(1, Number(process.env.ROT3D_PROCESS_CONCURRENCY) || 1);

let active = 0;
const waiting: Array<() => void> = [];

function pump() {
  if (active >= CONCURRENCY) return;
  const start = waiting.shift();
  if (!start) return;
  active++;
  start();
}

/** Current queue state — handy for a health/status endpoint or logging. */
export function processingQueueDepth() {
  return { active, waiting: waiting.length, concurrency: CONCURRENCY };
}

/**
 * Enqueue a processing task. Returns a promise that settles with the task's
 * result. At most CONCURRENCY tasks run at once; the rest wait their turn.
 */
export function enqueueProcessing<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    waiting.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          active--;
          pump();
        });
    });
    pump();
  });
}
