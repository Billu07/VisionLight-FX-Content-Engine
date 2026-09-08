import { prisma } from "./database";

// Editable transactional emails. Every platform email is a TEMPLATE KEY with code
// defaults below; a superadmin can override any field, the recipients, or switch
// a template off from the Drift admin "Emails" panel (routes/driftMail.ts). Rows
// live in MailTemplate (scope "GLOBAL"; an organizationId scope is reserved for
// per-brand overrides later). Missing row = code default. If the table isn't
// migrated yet, reads fail soft and the defaults are used, so sending never breaks.
//
// Placeholders: {{name}} inserts a value (HTML-escaped inside bodyHtml; plain in
// subject/heading/intro/footnote/CTA fields, which the shell escapes itself);
// {{{name}}} inserts raw HTML (only for variables flagged `html`).

const NS = "mail-templates";
export const GLOBAL_SCOPE = "GLOBAL";

export type MailTemplateFields = {
  subject: string;
  heading: string;
  intro: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footnote: string;
};
export const FIELD_KEYS = ["subject", "heading", "intro", "bodyHtml", "ctaLabel", "ctaUrl", "footnote"] as const;

export type MailTemplateVar = { name: string; description: string; sample: string; html?: boolean };

export type MailTemplateDef = {
  key: string;
  name: string;
  description: string;
  trigger: string;
  /** who receives it when recipients are left on "default" */
  audience: string;
  vars: MailTemplateVar[];
  defaults: MailTemplateFields;
};

export type MailTemplateOverride = {
  enabled: boolean;
  subject: string | null;
  heading: string | null;
  intro: string | null;
  bodyHtml: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  footnote: string | null;
  toMode: "DEFAULT" | "CUSTOM" | "BOTH";
  toList: string | null;
  bcc: string | null;
  updatedAt?: Date;
};

const f = (p: Partial<MailTemplateFields>): MailTemplateFields => ({
  subject: "",
  heading: "",
  intro: "",
  bodyHtml: "",
  ctaLabel: "",
  ctaUrl: "",
  footnote: "",
  ...p,
});

