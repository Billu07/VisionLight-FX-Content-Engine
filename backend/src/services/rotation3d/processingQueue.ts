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
// they don't get stuck. Raise ROT3D_PROCESS_CONCURRENCY if the box gets more
// cores (a worker per ~2 cores is a sane rule of thumb).

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
