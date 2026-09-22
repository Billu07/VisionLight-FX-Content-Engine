import { Router, Request, Response } from "express";
import { prisma } from "../services/database";
import { readUnsubscribeLink } from "../services/mail";

// The Unsubscribe link at the foot of every email (services/mail.ts). GET shows a small page
// with a button — link scanners open links, so opening one never unsubscribes by itself; the
// button (and mail apps' one-click, RFC 8058) POSTs. The link is signed per address, so only
// its holder can use it. "Subscribe Again" undoes it.

const router = Router();
const NS = "mail";

const esc = (v: string) => v.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[c] || c);

function page(title: string, body: string, action?: { label: string; url: string; ghost?: boolean }) {
  const button = action
    ? `<form method="post" action="${esc(action.url)}" style="margin:22px 0 0">
        <button type="submit" style="appearance:none;border:0;cursor:pointer;font:inherit;font-weight:700;font-size:14px;padding:12px 20px;border-radius:10px;${
          action.ghost ? "background:#eef1f5;color:#0b0f19" : "background:#22d3ee;color:#04121a"
        }">${esc(action.label)}</button>
      </form>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · drift.li</title></head>
<body style="margin:0;background:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0b0f19">
  <div style="max-width:480px;margin:10vh auto 0;padding:0 16px">
    <div style="background:#fff;border:1px solid #e6e9ef;border-radius:16px;overflow:hidden">
      <div style="background:#0d1324;padding:18px 24px"><span style="color:#fff;font-size:17px;font-weight:800">Drift Live</span>
        <span style="color:#22d3ee;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;margin-left:8px">Interactive</span></div>
      <div style="padding:24px">
        <h1 style="margin:0 0 10px;font-size:20px">${esc(title)}</h1>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#3a4150">${body}</p>
        ${button}
      </div>
    </div>
  </div>
</body></html>`;
}

/** The link the person opened (to post back to), without an old action. */
const selfUrl = (req: Request, extra = "") => {
  const q = new URLSearchParams();
  for (const k of ["e", "t", "k"]) if (typeof req.query[k] === "string") q.set(k, req.query[k] as string);
  return `${req.path}?${q.toString()}${extra}`;
};

const optedOut = async (email: string) => !!(await prisma.emailOptOut.findUnique({ where: { email } }).catch(() => null));

router.get("/api/mail/unsubscribe", async (req: Request, res: Response) => {
  const link = readUnsubscribeLink(req.query);
  res.setHeader("Cache-Control", "no-store");
  if (!link) {
    return res
      .status(400)
      .type("html")
      .send(page("This Link Doesn't Work", "It may be cut short — open the whole link from the email, or reply to any of our emails and we'll take you off the list."));
  }
  const who = `<b>${esc(link.email)}</b>`;
  if (await optedOut(link.email)) {
    return res
      .type("html")
      .send(page("You're Unsubscribed", `${who} doesn't get drift.li notification emails.`, { label: "Subscribe Again", url: selfUrl(req, "&a=resubscribe"), ghost: true }));
  }
  res
    .type("html")
    .send(
      page(
        "Unsubscribe From drift.li Emails?",
        `${who} will stop getting drift.li notification emails. Invites, receipts and emails you ask for still arrive.`,
        { label: "Unsubscribe", url: selfUrl(req) },
      ),
    );
});

// The page's button, and mail apps' one-click unsubscribe (body "List-Unsubscribe=One-Click").
router.post("/api/mail/unsubscribe", async (req: Request, res: Response) => {
  const link = readUnsubscribeLink(req.query);
  res.setHeader("Cache-Control", "no-store");
  if (!link) return res.status(400).type("html").send(page("This Link Doesn't Work", "Open the whole link from the email and try again."));
  const again = req.query.a === "resubscribe";
  try {
    if (again) await prisma.emailOptOut.deleteMany({ where: { email: link.email } });
    else await prisma.emailOptOut.upsert({ where: { email: link.email }, create: { email: link.email, source: link.key }, update: {} });
  } catch (err: any) {
    console.error(`[${NS}] unsubscribe save failed:`, err?.message || err);
    return res.status(503).type("html").send(page("That Didn't Go Through", "Please try again in a moment."));
  }
  console.log(`[${NS}] ${again ? "resubscribed" : "unsubscribed"} ${link.email}${link.key ? ` (from ${link.key})` : ""}`);
  const who = `<b>${esc(link.email)}</b>`;
  res
    .type("html")
    .send(
      again
        ? page("You're Subscribed Again", `${who} will get drift.li notification emails again.`)
        : page("You're Unsubscribed", `${who} won't get drift.li notification emails anymore.`, {
            label: "Subscribe Again",
            url: selfUrl(req, "&a=resubscribe"),
            ghost: true,
          }),
    );
});

export default router;
