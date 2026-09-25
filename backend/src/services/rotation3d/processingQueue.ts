import os from "node:os";

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
// network.
//
// What a second worker buys is therefore NOT throughput — the work is CPU-bound, so
// the same CPU-seconds simply interleave — it is FAIRNESS: the second person to
// upload stops waiting for the first person's whole drift before theirs starts. On
// 2 vCPU that trade is not worth it (both drifts take twice as long to appear and
// peak memory doubles beside Postgres and the API); from 4 it is, which is why the
// default below follows the box rather than being a flat number.
//
// One conversion per 2 cores, capped at 2 until a bigger box has been measured:
// 2 vCPU → 1 (what this has always done), 4 vCPU → 2. Set ROT3D_PROCESS_CONCURRENCY
// to override — and mind the memory, ~95 MB of peak per worker.

const CORES = Math.max(1, os.cpus().length);
const CONCURRENCY = Math.max(1, Number(process.env.ROT3D_PROCESS_CONCURRENCY) || Math.min(2, Math.floor(CORES / 2)));

let active = 0;
const waiting: Array<() => void> = [];

// Said once at boot, because the number is the difference between "the queue is busy" and
// "the queue is stuck", and it is decided by the box rather than by anything in the repo.
console.log(
  `[r3d-queue] converting ${CONCURRENCY} drift${CONCURRENCY === 1 ? "" : "s"} at a time on ${CORES} core${CORES === 1 ? "" : "s"}` +
    (process.env.ROT3D_PROCESS_CONCURRENCY ? " (set by ROT3D_PROCESS_CONCURRENCY)" : ""),
);
if (CONCURRENCY * 2 > CORES) {
  console.warn(
    `[r3d-queue] ${CONCURRENCY} workers on ${CORES} cores: a conversion wants about 3 cores and ~95 MB, so they will ` +
      `contend with each other and with the API. Lower ROT3D_PROCESS_CONCURRENCY unless this box only converts.`,
  );
}

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