export const MAIL_TEMPLATES: MailTemplateDef[] = [
  {
    key: "drift.lead.new",
    name: "New lead (form submission)",
    description: "Sent when a viewer submits one of a brand's drift forms. The submitted answers are listed under the intro automatically.",
    trigger: "A viewer submits a drift form",
    audience: "The brand's admin users (platform admins if the brand has none)",
    vars: [
      { name: "formName", description: "The form's name", sample: "Book a viewing" },
      { name: "contactName", description: "Name found in the answers (may be empty)", sample: "Jane Doe" },
      { name: "contactEmail", description: "Email found in the answers (may be empty)", sample: "jane@example.com" },
      { name: "contactLine", description: '"From Jane Doe" or empty', sample: "From Jane Doe" },
      { name: "driftName", description: "The drift the form was opened from", sample: "Penthouse living room" },
      { name: "buttonLabel", description: "The button that opened the form", sample: "Book a viewing" },
      { name: "brandName", description: "The brand", sample: "Harbour Homes" },
    ],
    defaults: f({
      subject: "New lead: {{formName}}",
      heading: "New lead from your drift",
      intro: 'Someone just submitted "{{formName}}". {{contactLine}}',
      footnote: "You're receiving this because you're an admin on this Drift Link brand.",
    }),
  },
  {
    key: "drift.brand.invite",
    name: "Brand admin invite",
    description: "Sign-in details for a brand admin created by a superadmin. The email and temporary password are listed automatically.",
    trigger: "A superadmin creates a brand with an admin email",
    audience: "The new brand admin",
    vars: [
      { name: "name", description: "Admin's name", sample: "Sam" },
      { name: "brandName", description: "The brand", sample: "Harbour Homes" },
      { name: "email", description: "Sign-in email", sample: "sam@harbourhomes.com" },
      { name: "loginUrl", description: "Where to sign in", sample: "https://drift.li" },
    ],
    defaults: f({
      subject: "Your Drift Link account for {{brandName}}",
      heading: "Your Drift Link account is ready",
      intro: 'Hi {{name}}, an account was created for you to manage "{{brandName}}" on Drift Link.',
      ctaLabel: "Sign in",
      ctaUrl: "{{loginUrl}}",
      footnote: "For your security, please change this temporary password right after you sign in.",
    }),
  },
  {
    key: "creator.welcome",
    name: "Creator welcome",
    description: "Welcomes a new self-serve creator right after their creator space is created.",
    trigger: "A creator signs up on drift.li/tour",
    audience: "The creator",
    vars: [
      { name: "name", description: "Creator's name", sample: "Alex" },
      { name: "creatorHomeUrl", description: "Link to their creator home", sample: "https://drift.li/tour" },
    ],
    defaults: f({
      subject: "Welcome to drift.li — your creator space is ready",
      heading: "Your creator space is ready",
      intro:
        "Hi {{name}}, welcome to drift.li. You can now turn short phone clips into an interactive tour people scrub with a finger. Your first tour is free: three stops, five-second clips, one link to share.",
      bodyHtml:
        '<ol style="margin:0 0 6px 18px;padding:0;color:#3a4150;font-size:14px;line-height:1.7">' +
        "<li>Film 3 short clips — hold the phone steady and move slowly through the space.</li>" +
        "<li>Upload them; we build every stop while you write a title, a headline and a button.</li>" +
        "<li>Publish. The stops link themselves — even if you reorder them later.</li>" +
        "</ol>",
      ctaLabel: "Create your first tour",
      ctaUrl: "{{creatorHomeUrl}}",
      footnote: "Reply to this email if you get stuck — a person reads it.",
    }),
  },
  {
    key: "creator.signup.notice",
    name: "New creator (team notice)",
    description: "Tells your team a creator signed up.",
    trigger: "A creator signs up on drift.li/tour",
    audience: "Platform admins (ADMIN_EMAILS)",
    vars: [
      { name: "email", description: "Creator's email", sample: "alex@example.com" },
      { name: "name", description: "Creator's name", sample: "Alex" },
      { name: "organizationId", description: "Their creator org id", sample: "9f2c…" },
      { name: "profileNote", description: "New signup vs added to an existing login", sample: "new signup" },
    ],
    defaults: f({
      subject: "New creator: {{email}}",
      heading: "New creator signup",
      intro: "Someone just created a creator space on drift.li.",
      footnote: "Creator-suite notification for the drift.li team.",
    }),
  },
  {
    key: "flow.created.notice",
    name: "Tour created (team notice)",
    description: "Tells your team a creator started a tour.",
    trigger: "A creator creates a tour",
    audience: "Platform admins (ADMIN_EMAILS)",
    vars: [
      { name: "creatorLabel", description: "Name · email, or just the email", sample: "Alex · alex@example.com" },
      { name: "creatorEmail", description: "Creator's email", sample: "alex@example.com" },
      { name: "creatorName", description: "Creator's name (may be empty)", sample: "Alex" },
      { name: "flowName", description: "The tour's name", sample: "14 Harbour Lane" },
      { name: "kind", description: "tour / view / memory / path", sample: "tour" },
    ],
    defaults: f({
      subject: "New {{kind}}: {{flowName}}",
      heading: "New {{kind}} started",
      intro: '{{creatorLabel}} created a {{kind}} called "{{flowName}}".',
      footnote: "Creator-suite notification for the drift.li team.",
    }),
  },
  {
    key: "flow.published.creator",
    name: "Tour published (to the creator)",
    description: "Congratulates the creator with their public link when a tour goes live.",
    trigger: "A creator publishes a tour",
    audience: "The creator",
    vars: [
      { name: "creatorName", description: "Creator's name (may be empty)", sample: "Alex" },
      { name: "flowName", description: "The tour's name", sample: "14 Harbour Lane" },
      { name: "kind", description: "tour / view / memory / path", sample: "tour" },
      { name: "url", description: "Public link", sample: "https://drift.li/tour/14-harbour-lane" },
      { name: "steps", description: "Number of stops", sample: "3" },
      { name: "stepsLabel", description: '"stop" or "stops"', sample: "stops" },
    ],
    defaults: f({
      subject: 'Your {{kind}} "{{flowName}}" is live',
      heading: "Your {{kind}} is live",
      intro:
        '"{{flowName}}" is published with {{steps}} {{stepsLabel}}. Share the link anywhere — it opens straight into the first stop, and every button carries people along the path.',
      ctaLabel: "Open your {{kind}}",
      ctaUrl: "{{url}}",
      footnote: "Want more stops, more tours or longer clips? Reply to this email and we'll set you up.",
    }),
  },
  {
    key: "flow.published.notice",
    name: "Tour published (team notice)",
    description: "Tells your team a tour went live.",
    trigger: "A creator publishes a tour",
    audience: "Platform admins (ADMIN_EMAILS)",
    vars: [
      { name: "creatorLabel", description: "Name · email, or just the email", sample: "Alex · alex@example.com" },
      { name: "creatorEmail", description: "Creator's email", sample: "alex@example.com" },
      { name: "flowName", description: "The tour's name", sample: "14 Harbour Lane" },
      { name: "kind", description: "tour / view / memory / path", sample: "tour" },
      { name: "url", description: "Public link", sample: "https://drift.li/tour/14-harbour-lane" },
      { name: "steps", description: "Number of stops", sample: "3" },
    ],
    defaults: f({
      subject: "Published: {{flowName}}",
      heading: "{{kind}} published",
      intro: '{{creatorLabel}} published "{{flowName}}".',
      ctaLabel: "Open it",
      ctaUrl: "{{url}}",
      footnote: "Creator-suite notification for the drift.li team.",
    }),
  },
  {
    key: "creator.upgrade.nudge",
    name: "Upgrade nudge",
    description: "A friendly note when a creator hits a free-plan limit. Sent at most once a week per creator.",
    trigger: "A creator hits the free plan's tour limit",
    audience: "The creator",
    vars: [
      { name: "name", description: "Creator's name (may be empty)", sample: "Alex" },
      { name: "kind", description: "tour / view / memory / path", sample: "tour" },
      { name: "limit", description: "The limit they hit", sample: "1 tour" },
    ],
    defaults: f({
      subject: "Ready for more than one tour?",
      heading: "Want to build more?",
      intro:
        "Hi {{name}}, you've reached the free plan's limit ({{limit}}). Paid plans unlock more {{kind}}s, more stops per {{kind}} and longer clips — and early creators get first access.",
      ctaLabel: "Tell us what you need",
      ctaUrl: "mailto:web@drift.li?subject=Upgrade%20my%20drift.li%20plan",
      footnote: "You'll get this at most once a week.",
    }),
  },
];

