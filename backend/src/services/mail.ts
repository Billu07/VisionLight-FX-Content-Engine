import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "./database";

/**
 * Transactional email for the platform (drift.li notifications, follow-ups, admin
 * invites, …). SMTP via Namecheap Private Email (privateemail.com) by default, but
 * host/port are env-driven so any provider works.
 *
 * ALL secrets come from env — nothing is hardcoded. When SMTP env is missing,
 * `mailConfigured()` is false and every send becomes a logged no-op, so the app
 * runs fine without email configured (dev, or before the client sets it up).
 *
 * Required env (set on the server, e.g. backend/.env — see backend/EMAIL_SETUP.md):
 *   SMTP_HOST=mail.privateemail.com
 *   SMTP_PORT=465
 *   SMTP_USER=web@drift.li
 *   SMTP_PASS=<mailbox password>          ← secret, server env only
 *   MAIL_FROM="Drift Link <web@drift.li>" ← optional; defaults to SMTP_USER
 *   MAIL_REPLY_TO=                         ← optional default Reply-To
 */

const SMTP_HOST = process.env.SMTP_HOST || "mail.privateemail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || (SMTP_USER ? `Drift Link <${SMTP_USER}>` : "");
const MAIL_REPLY_TO = process.env.MAIL_REPLY_TO || "";
// Platform-admin fallback recipients (already used elsewhere for admin lists).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const APP_URL = process.env.FRONTEND_URL || "https://drift.li";
const NS = "mail";

export const mailConfigured = () =>
  !!(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && MAIL_FROM);

