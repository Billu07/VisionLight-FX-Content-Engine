import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { setActiveProfile, setDriftOrgOverride } from "../lib/api";

/**
 * Who is looking at a tour page? A page (a TOUR org) is both its admin and its public
 * view, so the page and every pathway ask:
 * - a member (one of their TOUR profiles belongs to the page) → admin. Their matching
 *   profile is activated so the creator API acts on this page (a Pro holds several);
 * - a superadmin who isn't a member → a visitor by default, with "Manage this page",
 *   which scopes the creator API calls to the page (X-Drift-Org);
 * - everyone else → the public view.
 */
export function usePageAdmin(pageId: string | null | undefined) {
  const { user, profiles, isLoading, profileSelectionRequired, checkAuth } = useAuth();
  const [manage, setManage] = useState(false);
  const [activating, setActivating] = useState(false);
  const [triedFor, setTriedFor] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const memberProfile = pageId ? profiles.find((p) => p.organizationId === pageId && p.view === "TOUR") : undefined;
  const activeOnPage = !!pageId && !!user && user.organizationId === pageId && user.view === "TOUR";

  // Signed in on another workspace (or still choosing one) but a member here: switch to
  // the page's profile, once.
  useEffect(() => {
    if (!pageId || isLoading || activating || activeOnPage || !memberProfile) return;
    if (!user && !profileSelectionRequired) return;
    if (triedFor === memberProfile.id) return;
    setActivating(true);
    setTriedFor(memberProfile.id);
    setActiveProfile(memberProfile.id, memberProfile.organizationName || memberProfile.email);
    checkAuth().finally(() => setActivating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, isLoading, activeOnPage, memberProfile?.id]);

  const isSuper = user?.role === "SUPERADMIN";
  const canManage = !!pageId && isSuper && !activeOnPage && !memberProfile;
  const managing = canManage && manage;

  useEffect(() => {
    setDriftOrgOverride(managing ? (pageId as string) : null);
    return () => setDriftOrgOverride(null);
  }, [managing, pageId]);

  const waitingForSwitch = !!memberProfile && !activeOnPage && triedFor !== memberProfile.id;
  return {
    loading: isLoading || activating || waitingForSwitch,
    isAdmin: activeOnPage || managing,
    canManage,
    managing,
    setManage,
    signedIn: !!user,
  };
}