export const templateByKey = (key: string): MailTemplateDef | null =>
  MAIL_TEMPLATES.find((t) => t.key === key) || null;

const escHtml = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Fill {{var}} / {{{var}}} placeholders. `html` = the target is raw HTML (escape values). */
export function fill(text: string, vars: Record<string, string>, html: boolean, defs?: MailTemplateVar[]): string {
  const rawAllowed = new Set((defs || []).filter((d) => d.html).map((d) => d.name));
  return String(text || "")
    .replace(/\{\{\{\s*([A-Za-z0-9_]+)\s*\}\}\}/g, (_, k) => (rawAllowed.has(k) ? vars[k] ?? "" : html ? escHtml(vars[k] ?? "") : vars[k] ?? ""))
    .replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_, k) => (html ? escHtml(vars[k] ?? "") : vars[k] ?? ""));
}

/** Code defaults + any non-null override fields. */
export function effectiveFields(def: MailTemplateDef, override: MailTemplateOverride | null): MailTemplateFields {
  const out = { ...def.defaults };
  if (override) {
    for (const k of FIELD_KEYS) {
      const v = override[k];
      if (v !== null && v !== undefined) out[k] = v;
    }
  }
  return out;
}

export function renderFields(fields: MailTemplateFields, vars: Record<string, string>, defs: MailTemplateVar[]): MailTemplateFields {
  return {
    subject: fill(fields.subject, vars, false, defs),
    heading: fill(fields.heading, vars, false, defs),
    intro: fill(fields.intro, vars, false, defs),
    bodyHtml: fill(fields.bodyHtml, vars, true, defs),
    ctaLabel: fill(fields.ctaLabel, vars, false, defs),
    ctaUrl: fill(fields.ctaUrl, vars, false, defs).trim(),
    footnote: fill(fields.footnote, vars, false, defs),
  };
}

