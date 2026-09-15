import { API_BASE_URL } from "../lib/api";
import { AttentionMeter } from "./attentionMeter";

/**
 * Tour Insights, in the player: how a visitor spends their time in one tour drift — where
 * they linger once they start dragging, how much of it they reach, whether they drag back,
 * which pins they tap (counting in attentionMeter.ts). Anonymous: a random id per browser
 * tab visit (sessionStorage, 30 minutes idle), no cookies, no personal data. One small
 * beacon when the drift is left or the page is hidden → backend services/driftInsights.ts.
 */

export type AttentionTarget = {
  productId: string;
  /** one key per drift shown — records with the same key are one view */
  key: string;
  /** the personal link this visit came through */
  link?: string | null;
  /** a visit on the unbranded (/u/…) link */
  unbranded?: boolean;
};

const MIN_SEND_MS = 400;
const VISIT_KEY = "drift-visit";
const VISIT_IDLE_MS = 30 * 60 * 1000;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

const randomId = () => {
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
};

/** A fresh key for a drift view. */
export const newViewKey = (): string => randomId();

let memoryVisit: { id: string; t: number } | null = null;

/** This tab's visit: the same id until 30 minutes pass without a record. */
function visitId() {
  const now = Date.now();
  let visit = memoryVisit;
  try {
    const raw = sessionStorage.getItem(VISIT_KEY);
    if (raw) visit = JSON.parse(raw);
  } catch {
    /* storage blocked — the id lives in memory */
  }
  if (!visit || typeof visit.id !== "string" || !/^[a-z0-9]{8,32}$/.test(visit.id) || !(now - Number(visit.t) < VISIT_IDLE_MS)) {
    visit = { id: randomId(), t: now };
  }
  visit = { id: visit.id, t: now };
  memoryVisit = visit;
  try {
    sessionStorage.setItem(VISIT_KEY, JSON.stringify(visit));
  } catch {
    /* ignore */
  }
  return visit.id;
}

function send(body: string) {
  const url = `${API_BASE_URL}/api/drift/public/attention`;
  try {
    // text/plain: a beacon that needs no preflight, and still arrives as the page closes.
    if (typeof navigator.sendBeacon === "function" && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }))) return;
  } catch {
    /* fall back to fetch */
  }
  fetch(url, { method: "POST", body, keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain" } }).catch(() => undefined);
}

/** One drift view's recorder: sample() every animation frame, close() when the drift goes. */
export function createAttention(target: AttentionTarget, frames: number, loop: boolean) {
  const meter = new AttentionMeter(frames, loop, performance.now());
  let closed = false;
  const flush = () => {
    const counts = meter.take(MIN_SEND_MS);
    if (!counts) return;
    send(
      JSON.stringify({
        productId: target.productId,
        k: target.key,
        v: visitId(),
        ...counts,
        ...(target.link ? { l: target.link } : {}),
        ...(target.unbranded ? { u: 1 } : {}),
      }),
    );
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      flush();
    } else {
      meter.pause();
      meter.activity(performance.now());
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", flush);
  return {
    sample(frame: number, exploring: boolean) {
      if (!closed && document.visibilityState !== "hidden") meter.sample(frame, exploring, performance.now());
    },
    activity() {
      meter.activity(performance.now());
    },
    pin(id: string) {
      meter.pin(id);
    },
    close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    },
  };
}

export type AttentionRecorder = ReturnType<typeof createAttention>;
