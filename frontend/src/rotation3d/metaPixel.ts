/**
 * Minimal Meta (Facebook) Pixel loader for the drift player. The brand supplies
 * a pixel id (per drift, or a brand default); we inject fbevents.js once, init
 * the pixel, and expose track(). Events: PageView + ViewContent on load, a
 * custom CTAClick on CTA taps, and Lead when a lead form is submitted.
 *
 * Only runs in the browser on the real player (never in embeds' parent, never
 * SSR). Loading is idempotent per pixel id.
 */

declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

const loaded = new Set<string>();

export function initMetaPixel(pixelId?: string | null) {
  if (!pixelId || typeof window === "undefined") return;
  const id = String(pixelId).replace(/[^0-9]/g, "");
  if (!id) return;

  if (!window.fbq) {
    /* eslint-disable */
    (function (f: any, b: Document, e: string, v: string) {
      if (f.fbq) return;
      const n: any = (f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      });
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      const t = b.createElement(e) as HTMLScriptElement;
      t.async = true;
      t.src = v;
      const s = b.getElementsByTagName(e)[0];
      s.parentNode?.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
  }

  if (!loaded.has(id)) {
    loaded.add(id);
    try {
      window.fbq("init", id);
    } catch {
      /* ignore */
    }
  }
  track("PageView");
}

export function track(event: string, params?: Record<string, unknown>, custom = false) {
  if (typeof window === "undefined" || !window.fbq) return;
  try {
    window.fbq(custom ? "trackCustom" : "track", event, params || undefined);
  } catch {
    /* ignore */
  }
}