export const sampleVars = (def: MailTemplateDef): Record<string, string> =>
  Object.fromEntries(def.vars.map((v) => [v.name, v.sample]));

export const parseEmailList = (raw: string | null | undefined): string[] =>
  String(raw || "")
    .split(/[,\s;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));

export const toOverride = (row: any): MailTemplateOverride => ({
  enabled: row.enabled !== false,
  subject: row.subject ?? null,
  heading: row.heading ?? null,
  intro: row.intro ?? null,
  bodyHtml: row.bodyHtml ?? null,
  ctaLabel: row.ctaLabel ?? null,
  ctaUrl: row.ctaUrl ?? null,
  footnote: row.footnote ?? null,
  toMode: row.toMode === "CUSTOM" || row.toMode === "BOTH" ? row.toMode : "DEFAULT",
  toList: row.toList ?? null,
  bcc: row.bcc ?? null,
  updatedAt: row.updatedAt,
});

/** The stored override for a key (null = none). Fails soft when the table is missing. */
export async function loadOverride(key: string, scope = GLOBAL_SCOPE): Promise<MailTemplateOverride | null> {
  try {
    const row = await prisma.mailTemplate.findUnique({ where: { key_scope: { key, scope } } });
    return row ? toOverride(row) : null;
  } catch (e: any) {
    console.warn(`[${NS}] override lookup failed for ${key} (table not migrated?):`, e?.message || e);
    return null;
  }
}

export async function loadAllOverrides(scope = GLOBAL_SCOPE): Promise<Map<string, MailTemplateOverride>> {
  const out = new Map<string, MailTemplateOverride>();
  try {
    const rows = await prisma.mailTemplate.findMany({ where: { scope } });
    for (const r of rows) out.set(r.key, toOverride(r));
  } catch (e: any) {
    console.warn(`[${NS}] override list failed (table not migrated?):`, e?.message || e);
  }
  return out;
}

/** Validate + normalize a superadmin edit. Empty strings clear a field back to default. */
export function sanitizeOverrideInput(body: any): Partial<MailTemplateOverride> {
  const out: Partial<MailTemplateOverride> = {};
  if (typeof body?.enabled === "boolean") out.enabled = body.enabled;
  for (const k of FIELD_KEYS) {
    if (k in (body || {})) {
      const v = body[k];
      const max = k === "bodyHtml" ? 20000 : k === "ctaUrl" ? 2000 : 600;
      out[k] = v === null || v === undefined || String(v).trim() === "" ? null : String(v).slice(0, max);
    }
  }
  if ("toMode" in (body || {})) {
    out.toMode = body.toMode === "CUSTOM" || body.toMode === "BOTH" ? body.toMode : "DEFAULT";
  }
  if ("toList" in (body || {})) out.toList = parseEmailList(body.toList).join(", ") || null;
  if ("bcc" in (body || {})) out.bcc = parseEmailList(body.bcc).join(", ") || null;
  return out;
}

export async function saveOverride(key: string, patch: Partial<MailTemplateOverride>, userId: string | null, scope = GLOBAL_SCOPE) {
  const data: any = { ...patch, updatedByUserId: userId };
  return prisma.mailTemplate.upsert({
    where: { key_scope: { key, scope } },
    create: { key, scope, ...data },
    update: data,
  });
}

export async function deleteOverride(key: string, scope = GLOBAL_SCOPE) {
  await prisma.mailTemplate.deleteMany({ where: { key, scope } });
}