let transporter: Transporter | null = null;
function getTransport(): Transporter | null {
  if (!mailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export type MailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  from?: string;
};

/**
 * Core send. NEVER throws — returns a result so fire-and-forget callers stay safe.
 * A logged no-op when email isn't configured or there's no recipient.
 */
export async function sendMail(
  input: MailInput,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const t = getTransport();
  const to = (Array.isArray(input.to) ? input.to : [input.to]).map((s) => (s || "").trim()).filter(Boolean);
  if (!t) {
    console.warn(`[${NS}] not configured — skipped "${input.subject}" → ${to.join(", ") || "(no recipient)"}`);
    return { ok: false, skipped: true };
  }
  if (!to.length) {
    console.warn(`[${NS}] no recipient for "${input.subject}" — skipped`);
    return { ok: false, skipped: true };
  }
  try {
    await t.sendMail({
      from: input.from || MAIL_FROM,
      to,
      subject: input.subject,
      text: input.text || (input.html ? undefined : input.subject),
      html: input.html,
      replyTo: input.replyTo || MAIL_REPLY_TO || undefined,
    });
    console.log(`[${NS}] sent "${input.subject}" → ${to.join(", ")}`);
    return { ok: true };
  } catch (e: any) {
    console.error(`[${NS}] send failed "${input.subject}" → ${to.join(", ")}:`, e?.message || e);
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Verify SMTP at boot (logs status). Safe + quiet when unconfigured. */
export async function verifyMail(): Promise<void> {
  const t = getTransport();
  if (!t) {
    console.log(`[${NS}] disabled (SMTP_* env not set) — emails are no-ops`);
    return;
  }
  try {
    await t.verify();
    console.log(`[${NS}] SMTP ready — ${SMTP_USER} via ${SMTP_HOST}:${SMTP_PORT}`);
  } catch (e: any) {
    console.error(`[${NS}] SMTP verify FAILED (${SMTP_HOST}:${SMTP_PORT}):`, e?.message || e);
  }
}

// Escape user-supplied values before dropping them into email HTML.
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A small, email-safe branded HTML shell so platform emails look consistent. */
export function renderEmail(opts: {
  heading: string;
  intro?: string;
  rows?: Array<[string, string]>;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
}): string {
  const rows = (opts.rows || [])
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#5b6472;font-size:13px;vertical-align:top;white-space:nowrap">${esc(k)}</td>` +
        `<td style="padding:6px 0;color:#0b0f19;font-size:14px">${esc(v)}</td></tr>`,
    )
    .join("");
  const cta =
    opts.ctaLabel && opts.ctaUrl
      ? `<tr><td style="padding-top:22px"><a href="${esc(opts.ctaUrl)}" style="display:inline-block;background:#22d3ee;color:#04121a;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:10px">${esc(opts.ctaLabel)}</a></td></tr>`
      : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e9ef">
        <tr><td style="background:linear-gradient(135deg,#0d1324,#0a0e19);padding:20px 28px">
          <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:-.01em">Drift Link</span>
          <span style="color:#22d3ee;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">Interactive</span>
        </td></tr>
        <tr><td style="padding:26px 28px 30px">
          <h1 style="margin:0 0 10px;font-size:20px;color:#0b0f19">${esc(opts.heading)}</h1>
          ${opts.intro ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#3a4150">${esc(opts.intro)}</p>` : ""}
          ${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0">${rows}</table>` : ""}
          ${opts.bodyHtml || ""}
          ${cta ? `<table role="presentation" cellpadding="0" cellspacing="0">${cta}</table>` : ""}
          ${opts.footnote ? `<p style="margin:22px 0 0;font-size:12px;line-height:1.5;color:#8a93a3">${esc(opts.footnote)}</p>` : ""}
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#98a1b0">Sent by Drift Link · drift.li</p>
    </td></tr>
  </table></body></html>`;
}

/**
 * Recipients for an org's notifications: the org's ADMIN/SUPERADMIN user emails,
 * falling back to the platform ADMIN_EMAILS (Organization has no email field).
 */
export async function orgNotificationRecipients(organizationId: string): Promise<string[]> {
  try {
    const admins = await prisma.user.findMany({
      where: { organizationId, role: { in: ["ADMIN", "SUPERADMIN"] } },
      select: { email: true },
    });
    const emails = admins.map((a) => a.email).filter(Boolean);
    return emails.length ? emails : ADMIN_EMAILS;
  } catch (e: any) {
    console.error(`[${NS}] recipient lookup failed for org ${organizationId}:`, e?.message || e);
    return ADMIN_EMAILS;
  }
}

/** Pick a likely email/name out of a lead's dynamic { fieldKey: value } data. */
function pickLeadContact(data: Record<string, unknown>): { email?: string; name?: string } {
  let email: string | undefined;
  let name: string | undefined;
  for (const [k, v] of Object.entries(data || {})) {
    const val = typeof v === "string" ? v.trim() : "";
    if (!val) continue;
    const key = k.toLowerCase();
    if (!email && (key.includes("email") || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val))) email = val;
    if (!name && (key === "name" || key.includes("name"))) name = val;
  }
  return { email, name };
}

// ─────────────────────────── Templated notifications ───────────────────────────

/** Notify a brand's admins that a new lead came in from one of their drift forms. */
export async function sendNewLeadEmail(params: {
  organizationId: string;
  formName: string;
  data: Record<string, unknown>;
  source?: { drift?: string | null; cta?: string | null } | null;
  productName?: string | null;
  createdAt?: Date;
}): Promise<void> {
  if (!mailConfigured()) return;
  const to = await orgNotificationRecipients(params.organizationId);
  if (!to.length) return;
  const contact = pickLeadContact(params.data);
  const rows: Array<[string, string]> = Object.entries(params.data || {})
    .filter(([, v]) => v !== "" && v !== null && v !== undefined && typeof v !== "object")
    .map(([k, v]) => [k, typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)]);
  if (params.productName) rows.push(["Drift", params.productName]);
  if (params.source?.cta) rows.push(["Button", params.source.cta]);
  const html = renderEmail({
    heading: "New lead from your drift",
    intro: `Someone just submitted "${params.formName}"${contact.name ? ` — ${contact.name}` : ""}.`,
    rows,
    footnote: "You're receiving this because you're an admin on this Drift Link brand.",
  });
  await sendMail({
    to,
    subject: `New lead: ${params.formName}`,
    html,
    // Let the brand hit reply and land in the lead's inbox when we captured it.
    replyTo: contact.email,
  });
}

/** Email a freshly-created brand admin their sign-in details + temporary password. */
export async function sendBrandAdminInviteEmail(params: {
  email: string;
  name?: string | null;
  brandName: string;
  tempPassword: string;
  loginUrl?: string;
}): Promise<void> {
  if (!mailConfigured()) return;
  const loginUrl = params.loginUrl || APP_URL;
  const html = renderEmail({
    heading: `Your Drift Link account is ready`,
    intro: `Hi${params.name ? ` ${params.name}` : ""}, an account was created for you to manage "${params.brandName}" on Drift Link.`,
    rows: [
      ["Email", params.email],
      ["Temporary password", params.tempPassword],
    ],
    ctaLabel: "Sign in",
    ctaUrl: loginUrl,
    footnote: "For your security, please change this temporary password right after you sign in.",
  });
  await sendMail({
    to: params.email,
    subject: `Your Drift Link account for ${params.brandName}`,
    html,
  });
}
