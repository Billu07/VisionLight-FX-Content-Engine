import { useEffect } from "react";

const UPDATE_CHECK_INTERVAL_MS = 90_000;
const RELOAD_GUARD_KEY = "visionlight_reload_for_entry";

const ENTRY_SELECTOR = 'script[type="module"][src*="/assets/index-"]';

const normalizeEntrypoint = (value: string) => {
  try {
    const url = new URL(value, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return value;
  }
};

const getEntrypointFromDoc = (doc: Document) => {
  const script = doc.querySelector(ENTRY_SELECTOR) as HTMLScriptElement | null;
  const src = script?.getAttribute("src");
  return src ? normalizeEntrypoint(src) : null;
};

const getCurrentEntrypoint = () => getEntrypointFromDoc(document);

const fetchLatestEntrypoint = async () => {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("__app_update_check", Date.now().toString());
  const res = await fetch(url.toString(), {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) return null;
  const html = await res.text();
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  return getEntrypointFromDoc(parsed);
};

export const useAutoAppRefresh = () => {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let stopped = false;

    const checkForUpdate = async () => {
      if (stopped || document.hidden) return;
      try {
        const current = getCurrentEntrypoint();
        if (!current) return;
        const latest = await fetchLatestEntrypoint();
        if (!latest || latest === current) return;

        const lastReloadedFor = sessionStorage.getItem(RELOAD_GUARD_KEY);
        if (lastReloadedFor === latest) return;

        sessionStorage.setItem(RELOAD_GUARD_KEY, latest);
        window.location.reload();
      } catch {
        // Silent failure: do not block user flow for update checks.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkForUpdate();
      }
    };

    const intervalId = window.setInterval(() => {
      void checkForUpdate();
    }, UPDATE_CHECK_INTERVAL_MS);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);
    void checkForUpdate();

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, []);
};

