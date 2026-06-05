// Mirror of backend `config/pricing.ts`. Admins/superadmins are unlimited by
// default; they only count toward credit charges and coverage when they opt back
// into credit limits (stored as this marker in their adminNotes — no schema field).
export const ADMIN_CREDIT_LIMITS_MARKER = "[ADMIN_CREDIT_LIMITS_ENABLED]";

export const isUserCreditLimited = (
  user: { role?: string | null; adminNotes?: string | null } | null | undefined,
): boolean => {
  const role = String(user?.role || "").toUpperCase();
  if (role !== "ADMIN" && role !== "SUPERADMIN") return true;
  return String(user?.adminNotes || "").includes(ADMIN_CREDIT_LIMITS_MARKER);
};
