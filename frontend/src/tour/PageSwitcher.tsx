import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { MyPage } from "./types";
import { MY_PAGES_EVENT, loadMyPages } from "./myPages";
import { ROLE_INFO } from "./pageRoles";

/**
 * The tour header's page switcher: every page this login can open — its own page first,
 * then its other pages and client pages — each with the role it holds there, plus the
 * way to other (studio / brand) workspaces. Opening a page activates its profile
 * (usePageAdmin). Hidden when there's only one page and nowhere else to go.
 */
export function PageSwitcher({ identityKey, otherWorkspaces }: { identityKey: string; otherWorkspaces: boolean }) {
  const [pages, setPages] = useState<MyPage[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    const load = () =>
      loadMyPages()
        .then((list) => alive && setPages(list))
        .catch(() => undefined);
    load();
    window.addEventListener(MY_PAGES_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(MY_PAGES_EVENT, load);
    };
  }, [identityKey]);

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (pages.length < 2 && !otherWorkspaces) return null;
  const current = pages.find((p) => p.path && (location.pathname === p.path || location.pathname.startsWith(`${p.path}/`)));

  return (
    <div className="t-switch" ref={ref}>
      <button
        type="button"
        className="d-btn sm t-switch-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Switch page"
      >
        <span className="t-switch-name">{current ? current.name : "Pages"}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="t-switch-menu" role="menu">
          {pages.length > 0 && <div className="t-switch-label">Your pages</div>}
          {pages.map((p) => (
            <button
              key={p.profileId}
              type="button"
              role="menuitem"
              className={`t-switch-item ${current?.id === p.id ? "on" : ""}`}
              disabled={!p.path}
              onClick={() => p.path && navigate(p.path)}
            >
              <span className="t-switch-mark" aria-hidden>
                {(p.name || "?").trim().charAt(0)}
              </span>
              <span className="t-switch-text">
                <b>{p.name}</b>
                <small>
                  {p.home ? "Your page" : p.managedBy ? "Client page" : p.accountType === "PRO" ? "Pro page" : "Page"} ·{" "}
                  {ROLE_INFO[p.role].label}
                </small>
              </span>
            </button>
          ))}
          {otherWorkspaces && (
            <Link to="/studios" role="menuitem" className="t-switch-item t-switch-foot">
              Other workspaces →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
