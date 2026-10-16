/**
 * Where the guide films under each hero are served from.
 *
 * They are large (a few MB each, full resolution — see GuideVideo.tsx for why that is not
 * negotiable), and the VPS that would otherwise serve them is the same single box that runs
 * ffmpeg for every drift conversion. So the films belong on R2 behind Cloudflare's edge, and
 * `VITE_GUIDE_CDN` is how the build is told: set it to the public bucket's `…/drift/guide`
 * and every film comes off the CDN instead.
 *
 * Unset, the paths stay local (`/drift/guide/…`, served out of `frontend/public`), which is
 * also the fallback if the upload has not been run yet — so a build is never broken by this
 * being missing, it is only slower.
 *
 * `VERSION` is the cache-buster. The keys are stable names rather than content hashes, so a
 * replaced film would otherwise sit behind a year-long immutable cache; bump this whenever
 * the films are re-encoded, the same trick `CARD_VERSION` plays for the share cards.
 */

const BASE = String(import.meta.env.VITE_GUIDE_CDN || "/drift/guide").replace(/\/+$/, "");

const VERSION = 1;

/**
 * Every file for one film, e.g. `guideFilm("drift-desktop")`. The AV1/WebM is offered first
 * and carries most visitors; the mp4 is the fallback Safari takes.
 */
export const guideFilm = (name: string) => ({
  webm: `${BASE}/${name}.webm?v=${VERSION}`,
  src: `${BASE}/${name}.mp4?v=${VERSION}`,
  poster: `${BASE}/${name}.jpg?v=${VERSION}`,
});
