import { Request, Response, NextFunction } from "express";
import { AuthService } from "../services/auth";

export interface AuthenticatedRequest extends Request {
  user?: any;
  token?: string;
}

// Global SuperAdmin emails for safety net
const ADMIN_EMAILS_RAW = process.env.ADMIN_EMAILS || "";
const ADMIN_EMAILS = ADMIN_EMAILS_RAW.split(",").map((email) =>
  email.trim().toLowerCase(),
).filter(Boolean);

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const user = await AuthService.validateSession(token);
    if (!user)
      return res.status(401).json({ error: "Invalid or expired token" });

    const impersonateHeader = req.headers["x-impersonate-user-id"];
    const impersonateUserId = Array.isArray(impersonateHeader)
      ? impersonateHeader[0]
      : impersonateHeader;

    if (typeof impersonateUserId === "string" && impersonateUserId.trim()) {
      req.user = await AuthService.getReadOnlyImpersonationTarget(
        user,
        impersonateUserId.trim(),
      );
    } else {
      req.user = user;
    }

    if (
      req.user?.readOnlyImpersonation &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      return res.status(403).json({
        error: "Read-only dashboard access cannot make changes.",
      });
    }

    req.token = token;
    next();
  } catch (error: any) {
    const message = error?.message || "Authentication failed";
    if (message.toLowerCase().includes("impersonation")) {
      return res.status(403).json({ error: message });
    }
    res.status(500).json({ error: message });
  }
};

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const isDbAdmin = req.user?.role === "ADMIN" || req.user?.role === "SUPERADMIN";
  const isSuperAdminEmail =
    req.user?.email && ADMIN_EMAILS.includes(req.user.email.toLowerCase());

  if (isDbAdmin || isSuperAdminEmail) {
    next();
  } else {
    return res.status(403).json({ error: "Access Denied: Admins only." });
  }
};

export const requireSuperAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const isSuperAdmin = req.user?.role === "SUPERADMIN" || 
    (req.user?.email && ADMIN_EMAILS.includes(req.user.email.toLowerCase()));

  if (isSuperAdmin) {
    next();
  } else {
    return res.status(403).json({ error: "Access Denied: Super Admins only." });
  }
};
