import { Router, Response } from "express";
import { authenticateToken, requireSuperAdmin, type AuthenticatedRequest } from "../middleware/auth";
import { adminEmails, mailConfigured, mailFromAddress, renderTemplated, sendTemplated } from "../services/mail";
import {
  MAIL_TEMPLATES,
  deleteOverride,
  loadAllOverrides,
  parseEmailList,
  sampleVars,
  sanitizeOverrideInput,
  saveOverride,
  templateByKey,
  toOverride,
} from "../services/mailTemplates";

// Superadmin "Emails" panel: every transactional email is a template a superadmin
// can rewrite, re-address or switch off. Rows live in MailTemplate; a missing
// table (before `prisma db push`) fails soft on reads and returns a clear error
// on writes.

const router = Router();
const NS = "drift-mail";

const MIGRATION_HINT = "Email settings aren't stored yet — run `npx prisma db push` on the server and try again.";

// Sample rows (the structured key/value block some emails add under the intro).
const sampleRows = (key: string): Array<[string, string]> | undefined => {
  switch (key) {
    case "drift.lead.new":
      return [
        ["Name", "Jane Doe"],
        ["Email", "jane@example.com"],
        ["Message", "Is the penthouse still available this weekend?"],
        ["Drift", "Penthouse living room"],
        ["Button", "Book a viewing"],
      ];
    case "drift.brand.invite":
      return [
        ["Email", "sam@harbourhomes.com"],
        ["Temporary password", "k9x2-sample"],
      ];
    case "creator.signup.notice":
      return [
        ["Email", "alex@example.com"],
        ["Name", "Alex"],
        ["Org", "9f2c…"],
        ["Profile", "new signup"],
      ];
    case "flow.created.notice":
      return [
        ["Creator", "Alex · alex@example.com"],
        ["Kind", "tour"],
      ];
    case "flow.published.creator":
      return [["Link", "https://drift.li/tour/14-harbour-lane"]];
    case "flow.published.notice":
      return [
        ["Creator", "alex@example.com"],
        ["Stops", "3"],
        ["Link", "https://drift.li/tour/14-harbour-lane"],
      ];
    default:
      return undefined;
  }
};

const varsFromBody = (key: string, body: any): Record<string, string> => {
  const def = templateByKey(key)!;
  const vars = sampleVars(def);
  const given = body?.vars && typeof body.vars === "object" ? body.vars : {};
  for (const v of def.vars) {
    if (typeof given[v.name] === "string") vars[v.name] = String(given[v.name]).slice(0, 500);
  }
  return vars;
};

router.get("/api/drift/mail/templates", authenticateToken, requireSuperAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const overrides = await loadAllOverrides();
  res.json({
    configured: mailConfigured(),
    from: mailFromAddress(),
    adminEmails: adminEmails(),
    templates: MAIL_TEMPLATES.map((def) => ({
      key: def.key,
      name: def.name,
      description: def.description,
      trigger: def.trigger,
      audience: def.audience,
      vars: def.vars,
      defaults: def.defaults,
      override: overrides.get(def.key) ?? null,
    })),
  });
});

router.put("/api/drift/mail/templates/:key", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const def = templateByKey(req.params.key);
  if (!def) return res.status(404).json({ error: "Unknown email template" });
  const patch = sanitizeOverrideInput(req.body || {});
  try {
    const row = await saveOverride(def.key, patch, req.user?.id || null);
    console.log(`[${NS}] ${req.user?.email || "superadmin"} updated "${def.key}"`);
    res.json({ override: toOverride(row) });
  } catch (err: any) {
    console.error(`[${NS}] save failed for ${def.key}:`, err?.message || err);
    res.status(500).json({ error: MIGRATION_HINT });
  }
});

router.delete("/api/drift/mail/templates/:key", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const def = templateByKey(req.params.key);
  if (!def) return res.status(404).json({ error: "Unknown email template" });
  try {
    await deleteOverride(def.key);
    console.log(`[${NS}] ${req.user?.email || "superadmin"} reset "${def.key}" to defaults`);
    res.json({ ok: true });
  } catch (err: any) {
    console.error(`[${NS}] reset failed for ${def.key}:`, err?.message || err);
    res.status(500).json({ error: MIGRATION_HINT });
  }
});

// Render with sample values (+ unsaved draft) — nothing is sent.
router.post("/api/drift/mail/templates/:key/preview", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const def = templateByKey(req.params.key);
  if (!def) return res.status(404).json({ error: "Unknown email template" });
  const draft = sanitizeOverrideInput(req.body?.draft || {});
  const r = await renderTemplated(def.key, { vars: varsFromBody(def.key, req.body), rows: sampleRows(def.key), draft });
  res.json({ subject: r.subject, html: r.html, enabled: r.enabled });
});

// Send the (draft) template with sample values to the caller — or to `to`.
router.post("/api/drift/mail/templates/:key/test", authenticateToken, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const def = templateByKey(req.params.key);
  if (!def) return res.status(404).json({ error: "Unknown email template" });
  if (!mailConfigured()) return res.status(400).json({ error: "SMTP isn't configured on the server (SMTP_* env)." });
  const to = parseEmailList(req.body?.to);
  const target = to.length ? to : parseEmailList(req.user?.email);
  if (!target.length) return res.status(400).json({ error: "No address to send the test to" });
  const draft = sanitizeOverrideInput(req.body?.draft || {});
  await sendTemplated(def.key, {
    vars: varsFromBody(def.key, req.body),
    rows: sampleRows(def.key),
    draft,
    defaultTo: target,
    forceTo: target,
  });
  console.log(`[${NS}] test "${def.key}" → ${target.join(", ")}`);
  res.json({ ok: true, to: target });
});

export default router;
