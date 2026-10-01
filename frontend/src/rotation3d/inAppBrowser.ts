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
