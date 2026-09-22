import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { MyPage } from "./types";
import { MY_PAGES_EVENT, loadMyPages } from "./myPages";
import { ROLE_INFO } from "./pageRoles";
import { CREATOR_START } from "./tourSession";

/**
 * The tour header's page switcher: every page this login can open — its own page first,
 * then pages it joined and client pages — each with the role it holds there, plus the way
 * to other (studio / brand) workspaces. Someone who has only joined pages also gets
 * "Create your own page". Opening a page activates its profile (usePageAdmin). Hidden
 * when there's nothing to switch to or create.
 */
export function PageSwitcher({
  identityKey,
  otherWorkspaces,
  email,
  onLogout,
}: {
  identityKey: string;
  otherWorkspaces: boolean;
  /** shown at the foot of the menu, above Log Out */
  email?: string;
  /** given → the menu is also the account menu (always shown, ends with Log Out) */
  onLogout?: () => void;
}) {
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

  useEffect(() => setOpen(false), [location.pathname, location.search]);

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

  const canCreate = pages.length > 0 && !pages.some((p) => p.own);
  if (!onLogout && pages.length < 2 && !otherWorkspaces && !canCreate) return null;
  const current = pages.find((p) => p.path && (location.pathname === p.path || location.pathname.startsWith(`${p.path}/`)));

  return (
    <div className="t-switch" ref={ref}>
      <button
        type="button"
        className="d-btn sm t-switch-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={onLogout ? "Your Pages and Account" : "Switch Page"}
      >
        <span className="t-switch-name">{current ? current.name : pages.length ? "Your Pages" : "Account"}</span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="t-switch-menu" role="menu">
          {pages.length > 0 && <div className="t-switch-label">Your Pages</div>}
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
                  {p.own ? "Your Page" : p.managedBy ? "Client Page" : "Shared with You"} · {ROLE_INFO[p.role].label}
                </small>
              </span>
            </button>
          ))}
          {canCreate && (
            <Link to={`${CREATOR_START}?create=1`} role="menuitem" className="t-switch-item t-switch-foot">
              + Create Your Own Page
            </Link>
          )}
          {otherWorkspaces && (
            <Link to="/studios" role="menuitem" className="t-switch-item t-switch-foot">
              Other Workspaces →
            </Link>
          )}
          {onLogout && (
            <>
              {email && <div className="t-switch-me">Signed In as {email}</div>}
              <button type="button" role="menuitem" className="t-switch-item t-switch-out" onClick={onLogout}>
                Log Out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
