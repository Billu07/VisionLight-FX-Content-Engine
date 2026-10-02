/**
 * The embedded webviews social apps open links in. Two different questions get asked of them, so
 * there are two answers.
 */

const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent || "");

/**
 * Facebook's own webview (FBAN/FBAV name the app, FB_IAB its browser; Messenger carries FBAN).
 * It swallows the first touch sequence on a page, so a drift opened there goes to the tour menu
 * instead — see Rotation3DPlayer. Deliberately NOT Instagram: drifts opened from there work.
 */
export const isFacebookBrowser = () => /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua());

/**
 * Any embedded webview where turning the phone may not hand the screen over by itself, so the
 * "fill the screen" button has to stay (client, 2026-10-02: "the full screen button could come
 * off unless it's needed for insta / fb browser"). Broader than the above on purpose.
 */
export const isInAppBrowser = () => /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Twitter|TwitterAndroid|Line\//i.test(ua());

/**
 * An iPhone or iPad — every browser on them is Safari's engine, so this is a capability
 * question, not a brand one. There is no orientation lock and element fullscreen is granted to
 * `<video>` alone, so a "fill the screen" button can only ever pseudo-fullscreen and ask, which
 * the client found did "nothing" in practice (2026-10-03). Turning the phone is the real route
 * there, and the landscape takeover already handles it. iPadOS reports itself as a Mac, so the
 * touch points are what give it away.
 */
export const isApple = () => {
  const s = ua();
  return /iPad|iPhone|iPod/.test(s) || (/Macintosh/.test(s) && (navigator.maxTouchPoints || 0) > 1);
};
