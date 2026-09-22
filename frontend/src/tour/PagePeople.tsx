import { useEffect, useState } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { apiEndpoints, clearActiveProfile } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { confirmAction, notify } from "../lib/notifications";
import type { MyPage, PageMember, PageRole, TourInvite } from "./types";
import { ROLE_INFO, ROLE_ORDER } from "./pageRoles";
import { apiError } from "./tourUi";
import { invalidateMyPages, loadMyPages } from "./myPages";
import { CREATOR_LANDING } from "./tourSession";

/** Leave a page (remove your own profile there), then open your next page — or the landing. */
export async function leavePage(memberId: string, checkAuth: () => Promise<unknown>, navigate: NavigateFunction) {
  await apiEndpoints.driftRemovePageMember(memberId);
  clearActiveProfile();
  invalidateMyPages();
  await checkAuth().catch(() => undefined);
  const pages: MyPage[] = await loadMyPages().catch(() => []);
  const next = pages.find((p) => p.home) ?? pages[0];
  navigate(next?.path || CREATOR_LANDING, { replace: true });
}

/**
 * Page settings → People: who can open this page and as what (Admin · Editor · Viewer),
 * invites by email with a role, and pending invites. Shown to admins; the API checks too.
 */
export function PagePeople({ clientPage, onSelfChange }: { clientPage: boolean; onSelfChange: () => void }) {
  const navigate = useNavigate();
  const { checkAuth } = useAuth();
  const [members, setMembers] = useState<PageMember[] | null>(null);
  const [invites, setInvites] = useState<TourInvite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PageRole>(clientPage ? "VIEWER" : "EDITOR");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () =>
    apiEndpoints
      .driftPagePeople()
      .then((r) => {
        setMembers(r.data.members || []);
        setInvites(r.data.invites || []);
      })
      .catch((e) => {
        setMembers((m) => m ?? []);
        notify.error(apiError(e));
      });
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    const to = email.trim();
    if (!to) return;
    setSending(true);
    try {
      await apiEndpoints.driftCreatePageInvite(to, role);
      notify.success(`Invite Sent to ${to}`);
      setEmail("");
      load();
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setSending(false);
    }
  };

  const revoke = async (i: TourInvite) => {
    try {
      await apiEndpoints.driftRevokePageInvite(i.id);
      load();
    } catch (e) {
      notify.error(apiError(e));
    }
  };

  const changeRole = async (m: PageMember, next: PageRole) => {
    if (next === m.role) return;
    if (m.you && m.role === "ADMIN") {
      const ok = await confirmAction(
        `Make yourself ${ROLE_INFO[next].as}? You won't be able to change this page's settings or people any more.`,
      );
      if (!ok) return;
    }
    setBusyId(m.id);
    try {
      await apiEndpoints.driftUpdatePageMember(m.id, next);
      notify.success(m.you ? `You're Now ${ROLE_INFO[next].as}` : `${m.email} Is Now ${ROLE_INFO[next].as}`);
      if (m.you) {
        invalidateMyPages();
        onSelfChange();
        return;
      }
      load();
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (m: PageMember) => {
    const ok = await confirmAction(
      m.you ? "Leave this page? You'll lose access to it." : `Remove ${m.email} from this page? They lose access right away.`,
    );
    if (!ok) return;
    setBusyId(m.id);
    try {
      if (m.you) {
        await leavePage(m.id, checkAuth, navigate);
        notify.success("You Left the Page");
        return;
      }
      await apiEndpoints.driftRemovePageMember(m.id);
      notify.success(`${m.email} Was Removed`);
      load();
    } catch (e) {
      notify.error(apiError(e));
    } finally {
      setBusyId(null);
    }
  };

  const pending = invites.filter((i) => i.status !== "ACCEPTED");

  return (
    <div className="tpg-invite">
      <div className="d-label">People</div>
      <p className="d-sub" style={{ fontSize: 12.5, margin: "0 0 10px" }}>
        {clientPage
          ? "Invite your client — as a Viewer to follow along, or an Editor to help build."
          : "Invite the people you work with. Everyone signs in with their own login."}
      </p>

      {members === null ? (
        <div className="d-faint" style={{ fontSize: 13 }}>
          Loading…
        </div>
      ) : (
        <div className="d-list">
          {members.map((m) => {
            const named = !!m.name && m.name.trim().toLowerCase() !== m.email.toLowerCase();
            return (
              <div key={m.id} className="d-item static tpg-member">
                <span className="grow">
                  <span className="d-name" style={{ display: "block", fontSize: 13 }}>
                    {named ? m.name : m.email}
                    {m.you && (
                      <span className="d-pill accent" style={{ marginLeft: 6 }}>
                        You
                      </span>
                    )}
                  </span>
                  <span className="sub">{named ? m.email : `Joined ${new Date(m.joinedAt).toLocaleDateString()}`}</span>
                </span>
                <select
                  className="d-select tpg-role"
                  value={m.role}
                  disabled={busyId === m.id}
                  onChange={(e) => changeRole(m, e.target.value as PageRole)}
                  aria-label={`Role for ${m.email}`}
                >
                  {ROLE_ORDER.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_INFO[r].label}
                    </option>
                  ))}
                </select>
                <button className="d-btn ghost sm" onClick={() => remove(m)} disabled={busyId === m.id}>
                  {m.you ? "Leave" : "Remove"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="d-label" style={{ marginTop: 16 }}>
        Invite Someone
      </div>
      <div className="tpg-invite-form">
        <input
          className="d-input"
          type="email"
          inputMode="email"
          placeholder={clientPage ? "client@company.com" : "name@studio.com"}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          aria-label="Email to invite"
        />
        <select className="d-select tpg-role" value={role} onChange={(e) => setRole(e.target.value as PageRole)} aria-label="Their role">
          {ROLE_ORDER.map((r) => (
            <option key={r} value={r}>
              {ROLE_INFO[r].label}
            </option>
          ))}
        </select>
        <button className="d-btn primary" onClick={send} disabled={sending || !email.trim()}>
          {sending ? "Sending…" : "Send Invite"}
        </button>
      </div>
      <div className="d-faint tpg-role-help">
        {ROLE_INFO[role].label}: {ROLE_INFO[role].summary}
      </div>

      {pending.length > 0 && (
        <>
          <div className="d-label" style={{ marginTop: 16 }}>
            Pending Invites
          </div>
          <div className="d-list">
            {pending.map((i) => (
              <div key={i.id} className="d-item static tpg-member">
                <span className="grow">
                  <span className="d-name" style={{ display: "block", fontSize: 13 }}>
                    {i.email}
                  </span>
                  <span className="sub">
                    {ROLE_INFO[i.role || "ADMIN"].label} · {i.status === "EXPIRED" ? "Expired — Send a New Invite" : "Invite Sent"}
                  </span>
                </span>
                {i.status === "PENDING" && (
                  <button className="d-btn ghost sm" onClick={() => revoke(i)}>
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
